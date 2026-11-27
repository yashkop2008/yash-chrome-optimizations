// "Just the site": for listed sites, history keeps only the home page.
import { allHistory, hostOf, onSite } from '../../core/history.js'

export const DEFAULT_SITES = ['youtube.com']

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

export const shouldForget = (url, sites) => !isHomePage(url) && sites.some((s) => onSite(url, s))

export async function onPageVisit(url) {
  if (!shouldForget(url, await getSites())) return false
  await chrome.history.deleteUrl({ url })
  const { sitePagesForgotten = 0 } = await chrome.storage.local.get('sitePagesForgotten')
  await chrome.storage.local.set({ sitePagesForgotten: sitePagesForgotten + 1 })
  return true
}

export async function cleanUpPast(onlySites) {
  const sites = onlySites || (await getSites())
  let removed = 0
  for (const h of await allHistory()) {
    if (shouldForget(h.url, sites)) {
      await chrome.history.deleteUrl({ url: h.url })
      removed++
    }
  }
  const { sitePagesForgotten = 0 } = await chrome.storage.local.get('sitePagesForgotten')
  await chrome.storage.local.set({ sitePagesForgotten: sitePagesForgotten + removed })
  return removed
}
