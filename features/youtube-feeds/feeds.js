// Themed home feed: swap YouTube's home page for a feed of only cat videos or
// only Fern (youtube.com/@fern-tv). Videos come from YouTube itself, from a
// search for cats or Fern's own uploads page, cached for six hours.
;(() => {
  const TTL = 6 * 60 * 60 * 1000
  const MODES = {
    cats: {
      title: 'Cats only',
      blurb: 'Nothing but cats until you switch back.',
      queries: ['cat videos', 'funny cats', 'kittens', 'cats being cats', 'cat compilation', 'cat documentary', 'cute cats'],
      keep: (v) => /\b(cats?|kitt(y|ies|ens?)|meow\w*|feline|purr\w*|catto|tabby|maine coon|siamese)\b/i.test(v.title),
    },
    fern: {
      title: 'Fern only',
      blurb: 'Armchair documentaries from Fern, newest first.',
      channel: '/@fern-tv/videos',
      owner: 'Fern',
    },
  }

  let mode = 'normal'
  let host = null
  let ui = null
  let items = null
  let loading = false
  let failed = false
  let order = []
  let ensureTimer = 0

  const isHome = () => location.pathname === '/'
  const blinders = () => document.documentElement.classList.contains('rh-blinders')

  /* ---------- reading YouTube's own page data ---------- */

  const text = (t) => (t ? (t.simpleText ?? t.content ?? t.runs?.map((r) => r.text).join('') ?? '') : '')

  function collect(node, out, owner) {
    if (Array.isArray(node)) {
      for (const n of node) collect(n, out, owner)
      return
    }
    if (!node || typeof node !== 'object') return
    const vr = node.videoRenderer || node.gridVideoRenderer
    if (vr?.videoId) {
      out.push({
        id: vr.videoId,
        title: text(vr.title),
        channel: text(vr.ownerText || vr.shortBylineText || vr.longBylineText) || owner || '',
        length: text(vr.lengthText),
        meta: [text(vr.shortViewCountText || vr.viewCountText), text(vr.publishedTimeText)].filter(Boolean).join(' · '),
      })
      return
    }
    const lv = node.lockupViewModel
    if (lv?.contentId && /VIDEO/.test(lv.contentType || '')) {
      const md = lv.metadata?.lockupMetadataViewModel
      const rows = md?.metadata?.contentMetadataViewModel?.metadataRows || []
      const parts = rows.flatMap((r) => (r.metadataParts || []).map((p) => text(p.text))).filter(Boolean)
      out.push({
        id: lv.contentId,
        title: text(md?.title),
        channel: owner || parts[0] || '',
        length: '',
        meta: (owner ? parts : parts.slice(1)).join(' · '),
      })
      return
    }
    for (const k in node) collect(node[k], out, owner)
  }

  async function pageData(path) {
    const res = await fetch(path, { credentials: 'include' })
    const html = await res.text()
    const m = /ytInitialData\s*=\s*(\{.+?\});\s*<\/script>/s.exec(html)
    if (!m) throw new Error('no page data')
    return JSON.parse(m[1])
  }

  async function fetchMode(name) {
    const cfg = MODES[name]
    let list = []
    if (name === 'cats') {
      const picks = [...cfg.queries].sort(() => Math.random() - 0.5).slice(0, 3)
      const pages = await Promise.allSettled(picks.map((q) => pageData(`/results?search_query=${encodeURIComponent(q)}`)))
      for (const p of pages) if (p.status === 'fulfilled') collect(p.value, list)
      list = list.filter(cfg.keep)
    } else {
      try {
        collect(await pageData(cfg.channel), list, cfg.owner)
      } catch {}
      if (list.length < 4) {
        // Fallback: search, then keep only what Fern actually uploaded.
        const found = []
        collect(await pageData(`/results?search_query=${encodeURIComponent('Fern documentary')}`), found)
        list = list.concat(found.filter((v) => v.channel.trim().toLowerCase() === 'fern'))
      }
    }
    const unique = [...new Map(list.filter((v) => v.id && v.title).map((v) => [v.id, v])).values()]
    if (!unique.length) throw new Error('nothing found')
    return unique
  }

  async function load(force = false) {
    const want = mode
    loading = true
    failed = false
    items = null
    render()
    try {
      const { feedCache = {} } = await chrome.storage.local.get('feedCache')
      const cached = feedCache[want]
      let list
      if (!force && cached && Date.now() - cached.at < TTL && cached.items?.length) list = cached.items
      else {
        list = await fetchMode(want)
        feedCache[want] = { at: Date.now(), items: list }
        await chrome.storage.local.set({ feedCache })
      }
      if (mode !== want) return
      items = list
      await shuffle()
    } catch {
      if (mode === want) failed = true
    } finally {
      if (mode === want) {
        loading = false
        render()
      }
    }
  }

  // New order on every visit. Fern stays newest-first; cats get shuffled. Either
  // way, videos you already passed over on the home page sink to the bottom.
  async function shuffle() {
    const { seen = {} } = await chrome.storage.local.get('seen')
    const fresh = (v) => (seen[v.id] && !seen[v.id].c ? 1 : 0)
    order = [...items]
    if (mode === 'cats') order.sort(() => Math.random() - 0.5)
    order.sort((a, b) => fresh(a) - fresh(b))
    render()
  }

  /* ---------- drawing it ---------- */

  const CSS = `
    :host { all: initial; display: block; width: 100%; }
    :host([data-theme='dark']) { --bg: #0f0f0f; --text: #f1f1f1; --muted: #aaa; --line: #303030; --chip: rgb(255 255 255 / 10%); --chip-on: #f1f1f1; --on-chip-on: #0f0f0f; --skel: #222; }
    :host([data-theme='light']) { --bg: #fff; --text: #0f0f0f; --muted: #606060; --line: #e5e5e5; --chip: rgb(0 0 0 / 5%); --chip-on: #0f0f0f; --on-chip-on: #fff; --skel: #eee; }
    * { box-sizing: border-box; }
    .wrap { padding: 24px 24px 48px; color: var(--text); font: 14px/1.4 Roboto, system-ui, -apple-system, 'Segoe UI', sans-serif; }
    .head { display: flex; align-items: flex-end; justify-content: space-between; gap: 16px; flex-wrap: wrap; margin-bottom: 20px; }
    h2 { margin: 0; font-size: 24px; font-weight: 700; letter-spacing: -0.01em; }
    .blurb { margin-top: 2px; color: var(--muted); }
    .controls { display: flex; align-items: center; gap: 8px; }
    .seg { display: inline-flex; gap: 2px; padding: 3px; border-radius: 10px; background: var(--chip); }
    .seg button, .ghost { all: unset; cursor: pointer; height: 30px; padding: 0 12px; border-radius: 8px; font-weight: 500; display: inline-flex; align-items: center; }
    .seg button[aria-pressed='true'] { background: var(--chip-on); color: var(--on-chip-on); }
    .seg button:not([aria-pressed='true']):hover, .ghost:hover { background: var(--chip); }
    .seg button:focus-visible, .ghost:focus-visible, a:focus-visible { outline: 2px solid var(--muted); outline-offset: 2px; }
    .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(300px, 1fr)); gap: 40px 16px; }
    a { color: inherit; text-decoration: none; display: block; }
    .thumb { position: relative; aspect-ratio: 16 / 9; border-radius: 12px; overflow: hidden; background: var(--skel); }
    .thumb img { width: 100%; height: 100%; object-fit: cover; display: block; transition: transform 300ms cubic-bezier(0.23, 1, 0.32, 1); }
    a:hover .thumb img { transform: scale(1.03); }
    .len { position: absolute; right: 6px; bottom: 6px; padding: 1px 4px; border-radius: 4px; background: rgb(0 0 0 / 80%); color: #fff; font-size: 12px; font-weight: 500; }
    .title { margin: 12px 0 4px; font-size: 16px; font-weight: 500; line-height: 22px; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
    .sub { color: var(--muted); }
    .skel .thumb { animation: pulse 1.4s ease-in-out infinite; }
    .skel .bar { height: 14px; margin-top: 12px; border-radius: 4px; background: var(--skel); width: 85%; animation: pulse 1.4s ease-in-out infinite; }
    .skel .bar.short { width: 50%; margin-top: 8px; }
    @keyframes pulse { 50% { opacity: 0.55; } }
    .state { padding: 80px 0; text-align: center; color: var(--muted); }
    .state button { all: unset; cursor: pointer; margin-top: 12px; padding: 8px 14px; border-radius: 18px; background: var(--chip); color: var(--text); font-weight: 500; }
    @media (prefers-reduced-motion: reduce) { * { animation: none !important; transition: none !important; } }
  `

  function mount() {
    const browse = document.querySelector('ytd-browse[page-subtype="home"], ytm-browse')
    if (!browse) return false
    if (!host) {
      host = document.createElement('yco-feed')
      const root = host.attachShadow({ mode: 'closed' })
      root.innerHTML = `<style>${CSS}</style>
        <div class="wrap">
          <div class="head">
            <div><h2></h2><div class="blurb"></div></div>
            <div class="controls">
              <button class="ghost" data-act="shuffle" type="button">Shuffle</button>
              <div class="seg" role="group" aria-label="Home feed">
                <button type="button" data-mode="normal">Normal</button>
                <button type="button" data-mode="cats">Cats</button>
                <button type="button" data-mode="fern">Fern</button>
              </div>
            </div>
          </div>
          <div class="body"></div>
        </div>`
      ui = { root, h2: root.querySelector('h2'), blurb: root.querySelector('.blurb'), body: root.querySelector('.body') }
      root.addEventListener('click', (e) => {
        const b = e.target.closest('button')
        if (!b) return
        if (b.dataset.mode) chrome.storage.local.set({ feedMode: b.dataset.mode })
        if (b.dataset.act === 'shuffle') mode === 'cats' ? load(true) : shuffle()
        if (b.dataset.act === 'retry') load(true)
      })
    }
    host.dataset.theme = document.documentElement.hasAttribute('dark') ? 'dark' : 'light'
    if (host.parentNode !== browse) browse.prepend(host)
    return true
  }

  function card(v) {
    const a = document.createElement('a')
    a.href = `/watch?v=${encodeURIComponent(v.id)}`
    a.innerHTML = `<div class="thumb"><img loading="lazy" alt=""></div><div class="title"></div><div class="sub"></div>`
    a.querySelector('img').src = `https://i.ytimg.com/vi/${encodeURIComponent(v.id)}/hqdefault.jpg`
    if (v.length) {
      const len = document.createElement('span')
      len.className = 'len'
      len.textContent = v.length
      a.querySelector('.thumb').append(len)
    }
    a.querySelector('.title').textContent = v.title
    a.querySelector('.sub').textContent = [v.channel, v.meta].filter(Boolean).join(' · ')
    return a
  }

  function render() {
    if (!ui || mode === 'normal') return
    const cfg = MODES[mode]
    ui.h2.textContent = cfg.title
    ui.blurb.textContent = cfg.blurb
    ui.root.querySelectorAll('[data-mode]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.mode === mode)))
    const grid = document.createElement('div')
    grid.className = 'grid'
    if (loading) {
      for (let i = 0; i < 12; i++) {
        const s = document.createElement('div')
        s.className = 'skel'
        s.innerHTML = '<div class="thumb"></div><div class="bar"></div><div class="bar short"></div>'
        grid.append(s)
      }
      ui.body.replaceChildren(grid)
    } else if (failed) {
      const s = document.createElement('div')
      s.className = 'state'
      s.innerHTML = `<div></div><button type="button" data-act="retry">Try again</button>`
      s.firstChild.textContent =
        mode === 'cats' ? "Couldn't fetch cat videos from YouTube just now." : "Couldn't load Fern's videos just now."
      ui.body.replaceChildren(s)
    } else {
      grid.append(...order.map(card))
      ui.body.replaceChildren(grid)
    }
  }

  /* ---------- switch in the shared corner panel ---------- */

  let cornerRow = null
  function renderCorner() {
    const corner = globalThis.ycoCorner
    if (!corner) return
    if (!cornerRow) {
      cornerRow = corner.row('feed', 10)
      cornerRow.innerHTML = `<span>Home feed</span>
        <div class="seg">
          <button type="button" data-mode="normal">Normal</button>
          <button type="button" data-mode="cats">Cats</button>
          <button type="button" data-mode="fern">Fern</button>
        </div>`
      cornerRow.addEventListener('click', (e) => {
        const b = e.target.closest('button[data-mode]')
        if (b) chrome.storage.local.set({ feedMode: b.dataset.mode })
      })
    }
    cornerRow.hidden = !isHome()
    cornerRow.querySelectorAll('[data-mode]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.mode === mode)))
    corner.refresh()
  }

  /* ---------- when to show it ---------- */

  function apply() {
    clearInterval(ensureTimer)
    renderCorner()
    const on = mode !== 'normal' && isHome() && !blinders()
    document.documentElement.classList.toggle('rh-themed', on)
    if (!on) {
      host?.remove()
      return
    }
    const ready = () => {
      if (!mount()) return
      if (!items && !loading && !failed) load()
      else render()
    }
    ready()
    // YouTube builds the page lazily and sometimes rebuilds it; stay put.
    ensureTimer = setInterval(() => {
      if (!host?.isConnected || !host.parentNode?.matches?.('ytd-browse[page-subtype="home"], ytm-browse')) ready()
    }, 800)
  }

  chrome.storage.onChanged.addListener((changes) => {
    if ('feedMode' in changes) {
      const next = changes.feedMode.newValue || 'normal'
      if (next !== mode) {
        mode = next
        items = null
        failed = false
        loading = false
        apply()
      }
    }
    if ('pass' in changes) setTimeout(apply, 0)
  })

  document.addEventListener('yt-navigate-finish', () => {
    if (isHome() && items) shuffle()
    apply()
  })

  chrome.storage.local.get('feedMode').then(({ feedMode }) => {
    mode = feedMode || 'normal'
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', apply, { once: true })
    else apply()
  })
})()
