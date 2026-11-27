// The bottom-left panel on YouTube's home page, shared by YouTube features.
// Invisible until the mouse goes to that corner. Each feature asks for a row
// with ycoCorner.row(key, order) and fills it; the panel shows only when at
// least one row is visible. Loaded by more than one feature, so it guards
// against running twice (content scripts of one extension share globals).
;(() => {
  if (globalThis.ycoCorner) return

  const ZONE_W = 340
  const ZONE_H = 160
  let host = null
  let root = null
  let panel = null
  let open = false
  let closeTimer = 0
  const rows = new Map()

  const CSS = `
    :host { all: initial; }
    .panel {
      --bg: #fff; --line: #dedee2; --text: #27272a; --muted: #6b6b73; --hover: rgb(39 39 42 / 6%);
      --seg: rgb(39 39 42 / 6%); --on: #27272a; --on-text: #fff;
      --shadow: 0 1px 2px rgb(0 0 0 / 6%), 0 18px 40px -26px rgb(0 0 0 / 22%);
      position: fixed; left: 20px; bottom: 20px; z-index: 2147483645;
      display: grid; gap: 8px; min-width: 264px; padding: 10px 10px 10px 14px;
      border: 1px solid var(--line); border-radius: 16px; background: var(--bg); color: var(--muted);
      box-shadow: var(--shadow);
      font: 500 13px/1.2 system-ui, -apple-system, 'Segoe UI', sans-serif;
      opacity: 0; transform: translateY(8px) scale(0.98); pointer-events: none;
      transition: opacity 160ms cubic-bezier(0.2, 0.9, 0.25, 1), transform 160ms cubic-bezier(0.2, 0.9, 0.25, 1);
    }
    :host([data-theme='dark']) .panel {
      --bg: #1a1a1a; --line: #333; --text: #ededed; --muted: #8a8a8a; --hover: rgb(237 237 237 / 8%);
      --seg: rgb(0 0 0 / 34%); --on: #ededed; --on-text: #101010;
      --shadow: 0 1px 2px rgb(0 0 0 / 28%), 0 18px 40px -24px rgb(0 0 0 / 72%);
    }
    :host([data-open]) .panel { opacity: 1; transform: none; pointer-events: auto; }
    .row { display: flex; align-items: center; justify-content: space-between; gap: 12px; min-height: 30px; }
    .row[hidden] { display: none; }
    .row:not([hidden]) ~ .row:not([hidden]) { padding-top: 8px; border-top: 1px solid var(--line); }
    b { color: var(--text); font-weight: 600; font-variant-numeric: tabular-nums; }
    .seg { display: inline-flex; gap: 2px; padding: 2px; border-radius: 10px; background: var(--seg); }
    button { all: unset; cursor: pointer; height: 26px; padding: 0 10px; border-radius: 8px; color: var(--text); display: inline-flex; align-items: center; }
    button:hover { background: var(--hover); }
    .seg button[aria-pressed='true'] { background: var(--on); color: var(--on-text); }
    button:focus-visible { outline: 2px solid var(--muted); outline-offset: 1px; }
    @media (prefers-reduced-motion: reduce) { .panel { transition: none; } }
  `

  function build() {
    host = document.createElement('yco-corner')
    root = host.attachShadow({ mode: 'closed' })
    root.innerHTML = `<style>${CSS}</style><div class="panel" role="group" aria-label="Yash's Chrome"></div>`
    panel = root.querySelector('.panel')
    // Keyboard users can still reach it: focusing inside keeps it open.
    root.addEventListener('focusin', () => setOpen(true))
    root.addEventListener('focusout', () => setOpen(false))
  }

  function setOpen(next) {
    clearTimeout(closeTimer)
    if (next === open) return
    if (next) {
      open = true
      host?.setAttribute('data-open', '')
    } else {
      closeTimer = setTimeout(() => {
        open = false
        host?.removeAttribute('data-open')
      }, 300)
    }
  }

  // Watch the pointer instead of laying an invisible box over YouTube, so
  // nothing underneath the corner stops being clickable.
  let raf = 0
  document.addEventListener(
    'mousemove',
    (e) => {
      if (raf || !host?.isConnected) return
      raf = requestAnimationFrame(() => {
        raf = 0
        setOpen(e.clientX <= ZONE_W && e.clientY >= innerHeight - ZONE_H)
      })
    },
    { passive: true },
  )
  document.addEventListener('mouseleave', () => setOpen(false))

  const isHome = () => location.pathname === '/'
  const blinders = () => document.documentElement.classList.contains('rh-blinders')

  function refresh() {
    if (!host) return
    const anyVisible = [...rows.values()].some((r) => !r.hidden)
    if (!isHome() || blinders() || !anyVisible) {
      host.remove()
      return
    }
    host.dataset.theme = document.documentElement.hasAttribute('dark') ? 'dark' : 'light'
    if (!host.isConnected) document.documentElement.appendChild(host)
  }

  function row(key, order = 0) {
    if (!host) build()
    if (rows.has(key)) return rows.get(key)
    const el = document.createElement('div')
    el.className = 'row'
    el.dataset.order = String(order)
    rows.set(key, el)
    const after = [...panel.children].find((c) => Number(c.dataset.order) > order)
    panel.insertBefore(el, after || null)
    return el
  }

  document.addEventListener('yt-navigate-finish', refresh)
  globalThis.ycoCorner = { row, refresh }
})()
