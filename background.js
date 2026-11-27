// Service worker. Features with background work are imported statically
// (service workers can't import() on demand) and each checks its own switch.
import { syncContentScripts } from './core/settings.js'
import { installUpdaterBackground } from './updater/updater.js'
import './features/youtube-gate/background.js'
import './features/forget-searches/background.js'
import './features/site-pages/background.js'
import './features/forget-pages/background.js'
import './features/live-suggestions/background.js'

installUpdaterBackground()

const HUB = chrome.runtime.getURL('settings/settings.html')

// Clicking the toolbar icon opens the hub, or brings it forward if it's open.
async function openHub(hash = '') {
  const [existing] = await chrome.runtime.getContexts({ contextTypes: ['TAB'] })
    .then((all) => all.filter((c) => c.documentUrl?.startsWith(HUB)))
  if (existing && existing.tabId >= 0) {
    await chrome.tabs.update(existing.tabId, { active: true })
    await chrome.windows.update(existing.windowId, { focused: true })
  } else {
    await chrome.tabs.create({ url: HUB + hash })
  }
}
chrome.action.onClicked.addListener(() => openHub())

chrome.runtime.onInstalled.addListener(async ({ reason }) => {
  await syncContentScripts()
  if (reason === 'install') openHub('#welcome')
})
chrome.runtime.onStartup.addListener(syncContentScripts)
chrome.storage.onChanged.addListener((changes) => {
  if ('features' in changes) syncContentScripts()
})

// The extension's own pages (the YouTube gate, the hub) are never useful as
// address-bar suggestions, so they don't stay in history.
chrome.history.onVisited.addListener((item) => {
  if (item.url.startsWith(chrome.runtime.getURL(''))) chrome.history.deleteUrl({ url: item.url })
})
