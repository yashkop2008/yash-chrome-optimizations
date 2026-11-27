// The hub: opened by the toolbar icon. One section per group, each with a
// switch for the whole group, then every feature with its own switch and,
// while it's on, its panel (stats, lists, quick controls).
import { VISIBLE_GROUPS as GROUPS, inGroup } from '../core/features.js'
import { enabledMap, setEnabled } from '../core/settings.js'
import { getConfig, getState, newer, currentVersion, UPDATES_PAGE } from '../updater/updater.js'
import { openProblems, report } from '../core/health.js'
import { mountThemeRow } from './theme-status.js'

const $ = (id) => document.getElementById(id)
const openUpdates = () => chrome.tabs.create({ url: chrome.runtime.getURL(UPDATES_PAGE) })

$('open-updates').addEventListener('click', openUpdates)
$('update-install').addEventListener('click', openUpdates)

/* ---------- welcome (first install) ---------- */

if (location.hash === '#welcome') $('welcome-card').hidden = false
if (location.hash) history.replaceState(null, '', location.pathname)
$('welcome-done').addEventListener('click', () => {
  $('welcome-card').hidden = true
  history.replaceState(null, '', location.pathname)
})

/* ---------- groups & features ---------- */

const rows = new Map() // feature id -> { sw, panel, mounted }
const groupSwitches = new Map() // group id -> switch
const groupCounts = new Map() // group id -> "2 of 3 on" label
let collapsed = {} // group id -> true when folded (folded is the default)

const CHEVRON =
  '<svg class="chev" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m9 6 6 6-6 6"/></svg>'

const isFolded = (id) => collapsed[id] !== false

function setFolded(sec, folded, save = true) {
  sec.classList.toggle('folded', folded)
  sec.querySelector('.sec-toggle').setAttribute('aria-expanded', String(!folded))
  if (save) {
    collapsed = { ...collapsed, [sec.id]: folded }
    chrome.storage.local.set({ hubCollapsed: collapsed })
  }
}

function makeSwitch(label, onToggle) {
  const sw = document.createElement('button')
  sw.className = 'switch'
  sw.type = 'button'
  sw.setAttribute('role', 'switch')
  sw.setAttribute('aria-label', label)
  sw.addEventListener('click', () => onToggle(sw.getAttribute('aria-checked') !== 'true'))
  return sw
}

function buildGroups() {
  const out = []
  for (const g of GROUPS) {
    const sec = document.createElement('section')
    sec.className = 'sec'
    sec.id = g.id
    sec.innerHTML = `
      <div class="sec-head">
        <button class="sec-toggle" type="button" aria-controls="${g.id}-body">
          ${CHEVRON}<h2></h2><span class="count mono"></span>
        </button>
        <div class="sec-head-right">
          <div class="status" hidden><span class="dot"></span><span class="status-text"></span></div>
          <label class="all"></label>
        </div>
      </div>
      <div class="sec-body" id="${g.id}-body">
        <div class="group"></div>
      </div>`
    sec.querySelector('h2').textContent = g.name
    groupCounts.set(g.id, sec.querySelector('.count'))
    setFolded(sec, isFolded(g.id), false)
    sec.querySelector('.sec-toggle').addEventListener('click', () => setFolded(sec, !sec.classList.contains('folded')))
    const all = makeSwitch(`All of ${g.name}`, async (on) => {
      for (const f of inGroup(g.id)) await setEnabled(f.id, on)
    })
    sec.querySelector('.all').append(all)
    groupSwitches.set(g.id, all)

    const status = sec.querySelector('.status')
    const showStatus = (text, mode = '') => {
      status.hidden = !text
      status.querySelector('.status-text').textContent = text
      status.dataset.mode = mode
    }

    const card = sec.querySelector('.group')
    for (const f of inGroup(g.id)) {
      const wrap = document.createElement('div')
      wrap.className = 'feature'
      wrap.innerHTML = `<div class="row"><div class="row-text"><div class="row-title"></div><div class="row-desc"></div><div class="health" hidden></div></div></div>`
      wrap.querySelector('.row-title').textContent = f.name
      wrap.querySelector('.row-desc').textContent = f.summary
      const sw = makeSwitch(f.name, (on) => setEnabled(f.id, on))
      wrap.querySelector('.row').append(sw)
      let panel = null
      if (f.panel) {
        panel = document.createElement('div')
        panel.className = 'panel'
        panel.hidden = true
        wrap.append(panel)
      }
      // A feature can show a status in its group's header, but only while it's on.
      const r = { sw, panel, mounted: false, on: false, feature: f, clearStatus: () => showStatus(''), health: wrap.querySelector('.health') }
      r.ctx = { setStatus: (text, mode) => showStatus(r.on ? text : '', mode) }
      rows.set(f.id, r)
      card.append(wrap)
    }
    out.push(sec)
  }
  $('groups').replaceChildren(...out)
}

async function syncSwitches() {
  const on = await enabledMap()
  for (const [id, r] of rows) {
    r.sw.setAttribute('aria-checked', String(on[id]))
    const wasOn = r.on
    r.on = on[id]
    if (wasOn && !r.on) r.clearStatus()
    if (!r.panel) continue
    r.panel.hidden = !on[id]
    if (on[id] && !r.mounted) {
      r.mounted = true
      try {
        const mod = await import(chrome.runtime.getURL(r.feature.panel))
        await mod.mount(r.panel, r.ctx)
      } catch (e) {
        r.panel.textContent = `Couldn't load this panel: ${e.message}`
      }
    }
  }
  for (const g of GROUPS) {
    const list = inGroup(g.id)
    const count = list.filter((f) => on[f.id]).length
    groupSwitches.get(g.id).setAttribute('aria-checked', String(count > 0))
    // Only worth saying when something is off.
    groupCounts.get(g.id).textContent = count < list.length ? `${count} of ${list.length} on` : ''
  }
}

/* ---------- updates & source ---------- */

const themeState = mountThemeRow($('theme-row'))

async function renderUpdates() {
  const s = await getState()
  const c = await getConfig()
  const v = currentVersion()
  const waiting = s.latest && newer(s.latest, v)
  $('update-banner').hidden = !waiting
  const theme = await themeState
  const themeNote = theme && theme.state !== 'ok' ? (theme.state === 'stale' ? ' · theme needs a reload' : theme.state === 'off' ? ' · theme is off' : ' · theme not installed') : ''
  $('updates-count').textContent = (waiting ? `${s.latest} ready` : c.repo ? `v${v} · up to date` : `v${v}`) + themeNote
  if (waiting) {
    $('update-title').textContent = `Version ${s.latest} is ready`
    $('upd-title').textContent = `Version ${v} · ${s.latest} is ready`
    $('upd-desc').textContent = 'Open the updates page and press Install.'
  } else {
    $('upd-title').textContent = `Version ${v}`
    if (c.repo) {
      const a = document.createElement('a')
      a.href = `https://github.com/${c.repo}`
      a.target = '_blank'
      a.rel = 'noreferrer'
      a.textContent = c.repo
      $('upd-desc').replaceChildren('Up to date. Checks ', a, ' every six hours.')
    } else $('upd-desc').textContent = 'Set the GitHub repository on the updates page to turn on one-click updates.'
  }
}

/* ---------- health ---------- */

const ago = (ts) => {
  const m = Math.round((Date.now() - ts) / 60000)
  return m < 60 ? `${Math.max(1, m)}m ago` : m < 1440 ? `${Math.round(m / 60)}h ago` : `${Math.round(m / 1440)}d ago`
}

async function renderHealth() {
  const problems = await openProblems()
  for (const [id, r] of rows) {
    const p = r.on && problems[id]
    r.health.hidden = !p
    if (p) r.health.textContent = `${p.problem} (${ago(p.at)})`
  }
  for (const g of GROUPS) {
    const sec = document.getElementById(g.id)
    sec?.classList.toggle('unwell', inGroup(g.id).some((f) => rows.get(f.id)?.on && problems[f.id]))
  }
  const bg = problems.background
  $('health-banner').hidden = !bg
  if (bg) $('health-text').textContent = `${bg.problem} (${ago(bg.at)})`
}
$('health-dismiss').addEventListener('click', () => report('background', null))

chrome.storage.onChanged.addListener((c) => {
  if ('health' in c) renderHealth()
  if ('features' in c) syncSwitches().then(renderHealth)
  if ('updater' in c) renderUpdates()
})

collapsed = (await chrome.storage.local.get('hubCollapsed')).hubCollapsed || {}
buildGroups()
setInterval(renderHealth, 60000)
// Updates folds the same way as the groups.
for (const sec of document.querySelectorAll('.page-sec')) {
  setFolded(sec, isFolded(sec.id), false)
  sec.querySelector('.sec-toggle').addEventListener('click', () => setFolded(sec, !sec.classList.contains('folded')))
}
syncSwitches().then(renderHealth)
renderUpdates()
