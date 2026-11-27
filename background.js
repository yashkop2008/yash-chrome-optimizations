// Service worker. Features with background work are imported statically
// (service workers can't import() on demand) and each checks its own switch.
import { syncContentScripts } from './core/settings.js'
import { installUpdaterBackground } from './updater/updater.js'
import './features/youtube-gate/background.js'

installUpdaterBackground()

chrome.runtime.onInstalled.addListener(async ({ reason }) => {
  await syncContentScripts()
  if (reason === 'install') chrome.tabs.create({ url: chrome.runtime.getURL('settings/settings.html#welcome') })
})
chrome.runtime.onStartup.addListener(syncContentScripts)
chrome.storage.onChanged.addListener((changes) => {
  if ('features' in changes) syncContentScripts()
})
