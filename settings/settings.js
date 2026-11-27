import { FEATURES } from '../core/features.js'
import { enabledMap, setEnabled } from '../core/settings.js'
import { getConfig, getState, newer, currentVersion } from '../updater/updater.js'

const $ = (id) => document.getElementById(id)

$('ver').textContent = `v${currentVersion()}`
$('ext-id').textContent = chrome.runtime.id
$('open-updates').addEventListener('click', () => chrome.tabs.create({ url: chrome.runtime.getURL('updater/updates.html') }))

/* ---------- welcome (first install) ---------- */

if (location.hash === '#welcome') $('welcome-card').hidden = false
$('welcome-done').addEventListener('click', () => {
  $('welcome-card').hidden = true
  history.replaceState(null, '', '#features')
})

/* ---------- features ---------- */

async function renderFeatures() {
  const on = await enabledMap()
  const groups = new Map()
  for (const f of FEATURES) {
    if (!groups.has(f.site)) groups.set(f.site, [])
    groups.get(f.site).push(f)
  }
  const out = []
  for (const [site, list] of groups) {
    const group = document.createElement('div')
    group.className = 'group'
    const title = document.createElement('div')
    title.className = 'group-title'
    title.textContent = site
    group.append(title)
    for (const f of list) {
      const row = document.createElement('div')
      row.className = 'row'
      row.innerHTML = `<div class="row-text"><div class="row-title"></div><div class="row-desc"></div></div>
        <button class="switch" type="button" role="switch"></button>`
      row.querySelector('.row-title').textContent = f.name
      row.querySelector('.row-desc').textContent = f.summary
      const sw = row.querySelector('.switch')
      sw.setAttribute('aria-checked', String(on[f.id]))
      sw.setAttribute('aria-label', f.name)
      sw.addEventListener('click', () => setEnabled(f.id, sw.getAttribute('aria-checked') !== 'true'))
      group.append(row)
    }
    out.push(group)
  }
  $('groups').replaceChildren(...out)
}

/* ---------- updates & source ---------- */

async function renderUpdates() {
  const s = await getState()
  const c = await getConfig()
  const v = currentVersion()
  if (s.latest && newer(s.latest, v)) {
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

const links = [...document.querySelectorAll('.side a')]
const io = new IntersectionObserver(
  (entries) => {
    for (const e of entries)
      if (e.isIntersecting) links.forEach((a) => a.classList.toggle('active', a.getAttribute('href') === `#${e.target.id}`))
  },
  { rootMargin: '-45% 0px -50% 0px' },
)
document.querySelectorAll('main > section[id]').forEach((s) => io.observe(s))

chrome.storage.onChanged.addListener((c) => {
  if ('features' in c) renderFeatures()
  if ('updater' in c) renderUpdates()
})
renderFeatures()
renderUpdates()
