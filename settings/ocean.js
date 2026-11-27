// ASCII fish in the hub's empty space (vendor/ascii-sharks). The fish swim
// across the whole window, but the canvas is clipped to the space around the
// sidebar and content, so they pass behind them instead of over any text.
import { OceanEngine } from '../vendor/ascii-sharks/ascii-sharks.js'

const PAD = 24 // breathing room kept clear around the content
const HEADER = 44

const canvas = document.createElement('canvas')
canvas.className = 'ocean'
canvas.setAttribute('aria-hidden', 'true')
document.body.prepend(canvas)

// Two small sharks (the ASCII art) cruising through the schools of fish.
const SHARKS = [
  { kind: 'classic', size: 1 },
  { kind: 'hammerhead', size: 0.85 },
]

const dark = matchMedia('(prefers-color-scheme: dark)')
let engine = null
function start() {
  engine?.destroy()
  engine = new OceanEngine(canvas, SHARKS, {
    theme: dark.matches ? 'dark' : 'light',
    clearCentre: false,
    contain: false,
    pointer: true,
  })
}
dark.addEventListener('change', start)
start()

// The clip: the whole canvas minus a padded box around the sidebar and one
// around the content, re-measured whenever anything moves.
function box(el) {
  const kids = [...el.children].filter((c) => !c.hidden && getComputedStyle(c).display !== 'none')
  if (!kids.length) return null
  const rects = kids.map((c) => c.getBoundingClientRect())
  return {
    left: Math.min(...rects.map((r) => r.left)) - PAD,
    right: Math.max(...rects.map((r) => r.right)) + PAD,
    top: Math.min(...rects.map((r) => r.top)) - PAD - HEADER,
    bottom: Math.max(...rects.map((r) => r.bottom)) + PAD - HEADER,
  }
}
const rect = (b, r = 16) =>
  `M${b.left + r} ${b.top} H${b.right - r} Q${b.right} ${b.top} ${b.right} ${b.top + r} V${b.bottom - r} Q${b.right} ${b.bottom} ${b.right - r} ${b.bottom} H${b.left + r} Q${b.left} ${b.bottom} ${b.left} ${b.bottom - r} V${b.top + r} Q${b.left} ${b.top} ${b.left + r} ${b.top} Z`

let queued = false
function clip() {
  if (queued) return
  queued = true
  requestAnimationFrame(() => {
    queued = false
    const w = innerWidth
    const h = innerHeight - HEADER
    const holes = [document.querySelector('.side'), document.querySelector('main')].map((el) => el && box(el)).filter(Boolean)
    const path = `M0 0 H${w} V${h} H0 Z ` + holes.map((b) => rect(b)).join(' ')
    canvas.style.clipPath = `path(evenodd, '${path}')`
  })
}
addEventListener('resize', clip)
addEventListener('scroll', clip, { passive: true })
new ResizeObserver(clip).observe(document.querySelector('main'))
new MutationObserver(clip).observe(document.querySelector('main'), { subtree: true, attributes: true, attributeFilter: ['class', 'hidden'] })
clip()
