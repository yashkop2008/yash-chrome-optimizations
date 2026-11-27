// Lily pads for the koi pond. The shark engine calls this after drawing each frame
// (its `decor` option), on its own cell grid, so the pads cover the koi and they
// glide underneath. Each pad is a disc with a notch cut to its centre, veins
// running out from the middle and a slightly ragged rim; pads cluster toward the
// banks, drift a little and turn very slowly. A few carry a flower.

const SUB = [0.25, 0.3, 0.75, 0.3, 0.25, 0.72, 0.75, 0.72, 0.5, 0.5]
const FILL = ':;t%'
const EDGE = ".',`"

const rand = (a, b) => a + Math.random() * (b - a)
const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a))

function place(W, H, ch) {
  const pads = []
  const min = Math.min(W, H)
  // Two or three clusters, near corners and edges, never in the middle of the pond.
  const spots = [
    [0.08, 0.12], [0.92, 0.1], [0.06, 0.88], [0.94, 0.9], [0.5, 0.04], [0.5, 0.97], [0.03, 0.5], [0.97, 0.52],
  ].sort(() => Math.random() - 0.5)
  const clusters = Math.round(rand(2, 3.4))
  for (let c = 0; c < clusters; c++) {
    const [fx, fy] = spots[c]
    const cx = fx * W
    const cy = fy * H
    const count = Math.round(rand(2, 4.4))
    for (let tries = 0, made = 0; made < count && tries < 60; tries++) {
      const R = ch * (made === 0 ? rand(5, 7.5) : rand(2.4, 5))
      const a = rand(0, Math.PI * 2)
      const d = made === 0 ? 0 : rand(R, R + min * 0.14)
      const x = cx + Math.cos(a) * d
      const y = cy + Math.sin(a) * d
      if (pads.some((p) => Math.hypot(p.x - x, p.y - y) < p.R + R + ch * 0.6)) continue
      pads.push({
        x, y, R,
        notch: rand(0, Math.PI * 2),
        veins: Math.round(rand(9, 13)),
        seed: Math.random() * 1000,
        drift: rand(0.4, 0.9) * ch,
        flower: false,
      })
      made++
    }
  }
  // A flower or two, on the larger pads.
  const big = pads.filter((p) => p.R > ch * 4.5).sort(() => Math.random() - 0.5)
  for (const p of big.slice(0, Math.random() < 0.5 ? 1 : 2)) p.flower = { a: rand(0, Math.PI * 2), d: rand(0.2, 0.45) }
  return pads
}

export function lilyPads() {
  let pads = null
  let key = ''
  return (ctx, { cw, ch, width: W, height: H, t, tone, glyphShadow }) => {
    const k = `${W}x${H}x${cw}`
    if (k !== key) {
      key = k
      pads = place(W, H, ch)
    }
    const cols = Math.ceil(W / cw)
    const rows = Math.ceil(H / ch)
    for (const p of pads) {
      // Bob on the water and turn a little; the grid snaps it, as it does the fish.
      const px = p.x + Math.sin(t * 0.07 + p.seed) * p.drift
      const py = p.y + Math.cos(t * 0.06 + p.seed * 1.3) * p.drift * 0.6
      const turn = p.notch + 0.12 * Math.sin(t * 0.03 + p.seed)
      const inside = (x, y) => {
        const dx = x - px
        const dy = y - py
        const d = Math.hypot(dx, dy)
        const a = Math.atan2(dy, dx)
        const rim = p.R * (1 + 0.035 * Math.sin(a * 7 + p.seed) + 0.02 * Math.sin(a * 13 + p.seed * 2))
        if (d > rim) return false
        // The notch: a narrow wedge from the rim to the centre.
        return Math.abs(wrap(a - turn)) > 0.2 * Math.min(1, (d / p.R) * 2 + 0.25) || d < p.R * 0.08
      }
      const c0 = Math.max(0, Math.floor((px - p.R * 1.1) / cw))
      const c1 = Math.min(cols - 1, Math.floor((px + p.R * 1.1) / cw))
      const r0 = Math.max(0, Math.floor((py - p.R * 1.1) / ch))
      const r1 = Math.min(rows - 1, Math.floor((py + p.R * 1.1) / ch))
      for (let r = r0; r <= r1; r++) {
        for (let c = c0; c <= c1; c++) {
          const x = c * cw
          const y = r * ch
          let hits = 0
          for (let i = 0; i < SUB.length; i += 2) if (inside(x + SUB[i] * cw, y + SUB[i + 1] * ch)) hits++
          if (!hits) continue
          const cx = x + cw / 2
          const cy = y + ch / 2
          const dx = cx - px
          const dy = cy - py
          const d = Math.hypot(dx, dy)
          const a = Math.atan2(dy, dx)
          const h = Math.abs(Math.sin(c * 12.9898 + r * 78.233 + p.seed) * 43758.5453) % 1
          if (hits < 4) {
            // The rim, anti-aliased: a light glyph, no block.
            ctx.fillStyle = tone(110, 1, 1, 1)
            ctx.fillText(EDGE[Math.floor(h * EDGE.length)], cx, cy + 1)
            continue
          }
          // Lit from the top left, the rim curling up and catching the light.
          const across = d / p.R
          const light = 0.5 + 0.35 * ((-dx * 0.6 - dy * 0.8) / p.R) + (across > 0.86 ? 0.18 : 0)
          ctx.fillStyle = tone(58 + light * 70, 1, 1, 1)
          ctx.fillRect(x + 1, y + 1, cw - 1, ch - 1)
          // Veins: evenly spaced, the notch between two of them.
          const step = (Math.PI * 2) / p.veins
          const rel = wrap(a - turn - step / 2)
          const off = Math.abs(rel - Math.round(rel / step) * step) * d
          let glyph
          let colour = glyphShadow
          if (d < cw * 0.7) glyph = 'o'
          else if (off < cw * 0.42 && across < 0.9) {
            // A vein: its glyph follows its direction on screen.
            const dir = ((Math.round((a / Math.PI) * 4) % 4) + 4) % 4
            glyph = ['-', '\\', '|', '/'][dir]
            colour = tone(150 + light * 60, 1, 1, 1)
          } else glyph = FILL[Math.max(0, Math.min(FILL.length - 1, Math.floor((1 - light) * FILL.length + h * 0.9)))]
          ctx.fillStyle = colour
          ctx.fillText(glyph, cx, cy + 1)
        }
      }
      if (p.flower) drawFlower(ctx, p, px, py, turn, cw, ch, tone)
    }
  }
}

// A water lily: a pale bloom of pointed petals around a bright centre, sitting on the pad.
function drawFlower(ctx, p, px, py, turn, cw, ch, tone) {
  const fx = px + Math.cos(turn + Math.PI + p.flower.a * 0.3) * p.R * p.flower.d
  const fy = py + Math.sin(turn + Math.PI + p.flower.a * 0.3) * p.R * p.flower.d
  const c0 = Math.floor(fx / cw)
  const r0 = Math.floor(fy / ch)
  for (let r = r0 - 2; r <= r0 + 2; r++) {
    for (let c = c0 - 3; c <= c0 + 3; c++) {
      const dx = (c - c0) * cw
      const dy = (r - r0) * ch
      const d = Math.hypot(dx, dy)
      if (d > ch * 1.75) continue
      const a = Math.atan2(dy, dx)
      // Eight petals: the bloom is wider along each petal than between them.
      const petal = 0.75 + 0.25 * Math.cos(a * 8 + p.seed)
      if (d > ch * 1.75 * petal) continue
      const x = c * cw
      const y = r * ch
      const centre = d < ch * 0.5
      ctx.fillStyle = tone(centre ? 250 : 200 + 40 * (1 - d / (ch * 1.75)), 1, 1, 1)
      ctx.fillRect(x + 1, y + 1, cw - 1, ch - 1)
      const dir = ((Math.round((a / Math.PI) * 4) % 4) + 4) % 4
      ctx.fillStyle = tone(centre ? 120 : 150, 1, 1, 1)
      ctx.fillText(centre ? '*' : ['-', '\\', '|', '/'][dir], x + cw / 2, y + ch / 2 + 1)
    }
  }
}
