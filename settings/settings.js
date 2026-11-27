// The hub: opened by the toolbar icon. One section per group, each with a
// switch for the whole group, then every feature with its own switch and,
// while it's on, its panel (stats, lists, quick controls).
import { VISIBLE_GROUPS as GROUPS, inGroup } from '../core/features.js'
import { enabledMap, setEnabled } from '../core/settings.js'
import { getConfig, getState, newer, currentVersion, UPDATES_PAGE } from '../updater/updater.js'

const $ = (id) => document.getElementById(id)
const openUpdates = () => chrome.tabs.create({ url: chrome.runtime.getURL(UPDATES_PAGE) })

$('ver').textContent = `v${currentVersion()}`
$('ext-id').textContent = chrome.runtime.id
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
  const nav = $('nav')
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
          <label class="all"><span>All</span></label>
        </div>
      </div>
      <div class="sec-body" id="${g.id}-body">
        <p class="lead"></p>
        <div class="group"></div>
      </div>`
    sec.querySelector('h2').textContent = g.name
    sec.querySelector('.lead').textContent = g.summary
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
      wrap.innerHTML = `<div class="row"><div class="row-text"><div class="row-title"></div><div class="row-desc"></div></div></div>`
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
      const r = { sw, panel, mounted: false, on: false, feature: f, clearStatus: () => showStatus('') }
      r.ctx = { setStatus: (text, mode) => showStatus(r.on ? text : '', mode) }
      rows.set(f.id, r)
      card.append(wrap)
    }
    out.push(sec)

    const link = document.createElement('a')
    link.href = `#${g.id}`
    link.textContent = g.name
    // Jumping to a group from the sidebar opens it.
    link.addEventListener('click', () => setFolded(sec, false))
    nav.append(link)
  }
  for (const [id, label] of [['updates', 'Updates'], ['about', 'About']]) {
    const link = document.createElement('a')
    link.href = `#${id}`
    link.textContent = label
    nav.append(link)
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
    groupCounts.get(g.id).textContent = `${count} of ${list.length} on`
  }
}

/* ---------- updates & source ---------- */

async function renderUpdates() {
  const s = await getState()
  const c = await getConfig()
  const v = currentVersion()
  const waiting = s.latest && newer(s.latest, v)
  $('update-banner').hidden = !waiting
  $('updates-count').textContent = waiting ? `${s.latest} ready` : c.repo ? `v${v} · up to date` : `v${v}`
  if (waiting) {
    $('update-title').textContent = `Version ${s.latest} is ready`
    $('upd-title').textContent = `Version ${v} · ${s.latest} is ready`
    $('upd-desc').textContent = 'Open the updates page and press Install.'
  } else {
    $('upd-title').textContent = `Version ${v}`
    $('upd-desc').textContent = c.repo
      ? 'Up to date as of the last check. Checks every six hours.'
      : 'Set the GitHub repository on the updates page to turn on one-click updates.'
  }
  if (c.repo) {
    const a = document.createElement('a')
    a.href = `https://github.com/${c.repo}`
    a.target = '_blank'
    a.rel = 'noreferrer'
    a.textContent = `github.com/${c.repo}`
    $('source').replaceChildren(a)
  }
}

/* ---------- sidebar highlight ---------- */

function watchSections() {
  // The current section is the last one whose top has scrolled past the header.
  const links = [...document.querySelectorAll('.side a')]
  const sections = [...document.querySelectorAll('main .sec[id]')]
  const update = () => {
    let current = sections[0]?.id
    for (const sec of sections) if (sec.getBoundingClientRect().top <= 120) current = sec.id
    const scrollable = document.documentElement.scrollHeight > innerHeight + 8
    if (scrollable && innerHeight + scrollY >= document.documentElement.scrollHeight - 4) current = sections.at(-1)?.id
    links.forEach((a) => a.classList.toggle('active', a.getAttribute('href') === `#${current}`))
  }
  addEventListener('scroll', update, { passive: true })
  addEventListener('resize', update)
  update()
}

chrome.storage.onChanged.addListener((c) => {
  if ('features' in c) syncSwitches()
  if ('updater' in c) renderUpdates()
})

collapsed = (await chrome.storage.local.get('hubCollapsed')).hubCollapsed || {}
buildGroups()
// Updates and About fold the same way as the groups.
for (const sec of document.querySelectorAll('.page-sec')) {
  setFolded(sec, isFolded(sec.id), false)
  sec.querySelector('.sec-toggle').addEventListener('click', () => setFolded(sec, !sec.classList.contains('folded')))
  document.querySelector(`.side a[href="#${sec.id}"]`)?.addEventListener('click', () => setFolded(sec, false))
}
watchSections()
syncSwitches()
renderUpdates()
