// Self-updater for unpacked Chrome extensions.
//
// The newest version of the extension lives in a GitHub repository (a whole
// repo, or one folder of a repo that holds several extensions). The updater
// compares the version in the repo's manifest.json with the running one,
// downloads the repo as a zip, unpacks it in the browser, writes the files into
// the extension's own folder (which you grant once through Chrome's folder
// picker) and reloads the extension.
//
// Drop the whole `updater/` folder into any extension; see updater/README.md.

const API = 'https://api.github.com'
const KEY = 'updater' // chrome.storage.local key
// Where the updates page is; override with "page" in config.json at build time.
export const UPDATES_PAGE = 'updates.html'

/* ---------------- settings & status ---------------- */

export async function getConfig() {
  let defaults = {}
  try {
    defaults = await (await fetch(chrome.runtime.getURL('updater/config.json'))).json()
  } catch {}
  const { [KEY]: saved = {} } = await chrome.storage.local.get(KEY)
  return {
    repo: '',
    branch: 'main',
    path: '',
    token: '',
    ...defaults,
    ...(saved.config || {}),
    // Never overridable: these identify the extension and what the repo
    // holds that isn't part of it.
    id: defaults.id || chrome.runtime.getManifest().name,
    ignore: defaults.ignore || [],
  }
}

// An extension is recognised by updater/config.json's "id", not its display
// name, so the name can change without breaking updates.
const idOf = (configText) => {
  try {
    return JSON.parse(configText).id || null
  } catch {
    return null
  }
}

export async function getState() {
  const { [KEY]: saved = {} } = await chrome.storage.local.get(KEY)
  return saved
}

async function patchState(patch) {
  const current = await getState()
  await chrome.storage.local.set({ [KEY]: { ...current, ...patch } })
}

export async function saveConfig(config) {
  const clean = {
    repo: String(config.repo || '').trim().replace(/^https?:\/\/github\.com\//, '').replace(/\.git$/, '').replace(/\/+$/, ''),
    branch: String(config.branch || 'main').trim() || 'main',
    path: String(config.path || '').trim().replace(/^\/+|\/+$/g, ''),
    token: String(config.token || '').trim(),
  }
  await patchState({ config: clean, latest: null, checkedAt: 0, error: '' })
  return clean
}

export const currentVersion = () => chrome.runtime.getManifest().version

export function newer(a, b) {
  // true when version a is newer than version b ("1.10.0" > "1.9.2")
  const pa = String(a).split('.').map(Number)
  const pb = String(b).split('.').map(Number)
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const d = (pa[i] || 0) - (pb[i] || 0)
    if (d) return d > 0
  }
  return false
}

/* ---------------- talking to GitHub ---------------- */

function headers(config, accept = 'application/vnd.github+json') {
  const h = { Accept: accept, 'X-GitHub-Api-Version': '2022-11-28' }
  if (config.token) h.Authorization = `Bearer ${config.token}`
  return h
}

async function gh(config, url, accept) {
  const res = await fetch(url, { headers: headers(config, accept), cache: 'no-store' })
  if (res.status === 404) throw new Error(config.token ? 'Repository, branch or folder not found.' : 'Not found. Check the repository name, or add a token if it is private.')
  if (res.status === 401) throw new Error('The access token was rejected.')
  if (res.status === 403) throw new Error('GitHub refused the request (rate limit or token permissions). Try again later.')
  if (!res.ok) throw new Error(`GitHub answered ${res.status}.`)
  return res
}

const repoPath = (config, file) => [config.path, file].filter(Boolean).join('/')

// Reads the repo's manifest.json and a few recent commit messages for that folder.
export async function check({ withNotes = false } = {}) {
  const config = await getConfig()
  if (!/^[\w.-]+\/[\w.-]+$/.test(config.repo)) {
    await patchState({ error: '', latest: null })
    return { configured: false }
  }
  try {
    const url = `${API}/repos/${config.repo}/contents/${repoPath(config, 'manifest.json')}?ref=${encodeURIComponent(config.branch)}`
    const manifest = await (await gh(config, url, 'application/vnd.github.raw+json')).json()
    if (!manifest?.version) throw new Error('manifest.json in the repo has no version.')
    const idUrl = `${API}/repos/${config.repo}/contents/${repoPath(config, 'updater/config.json')}?ref=${encodeURIComponent(config.branch)}`
    const remoteId = idOf(await (await gh(config, idUrl, 'application/vnd.github.raw+json')).text())
    if (remoteId !== config.id)
      throw new Error(`That repo folder holds a different extension (${remoteId || 'unknown'}). Check the folder setting.`)
    let notes = []
    if (withNotes) {
      try {
        const q = new URLSearchParams({ sha: config.branch, per_page: '6' })
        if (config.path) q.set('path', config.path)
        const commits = await (await gh(config, `${API}/repos/${config.repo}/commits?${q}`)).json()
        notes = commits.map((c) => ({
          message: c.commit.message.split('\n')[0],
          date: c.commit.author?.date,
        }))
      } catch {}
    }
    const latest = manifest.version
    await patchState({ latest, checkedAt: Date.now(), error: '' })
    return { configured: true, latest, current: currentVersion(), available: newer(latest, currentVersion()), notes }
  } catch (e) {
    await patchState({ error: e.message, checkedAt: Date.now() })
    return { configured: true, error: e.message }
  }
}

/* ---------------- unzipping (no libraries) ---------------- */

async function unzip(buffer) {
  const dv = new DataView(buffer)
  const bytes = new Uint8Array(buffer)
  let eocd = -1
  for (let i = buffer.byteLength - 22; i >= Math.max(0, buffer.byteLength - 65557); i--) {
    if (dv.getUint32(i, true) === 0x06054b50) {
      eocd = i
      break
    }
  }
  if (eocd < 0) throw new Error('The download is not a zip file.')
  const count = dv.getUint16(eocd + 10, true)
  let off = dv.getUint32(eocd + 16, true)
  const names = new TextDecoder()
  const files = []
  for (let n = 0; n < count; n++) {
    if (dv.getUint32(off, true) !== 0x02014b50) throw new Error('The zip file is damaged.')
    const method = dv.getUint16(off + 10, true)
    const size = dv.getUint32(off + 20, true)
    const nameLen = dv.getUint16(off + 28, true)
    const extraLen = dv.getUint16(off + 30, true)
    const commentLen = dv.getUint16(off + 32, true)
    const local = dv.getUint32(off + 42, true)
    const name = names.decode(bytes.subarray(off + 46, off + 46 + nameLen))
    off += 46 + nameLen + extraLen + commentLen
    if (name.endsWith('/')) continue
    const start = local + 30 + dv.getUint16(local + 26, true) + dv.getUint16(local + 28, true)
    files.push({ name, method, raw: bytes.subarray(start, start + size) })
  }
  return files
}

async function inflate(file) {
  if (file.method === 0) return file.raw
  if (file.method !== 8) throw new Error(`Unsupported compression in ${file.name}.`)
  const stream = new Blob([file.raw]).stream().pipeThrough(new DecompressionStream('deflate-raw'))
  return new Uint8Array(await new Response(stream).arrayBuffer())
}

/* ---------------- the extension folder ---------------- */

function idb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open('updater', 1)
    req.onupgradeneeded = () => req.result.createObjectStore('kv')
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}
async function idbGet(key) {
  const db = await idb()
  return new Promise((resolve) => {
    const req = db.transaction('kv').objectStore('kv').get(key)
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => resolve(undefined)
  })
}
async function idbSet(key, value) {
  const db = await idb()
  return new Promise((resolve, reject) => {
    const tx = db.transaction('kv', 'readwrite')
    tx.objectStore('kv').put(value, key)
    tx.oncomplete = resolve
    tx.onerror = () => reject(tx.error)
  })
}

export const getFolder = () => idbGet('folder')

// Asks you to pick the folder Chrome loads this extension from, and checks
// it really is this extension before remembering it.
export async function pickFolder() {
  const handle = await showDirectoryPicker({ id: 'extension-folder', mode: 'readwrite' })
  await assertIsThisExtension(handle)
  await idbSet('folder', handle)
  return handle
}

async function assertIsThisExtension(handle) {
  const { id } = await getConfig()
  let found = null
  try {
    await handle.getFileHandle('manifest.json')
    const updater = await handle.getDirectoryHandle('updater')
    found = idOf(await (await (await updater.getFileHandle('config.json')).getFile()).text())
  } catch {
    throw new Error('That folder isn’t this extension. Pick the folder you chose in “Load unpacked”.')
  }
  if (found !== id) throw new Error(`That folder holds a different extension (${found || 'unknown'}).`)
}

// Must run inside a click handler: Chrome only shows the permission prompt
// in response to something you did.
export async function ensureWritable(handle) {
  const opts = { mode: 'readwrite' }
  if ((await handle.queryPermission(opts)) === 'granted') return true
  return (await handle.requestPermission(opts)) === 'granted'
}

function safePath(rel, ignore = []) {
  if (ignore.some((g) => (g.endsWith('/') ? rel.startsWith(g) : rel === g))) return false
  const parts = rel.split('/')
  return (
    rel &&
    !rel.startsWith('/') &&
    !rel.includes('\\') &&
    parts.every((p) => p && p !== '.' && p !== '..') &&
    !parts.some((p) => p === '.git' || p === '.github')
  )
}

async function writeFile(root, rel, data) {
  const parts = rel.split('/')
  let dir = root
  for (const p of parts.slice(0, -1)) dir = await dir.getDirectoryHandle(p, { create: true })
  const writable = await (await dir.getFileHandle(parts.at(-1), { create: true })).createWritable()
  await writable.write(data)
  await writable.close()
}

async function removeFile(root, rel) {
  const parts = rel.split('/')
  try {
    let dir = root
    for (const p of parts.slice(0, -1)) dir = await dir.getDirectoryHandle(p)
    await dir.removeEntry(parts.at(-1))
  } catch {}
}

/* ---------------- installing ---------------- */

// onStep(label, fraction) reports progress for the page.
export async function install(handle, onStep = () => {}) {
  const config = await getConfig()
  onStep('Checking the folder…', 0.04)
  await assertIsThisExtension(handle)

  onStep('Downloading…', 0.1)
  const res = await gh(config, `${API}/repos/${config.repo}/zipball/${encodeURIComponent(config.branch)}`)
  const zip = await res.arrayBuffer()

  onStep('Unpacking…', 0.45)
  const entries = await unzip(zip)
  const top = entries[0]?.name.split('/')[0]
  const prefix = [top, config.path].filter(Boolean).join('/') + '/'
  const wanted = entries.filter((e) => e.name.startsWith(prefix))
  const files = []
  for (const e of wanted) {
    const rel = e.name.slice(prefix.length)
    if (!safePath(rel, config.ignore)) continue
    files.push({ rel, data: await inflate(e) })
  }
  const manifestFile = files.find((f) => f.rel === 'manifest.json')
  if (!manifestFile) throw new Error('The download has no manifest.json in that folder.')
  const manifest = JSON.parse(new TextDecoder().decode(manifestFile.data))
  const idFile = files.find((f) => f.rel === 'updater/config.json')
  if (!idFile || idOf(new TextDecoder().decode(idFile.data)) !== config.id) throw new Error('The download is a different extension.')

  // Everything is downloaded and unpacked before the first write. manifest.json
  // goes last, so a write that fails half way leaves the old version number and
  // the next attempt simply runs again.
  const ordered = [...files.filter((f) => f.rel !== 'manifest.json'), manifestFile]
  for (let i = 0; i < ordered.length; i++) {
    onStep(`Writing ${ordered[i].rel}`, 0.5 + (0.45 * i) / ordered.length)
    await writeFile(handle, ordered[i].rel, ordered[i].data)
  }

  // Only remove files an earlier update installed and this one no longer has,
  // never anything else that happens to be in the folder.
  const state = await getState()
  const now = new Set(files.map((f) => f.rel))
  for (const old of state.files || []) if (!now.has(old)) await removeFile(handle, old)

  await patchState({ files: [...now], justInstalled: manifest.version, from: currentVersion(), latest: manifest.version, error: '' })
  onStep(`Installed ${manifest.version}. Reloading…`, 1)
  setTimeout(() => chrome.runtime.reload(), 600)
  return manifest.version
}

/* ---------------- background wiring ---------------- */

// Call once from the service worker: checks every few hours, shows a badge
// when an update is waiting, and opens the updates page after one installs.
export function installUpdaterBackground({ everyMinutes = 360 } = {}) {
  const ALARM = 'updater-check'
  const badge = async () => {
    const s = await getState()
    const waiting = s.latest && newer(s.latest, currentVersion())
    await chrome.action.setBadgeText({ text: waiting ? '↑' : '' })
    if (waiting) await chrome.action.setBadgeBackgroundColor({ color: '#4c9dff' })
  }
  const run = async () => {
    await check()
    await badge()
  }
  chrome.runtime.onInstalled.addListener(async () => {
    chrome.alarms.create(ALARM, { periodInMinutes: everyMinutes, delayInMinutes: 1 })
    const s = await getState()
    if (s.justInstalled && s.justInstalled === currentVersion()) {
      await patchState({ justInstalled: null })
      chrome.tabs.create({ url: chrome.runtime.getURL(`${UPDATES_PAGE}#updated`) })
    }
    badge()
  })
  chrome.runtime.onStartup.addListener(run)
  chrome.alarms.onAlarm.addListener((a) => a.name === ALARM && run())
  chrome.storage.onChanged.addListener((c) => KEY in c && badge())
}
