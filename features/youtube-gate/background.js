// YouTube gate: the redirect rule, passes, timers and pause.
import { load, save, bump, passActive, pauseActive, SEARCH_MINUTES, PAUSE_MINUTES } from './state.js'
import { isEnabled } from '../../core/settings.js'

const FEATURE = 'youtube-gate'

const RULE_ID = 1
const YT_TABS = ['*://*.youtube.com/*', '*://youtube.com/*']

// One redirect rule sends every top-level YouTube load to the gate, carrying
// the original address in the fragment so the gate can send you on if you earn it.
function gateRule() {
  return {
    id: RULE_ID,
    priority: 1,
    action: {
      type: 'redirect',
      redirect: { regexSubstitution: chrome.runtime.getURL('features/youtube-gate/gate.html') + '#\\0' },
    },
    condition: {
      regexFilter: '^https?://((www\\.|m\\.)?youtube\\.com|youtu\\.be)(/.*)?$',
      resourceTypes: ['main_frame'],
    },
  }
}

async function sync() {
  const state = await load()
  const guarding = (await isEnabled(FEATURE)) && state.enabled && !pauseActive(state) && !passActive(state)
  await chrome.declarativeNetRequest.updateDynamicRules({
    removeRuleIds: [RULE_ID],
    addRules: guarding ? [gateRule()] : [],
  })
  if (state.pass && !passActive(state)) await save({ pass: null })
  if (state.pauseUntil && !pauseActive(state)) await save({ pauseUntil: 0 })
  return guarding
}

// Open YouTube tabs get told the window closed; the content script shows a
// short notice and reloads, which now lands on the gate.
async function closeOpenTabs(reason) {
  const tabs = await chrome.tabs.query({ url: YT_TABS })
  for (const tab of tabs) chrome.tabs.sendMessage(tab.id, { type: 'time-up', reason }).catch(() => {})
}

async function grantPass(kind, minutes) {
  const until = Date.now() + minutes * 60_000
  await save({ pass: { kind, until, minutes } })
  await bump(kind === 'search' ? 'searches' : 'passes')
  await chrome.alarms.create('pass-end', { when: until })
  await sync()
  return until
}

async function endPass() {
  await chrome.alarms.clear('pass-end')
  await save({ pass: null })
  await sync()
  await closeOpenTabs('ended')
}

chrome.runtime.onInstalled.addListener(sync)
chrome.runtime.onStartup.addListener(sync)

chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name === 'pass-end') {
    await sync()
    await closeOpenTabs('expired')
  }
  if (alarm.name === 'pause-end') await sync()
})

chrome.storage.onChanged.addListener((changes) => {
  if ('enabled' in changes || 'features' in changes) sync()
})

chrome.runtime.onMessage.addListener((msg, _sender, reply) => {
  if (!['grant-browse', 'grant-search', 'end-pass', 'pause', 'resume', 'sync'].includes(msg?.type)) return
  const run = async () => {
    switch (msg.type) {
      case 'grant-browse':
        return { until: await grantPass('browse', msg.minutes) }
      case 'grant-search':
        return { until: await grantPass('search', SEARCH_MINUTES) }
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
        return { guarding: await sync() }
    }
  }
  run().then(reply)
  return true
})
