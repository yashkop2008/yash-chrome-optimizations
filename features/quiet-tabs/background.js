// Runs the tidy every 15 minutes, and clears extra empty new tabs the moment
// another one opens.
import { isEnabled } from '../../core/settings.js'
import { tidy, closeExtraNewTabs } from './tabs.js'

const FEATURE = 'quiet-tabs'
const ALARM = 'quiet-tabs'

chrome.alarms.get(ALARM).then((a) => a || chrome.alarms.create(ALARM, { periodInMinutes: 15 }))
chrome.alarms.onAlarm.addListener(async (a) => {
  if (a.name === ALARM && (await isEnabled(FEATURE))) await tidy()
})

chrome.tabs.onCreated.addListener(async () => {
  if (!(await isEnabled(FEATURE))) return
  const closing = await closeExtraNewTabs(await chrome.tabs.query({}))
  if (closing.size) await chrome.tabs.remove([...closing]).catch(() => {})
})

chrome.runtime.onMessage.addListener((msg, _s, reply) => {
  if (msg?.type !== 'quiet-tabs-tidy') return
  tidy().then(reply)
  return true
})
