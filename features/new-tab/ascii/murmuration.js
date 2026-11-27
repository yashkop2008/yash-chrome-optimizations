// Bird murmuration: a few hundred birds flocking (keep apart, match heading,
// stay together) around a slowly wandering centre, so the flock folds and
// sweeps across the page. The cursor is a falcon: the flock splits around it.
import { AsciiField, rand, clamp } from './field.js'

const CELL = 42 // neighbour grid, px

export class Murmuration extends AsciiField {
  constructor(canvas, options) {
    super(canvas, options)
    this.start()
  }

  setup() {
    const n = clamp(Math.round((this.W * this.H) / 3200), 180, 420)
    this.birds = Array.from({ length: n }, () => {
      const a = rand(0, Math.PI * 2)
      return { x: this.W / 2 + rand(-160, 160), y: this.H / 2 + rand(-90, 90), vx: Math.cos(a) * 60, vy: Math.sin(a) * 60 }
    })
  }

  step(dt) {
    const { birds, W, H } = this
    const grid = new Map()
    for (const b of birds) {
      const k = `${(b.x / CELL) | 0},${(b.y / CELL) | 0}`
      if (!grid.has(k)) grid.set(k, [])
      grid.get(k).push(b)
    }
    // The flock's centre wanders on a slow figure of eight.
    const cx = W * (0.5 + 0.3 * Math.sin(this.t * 0.11))
    const cy = H * (0.5 + 0.22 * Math.sin(this.t * 0.23 + 1))
    const p = this.pointer
    for (const b of birds) {
      let ax = 0, ay = 0, avx = 0, avy = 0, n = 0, sx = 0, sy = 0
      const gx = (b.x / CELL) | 0
      const gy = (b.y / CELL) | 0
      for (let i = -1; i <= 1; i++)
        for (let j = -1; j <= 1; j++) {
          const cellBirds = grid.get(`${gx + i},${gy + j}`)
          if (!cellBirds) continue
          for (const o of cellBirds) {
            if (o === b) continue
            const dx = o.x - b.x
            const dy = o.y - b.y
            const d2 = dx * dx + dy * dy
            if (d2 > CELL * CELL) continue
            n++
            ax += o.x
            ay += o.y
            avx += o.vx
            avy += o.vy
            if (d2 < 200) {
              sx -= dx / (d2 + 1)
              sy -= dy / (d2 + 1)
            }
          }
        }
      let fx = 0, fy = 0
      if (n) {
        fx += (ax / n - b.x) * 0.9 + (avx / n - b.vx) * 1.4 + sx * 900
        fy += (ay / n - b.y) * 0.9 + (avy / n - b.vy) * 1.4 + sy * 900
      }
      fx += (cx - b.x) * 0.12
      fy += (cy - b.y) * 0.12
      if (p.active) {
        const dx = b.x - p.x
        const dy = b.y - p.y
        const d = Math.hypot(dx, dy)
        if (d < 150 && d > 1) {
          fx += (dx / d) * (150 - d) * 9
          fy += (dy / d) * (150 - d) * 9
        }
      }
      b.vx += fx * dt
      b.vy += fy * dt
      const s = Math.hypot(b.vx, b.vy)
      const max = 190
      const min = 70
      if (s > max) (b.vx *= max / s), (b.vy *= max / s)
      if (s < min && s > 0) (b.vx *= min / s), (b.vy *= min / s)
      b.x += b.vx * dt
      b.y += b.vy * dt
    }
  }

  draw() {
    for (const b of this.birds) {
      const a = Math.atan2(b.vy, b.vx)
      const o = ((a + Math.PI) / Math.PI) * 4 // 0..8 around the circle
      const c = '-\\|/-\\|/'[Math.round(o) % 8]
      this.put(Math.sin(this.t * 9 + b.x * 0.05) > 0.85 ? 'v' : c, b.x, b.y, 0.75)
    }
  }
}
