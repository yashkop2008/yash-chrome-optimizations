// Keeps listed sites down to their home page in history, without anyone
// pressing a button: a full sweep when the feature turns on or a site is
// added, a sweep of that site whenever you visit it, and a light sweep every
// half hour for anything that slipped through.
import { isEnabled } from '../../core/settings.js'
import { sweepAll, sweepRecent, sweepNow, isListed, getSites } from './sites.js'

const FEATURE = 'site-pages'
const ALARM = 'site-pages-sweep'
let visitTimer = 0

chrome.history.onVisited.addListener(async (item) => {
  if (!(await isEnabled(FEATURE)) || !(await isListed(item.url))) return
  await sweepNow([item])
  // A burst of navigation inside a site is one sweep, a few seconds later.
  clearTimeout(visitTimer)
  visitTimer = setTimeout(() => sweepRecent(72), 3000)
})

chrome.alarms.onAlarm.addListener(async (a) => {
  if (a.name === ALARM && (await isEnabled(FEATURE))) sweepRecent(2)
})

async function start() {
  chrome.alarms.create(ALARM, { periodInMinutes: 30 })
  if (await isEnabled(FEATURE)) {
    const { sitePagesSweptAll } = await chrome.storage.local.get('sitePagesSweptAll')
    if (!sitePagesSweptAll) {
      await sweepAll()
      await chrome.storage.local.set({ sitePagesSweptAll: true })
    }
  }
}
chrome.runtime.onInstalled.addListener(start)
chrome.runtime.onStartup.addListener(start)

chrome.storage.onChanged.addListener(async (changes) => {
  if ('features' in changes) {
    const before = changes.features.oldValue?.[FEATURE]
    const after = changes.features.newValue?.[FEATURE]
    if (after === true && before !== true) {
      await sweepAll()
      await chrome.storage.local.set({ sitePagesSweptAll: true })
    }
  }
  if ('sitePages' in changes && (await isEnabled(FEATURE))) {
    const added = (changes.sitePages.newValue || []).filter((s) => !(changes.sitePages.oldValue || []).includes(s))
    if (added.length) await sweepAll(added)
  }
})

export { getSites }
