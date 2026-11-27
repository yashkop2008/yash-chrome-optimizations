// A small engine for ASCII creatures on a canvas: a character grid, a loop,
// the cursor, and the house rules (transparent background, greyscale ink that
// follows light/dark, a single still frame for reduced motion, no work while
// the tab is hidden). A creature extends AsciiField and fills in step() and
// draw(), putting characters with put(ch, x, y, alpha).

const FONT = 'ui-monospace, "SF Mono", Menlo, "JetBrains Mono", monospace'
const LEVELS = 10 // alpha is bucketed so each frame sets few fill styles

export class AsciiField {
  constructor(canvas, { theme = 'dark', cell = 14 } = {}) {
    this.canvas = canvas
    this.ctx = canvas.getContext('2d')
    this.ink = theme === 'dark' ? '237,237,237' : '39,39,42'
    this.cell = cell
    this.t = 0
    this.pointer = { x: -1e4, y: -1e4, active: false, clicked: 0 }
    this.reduced = matchMedia('(prefers-reduced-motion: reduce)').matches
    this.alive = true

    this.onMove = (e) => {
      const r = canvas.getBoundingClientRect()
      this.pointer.x = e.clientX - r.left
      this.pointer.y = e.clientY - r.top
      this.pointer.active = true
    }
    this.onLeave = () => (this.pointer.active = false)
    this.onDown = () => (this.pointer.clicked = this.t)
    addEventListener('pointermove', this.onMove, { passive: true })
    addEventListener('pointerdown', this.onDown, { passive: true })
    document.documentElement.addEventListener('pointerleave', this.onLeave)
    this.ro = new ResizeObserver(() => this.resize())
    this.ro.observe(canvas)
    this.resize()
  }

  // Call at the end of a subclass constructor, once its state exists.
  start() {
    this.setup?.()
    this.started = true
    if (this.reduced) {
      for (let i = 0; i < 240; i++) this.step(1 / 60)
      this.render()
      return this
    }
    let last = performance.now()
    const frame = (now) => {
      if (!this.alive) return
      const dt = Math.min(0.05, (now - last) / 1000)
      last = now
      if (!document.hidden) {
        this.t += dt
        this.step(dt)
        this.render()
      }
      this.raf = requestAnimationFrame(frame)
    }
    this.raf = requestAnimationFrame(frame)
    return this
  }

  resize() {
    const r = this.canvas.getBoundingClientRect()
    const dpr = Math.min(devicePixelRatio || 1, 2)
    this.W = Math.max(1, r.width)
    this.H = Math.max(1, r.height)
    this.canvas.width = Math.round(this.W * dpr)
    this.canvas.height = Math.round(this.H * dpr)
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    this.cw = Math.round(this.cell * 0.62)
    this.ch = this.cell
    this.cols = Math.ceil(this.W / this.cw)
    this.rows = Math.ceil(this.H / this.ch)
    this.chars = new Array(this.cols * this.rows)
    this.alpha = new Float32Array(this.cols * this.rows)
    this.onResize?.()
    if (this.reduced && this.started) this.render()
  }

  // Put a character at a point; the brightest one in each cell wins.
  put(ch, x, y, a) {
    if (a <= 0.02) return
    const col = Math.round(x / this.cw)
    const row = Math.round(y / this.ch)
    if (col < 0 || row < 0 || col >= this.cols || row >= this.rows) return
    const i = row * this.cols + col
    if (a > this.alpha[i]) {
      this.alpha[i] = Math.min(1, a)
      this.chars[i] = ch
    }
  }

  render() {
    const { ctx } = this
    this.alpha.fill(0)
    this.draw()
    ctx.clearRect(0, 0, this.W, this.H)
    ctx.font = `500 ${Math.round(this.ch * 0.86)}px ${FONT}`
    ctx.textBaseline = 'middle'
    ctx.textAlign = 'center'
    for (let level = 1; level <= LEVELS; level++) {
      const lo = (level - 1) / LEVELS
      const hi = level / LEVELS
      ctx.fillStyle = `rgba(${this.ink},${hi.toFixed(2)})`
      for (let i = 0; i < this.alpha.length; i++) {
        const a = this.alpha[i]
        if (a > lo && a <= hi) ctx.fillText(this.chars[i], (i % this.cols) * this.cw, ((i / this.cols) | 0) * this.ch)
      }
    }
  }

  destroy() {
    this.alive = false
    cancelAnimationFrame(this.raf)
    this.ro.disconnect()
    removeEventListener('pointermove', this.onMove)
    removeEventListener('pointerdown', this.onDown)
    document.documentElement.removeEventListener('pointerleave', this.onLeave)
    this.ctx.clearRect(0, 0, this.W, this.H)
  }
}

export const rand = (a, b) => a + Math.random() * (b - a)
export const clamp = (v, a, b) => Math.max(a, Math.min(b, v))
