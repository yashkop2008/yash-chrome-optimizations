// ASCII fish in the hub's empty space (vendor/ascii-sharks). The fish swim
// across the whole window, but the canvas is clipped to the space around the
// sidebar and content, so they pass behind them instead of over any text.
import { OceanEngine } from '../vendor/ascii-sharks/ascii-sharks.js'
import { keepToNegativeSpace } from '../core/negative-space.js'

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

// Only in the empty space: clipped around the sidebar and the content.
keepToNegativeSpace(canvas, () => [document.querySelector('main')], { offsetTop: 44 })
