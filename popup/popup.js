// The toolbar popup: a hub that mounts a section from each switched-on feature.
import { FEATURES } from '../core/features.js'
import { enabledMap } from '../core/settings.js'
import { newer, currentVersion } from '../updater/updater.js'

const $ = (id) => document.getElementById(id)
const open = (path) => chrome.tabs.create({ url: chrome.runtime.getURL(path) })

$('ver').textContent = `v${currentVersion()}`
$('open-settings').addEventListener('click', () => open('settings/settings.html'))
$('open-updates').addEventListener('click', () => open('updater/updates.html'))
$('update-open').addEventListener('click', () => open('updater/updates.html'))

// Features may show a status in the header (e.g. the gate's "Guarding").
export function setStatus(text, mode = '') {
  $('status').hidden = !text
  $('status-text').textContent = text
  $('status').dataset.mode = mode
}
window.hubSetStatus = setStatus

async function renderUpdate() {
  const { updater = {} } = await chrome.storage.local.get('updater')
  const waiting = updater.latest && newer(updater.latest, currentVersion())
  $('update').hidden = !waiting
  if (waiting) $('update-title').textContent = `Version ${updater.latest} is ready`
}

async function mountAll() {
  const on = await enabledMap()
  const active = FEATURES.filter((f) => on[f.id] && f.popup)
  $('empty').hidden = FEATURES.some((f) => on[f.id])
  const sites = $('sites')
  sites.replaceChildren()
  const groups = new Map()
  for (const f of active) {
    if (!groups.has(f.site)) {
      const group = document.createElement('section')
      group.className = 'site'
      const head = document.createElement('div')
      head.className = 'site-head'
      head.textContent = f.site
      group.append(head)
      sites.append(group)
      groups.set(f.site, group)
    }
    const box = document.createElement('div')
    box.className = 'feature'
    box.dataset.feature = f.id
    groups.get(f.site).append(box)
    try {
      const mod = await import(chrome.runtime.getURL(f.popup))
      await mod.mount(box)
    } catch (e) {
      box.textContent = `${f.name} couldn't load: ${e.message}`
      box.className = 'feature muted'
    }
  }
}

chrome.storage.onChanged.addListener((changes) => {
  if ('updater' in changes) renderUpdate()
  if ('features' in changes) mountAll()
})
renderUpdate()
mountAll()
