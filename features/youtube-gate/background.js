// Focus gate: the redirect rule, passes, school hours, timers and pause.
// One rule sends every top-level load of a listed site to the gate (focus.html),
// carrying the original address so the gate can send you on if you earn it.
// A pass opens only the site it was taken for.
import {
  load,
  save,
  bump,
  passActive,
  pauseActive,
  SEARCH_MINUTES,
  PAUSE_MINUTES,
  gateSites,
  gateHours,
  inHours,
  hostMap,
} from './state.js'
import { isEnabled } from '../../core/settings.js'

const FEATURE = 'youtube-gate' // the id predates the gate covering more than YouTube
const RULE_ID = 1
const SCRIPT_ID = 'gate:sites'
const TICK = 'gate-tick'

const escape = (h) => h.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
const patterns = (hosts) => hosts.flatMap((h) => [`*://${h}/*`, `*://*.${h}/*`])

function gateRule(hosts) {
  return {
    id: RULE_ID,
    priority: 1,
    action: { type: 'redirect', redirect: { regexSubstitution: chrome.runtime.getURL('focus.html') + '#\\0' } },
    condition: {
      regexFilter: `^https?://([a-z0-9-]+\\.)*(${hosts.map(escape).join('|')})(:[0-9]+)?(/.*)?$`,
      resourceTypes: ['main_frame'],
    },
  }
}

// The timer pill and the time's-up screen run on every listed site.
async function syncScripts(on, hosts) {
  const existing = (await chrome.scripting.getRegisteredContentScripts({ ids: [SCRIPT_ID] }).catch(() => [])).length > 0
  if (!on || !hosts.length) {
    if (existing) await chrome.scripting.unregisterContentScripts({ ids: [SCRIPT_ID] }).catch(() => {})
    return
  }
  const script = {
    id: SCRIPT_ID,
    matches: patterns(hosts),
    js: ['features/youtube-gate/content.js'],
    css: ['features/youtube-gate/content.css'],
    runAt: 'document_start',
    persistAcrossSessions: true,
  }
  if (existing) await chrome.scripting.updateContentScripts([script]).catch(() => {})
  else
    await chrome.scripting.registerContentScripts([script]).catch((e) => {
      if (!/duplicate/i.test(e.message)) throw e
    })
}

let syncing = Promise.resolve()
function sync() {
  syncing = syncing.then(syncOnce, syncOnce)
  return syncing
}

async function syncOnce() {
  const state = await load()
  const on = await isEnabled(FEATURE)
  const sites = await gateSites()
  const map = hostMap(sites)
  const live = passActive(state) ? state.pass : null
  if (state.pass && !live) await save({ pass: null })
  if (state.pauseUntil && !pauseActive(state)) await save({ pauseUntil: 0 })

  const strict = on && state.enabled && !pauseActive(state) && inHours(await gateHours())
  // Everything listed, except the site a pass is open for.
  const guarded = Object.keys(map).filter((h) => !live || map[h] !== live.site)
  await chrome.declarativeNetRequest.updateDynamicRules({
    removeRuleIds: [RULE_ID],
    addRules: strict && guarded.length ? [gateRule(guarded)] : [],
  })
  await syncScripts(on, Object.keys(map))

  // The content script reads these to know whether to send a page to the gate.
  const { gateStrict: wasStrict } = await chrome.storage.local.get('gateStrict')
  await chrome.storage.local.set({ gateStrict: strict, gateHostMap: map })
  if (strict && wasStrict === false) await closeOpenTabs('hours') // school hours just began
  return strict
}

// Open tabs of a site get told their time is up; the content script says so
// and reloads, which lands on the gate.
async function closeOpenTabs(reason, site = null) {
  const map = hostMap(await gateSites())
  const hosts = Object.keys(map).filter((h) => !site || map[h] === site)
  if (!hosts.length) return
  const tabs = await chrome.tabs.query({ url: patterns(hosts) })
  for (const tab of tabs) chrome.tabs.sendMessage(tab.id, { type: 'time-up', reason }).catch(() => {})
}

async function grantPass(kind, minutes, site) {
  const until = Date.now() + minutes * 60_000
  await save({ pass: { kind, until, minutes, site } })
  await bump(kind === 'search' ? 'searches' : 'passes')
  await chrome.alarms.create('pass-end', { when: until })
  await sync()
  return until
}

async function endPass() {
  const { pass } = await load()
  await chrome.alarms.clear('pass-end')
  await save({ pass: null })
  await sync()
  await closeOpenTabs('ended', pass?.site)
}

// Whenever the background wakes (install/update events aren't always delivered).
chrome.alarms.get(TICK).then((a) => a || chrome.alarms.create(TICK, { periodInMinutes: 1 }))
sync()
chrome.runtime.onInstalled.addListener(() => sync())
chrome.runtime.onStartup.addListener(() => sync())

chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name === 'pass-end') {
    const { pass } = await load()
    await sync()
    await closeOpenTabs('expired', pass?.site)
  }
  if (alarm.name === 'pause-end' || alarm.name === TICK) await sync()
})

chrome.storage.onChanged.addListener((changes) => {
  if (['enabled', 'features', 'gateSites', 'gateHours'].some((k) => k in changes)) sync()
})

chrome.runtime.onMessage.addListener((msg, _sender, reply) => {
  if (!['grant-browse', 'grant-search', 'end-pass', 'pause', 'resume', 'sync'].includes(msg?.type)) return
  const run = async () => {
    switch (msg.type) {
      case 'grant-browse':
        return { until: await grantPass('browse', msg.minutes, msg.site || 'youtube.com') }
      case 'grant-search':
        return { until: await grantPass('search', SEARCH_MINUTES, 'youtube.com') }
      case 'end-pass':
        await endPass()
        return { ok: true }
      case 'pause': {
        const until = Date.now() + PAUSE_MINUTES * 60_000
        await save({ pauseUntil: until })
        await chrome.alarms.create('pause-end', { when: until })
        await sync()
        return { until }
      }
      case 'resume':
        await chrome.alarms.clear('pause-end')
        await save({ pauseUntil: 0 })
        await sync()
        await closeOpenTabs('resumed')
        return { ok: true }
      case 'sync':
        return { strict: await sync() }
    }
  }
  run().then(reply)
  return true
})
