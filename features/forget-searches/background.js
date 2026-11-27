// Forgets searches as you make them, and applies the same rule to searches
// already in history: once when the feature turns on, and again whenever the
// "keep after" number changes.
import { isEnabled } from '../../core/settings.js'
import { onSearchVisit, cleanUpPast } from './searches.js'

const FEATURE = 'forget-searches'

chrome.history.onVisited.addListener(async (item) => {
  if (await isEnabled(FEATURE)) await onSearchVisit(item.url)
})

// Same rule for searches already in history: checked whenever the background
// wakes (not only on install/update, which Chrome doesn't always report), at
// most every six hours.
const FULL_EVERY_MS = 6 * 60 * 60 * 1000
let running = null

async function ensureSwept() {
  if (running) return running
  running = (async () => {
    if (!(await isEnabled(FEATURE))) return
    const { searchLastFull2: searchLastFull = 0 } = await chrome.storage.local.get('searchLastFull2')
    if (Date.now() - searchLastFull < FULL_EVERY_MS) return
    await cleanUpPast()
    await chrome.storage.local.set({ searchLastFull2: Date.now(), searchSweptAll: true })
  })().finally(() => (running = null))
  return running
}
ensureSwept()
chrome.runtime.onInstalled.addListener(ensureSwept)
chrome.runtime.onStartup.addListener(ensureSwept)

chrome.storage.onChanged.addListener(async (changes) => {
  if ('features' in changes) {
    const before = changes.features.oldValue?.[FEATURE]
    const after = changes.features.newValue?.[FEATURE]
    if (after === true && before !== true) await cleanUpPast()
  }
  if ('searchKeepAfter' in changes && (await isEnabled(FEATURE))) await cleanUpPast()
})
