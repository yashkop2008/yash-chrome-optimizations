// Canvas to-do, on Canvas's own pages. A request from Canvas's own page always
// carries your sign-in, whatever the profile's cookie settings, so whenever you
// open Canvas this reads your planner (as Canvas's To Do sidebar does) and hands
// it to the extension. The new tab shows the latest copy. Keep the window in
// step with canvas.js (30 days back for late work, 7 ahead).
;(() => {
  if (window.top !== window || !location.protocol.startsWith('https')) return
  try {
    // Once a minute is plenty, however many Canvas pages you click through.
    if (Date.now() - Number(sessionStorage.getItem('yco-canvas-at') || 0) < 60e3) return
    sessionStorage.setItem('yco-canvas-at', String(Date.now()))
  } catch {}
  const now = Date.now()
  const DAY = 864e5
  const q = new URLSearchParams({
    start_date: new Date(now - 30 * DAY).toISOString(),
    end_date: new Date(now + 7 * DAY).toISOString(),
    per_page: '100',
  })
  fetch(`/api/v1/planner/items?${q}`, { headers: { Accept: 'application/json' } })
    .then((r) => (r.ok ? r.text() : null))
    .then((text) => {
      if (!text) return
      const items = JSON.parse(text.replace(/^while\(1\);/, ''))
      if (Array.isArray(items)) chrome.runtime.sendMessage({ type: 'canvas-planner', items })
    })
    .catch(() => {})
})()
