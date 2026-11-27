// YouTube gate state, shared by its service-worker code, the gate page and its popup section.
// Everything lives in chrome.storage.local; nothing leaves the browser.

export const HOLD_LADDER = [8, 15, 25, 40, 60] // seconds, one step per pass taken today
export const SEARCH_MINUTES = 15
export const PAUSE_MINUTES = 60

export const todayKey = (d = new Date()) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

const DEFAULTS = {
  enabled: true,
  pauseUntil: 0,
  pass: null, // { kind: 'browse' | 'search', until: ms, minutes }
  days: {}, // { 'YYYY-MM-DD': { knocks, back, passes, searches, parked } }
  parked: [], // [{ id, text, at }]
  task: '',
}

export async function load() {
  const got = await chrome.storage.local.get(Object.keys(DEFAULTS))
  return { ...DEFAULTS, ...got }
}

export const save = (patch) => chrome.storage.local.set(patch)

export function today(state) {
  return { knocks: 0, back: 0, passes: 0, searches: 0, parked: 0, ...(state.days[todayKey()] || {}) }
}

export async function bump(field, by = 1) {
  const state = await load()
  const key = todayKey()
  const day = today(state)
  day[field] = (day[field] || 0) + by
  // Keep two weeks of history; older days are only noise.
  const days = Object.fromEntries(
    Object.entries({ ...state.days, [key]: day })
      .sort(([a], [b]) => (a < b ? 1 : -1))
      .slice(0, 14),
  )
  await save({ days })
  return day
}

export const holdSecondsFor = (passesToday) =>
  HOLD_LADDER[Math.min(passesToday, HOLD_LADDER.length - 1)]

export const passActive = (state, now = Date.now()) => !!state.pass && state.pass.until > now
export const pauseActive = (state, now = Date.now()) => state.pauseUntil > now

export function ordinal(n) {
  const s = ['th', 'st', 'nd', 'rd']
  const v = n % 100
  return n + (s[(v - 20) % 10] || s[v] || s[0])
}

export function clock(ms) {
  const total = Math.max(0, Math.ceil(ms / 1000))
  const m = Math.floor(total / 60)
  const s = total % 60
  return `${m}:${String(s).padStart(2, '0')}`
}
