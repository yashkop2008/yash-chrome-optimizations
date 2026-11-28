// The new tab page: the next ASCII creature in the rotation, full screen, what's
// due on Canvas in the top-left corner, and your most visited sites as plain
// names that only appear when the mouse goes to the bottom of the page. Each
// part follows its own switch in the hub.
import { isEnabled } from '../../core/settings.js'
import { keepToNegativeSpace } from '../../core/negative-space.js'
import { nextCreature } from './creatures.js'
import { cached, refresh, dueLabel, order } from '../canvas-todo/canvas.js'

const canvas = document.querySelector('.creatures')
const nav = document.querySelector('.shortcuts')
const todo = document.querySelector('.todo')
const dark = matchMedia('(prefers-color-scheme: dark)')

/* ---------- the creature ---------- */

let engine = null
if (await isEnabled('newtab-creatures')) {
  const creature = await nextCreature()
  const start = async () => {
    engine?.destroy()
    engine = await creature.start(canvas, dark.matches ? 'dark' : 'light')
  }
  dark.addEventListener('change', start)
  await start()
  document.documentElement.dataset.creature = creature.id
} else {
  canvas.remove()
}

// The creature swims around whatever is showing: the to-do list, and the shortcuts while open.
let open = false
const reclip = canvas.isConnected
  ? keepToNegativeSpace(canvas, () => [todo, open ? nav : null], { pad: 16 })
  : () => {}

/* ---------- Canvas to-do ---------- */

const SHOW = 5

function renderTodo(c) {
  todo.replaceChildren()
  if (!c) return (todo.hidden = true)
  const link = (cls, href, text) => {
    const a = document.createElement('a')
    a.className = cls
    a.href = href
    a.textContent = text
    return a
  }
  const home = `https://${c.domain}/`
  if (c.state === 'signed-out') {
    todo.append(link('todo-quiet', home, 'Open Canvas to see what’s due'))
  } else if (!c.items.length) {
    if (c.state === 'ok') todo.append(Object.assign(document.createElement('div'), { className: 'todo-quiet', textContent: 'Nothing due this week' }))
  } else {
    // Late as of now, not as of when the list was read.
    const items = c.items.map((it) => ({ ...it, late: it.due < Date.now() })).sort(order)
    for (const it of items.slice(0, SHOW)) {
      const a = link(`todo-row${it.late ? ' late' : ''}`, it.url, '')
      a.title = it.course ? `${it.title} · ${it.course}` : it.title
      a.append(
        Object.assign(document.createElement('span'), { className: 'todo-title', textContent: it.title }),
        Object.assign(document.createElement('span'), { className: 'todo-due', textContent: dueLabel(it.due) }),
      )
      todo.append(a)
    }
    if (c.items.length > SHOW) todo.append(link('todo-quiet', home, `+ ${c.items.length - SHOW} more`))
  }
  todo.hidden = !todo.childElementCount
  reclip()
}

if (await isEnabled('canvas-todo')) {
  // What we knew last time straight away, then whatever Canvas says now.
  renderTodo(await cached())
  refresh().then(renderTodo)
}

/* ---------- quiet shortcuts ---------- */

const ZONE = 140 // how close to the bottom the mouse has to be
let closeTimer = 0

function setOpen(next) {
  clearTimeout(closeTimer)
  if (next === open) return
  if (next) {
    open = true
    nav.classList.add('open')
    reclip()
  } else {
    closeTimer = setTimeout(() => {
      open = false
      nav.classList.remove('open')
      reclip()
    }, 300)
  }
}

function label(url) {
  const host = new URL(url).hostname.replace(/^www\./, '')
  return host
}

if (await isEnabled('newtab-shortcuts')) {
  let sites = []
  try {
    sites = await chrome.topSites.get()
  } catch {}
  const seen = new Set()
  for (const s of sites) {
    if (!/^https?:/.test(s.url)) continue
    const name = label(s.url)
    if (seen.has(name)) continue
    seen.add(name)
    const a = document.createElement('a')
    a.href = s.url
    a.textContent = name
    a.title = s.title || name
    nav.append(a)
    if (seen.size === 8) break
  }
  if (seen.size) {
    nav.hidden = false
    document.addEventListener(
      'mousemove',
      (e) => setOpen(e.clientY >= innerHeight - ZONE),
      { passive: true },
    )
    document.addEventListener('mouseleave', () => setOpen(false))
  }
}
