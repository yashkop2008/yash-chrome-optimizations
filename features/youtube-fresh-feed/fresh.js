// Fresh home feed.
// A video you actually looked at on the home page (at least 60% on screen for
// a full second) and didn't click has been passed over. The next time you open
// the home page it is hidden, so the feed only shows things you haven't already
// said no to. Clicked videos are never hidden. Records expire after 30 days.
// Its count of hidden videos lives in the shared bottom-left corner panel.
;(() => {
  const CARD = 'ytd-rich-item-renderer, ytm-rich-item-renderer'
  const DWELL_MS = 1000
  const KEEP_MS = 30 * 24 * 60 * 60 * 1000
  const MAX = 4000

  let enabled = true
  let seen = {} // videoId -> { v: visit id, t: last seen ms, c?: 1 when clicked }
  let visit = ''
  let pending = {}
  let flushTimer = 0
  let scanTimer = 0
  let hidden = new Set()
  let showing = false
  const timers = new Map()

  const isHome = () => location.pathname === '/'
  const report = (id, problem) =>
    chrome.storage.local.get('health').then(({ health = {} }) => {
      if (problem ? health[id]?.problem === problem : !health[id]) return
      if (problem) health[id] = { problem, at: Date.now() }
      else delete health[id]
      return chrome.storage.local.set({ health })
    })

  // Health: ten seconds into a home page visit, it should have found videos.
  let healthTimer = 0
  function checkHealthSoon() {
    clearTimeout(healthTimer)
    healthTimer = setTimeout(() => {
      if (!isHome() || !enabled || document.hidden) return
      const found = document.querySelectorAll(CARD).length
      report('youtube-fresh-feed', found ? null : "YouTube's home page changed: the fresh feed can't find any videos to hide.")
    }, 10000)
  }

  function idOf(card) {
    const a = card.querySelector('a[href*="watch?v="]')
    if (!a) return null
    try {
      return new URL(a.getAttribute('href'), location.origin).searchParams.get('v')
    } catch {
      return null
    }
  }

  /* ---------- watching what you look at ---------- */

  const io = new IntersectionObserver(
    (entries) => {
      for (const e of entries) {
        const card = e.target
        if (e.isIntersecting && e.intersectionRatio >= 0.6 && !document.hidden) {
          if (!timers.has(card)) timers.set(card, setTimeout(() => record(card), DWELL_MS))
        } else {
          clearTimeout(timers.get(card))
          timers.delete(card)
        }
      }
    },
    { threshold: [0, 0.6] },
  )

  function record(card) {
    timers.delete(card)
    io.unobserve(card)
    const id = idOf(card)
    if (!id || !isHome() || seen[id]?.c) return
    seen[id] = pending[id] = { v: visit, t: Date.now() }
    scheduleFlush()
  }

  function markClicked(id) {
    if (!id) return
    seen[id] = pending[id] = { v: visit, t: Date.now(), c: 1 }
    scheduleFlush()
  }

  /* ---------- deciding what to hide ---------- */

  function decide(card) {
    const id = idOf(card)
    if (!id) return
    if (card.dataset.rhId === id) return
    card.dataset.rhId = id
    card.removeAttribute('data-rh-passed')
    const rec = seen[id]
    if (enabled && rec && !rec.c && rec.v !== visit) {
      card.setAttribute('data-rh-passed', '')
      hidden.add(id)
    } else {
      io.observe(card)
    }
  }

  function scan() {
    if (!isHome()) return
    document.querySelectorAll(CARD).forEach(decide)
    renderChip()
  }

  // Each arrival on the home page is a new visit. Anything recorded on an
  // earlier visit is now fair game, including cards YouTube kept in the DOM.
  function newVisit() {
    visit = Date.now().toString(36)
    hidden = new Set()
    showing = false
    document.documentElement.classList.remove('rh-show-passed')
    document.querySelectorAll(CARD).forEach((card) => {
      delete card.dataset.rhId
      card.removeAttribute('data-rh-passed')
      io.unobserve(card)
    })
    scan()
  }

  function onRoute() {
    clearInterval(scanTimer)
    if (isHome()) {
      newVisit()
      checkHealthSoon()
      // The feed fills in lazily and keeps loading as you scroll.
      scanTimer = setInterval(scan, 1200)
    } else {
      renderChip()
      const v = location.pathname === '/watch' && new URLSearchParams(location.search).get('v')
      if (v) markClicked(v)
    }
  }

  document.addEventListener(
    'click',
    (e) => {
      const card = e.target.closest?.(CARD)
      if (!card) return
      const id = idOf(card)
      markClicked(id)
      if (card.hasAttribute('data-rh-passed')) {
        card.removeAttribute('data-rh-passed')
        hidden.delete(id)
      }
    },
    true,
  )

  /* ---------- storage ---------- */

  function scheduleFlush() {
    clearTimeout(flushTimer)
    flushTimer = setTimeout(flush, 1500)
  }

  async function flush() {
    const batch = pending
    pending = {}
    if (!Object.keys(batch).length) return
    // Merge with what other tabs wrote, then forget old and excess records.
    const { seen: stored = {} } = await chrome.storage.local.get('seen')
    const now = Date.now()
    const merged = Object.entries({ ...stored, ...batch })
      .filter(([, r]) => now - r.t < KEEP_MS)
      .sort(([, a], [, b]) => b.t - a.t)
      .slice(0, MAX)
    await chrome.storage.local.set({ seen: Object.fromEntries(merged) })
  }
  addEventListener('pagehide', flush)

  chrome.storage.onChanged.addListener((changes) => {
    if ('features' in changes) {
      enabled = changes.features.newValue?.['youtube-fresh-feed'] !== false
      if (!enabled) {
        // Switched off in settings: put every hidden video back right away.
        hidden = new Set()
        document.querySelectorAll('[data-rh-passed]').forEach((c) => c.removeAttribute('data-rh-passed'))
        renderChip()
        return
      }
      if (isHome()) {
        // Re-decide every card under the new setting, keeping the current visit.
        document.querySelectorAll(CARD).forEach((c) => delete c.dataset.rhId)
        hidden = new Set()
        scan()
      }
    }
    if ('seen' in changes) {
      const next = changes.seen.newValue || {}
      if (!Object.keys(next).length) {
        // Forgotten from the popup: bring everything back.
        seen = {}
        hidden = new Set()
        document.querySelectorAll('[data-rh-passed]').forEach((c) => c.removeAttribute('data-rh-passed'))
        renderChip()
      } else {
        seen = { ...next, ...pending }
      }
    }
  })

  /* ---------- row in the shared corner panel ---------- */

  let feedMode = 'normal'
  let cornerRow = null

  function renderChip() {
    const corner = globalThis.ycoCorner
    if (!corner) return
    if (!cornerRow) {
      cornerRow = corner.row('passed', 20)
      cornerRow.innerHTML = '<span class="text"></span><button type="button"></button>'
      cornerRow.querySelector('button').addEventListener('click', () => {
        showing = !showing
        document.documentElement.classList.toggle('rh-show-passed', showing)
        renderChip()
      })
    }
    const count = hidden.size
    cornerRow.hidden = !(isHome() && feedMode === 'normal' && enabled && count > 0)
    cornerRow.querySelector('.text').innerHTML =
      `<b>${count}</b>&nbsp;passed-over ${count === 1 ? 'video' : 'videos'} ${showing ? 'shown faded' : 'hidden'}`
    cornerRow.querySelector('button').textContent = showing ? 'Hide' : 'Show'
    corner.refresh()
  }

  /* ---------- start ---------- */

  chrome.storage.onChanged.addListener((changes) => {
    if ('feedMode' in changes) {
      feedMode = changes.feedMode.newValue || 'normal'
      renderChip()
    }
  })

  chrome.storage.local.get(['features', 'seen', 'feedMode']).then((s) => {
    enabled = s.features?.['youtube-fresh-feed'] !== false
    feedMode = s.feedMode || 'normal'
    seen = s.seen || {}
    document.addEventListener('yt-navigate-finish', onRoute)
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', onRoute, { once: true })
    else onRoute()
  })
})()
