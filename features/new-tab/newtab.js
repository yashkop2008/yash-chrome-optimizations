// The new tab page: the next ASCII creature in the rotation, full screen, and
// your most visited sites as plain names that only appear when the mouse goes
// to the bottom of the page. Each part follows its own switch in the hub.
import { isEnabled } from '../../core/settings.js'
import { keepToNegativeSpace } from '../../core/negative-space.js'
import { nextCreature } from './creatures.js'

const canvas = document.querySelector('.creatures')
const nav = document.querySelector('.shortcuts')
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

/* ---------- quiet shortcuts ---------- */

const ZONE = 140 // how close to the bottom the mouse has to be
let open = false
let closeTimer = 0
let reclip = () => {}

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
    // While they're showing, the creature swims behind them, not over them.
    if (canvas.isConnected) reclip = keepToNegativeSpace(canvas, () => (open ? [nav] : []), { pad: 16 })
  }
}
