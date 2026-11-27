import { load, save, bump, today, holdSecondsFor, ordinal, SEARCH_MINUTES } from './state.js'

const $ = (id) => document.getElementById(id)
const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches

// Where you were headed. Only YouTube addresses are honoured.
// The redirect brings the YouTube address after a #. It's kept for this tab
// and wiped from the address bar, which then reads just …/youtube.html.
const KEY = 'rh-target'
if (location.hash.length > 1) {
  sessionStorage.setItem(KEY, location.hash.slice(1))
  history.replaceState(null, '', location.pathname)
}

function readTarget() {
  try {
    const url = new URL(sessionStorage.getItem(KEY) || '')
    if (/^https?:$/.test(url.protocol) && /(^|\.)youtube\.com$|^youtu\.be$/.test(url.hostname)) return url
  } catch {}
  return null
}
const target = readTarget()

let state = await load()
const navType = performance.getEntriesByType('navigation')[0]?.type
// "Back to it" walks history backwards; if that lands on an older gate in the
// same tab, keep walking instead of greeting you again.
const leaving = Number(sessionStorage.getItem('rh-leaving') || 0)
if (navType === 'back_forward' && Date.now() - leaving < 3000) {
  sessionStorage.setItem('rh-leaving', String(Date.now()))
  history.length > 1 ? history.back() : closeTab()
} else {
  sessionStorage.removeItem('rh-leaving')
}
let day = navType === 'navigate' ? await bump('knocks') : today(state)

/* ---------- copy ---------- */

function render() {
  const { knocks, back, passes } = day
  $('meta').textContent =
    `${ordinal(knocks)} knock today · ${passes} ${passes === 1 ? 'pass' : 'passes'} · ${back} turned back`
  $('sub').textContent =
    knocks <= 1
      ? 'First knock today. Whatever it is, it will still exist in an hour.'
      : knocks <= 3
        ? `That's the ${ordinal(knocks)} time today. It can wait.`
        : `That's the ${ordinal(knocks)} time today. Something keeps pulling — park it below.`
  holdMs = holdSecondsFor(passes) * 1000
  if (!holding && progress === 0) $('fall-label').textContent = `Hold ${holdSecondsFor(passes)}s`
}

$('search-min').textContent = SEARCH_MINUTES

/* ---------- task composer ---------- */

const task = $('task')
task.value = state.task || ''
let saveTimer
task.addEventListener('input', () => {
  clearTimeout(saveTimer)
  saveTimer = setTimeout(() => save({ task: task.value.trim() }), 250)
})
task.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) {
    e.preventDefault()
    $('task-form').requestSubmit()
  }
})
$('task-form').addEventListener('submit', async (e) => {
  e.preventDefault()
  await save({ task: task.value.trim() })
  await goBack()
})

async function goBack() {
  day = await bump('back')
  render()
  sessionStorage.setItem('rh-leaving', String(Date.now()))
  if (history.length > 1) history.back()
  // No page behind us (YouTube typed into a fresh tab): close the tab instead.
  setTimeout(closeTab, 350)
}

async function closeTab() {
  const tab = await chrome.tabs.getCurrent()
  if (tab) chrome.tabs.remove(tab.id)
}

/* ---------- park ---------- */

$('park-form').addEventListener('submit', async (e) => {
  e.preventDefault()
  const text = $('park').value.trim()
  if (!text) return $('park').focus()
  state = await load()
  const parked = [{ id: crypto.randomUUID(), text, at: Date.now() }, ...state.parked].slice(0, 50)
  await save({ parked })
  await bump('parked')
  $('park').value = ''
  toast('Parked. Taking you back…')
  setTimeout(goBack, 900)
})

/* ---------- search with blinders ---------- */

const search = $('search')
const prefill = target?.searchParams.get('search_query')
if (prefill) search.value = prefill
const syncSearch = () => ($('search-btn').disabled = search.value.trim().length < 3)
search.addEventListener('input', syncSearch)
syncSearch()

$('search-form').addEventListener('submit', async (e) => {
  e.preventDefault()
  const q = search.value.trim()
  if (q.length < 3) return
  await chrome.runtime.sendMessage({ type: 'grant-search' })
  location.replace(`https://www.youtube.com/results?search_query=${encodeURIComponent(q)}`)
})

/* ---------- hold to fall in ---------- */

const fall = $('fall')
let holdMs = 8000
let holding = false
let progress = 0
let done = false
let lastWhisper = -1

const whispers = () => {
  const t = (state.task || task.value).trim()
  return [
    [0.12, t ? `“${t}” is still open in another tab.` : 'Whatever you were doing is still open.'],
    [0.38, 'One video is never one video.'],
    [0.62, `This is knock number ${day.knocks} today.`],
    [0.84, 'You can still let go.'],
  ]
}

function whisper(text, linger = 0) {
  const el = $('whisper')
  clearTimeout(whisper.timer)
  el.classList.remove('on')
  document.body.classList.toggle('whispering', !!text)
  requestAnimationFrame(() => {
    el.textContent = text
    if (text) el.classList.add('on')
  })
  if (linger) whisper.timer = setTimeout(() => whisper(''), linger)
}

function startHold(e) {
  if (done || holding) return
  e?.preventDefault()
  holding = true
  document.body.classList.add('falling')
}
function endHold() {
  if (!holding || done) return
  holding = false
  document.body.classList.remove('falling')
  whisper(progress > 0.15 ? 'Good. Let go.' : '', 1400)
  lastWhisper = -1
}

fall.addEventListener('pointerdown', (e) => {
  fall.setPointerCapture(e.pointerId)
  startHold(e)
})
fall.addEventListener('pointerup', endHold)
fall.addEventListener('pointercancel', endHold)
fall.addEventListener('lostpointercapture', endHold)
fall.addEventListener('keydown', (e) => {
  if ((e.key === ' ' || e.key === 'Enter') && !e.repeat) startHold(e)
  else if (e.key === ' ' || e.key === 'Enter') e.preventDefault()
})
fall.addEventListener('keyup', (e) => {
  if (e.key === ' ' || e.key === 'Enter') endHold()
})
fall.addEventListener('click', (e) => e.preventDefault())
fall.addEventListener('contextmenu', (e) => e.preventDefault())
document.addEventListener('visibilitychange', () => document.hidden && endHold())
window.addEventListener('blur', endHold)

async function landed() {
  done = true
  holding = false
  fall.classList.add('done')
  const minutes = Number(document.querySelector('input[name="min"]:checked').value)
  $('fall-label').textContent = `Falling in · ${minutes}m`
  whisper(`See you in ${minutes} minutes. The timer is in the corner.`)
  await chrome.runtime.sendMessage({ type: 'grant-browse', minutes })
  setTimeout(() => location.replace(target?.href || 'https://www.youtube.com/'), reduced ? 200 : 900)
}

function stepHold(dt) {
  if (done) return
  if (holding) progress = Math.min(1, progress + dt / holdMs)
  else if (progress > 0) progress = Math.max(0, progress - dt / 450)

  fall.style.setProperty('--p', progress.toFixed(4))
  if (holding || progress > 0) {
    const left = Math.ceil(((1 - progress) * holdMs) / 1000)
    $('fall-label').textContent = holding ? `Falling… ${left}s` : `Hold ${Math.round(holdMs / 1000)}s`
  }
  if (holding) {
    const list = whispers()
    for (let i = list.length - 1; i >= 0; i--) {
      if (progress >= list[i][0]) {
        if (i !== lastWhisper) {
          lastWhisper = i
          whisper(list[i][1])
        }
        break
      }
    }
  }
  if (progress >= 1) landed()
}

/* ---------- the hole ---------- */

const canvas = $('hole')
const ctx = canvas.getContext('2d')
const dark = matchMedia('(prefers-color-scheme: dark)')
const RINGS = 16
const rings = Array.from({ length: RINGS }, (_, i) => ({ z: 0.1 + (i / RINGS) * 0.95 }))
let ink = '237,237,237'
let W = 0
let H = 0
let t = 0

function readInk() {
  const c = getComputedStyle(document.documentElement).getPropertyValue('--text').trim()
  const m = /^#?([0-9a-f]{6})$/i.exec(c)
  if (m) {
    const n = parseInt(m[1], 16)
    ink = `${(n >> 16) & 255},${(n >> 8) & 255},${n & 255}`
  }
}
readInk()
dark.addEventListener('change', readInk)

function resize() {
  const dpr = Math.min(devicePixelRatio || 1, 2)
  const r = canvas.getBoundingClientRect()
  W = r.width
  H = r.height
  canvas.width = Math.round(W * dpr)
  canvas.height = Math.round(H * dpr)
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
}
new ResizeObserver(resize).observe(canvas)
resize()

function drawHole(dt) {
  const p = done ? 1 : progress
  const speed = reduced ? 0 : 0.035 + p * p * 1.5 + (done ? 2.5 : 0)
  t += dt / 1000
  ctx.clearRect(0, 0, W, H)

  // Sized by width, but never taller than the space the layout left for it.
  const base = Math.min(Math.min(W, 560) * 0.075, H * 0.19)
  const cx = W / 2
  const cy = H / 2

  // The bottom you never reach.
  const core = ctx.createRadialGradient(cx, cy, 0, cx, cy, base * 3.2)
  const deep = dark.matches ? '0,0,0' : ink
  core.addColorStop(0, `rgba(${deep},${dark.matches ? 0.9 : 0.16})`)
  core.addColorStop(1, `rgba(${deep},0)`)
  ctx.fillStyle = core
  ctx.beginPath()
  ctx.ellipse(cx, cy, base * 3.2, base * 3.2 * 0.42, 0, 0, Math.PI * 2)
  ctx.fill()

  for (const ring of rings) {
    ring.z -= speed * (dt / 1000) * ring.z
    if (ring.z < 0.06) ring.z += 1
  }
  const ordered = [...rings].sort((a, b) => b.z - a.z)
  for (const { z } of ordered) {
    const rx = base / z
    const ry = rx * 0.42
    // Swirl only once you're really falling.
    const swirl = p * p * 10
    const ox = Math.sin(t * 1.7 + z * 9) * swirl * (1 - z)
    const oy = Math.cos(t * 1.3 + z * 7) * swirl * 0.4 * (1 - z)
    const farFade = Math.pow(1 - Math.min(z, 1), 1.3)
    const nearFade = Math.min(1, (W * 0.75) / rx)
    const alpha = (0.06 + 0.5 * farFade) * nearFade * (dark.matches ? 1 : 0.8)
    ctx.strokeStyle = `rgba(${ink},${alpha.toFixed(3)})`
    ctx.lineWidth = Math.max(0.6, Math.min(2.2, 0.35 / z))
    ctx.beginPath()
    ctx.ellipse(cx + ox, cy + oy, rx, ry, 0, 0, Math.PI * 2)
    ctx.stroke()
  }
}

let last = performance.now()
function frame(now) {
  const dt = Math.min(64, now - last)
  last = now
  stepHold(dt)
  drawHole(dt)
  requestAnimationFrame(frame)
}

render()
requestAnimationFrame(frame)
if (!state.task) task.focus()

function toast(text) {
  const el = $('toast')
  el.textContent = text
  el.hidden = false
  clearTimeout(toast.timer)
  toast.timer = setTimeout(() => (el.hidden = true), 2400)
}
