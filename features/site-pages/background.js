import { isEnabled } from '../../core/settings.js'
import { onPageVisit } from './sites.js'

chrome.history.onVisited.addListener(async (item) => {
  if (await isEnabled('site-pages')) await onPageVisit(item.url)
})
