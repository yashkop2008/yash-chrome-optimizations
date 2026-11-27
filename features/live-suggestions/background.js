// Google's live suggestions can only be switched on or off as a whole.
// While this feature is on, they're off; switching it off hands the setting
// back to Chrome (whatever you had before).
import { isEnabled } from '../../core/settings.js'

async function apply() {
  const setting = chrome.privacy.services.searchSuggestEnabled
  if (await isEnabled('live-suggestions')) await setting.set({ value: false })
  else await setting.clear({})
}

chrome.runtime.onInstalled.addListener(apply)
chrome.runtime.onStartup.addListener(apply)
chrome.storage.onChanged.addListener((c) => 'features' in c && apply())
