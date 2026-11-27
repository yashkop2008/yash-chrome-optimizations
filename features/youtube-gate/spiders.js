// ASCII spiders (vendor/ascii-spiders) spinning webs in the gate's empty
// space while you decide. Webs go up from bare frames on every visit; moving
// the cursor plucks the silk. Clipped around the gate's content so nothing
// crawls over what you're reading.
import { SpiderEngine } from '../../vendor/ascii-spiders/ascii-spiders.js'
import { keepToNegativeSpace } from '../../core/negative-space.js'

const canvas = document.createElement('canvas')
canvas.className = 'spiders'
canvas.setAttribute('aria-hidden', 'true')
document.body.prepend(canvas)

const dark = matchMedia('(prefers-color-scheme: dark)')
let engine = null
function start() {
  engine?.destroy()
  engine = new SpiderEngine(canvas, undefined, {
    theme: dark.matches ? 'dark' : 'light',
    build: true,
    webs: 4,
    pointer: true,
  })
}
dark.addEventListener('change', start)
start()

keepToNegativeSpace(canvas, () => [document.querySelector('main')], { offsetTop: 44 })
