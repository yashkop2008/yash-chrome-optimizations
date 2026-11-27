// Fireflies: they wander and blink, and each flash nudges nearby ones a
// little closer to flashing too, so over a minute or so they fall into
// flashing together, as real fireflies do. They drift toward the cursor.
import { AsciiField, rand, clamp } from './field.js'

const PERIOD = 3.2 // seconds between flashes, give or take
const FLASH = 0.14 // the bright part of the cycle
const REACH = 240 // px a flash is seen across
const NUDGE = 0.06

export class Fireflies extends AsciiField {
  constructor(canvas, options) {
    super(canvas, options)
    this.start()
  }

  setup() {
    const n = clamp(Math.round((this.W * this.H) / 20000), 30, 90)
    this.flies = Array.from({ length: n }, () => ({
      x: rand(0, this.W),
      y: rand(0, this.H),
      heading: rand(0, Math.PI * 2),
      speed: rand(8, 22),
      phase: Math.random(),
      rate: (1 / PERIOD) * rand(0.92, 1.08),
    }))
  }

  step(dt) {
    const p = this.pointer
    const flashed = []
    for (const f of this.flies) {
      f.heading += rand(-1.5, 1.5) * dt
      let vx = Math.cos(f.heading) * f.speed
      let vy = Math.sin(f.heading) * f.speed
      if (p.active) {
        const dx = p.x - f.x
        const dy = p.y - f.y
        const d = Math.hypot(dx, dy)
        if (d < 280 && d > 30) (vx += (dx / d) * 18), (vy += (dy / d) * 18)
      }
      f.x = (f.x + vx * dt + this.W) % this.W
      f.y = (f.y + vy * dt + this.H) % this.H
      f.phase += f.rate * dt
      if (f.phase >= 1) {
        f.phase -= 1
        flashed.push(f)
      }
    }
    // Seeing a neighbour flash pulls you toward your own flash.
    for (const s of flashed)
      for (const f of this.flies) {
        if (f === s || Math.hypot(f.x - s.x, f.y - s.y) > REACH) continue
        f.phase = Math.min(0.999, f.phase + NUDGE * f.phase)
      }
  }

  draw() {
    for (const f of this.flies) {
      const glow = f.phase < FLASH ? Math.sin((Math.PI * f.phase) / FLASH) : 0
      this.put(glow > 0.5 ? '*' : '·', f.x, f.y, 0.12 + 0.88 * glow)
      if (glow > 0.25) {
        const { cw, ch } = this
        for (const [dx, dy, c] of [[-cw, 0, '-'], [cw, 0, '-'], [0, -ch, "'"], [0, ch, '.']]) this.put(c, f.x + dx, f.y + dy, 0.35 * glow)
      }
    }
  }
}
