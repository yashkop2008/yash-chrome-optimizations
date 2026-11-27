// Helpers for features that curate Chrome's history (which is what the
// address bar's dropdown suggests from).

// Everything in history, newest first. Chrome caps a single query, so this
// walks backwards in time until nothing older is left.
export async function allHistory() {
  const out = []
  const seen = new Set()
  let endTime = Date.now()
  for (let i = 0; i < 50; i++) {
    const batch = await chrome.history.search({ text: '', startTime: 0, endTime, maxResults: 10000 })
    const fresh = batch.filter((h) => !seen.has(h.url))
    if (!fresh.length) break
    for (const h of fresh) {
      seen.add(h.url)
      out.push(h)
    }
    const oldest = Math.min(...batch.map((h) => h.lastVisitTime || endTime))
    if (oldest >= endTime) break
    endTime = oldest
  }
  return out
}

export const hostOf = (url) => {
  try {
    return new URL(url).hostname.replace(/^www\./, '').toLowerCase()
  } catch {
    return ''
  }
}

export const onSite = (url, site) => {
  const h = hostOf(url)
  return h === site || h.endsWith(`.${site}`)
}
