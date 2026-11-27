// Forgets one-time pages as you open them, and applies the same rule to what's
// already in history whenever the background wakes (at most every six hours),
// when the feature is switched on, and when the "keep after" number changes.
import { isEnabled } from '../../core/settings.js'
import { onPageVisit, cleanUpPast } from './pages.js'

const FEATURE = 'forget-pages'
const FULL_EVERY_MS = 6 * 60 * 60 * 1000
let running = null

chrome.history.onVisited.addListener(async (item) => {
  if (await isEnabled(FEATURE)) await onPageVisit(item.url)
})

async function sweep(force = false) {
  if (running) return running
  running = (async () => {
    if (!(await isEnabled(FEATURE))) return
    const { pagesLastFull = 0 } = await chrome.storage.local.get('pagesLastFull')
    if (!force && Date.now() - pagesLastFull < FULL_EVERY_MS) return
    await cleanUpPast()
    await chrome.storage.local.set({ pagesLastFull: Date.now() })
  })().finally(() => (running = null))
  return running
}
sweep()
chrome.runtime.onStartup.addListener(() => sweep())

chrome.storage.onChanged.addListener((changes) => {
  if ('features' in changes) {
    const before = changes.features.oldValue?.[FEATURE]
    const after = changes.features.newValue?.[FEATURE]
    if (after === true && before !== true) sweep(true)
  }
  if ('pageKeepAfter' in changes) sweep(true)
})
