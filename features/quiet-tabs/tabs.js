// Quiet tabs: tabs you haven't touched in a while close into a "parked tabs"
// list (one click brings them back), duplicate tabs merge, and extra empty new
// tabs go. Never touched: pinned tabs, tabs playing audio, tabs in a group,
// and the tab you're on in each window.

export const IDLE_CHOICES = [12, 24, 72] // hours
const MAX_PARKED = 200

const isNewTab = (url = '') =>
  url === 'chrome://newtab/' || url.startsWith('chrome://new-tab-page') || url === chrome.runtime.getURL('newtab.html')
const sameKey = (url = '') => {
  try {
    const u = new URL(url)
    u.hash = ''
    return u.href
  } catch {
    return url
  }
}

export async function settings() {
  const { tabsIdleHours = 24, parkedTabs = [] } = await chrome.storage.local.get(['tabsIdleHours', 'parkedTabs'])
  return { idleHours: tabsIdleHours, parked: parkedTabs }
}

const untouchable = (t) => t.pinned || t.audible || t.active || (t.groupId ?? -1) !== -1

async function park(tabs) {
  if (!tabs.length) return
  const { parked } = await settings()
  const add = tabs
    .filter((t) => t.url && !isNewTab(t.url) && /^(https?|file|chrome-extension):/.test(t.url))
    .map((t) => ({ url: t.url, title: t.title || t.url, at: Date.now() }))
  const urls = new Set(add.map((p) => p.url))
  await chrome.storage.local.set({ parkedTabs: [...add, ...parked.filter((p) => !urls.has(p.url))].slice(0, MAX_PARKED) })
  await chrome.tabs.remove(tabs.map((t) => t.id))
}

// One pass over every window.
export async function tidy() {
  const { idleHours } = await settings()
  const tabs = await chrome.tabs.query({})
  const now = Date.now()
  const closing = new Set()

  // Duplicates: keep the one you used most recently (or the active one).
  const byKey = new Map()
  for (const t of tabs) {
    if (isNewTab(t.url)) continue
    const k = `${t.windowId}|${sameKey(t.url)}`
    if (!byKey.has(k)) byKey.set(k, [])
    byKey.get(k).push(t)
  }
  for (const group of byKey.values()) {
    if (group.length < 2) continue
    group.sort((a, b) => Number(b.active) - Number(a.active) || (b.lastAccessed || 0) - (a.lastAccessed || 0))
    for (const t of group.slice(1)) if (!untouchable(t)) closing.add(t.id)
  }

  // Empty new tabs: at most one per window, and not one you're looking at.
  await closeExtraNewTabs(tabs, closing)

  // Idle: not looked at for the chosen number of hours.
  const idle = tabs.filter(
    (t) => !closing.has(t.id) && !untouchable(t) && !isNewTab(t.url) && t.lastAccessed && now - t.lastAccessed > idleHours * 36e5,
  )
  const dupes = tabs.filter((t) => closing.has(t.id))
  if (dupes.length) await chrome.tabs.remove(dupes.map((t) => t.id))
  await park(idle)
  return { duplicates: dupes.length, parked: idle.length }
}

export async function closeExtraNewTabs(tabs, closing = new Set()) {
  const perWindow = new Map()
  for (const t of tabs) {
    if (!isNewTab(t.url) && !isNewTab(t.pendingUrl)) continue
    if (!perWindow.has(t.windowId)) perWindow.set(t.windowId, [])
    perWindow.get(t.windowId).push(t)
  }
  for (const list of perWindow.values()) {
    list.sort((a, b) => Number(b.active) - Number(a.active) || (b.id - a.id))
    for (const t of list.slice(1)) if (!t.pinned && !t.active) closing.add(t.id)
  }
  return closing
}

export async function restore(url, { all = false } = {}) {
  const { parked } = await settings()
  const back = all ? parked : parked.filter((p) => p.url === url)
  for (const p of back) await chrome.tabs.create({ url: p.url, active: !all })
  await chrome.storage.local.set({ parkedTabs: all ? [] : parked.filter((p) => p.url !== url) })
}
