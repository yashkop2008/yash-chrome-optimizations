// Health: a feature says when something it depends on isn't there (say,
// YouTube changed its page and the fresh feed can't find any videos), and
// clears it once things work again. The hub shows open problems on the
// feature they belong to. Stored as { health: { [featureId]: { problem, at } } }.
// Content scripts can't import modules, so they use the same three lines inline.

const KEEP_MS = 7 * 864e5

export async function report(id, problem) {
  const { health = {} } = await chrome.storage.local.get('health')
  const current = health[id]
  if (problem ? current?.problem === problem : !current) return
  if (problem) health[id] = { problem: String(problem).slice(0, 300), at: Date.now() }
  else delete health[id]
  await chrome.storage.local.set({ health })
}

export async function openProblems() {
  const { health = {} } = await chrome.storage.local.get('health')
  return Object.fromEntries(Object.entries(health).filter(([, h]) => Date.now() - h.at < KEEP_MS))
}
