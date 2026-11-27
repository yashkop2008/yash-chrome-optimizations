// Which features are on. Stored as { features: { [id]: boolean } } in
// chrome.storage.local; anything not stored falls back to the registry default.
import { FEATURES } from './features.js'

export async function enabledMap() {
  const { features = {} } = await chrome.storage.local.get('features')
  return Object.fromEntries(FEATURES.map((f) => [f.id, features[f.id] ?? f.enabled]))
}

export async function isEnabled(id) {
  return (await enabledMap())[id] === true
}

export async function setEnabled(id, on) {
  const { features = {} } = await chrome.storage.local.get('features')
  await chrome.storage.local.set({ features: { ...features, [id]: !!on } })
}

// Content scripts are registered at runtime instead of in the manifest, so a
// switched-off feature doesn't load on any page at all.
//
// Several things can ask for a sync at nearly the same moment (the group
// switch flips three features at once, Chrome starting up while settings
// change). So each sync works by difference: register what's missing, update
// what's there, remove what's no longer wanted, and treat "already registered"
// as done. That way overlapping syncs can't trip over each other. Within one
// context they also run one after another.
let queue = Promise.resolve()

export function syncContentScripts() {
  const run = queue.then(syncOnce, syncOnce)
  queue = run.catch(() => {})
  return run
}

const isDuplicate = (e) => /duplicate/i.test(e?.message || '')

async function syncOnce() {
  const on = await enabledMap()
  const wanted = FEATURES.filter((f) => on[f.id]).flatMap((f) =>
    (f.content || []).map((c, i) => ({
      id: `feature:${f.id}:${i}`,
      matches: c.matches,
      js: c.js,
      css: c.css,
      runAt: c.runAt || 'document_idle',
      allFrames: false,
      persistAcrossSessions: true,
    })),
  )
  const wantedIds = new Set(wanted.map((s) => s.id))
  const existing = new Set(
    (await chrome.scripting.getRegisteredContentScripts()).map((s) => s.id).filter((id) => id.startsWith('feature:')),
  )

  for (const id of existing) {
    if (!wantedIds.has(id)) await chrome.scripting.unregisterContentScripts({ ids: [id] }).catch(() => {})
  }
  const toUpdate = []
  for (const script of wanted) {
    if (existing.has(script.id)) {
      toUpdate.push(script)
      continue
    }
    try {
      await chrome.scripting.registerContentScripts([script])
    } catch (e) {
      if (!isDuplicate(e)) throw e
      toUpdate.push(script) // registered by an overlapping sync a moment ago
    }
  }
  for (const script of toUpdate) await chrome.scripting.updateContentScripts([script]).catch(() => {})
  return [...wantedIds]
}
