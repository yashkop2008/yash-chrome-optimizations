// Canvas to-do: takes the planner a Canvas page read (page.js) and keeps it for the
// new tab. page.js runs on every *.instructure.com page (see core/features.js); a
// school whose Canvas has its own address gets it registered here for that address.
import { isEnabled } from '../../core/settings.js'
import { storeFromPage } from './canvas.js'

const SCRIPT_ID = 'canvas:own-domain'

chrome.runtime.onMessage.addListener((msg, sender) => {
  if (msg?.type !== 'canvas-planner' || !sender.tab || !Array.isArray(msg.items)) return
  const domain = new URL(sender.url).hostname
  isEnabled('canvas-todo').then((on) => on && storeFromPage(domain, msg.items))
})

let queue = Promise.resolve()
const sync = () => (queue = queue.then(syncOnce, syncOnce))

async function syncOnce() {
  const { canvasDomain = '' } = await chrome.storage.local.get('canvasDomain')
  const want = (await isEnabled('canvas-todo')) && canvasDomain && !/(^|\.)instructure\.com$/.test(canvasDomain)
  const has = (await chrome.scripting.getRegisteredContentScripts({ ids: [SCRIPT_ID] }).catch(() => [])).length > 0
  if (has) await chrome.scripting.unregisterContentScripts({ ids: [SCRIPT_ID] }).catch(() => {})
  if (!want) return
  await chrome.scripting
    .registerContentScripts([
      { id: SCRIPT_ID, matches: [`https://${canvasDomain}/*`], js: ['features/canvas-todo/page.js'], runAt: 'document_idle', persistAcrossSessions: true },
    ])
    .catch(() => {})
}

// Whenever the background wakes, and when the address or the switch changes.
sync()
chrome.storage.onChanged.addListener((c) => ('canvasDomain' in c || 'features' in c) && sync())
