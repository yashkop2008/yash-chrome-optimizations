import { isEnabled } from '../../core/settings.js'
import { onSearchVisit } from './searches.js'

chrome.history.onVisited.addListener(async (item) => {
  if (await isEnabled('forget-searches')) await onSearchVisit(item.url)
})
