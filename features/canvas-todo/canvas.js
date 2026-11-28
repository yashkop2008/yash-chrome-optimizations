// Canvas to-do: what's due in the next week, read from Canvas's own planner (the
// list behind its To Do sidebar) with the session you're already signed in with.
// Two ways in, whichever works:
//   - page.js, on every Canvas page you open: Canvas's own page asks, so your
//     sign-in always goes along. The list is as fresh as your last Canvas visit.
//   - from the new tab or hub directly. Chrome sends Canvas's SameSite=None session
//     cookie with an extension's requests, unless the profile's cookie settings
//     stop it. An access token from Canvas's settings works here too.
//
// Stored: canvasDomain (the address), canvasToken (optional), canvasCache
// { domain, at, checked, source: 'page' | 'direct', state, items }.
// state is 'ok', 'signed-out' or 'error'.
import { report } from '../../core/health.js'

const FEATURE = 'canvas-todo'
const DAY = 864e5
export const AHEAD_DAYS = 7
const LATE_DAYS = 30 // how far back missing work still counts as late
const STALE_MS = 5 * 60e3
// A list read on a Canvas page still counts if the direct way can't get through.
const PAGE_TRUST_MS = 2 * DAY
// Planner entries that are work to hand in (announcements and calendar events aren't).
const TYPES = new Set(['assignment', 'quiz', 'discussion_topic', 'wiki_page', 'planner_note', 'assessment_request'])

// "https://school.instructure.com/courses/1" or "school.instructure.com" -> "school.instructure.com"
export function cleanDomain(input) {
  const s = String(input || '').trim()
  if (!s) return ''
  try {
    return new URL(/^https?:\/\//.test(s) ? s : `https://${s}`).hostname.toLowerCase()
  } catch {
    return ''
  }
}

// Your school's Canvas, from history: the instructure.com (or canvas.*) site you open most.
export async function detectDomain() {
  const seen = new Map()
  for (const text of ['instructure.com', 'canvas']) {
    const items = await chrome.history.search({ text, startTime: Date.now() - 180 * DAY, maxResults: 500 }).catch(() => [])
    for (const it of items) {
      let host
      try {
        host = new URL(it.url).hostname
      } catch {
        continue
      }
      if (!/(^|\.)instructure\.com$/.test(host) && !/^canvas\./.test(host)) continue
      if (/^(www|community|status|info)\.instructure\.com$/.test(host)) continue // Instructure's own pages
      seen.set(host, (seen.get(host) || 0) + (it.visitCount || 1))
    }
  }
  return [...seen].sort((a, b) => b[1] - a[1])[0]?.[0] || ''
}

export async function getDomain() {
  const { canvasDomain } = await chrome.storage.local.get('canvasDomain')
  if (canvasDomain !== undefined) return canvasDomain // '' means you cleared it on purpose
  const found = await detectDomain()
  if (found) await chrome.storage.local.set({ canvasDomain: found })
  return found
}

// One planner entry -> what the new tab shows, or null when it's done or not work.
export function toItem(raw, domain, now = Date.now()) {
  if (!raw || !TYPES.has(raw.plannable_type)) return null
  const due = Date.parse(raw.plannable_date || raw.plannable?.due_at || raw.plannable?.todo_date || '')
  if (!due) return null
  const o = raw.planner_override
  const s = raw.submissions || {}
  if (o?.marked_complete || o?.dismissed || s.submitted || s.excused || (s.graded && !s.missing)) return null
  if (due > now + AHEAD_DAYS * DAY || due < now - LATE_DAYS * DAY) return null
  // Planner notes (your own to-dos) link to nothing useful, so they open the planner.
  const path = raw.plannable_type === 'planner_note' || !raw.html_url ? '/' : raw.html_url
  return {
    id: `${raw.plannable_type}:${raw.plannable_id}`,
    title: String(raw.plannable?.title || raw.plannable?.name || 'Untitled').trim(),
    course: raw.context_name || '',
    due,
    late: due < now,
    url: /^https?:/.test(path) ? path : `https://${domain}${path}`,
  }
}

// Late first, then soonest.
export const order = (a, b) => (a.late !== b.late ? (a.late ? -1 : 1) : a.due - b.due)

async function fetchItems(domain, token) {
  const now = Date.now()
  const q = new URLSearchParams({
    start_date: new Date(now - LATE_DAYS * DAY).toISOString(),
    end_date: new Date(now + AHEAD_DAYS * DAY).toISOString(),
    per_page: '100',
  })
  const res = await fetch(`https://${domain}/api/v1/planner/items?${q}`, {
    credentials: 'include',
    headers: { Accept: 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
  })
  if (res.status === 401) return { state: 'signed-out', items: [] }
  const text = await res.text()
  let data
  try {
    // Canvas puts "while(1);" in front of JSON it serves to a signed-in browser.
    data = JSON.parse(text.replace(/^while\(1\);/, ''))
  } catch {
    // An HTML page instead of JSON is Canvas's sign-in page.
    if (/<html|<!doctype/i.test(text)) return { state: 'signed-out', items: [] }
    throw new Error('Canvas sent something that isn’t its to-do list.')
  }
  if (data?.status === 'unauthenticated') return { state: 'signed-out', items: [] }
  if (!res.ok || !Array.isArray(data)) throw new Error(`Canvas answered ${res.status} instead of its to-do list.`)
  return { state: 'ok', items: data.map((r) => toItem(r, domain, now)).filter(Boolean).sort(order) }
}

export async function cached() {
  const { canvasCache } = await chrome.storage.local.get('canvasCache')
  return canvasCache || null
}

// The planner a Canvas page read (see page.js), for the Canvas you use.
export async function storeFromPage(domain, raw) {
  const { canvasDomain } = await chrome.storage.local.get('canvasDomain')
  if (canvasDomain !== undefined && canvasDomain !== domain) return // another Canvas, or you cleared it on purpose
  const now = Date.now()
  const items = raw.map((r) => toItem(r, domain, now)).filter(Boolean).sort(order)
  await chrome.storage.local.set({ canvasDomain: domain, canvasCache: { domain, at: now, checked: now, source: 'page', state: 'ok', items } })
  report(FEATURE, null)
}

// Ask Canvas now (or only when the last answer is a few minutes old) and store the result.
export async function refresh({ force = false } = {}) {
  const domain = await getDomain()
  if (!domain) return null
  const prev = await cached()
  const same = prev?.domain === domain
  // Only a good answer is reused: after signing in, the very next tab should see it.
  if (!force && same && prev.state === 'ok' && Date.now() - (prev.checked || prev.at) < STALE_MS) return prev
  const { canvasToken } = await chrome.storage.local.get('canvasToken')
  let next
  try {
    next = { domain, at: Date.now(), checked: Date.now(), source: 'direct', ...(await fetchItems(domain, canvasToken)) }
    report(FEATURE, null)
    // Can't get through from here, but a Canvas page read the list recently: keep that.
    if (next.state === 'signed-out' && same && prev.source === 'page' && prev.state === 'ok' && Date.now() - prev.at < PAGE_TRUST_MS) {
      next = { ...prev, checked: Date.now() }
    }
  } catch (e) {
    // Offline or Canvas down: keep showing what we had, and say so in the hub.
    next = { domain, at: Date.now(), checked: Date.now(), state: 'error', error: e.message, items: same ? prev.items : [] }
    if (!/Failed to fetch|NetworkError/i.test(e.message)) report(FEATURE, `${e.message} Canvas may have changed its planner.`)
  }
  await chrome.storage.local.set({ canvasCache: next })
  return next
}

// "late", "in 3h", "today", "tomorrow", "Wed"
export function dueLabel(due, now = Date.now()) {
  if (due < now) return 'late'
  const ms = due - now
  if (ms < 60 * 60e3) return `in ${Math.max(1, Math.round(ms / 60e3))}m`
  if (ms < 6 * 60 * 60e3) return `in ${Math.round(ms / (60 * 60e3))}h`
  const d = new Date(due)
  const start = new Date(now)
  start.setHours(0, 0, 0, 0)
  const days = Math.floor((d - start) / DAY)
  if (days === 0) return 'today'
  if (days === 1) return 'tomorrow'
  return d.toLocaleDateString(undefined, { weekday: 'short' })
}
