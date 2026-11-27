// Forgets searches as you make them, and applies the same rule to searches
// already in history: once when the feature turns on, and again whenever the
// "keep after" number changes.
import { isEnabled } from '../../core/settings.js'
import { onSearchVisit, cleanUpPast } from './searches.js'

const FEATURE = 'forget-searches'

chrome.history.onVisited.addListener(async (item) => {
  if (await isEnabled(FEATURE)) await onSearchVisit(item.url)
})

async function sweepOnce() {
  if (!(await isEnabled(FEATURE))) return
  const { searchSweptAll } = await chrome.storage.local.get('searchSweptAll')
  if (searchSweptAll) return
  await cleanUpPast()
  await chrome.storage.local.set({ searchSweptAll: true })
}
chrome.runtime.onInstalled.addListener(sweepOnce)
chrome.runtime.onStartup.addListener(sweepOnce)

chrome.storage.onChanged.addListener(async (changes) => {
  if ('features' in changes) {
    const before = changes.features.oldValue?.[FEATURE]
    const after = changes.features.newValue?.[FEATURE]
    if (after === true && before !== true) await cleanUpPast()
  }
  if ('searchKeepAfter' in changes && (await isEnabled(FEATURE))) await cleanUpPast()
})
