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
  const rec = counts[q] || { n: 0, t: 0 }
  if (Date.now() - rec.t > SAME_SEARCH_MS) rec.n += 1
  rec.t = Date.now()
  counts[q] = rec
  const forget = rec.n < keepAfter
  if (forget) await chrome.history.deleteUrl({ url })
  await chrome.storage.local.set({ searchCounts: prune(counts), searchForgotten: forgotten + (forget ? 1 : 0) })
  return forget
}

// Go through everything already in history once.
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
    // A query's separate result URLs (different filters, pages) are one search.
    const times = Math.max(items.length, ...items.map((h) => h.typedCount || 0), counts[q]?.n || 0)
    if (times < keepAfter) {
      for (const h of items) await chrome.history.deleteUrl({ url: h.url })
      removed++
    } else {
      counts[q] = { n: Math.max(times, counts[q]?.n || 0), t: Math.max(...items.map((h) => h.lastVisitTime || 0)) }
    }
  }
  await chrome.storage.local.set({ searchCounts: prune(counts), searchForgotten: forgotten + removed })
  return { removed, kept: byQuery.size - removed }
}
