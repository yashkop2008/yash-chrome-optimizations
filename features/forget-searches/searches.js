// Recognising searches in history and deciding which ones to keep.
import { allHistory } from '../../core/history.js'

const ENGINES = [
  { host: /(^|\.)google\.[a-z.]+$/, path: /^\/search$/, param: 'q' },
  { host: /(^|\.)bing\.com$/, path: /^\/search$/, param: 'q' },
  { host: /(^|\.)duckduckgo\.com$/, path: /^\/$/, param: 'q' },
  { host: /(^|\.)search\.yahoo\.com$/, path: /^\/search/, param: 'p' },
  { host: /(^|\.)youtube\.com$/, path: /^\/results$/, param: 'search_query' },
]
const SAME_SEARCH_MS = 10 * 60 * 1000 // a reload or a back-and-forth isn't a second search
const KEEP_DAYS = 180
const MAX = 3000

export function searchQuery(url) {
  let u
  try {
    u = new URL(url)
  } catch {
    return null
  }
  const engine = ENGINES.find((e) => e.host.test(u.hostname) && e.path.test(u.pathname))
  const q = engine && u.searchParams.get(engine.param)
  return q ? q.toLowerCase().replace(/\s+/g, ' ').trim() : null
}

export async function settings() {
  const { searchKeepAfter = 2, searchCounts = {}, searchForgotten = 0 } = await chrome.storage.local.get([
    'searchKeepAfter',
    'searchCounts',
    'searchForgotten',
  ])
  return { keepAfter: searchKeepAfter, counts: searchCounts, forgotten: searchForgotten }
}

function prune(counts) {
  const cutoff = Date.now() - KEEP_DAYS * 864e5
  return Object.fromEntries(
    Object.entries(counts)
      .filter(([, r]) => r.t > cutoff)
      .sort(([, a], [, b]) => b.t - a.t)
      .slice(0, MAX),
  )
}

// One visit to a search page: count it, and forget it unless it has now been
// searched often enough to be worth suggesting.
export async function onSearchVisit(url) {
  const q = searchQuery(url)
  if (!q) return false
  const { keepAfter, counts, forgotten } = await settings()
  const rec = counts[q]?.live ? counts[q] : { n: 0, t: 0, live: true }
  if (Date.now() - rec.t > SAME_SEARCH_MS) rec.n += 1
  rec.t = Date.now()
  counts[q] = rec
  const forget = rec.n < keepAfter
  if (forget) await chrome.history.deleteUrl({ url })
  await chrome.storage.local.set({ searchCounts: prune(counts), searchForgotten: forgotten + (forget ? 1 : 0) })
  return forget
}

// Go through everything already in history once.
// How many separate times a search was made, from the visit times Chrome
// keeps. One search leaves several history entries (the address Chrome opens,
// then the one Google rewrites it to, then filters or page 2), so counting
// entries made one-time searches look repeated. Visits less than half an hour
// apart are one occasion.
const OCCASION_GAP_MS = 30 * 60 * 1000

async function occasions(items) {
  const times = []
  for (const h of items) {
    const visits = await chrome.history.getVisits({ url: h.url })
    if (visits.length) times.push(...visits.map((v) => v.visitTime))
    else if (h.lastVisitTime) times.push(h.lastVisitTime)
  }
  times.sort((a, b) => a - b)
  let n = 0
  let last = -Infinity
  for (const t of times) {
    if (t - last > OCCASION_GAP_MS) n++
    last = t
  }
  return n
}

// Go through everything already in history: anything searched on fewer
// occasions than the "keep after" number goes.
export async function cleanUpPast() {
  const { keepAfter, counts, forgotten } = await settings()
  const byQuery = new Map()
  for (const h of await allHistory()) {
    const q = searchQuery(h.url)
    if (!q) continue
    if (!byQuery.has(q)) byQuery.set(q, [])
    byQuery.get(q).push(h)
  }
  let removed = 0
  for (const [q, items] of byQuery) {
    // Counts written as searches happen are trusted; ones an older version
    // derived from history (by counting entries) are not.
    const live = counts[q]?.live ? counts[q].n : 0
    const times = Math.max(await occasions(items), live)
    if (times < keepAfter) {
      for (const h of items) await chrome.history.deleteUrl({ url: h.url })
      delete counts[q]
      removed++
    } else {
      counts[q] = { n: times, t: Math.max(...items.map((h) => h.lastVisitTime || 0)), live: true }
    }
  }
  await chrome.storage.local.set({ searchCounts: prune(counts), searchForgotten: forgotten + removed })
  return { removed, kept: byQuery.size - removed }
}
