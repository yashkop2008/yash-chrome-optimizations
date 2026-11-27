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
export async function syncContentScripts() {
  const on = await enabledMap()
  const existing = await chrome.scripting.getRegisteredContentScripts()
  const ours = existing.map((s) => s.id).filter((id) => id.startsWith('feature:'))
  if (ours.length) await chrome.scripting.unregisterContentScripts({ ids: ours })
  const scripts = FEATURES.filter((f) => on[f.id]).flatMap((f) =>
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
  if (scripts.length) await chrome.scripting.registerContentScripts(scripts)
  return scripts.map((s) => s.id)
}
