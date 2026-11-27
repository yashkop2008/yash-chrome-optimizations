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
  if (a.name !== ALARM || !(await isEnabled(FEATURE))) return
  await sweepRecent(2)
  await ensureFullSweep()
})

// A full sweep whenever the background wakes and the last one is more than
// six hours old. Deliberately not tied to install/update events: Chrome
// doesn't always deliver those (for example when it restarts with new files
// on disk), and a missed sweep is exactly how old videos stayed suggested.
const FULL_EVERY_MS = 6 * 60 * 60 * 1000
let fullSweep = null

async function ensureFullSweep() {
  if (fullSweep) return fullSweep
  fullSweep = (async () => {
    chrome.alarms.get(ALARM).then((a) => a || chrome.alarms.create(ALARM, { periodInMinutes: 30 }))
    if (!(await isEnabled(FEATURE))) return
    const { sitePagesLastFull = 0 } = await chrome.storage.local.get('sitePagesLastFull')
    if (Date.now() - sitePagesLastFull < FULL_EVERY_MS) return
    await sweepAll()
    await chrome.storage.local.set({ sitePagesLastFull: Date.now(), sitePagesSweptAll: true })
  })().finally(() => (fullSweep = null))
  return fullSweep
}
ensureFullSweep()
chrome.runtime.onInstalled.addListener(ensureFullSweep)
chrome.runtime.onStartup.addListener(ensureFullSweep)

chrome.storage.onChanged.addListener(async (changes) => {
  if ('features' in changes) {
    const before = changes.features.oldValue?.[FEATURE]
    const after = changes.features.newValue?.[FEATURE]
    if (after === true && before !== true) {
      await sweepAll()
      await chrome.storage.local.set({ sitePagesLastFull: Date.now(), sitePagesSweptAll: true })
    }
  }
  if ('sitePages' in changes && (await isEnabled(FEATURE))) {
    const added = (changes.sitePages.newValue || []).filter((s) => !(changes.sitePages.oldValue || []).includes(s))
    if (added.length) await sweepAll(added)
  }
})

export { getSites }
