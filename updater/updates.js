import { getConfig, saveConfig, getState, check, currentVersion, getFolder, pickFolder, ensureWritable, install } from './updater.js'

const $ = (id) => document.getElementById(id)
const me = chrome.runtime.getManifest()
const form = $('config')
let latest = null
let busy = false

/* ---------- header ---------- */

$('ext-name').textContent = me.short_name || me.name
document.title = `Updates · ${me.name}`
const icons = me.icons || {}
const iconPath = icons['48'] || icons['32'] || icons['16'] || Object.values(icons)[0]
if (iconPath) $('icon').src = chrome.runtime.getURL(iconPath)
else $('icon').remove()
$('version').textContent = currentVersion()

function ago(ts) {
  if (!ts) return ''
  const s = Math.round((Date.now() - ts) / 1000)
  if (s < 60) return 'checked just now'
  const m = Math.round(s / 60)
  if (m < 60) return `checked ${m}m ago`
  return `checked ${Math.round(m / 60)}h ago`
}
setInterval(async () => ($('checked').textContent = ago((await getState()).checkedAt)), 15000)

function say(text, tone = '') {
  $('message').textContent = text
  $('message').dataset.tone = tone
}

/* ---------- status ---------- */

async function refresh() {
  if (busy) return
  $('check').disabled = true
  say('Checking…')
  const r = await check({ withNotes: true })
  $('check').disabled = false
  $('checked').textContent = ago((await getState()).checkedAt)
  $('install').hidden = true
  $('notes').hidden = true
  latest = null

  if (!r.configured) return say('Add the GitHub repository below to turn on updates.')
  if (r.error) return say(r.error, 'bad')

  if (r.available) {
    latest = r.latest
    say(`Version ${r.latest} is ready to install.`, 'news')
    $('install').hidden = false
    $('install').textContent = `Install ${r.latest}`
  } else if (location.hash === '#updated') {
    const s = await getState()
    say(`Updated${s.from ? ` from ${s.from}` : ''} to ${currentVersion()}. You're on the newest version.`, 'good')
  } else {
    say(`Up to date. The repo has ${r.latest}.`, 'good')
  }
  renderNotes(r.notes)
}

function renderNotes(notes = []) {
  const list = $('notes')
  list.replaceChildren()
  for (const n of notes.slice(0, 5)) {
    const li = document.createElement('li')
    const msg = document.createElement('span')
    msg.textContent = n.message
    const when = document.createElement('span')
    when.className = 'mono'
    when.textContent = n.date ? new Date(n.date).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) : ''
    li.append(msg, when)
    list.append(li)
  }
  list.hidden = !notes.length
}

/* ---------- install ---------- */

function progress(label, fraction) {
  $('progress').hidden = false
  $('step').textContent = label
  $('fill').style.transform = `scaleX(${fraction})`
}

$('install').addEventListener('click', async () => {
  if (busy || !latest) return
  busy = true
  $('install').disabled = $('check').disabled = $('pick').disabled = true
  try {
    // Folder access first, while Chrome still counts this as your click.
    let folder = await getFolder()
    if (!folder) {
      say('Pick the folder this extension was loaded from.')
      folder = await pickFolder()
      showFolder(folder)
    }
    if (!(await ensureWritable(folder))) throw new Error('Chrome needs permission to edit the folder. Press Install again and choose Allow.')
    await install(folder, progress)
    say(`Installed ${latest}. Reloading the extension…`, 'good')
  } catch (e) {
    if (e?.name === 'AbortError') say('No folder picked, so nothing changed.')
    else say(e.message || String(e), 'bad')
    $('progress').hidden = true
    busy = false
    $('install').disabled = $('check').disabled = $('pick').disabled = false
  }
})

$('check').addEventListener('click', refresh)

/* ---------- folder ---------- */

function showFolder(handle) {
  const desc = $('folder-desc')
  if (handle) {
    desc.textContent = `Linked to the “${handle.name}” folder.`
    desc.dataset.tone = 'good'
    $('pick').textContent = 'Change…'
  } else {
    desc.textContent = 'The folder you picked in “Load unpacked”. Linked once, then reused.'
    desc.dataset.tone = ''
    $('pick').textContent = 'Choose folder…'
  }
}

$('pick').addEventListener('click', async () => {
  try {
    showFolder(await pickFolder())
  } catch (e) {
    if (e?.name !== 'AbortError') say(e.message || String(e), 'bad')
  }
})

/* ---------- settings ---------- */

const config = await getConfig()
for (const key of ['repo', 'path', 'branch', 'token']) form.elements[key].value = config[key] || ''

let saveTimer
form.addEventListener('input', () => {
  clearTimeout(saveTimer)
  saveTimer = setTimeout(async () => {
    const data = Object.fromEntries(new FormData(form))
    const clean = await saveConfig(data)
    if (form.elements.repo.value !== clean.repo && document.activeElement !== form.elements.repo) form.elements.repo.value = clean.repo
    refresh()
  }, 700)
})
form.addEventListener('submit', (e) => e.preventDefault())

showFolder(await getFolder())
refresh()
