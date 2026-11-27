// "Forget one-time pages": a page you've opened on only one occasion leaves
// history (and so the address bar); a page you come back to stays. Home pages
// always stay. Searches and listed sites have their own features.
import { allHistory } from '../../core/history.js'
import { searchQuery } from '../forget-searches/searches.js'
import { isListed } from '../site-pages/sites.js'

const OCCASION_GAP_MS = 30 * 60 * 1000 // visits closer than this are one occasion
const KEEP_DAYS = 90
const MAX = 5000

const keyOf = (url) => {
  try {
    const u = new URL(url)
    return u.origin + u.pathname + u.search
  } catch {
    return null
  }
}

async function exempt(url) {
  let u
  try {
    u = new URL(url)
  } catch {
    return true
  }
  if (!/^https?:$/.test(u.protocol)) return true // chrome://, extension pages, files
  if (u.pathname === '/' && !u.search) return true // a site itself is a good suggestion
  if (searchQuery(url)) return true // "Forget one-time searches" decides these
  if (await isListed(url)) return true // so does "Just the site"
  return false
}

export async function settings() {
  const { pageKeepAfter = 2, pageCounts = {}, pagesForgotten = 0 } = await chrome.storage.local.get([
    'pageKeepAfter',
    'pageCounts',
    'pagesForgotten',
  ])
  return { keepAfter: pageKeepAfter, counts: pageCounts, forgotten: pagesForgotten }
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

function countOccasions(times) {
  times.sort((a, b) => a - b)
  let n = 0
  let last = -Infinity
  for (const t of times) {
    if (t - last > OCCASION_GAP_MS) n++
    last = t
  }
  return n
}

async function occasionsOf(url) {
  const visits = await chrome.history.getVisits({ url })
  return countOccasions(visits.map((v) => v.visitTime))
}

export async function onPageVisit(url) {
  if (await exempt(url)) return false
  const key = keyOf(url)
  const { keepAfter, counts, forgotten } = await settings()
  let rec = counts[key]
  if (!rec) {
    // First time we see it: start from what history already knows, so a page
    // you've returned to for years isn't treated as new.
    rec = { n: Math.max(1, await occasionsOf(url)), t: Date.now() }
  } else if (Date.now() - rec.t > OCCASION_GAP_MS) {
    rec = { n: rec.n + 1, t: Date.now() }
  } else {
    rec = { ...rec, t: Date.now() }
  }
  counts[key] = rec
  const forget = rec.n < keepAfter
  if (forget) await chrome.history.deleteUrl({ url })
  await chrome.storage.local.set({ pageCounts: prune(counts), pagesForgotten: forgotten + (forget ? 1 : 0) })
  return forget
}

export async function cleanUpPast() {
  const { keepAfter, counts, forgotten } = await settings()
  let removed = 0
  for (const h of await allHistory()) {
    if (await exempt(h.url)) continue
    const key = keyOf(h.url)
    // One visit is one occasion; only look closer when there were more.
    const n = Math.max(h.visitCount > 1 ? await occasionsOf(h.url) : 1, counts[key]?.n || 0)
    if (n < keepAfter) {
      await chrome.history.deleteUrl({ url: h.url })
      removed++
    } else {
      counts[key] = { n, t: h.lastVisitTime || Date.now() }
    }
  }
  await chrome.storage.local.set({ pageCounts: prune(counts), pagesForgotten: forgotten + removed })
  return removed
}
