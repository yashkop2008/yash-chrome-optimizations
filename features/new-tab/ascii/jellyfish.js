// Jellyfish drift: bells that pulse and push upward, tentacles trailing and
// swaying behind them. They drift away from the cursor; a click makes the
// nearest one pulse hard.
import { AsciiField, rand, clamp } from './field.js'

export class Jellyfish extends AsciiField {
  constructor(canvas, options) {
    super(canvas, options)
    this.start()
  }

  setup() {
    const n = clamp(Math.round((this.W * this.H) / 170000), 4, 9)
    this.jellies = Array.from({ length: n }, () => this.spawn(rand(0, this.H)))
  }

  spawn(y = this.H + rand(80, 220)) {
    const r = rand(26, 62)
    const strands = Math.round(r / 14) + 3
    return {
      x: rand(0.08, 0.92) * this.W,
      y,
      r,
      phase: rand(0, Math.PI * 2),
      rate: rand(1.4, 2.1), // pulses per ~4s
      sway: rand(0, Math.PI * 2),
      vx: 0,
      vy: 0,
      tentacles: Array.from({ length: strands }, (_, i) => ({
        at: (i / (strands - 1) - 0.5) * 1.6, // across the rim
        len: r * rand(1.8, 3.2),
        seed: rand(0, 10),
      })),
    }
  }

  step(dt) {
    const p = this.pointer
    for (const j of this.jellies) {
      j.phase += dt * j.rate
      const squeeze = Math.max(0, Math.sin(j.phase)) // the power stroke
      j.vy += (-squeeze * 38 * (60 / j.r) - j.vy * 0.9) * dt
      j.vx += (Math.sin(this.t * 0.25 + j.sway) * 6 - j.vx * 0.6) * dt
      if (p.active) {
        const dx = j.x - p.x
        const dy = j.y - p.y
        const d = Math.hypot(dx, dy)
        if (d < 180 && d > 1) {
          j.vx += (dx / d) * (180 - d) * 0.9 * dt
          j.vy += (dy / d) * (180 - d) * 0.5 * dt
        }
      }
      if (p.clicked && this.t - p.clicked < 0.05 && Math.hypot(j.x - p.x, j.y - p.y) < 220) j.vy -= 40
      j.x += j.vx * dt * 3
      j.y += (j.vy - 4) * dt * 3
      if (j.x < -j.r * 2) j.x = this.W + j.r
      if (j.x > this.W + j.r * 2) j.x = -j.r
      if (j.y < -j.r * 4) Object.assign(j, this.spawn())
    }
  }

  draw() {
    const { cw, ch } = this
    for (const j of this.jellies) {
      const squeeze = Math.max(0, Math.sin(j.phase))
      const rx = j.r * (1 - 0.18 * squeeze)
      const ry = j.r * (0.78 + 0.14 * squeeze)
      // Bell: a translucent dome. A bright outline (/ at the crown, ( at the
      // rim), a few faint dots inside, a scalloped rim underneath.
      for (let y = -ry; y <= 0; y += ch) {
        const t = -y / ry // 1 at the crown, 0 at the rim
        const w = rx * Math.sqrt(Math.max(0, 1 - t * t))
        const left = t > 0.55 ? '/' : t > 0.2 ? '(' : '('
        const right = t > 0.55 ? '\\' : ')'
        if (w < cw) {
          this.put(t > 0.9 ? '_' : '.', j.x, j.y + y, 0.8)
          continue
        }
        this.put(left, j.x - w, j.y + y, 0.85)
        this.put(right, j.x + w, j.y + y, 0.85)
        for (let x = -w + cw; x < w - cw * 0.5; x += cw) {
          const inner = 1 - Math.abs(x) / w
          const speck = Math.sin(x * 0.7 + y * 1.3 + j.phase) > 0.55
          if (speck) this.put(t > 0.5 ? '.' : ':', j.x + x, j.y + y, 0.18 + 0.2 * inner)
        }
        if (t > 0.92) for (let x = -w; x <= w; x += cw) this.put('_', j.x + x, j.y + y - ch * 0.5, 0.75)
      }
      for (let x = -rx; x <= rx; x += cw) {
        const scallop = Math.sin(x / (cw * 1.2) + j.phase * 2) > 0 ? '~' : '-'
        this.put(scallop, j.x + x, j.y + ch * 0.6, 0.7)
      }
      // Tentacles: fine strands of : . ' that sway more the further they hang.
      for (const tt of j.tentacles) {
        const x0 = j.x + tt.at * rx * 0.7
        const steps = Math.round(tt.len / (ch * 0.75))
        for (let k = 1; k <= steps; k++) {
          const f = k / steps
          const swing = Math.sin(this.t * 1.5 + tt.seed + k * 0.4 - j.phase * 0.6) * 12 * f
          this.put(k % 3 === 0 ? "'" : k % 2 ? ':' : '.', x0 + swing - j.vx * f * 4, j.y + ch + k * ch * 0.75, 0.5 * (1 - f) + 0.06)
        }
      }
      // Two oral arms down the middle: shorter, brighter, wavier.
      for (const side of [-1, 1]) {
        const steps = Math.round((j.r * 1.4) / ch)
        for (let k = 1; k <= steps; k++) {
          const f = k / steps
          const wave = Math.sin(this.t * 2.2 + k * 0.7 + side) * 7 * f
          this.put(Math.cos(this.t * 2.2 + k * 0.7 + side) > 0 ? '}' : '{', j.x + side * 6 + wave, j.y + ch + k * ch, 0.7 * (1 - f) + 0.15)
        }
      }
    }
  }
}
