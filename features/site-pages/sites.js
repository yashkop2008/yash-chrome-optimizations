// "Just the site": for listed sites, history keeps only the home page, so
// typing "you" in the address bar offers youtube.com and nothing else.
import { allHistory, hostOf, onSite } from '../../core/history.js'

export const DEFAULT_SITES = ['youtube.com']

// Titles our own pages gave a site's home page in history (the YouTube gate
// opens in its place, and Chrome files youtube.com under the gate's title).
const OUR_TITLES = /Rabbit Hole|YouTube gate|Yash's Chrome/i

export async function getSites() {
  const { sitePages } = await chrome.storage.local.get('sitePages')
  return sitePages || DEFAULT_SITES
}

export function normaliseSite(input) {
  const raw = String(input || '').trim().toLowerCase()
  if (!raw) return ''
  try {
    return hostOf(raw.includes('://') ? raw : `https://${raw}`)
  } catch {
    return ''
  }
}

const isHomePage = (url) => {
  try {
    return new URL(url).pathname === '/'
  } catch {
    return false
  }
}

async function countRemoved(n) {
  if (!n) return
  const { sitePagesForgotten = 0 } = await chrome.storage.local.get('sitePagesForgotten')
  await chrome.storage.local.set({ sitePagesForgotten: sitePagesForgotten + n })
}

// Removes every page of the listed sites except their home pages, and gives a
// home page that's filed under one of our titles a clean entry.
async function tidy(items, sites) {
  let removed = 0
  for (const h of items) {
    if (!sites.some((s) => onSite(h.url, s))) continue
    if (!isHomePage(h.url)) {
      await chrome.history.deleteUrl({ url: h.url })
      removed++
    } else if (OUR_TITLES.test(h.title || '')) {
      await chrome.history.deleteUrl({ url: h.url })
      await chrome.history.addUrl({ url: h.url })
    }
  }
  await countRemoved(removed)
  return removed
}

// Everything in history, once: when the feature is switched on or a site is added.
export async function sweepAll(onlySites) {
  return tidy(await allHistory(), onlySites || (await getSites()))
}

// The recent past, often: catches visits Chrome didn't report one by one,
// such as pages the YouTube gate opened in place of.
export async function sweepRecent(hours = 72, onlySites) {
  const sites = onlySites || (await getSites())
  let removed = 0
  for (const site of sites) {
    const items = await chrome.history.search({ text: site, startTime: Date.now() - hours * 36e5, maxResults: 10000 })
    removed += await tidy(items, [site])
  }
  return removed
}

export const sweepNow = async (items) => tidy(items, await getSites())

export const isListed = async (url) => (await getSites()).some((s) => onSite(url, s))
