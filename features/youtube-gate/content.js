// Runs on YouTube. Three jobs:
// 1. If there is no pass, bounce to the gate (catches back/forward cache and
//    anything the network rule missed).
// 2. While a pass runs, show a small countdown in the corner; a search pass
//    also puts the blinders on (no feed, no Shorts, no recommendations).
// 3. When the pass ends, pause the video, say so, and hand back to the gate.
;(() => {
  const GATE = chrome.runtime.getURL('features/youtube-gate/gate.html')
  let pass = null
  let host = null
  let ui = null
  let tick = 0
  let ending = false

  const passLive = (p) => !!p && p.until > Date.now()

  async function check() {
    const s = await chrome.storage.local.get(['enabled', 'pauseUntil', 'pass', 'features'])
    const enabled = s.enabled !== false && s.features?.['youtube-gate'] !== false
    const paused = (s.pauseUntil || 0) > Date.now()
    pass = passLive(s.pass) ? s.pass : null
    document.documentElement.classList.toggle('rh-blinders', pass?.kind === 'search' && !paused)
    if (enabled && !paused && !pass) {
      location.replace(`${GATE}#${location.href}`)
      return
    }
    if (pass && !paused) mountPill()
    else unmountPill()
  }

  /* ---------- countdown pill ---------- */

  const CSS = `
    :host { all: initial; }
    .pill {
      --bg: #1a1a1a; --line: #333; --text: #ededed; --muted: #8a8a8a; --track: #2b2b2b; --warn: #f2c94c;
      position: fixed; right: 20px; bottom: 20px; z-index: 2147483646;
      display: flex; align-items: center; gap: 10px;
      height: 40px; padding: 0 6px 0 10px;
      border: 1px solid var(--line); border-radius: 999px; background: var(--bg); color: var(--text);
      box-shadow: 0 1px 2px rgb(0 0 0 / 28%), 0 18px 40px -24px rgb(0 0 0 / 72%);
      font: 500 13px/1 system-ui, -apple-system, 'Segoe UI', sans-serif;
      animation: in 220ms cubic-bezier(0.2, 0.9, 0.25, 1);
    }
    @media (prefers-color-scheme: light) {
      .pill { --bg: #fff; --line: #dedee2; --text: #27272a; --muted: #6b6b73; --track: #ececef; --warn: #b7791f;
        box-shadow: 0 1px 2px rgb(0 0 0 / 6%), 0 18px 40px -26px rgb(0 0 0 / 22%); }
    }
    @keyframes in { from { opacity: 0; transform: translateY(8px) scale(0.98); } }
    svg { display: block; transform: rotate(-90deg); }
    .track { stroke: var(--track); }
    .arc { stroke: var(--text); transition: stroke-dashoffset 900ms linear, stroke 300ms; }
    .low .arc { stroke: var(--warn); }
    .time { font-family: 'Geist Mono', ui-monospace, 'SF Mono', Menlo, Consolas, monospace; font-variant-numeric: tabular-nums; }
    .label { color: var(--muted); }
    button {
      all: unset; cursor: pointer; height: 28px; padding: 0 10px; border-radius: 999px;
      background: var(--text); color: var(--bg); font-weight: 600; font-size: 12px;
    }
    button:hover { opacity: 0.9; }
    button:focus-visible { outline: 2px solid var(--muted); outline-offset: 2px; }
    .veil {
      position: fixed; inset: 0; z-index: 2147483647; display: grid; place-items: center;
      background: rgb(10 10 10 / 72%); backdrop-filter: blur(14px); -webkit-backdrop-filter: blur(14px);
      font: 15px/1.45 system-ui, -apple-system, 'Segoe UI', sans-serif; color: #ededed; text-align: center;
      animation: fade 300ms ease-out;
    }
    .veil h2 { margin: 0 0 6px; font-size: 26px; font-weight: 600; letter-spacing: -0.015em; }
    .veil p { margin: 0; color: #a3a3a3; }
    @keyframes fade { from { opacity: 0; } }
    @media (prefers-reduced-motion: reduce) { * { animation: none !important; transition: none !important; } }
  `
  const R = 9
  const C = 2 * Math.PI * R

  function mountPill() {
    if (!document.body) {
      document.addEventListener('DOMContentLoaded', mountPill, { once: true })
      return
    }
    if (!host) {
      host = document.createElement('yco-timer')
      const root = host.attachShadow({ mode: 'closed' })
      root.innerHTML = `<style>${CSS}</style>
        <div class="pill" role="timer" aria-live="off">
          <svg width="22" height="22" viewBox="0 0 22 22" aria-hidden="true">
            <circle class="track" cx="11" cy="11" r="${R}" fill="none" stroke-width="2.5"/>
            <circle class="arc" cx="11" cy="11" r="${R}" fill="none" stroke-width="2.5" stroke-linecap="round"
              stroke-dasharray="${C}" stroke-dashoffset="0"/>
          </svg>
          <span class="time">0:00</span>
          <span class="label"></span>
          <button type="button">I'm done</button>
        </div>`
      ui = {
        root,
        pill: root.querySelector('.pill'),
        arc: root.querySelector('.arc'),
        time: root.querySelector('.time'),
        label: root.querySelector('.label'),
      }
      root.querySelector('button').addEventListener('click', () => chrome.runtime.sendMessage({ type: 'end-pass' }))
    }
    if (!host.isConnected) document.documentElement.appendChild(host)
    clearInterval(tick)
    update()
    tick = setInterval(update, 1000)
  }

  function unmountPill() {
    clearInterval(tick)
    host?.remove()
  }

  function update() {
    if (!pass || !ui) return
    const left = pass.until - Date.now()
    if (left <= 0) return timeUp('expired')
    const total = (pass.minutes || 5) * 60_000
    const secs = Math.ceil(left / 1000)
    ui.time.textContent = `${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, '0')}`
    ui.label.textContent = pass.kind === 'search' ? 'blinders on' : 'left'
    ui.arc.style.strokeDashoffset = String(C * (1 - left / total))
    ui.pill.classList.toggle('low', left < 60_000)
  }

  /* ---------- the end ---------- */

  function timeUp(reason) {
    if (ending) return
    ending = true
    clearInterval(tick)
    document.querySelectorAll('video').forEach((v) => v.pause())
    if (!host) {
      host = document.createElement('yco-timer')
      ui = { root: host.attachShadow({ mode: 'closed' }) }
      ui.root.innerHTML = `<style>${CSS}</style>`
    }
    if (!host.isConnected) document.documentElement.appendChild(host)
    const veil = document.createElement('div')
    veil.className = 'veil'
    const minutes = pass?.minutes
    veil.innerHTML = `<div><h2></h2><p></p></div>`
    veil.querySelector('h2').textContent = reason === 'ended' ? 'Climbing out.' : "Time's up."
    veil.querySelector('p').textContent =
      reason === 'ended'
        ? 'Good call. Back to what you were doing.'
        : minutes
          ? `That was your ${minutes} minutes. Back to the work.`
          : 'Back to the work.'
    ui.root.appendChild(veil)
    ui.pill?.remove()
    setTimeout(() => location.replace(`${GATE}#${location.href}`), reason === 'ended' ? 900 : 2200)
  }

  chrome.runtime.onMessage.addListener((msg) => {
    if (msg.type === 'time-up') timeUp(msg.reason)
  })

  chrome.storage.onChanged.addListener((changes) => {
    if (ending) return
    // A pass that just disappeared gets the "time's up" moment, not a silent bounce.
    if ('pass' in changes && pass && !passLive(changes.pass.newValue)) {
      const early = (changes.pass.oldValue?.until || 0) - Date.now() > 2000
      return timeUp(early ? 'ended' : 'expired')
    }
    if ('pass' in changes || 'pauseUntil' in changes || 'enabled' in changes || 'features' in changes) check()
  })

  // Shorts are the deepest part of the hole: under blinders, open them as a normal video.
  document.addEventListener('yt-navigate-finish', () => {
    if (!document.documentElement.classList.contains('rh-blinders')) return
    const m = /^\/shorts\/([\w-]+)/.exec(location.pathname)
    if (m) location.replace(`/watch?v=${m[1]}`)
  })

  window.addEventListener('pageshow', (e) => e.persisted && check())
  check()
})()
