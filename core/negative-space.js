// Keeps a full-window animation canvas (fish on the hub, spiders on the gate)
// in the page's empty space: it's clipped to everything except padded boxes
// around the given content, so creatures pass behind the content, never over it.
//
// The boxes are merged into one shape made of non-overlapping cells before
// clipping. Clip paths use the even-odd rule, where a spot covered by two
// overlapping boxes would count as outside both and show the animation again.

const PAD = 24

// Union of each element's visible children, padded.
function boxOf(el, pad, offsetTop) {
  const kids = [...el.children].filter((c) => !c.hidden && getComputedStyle(c).display !== 'none')
  const rects = kids.map((c) => c.getBoundingClientRect()).filter((r) => r.width && r.height)
  if (!rects.length) return null
  return {
    left: Math.min(...rects.map((r) => r.left)) - pad,
    right: Math.max(...rects.map((r) => r.right)) + pad,
    top: Math.min(...rects.map((r) => r.top)) - pad - offsetTop,
    bottom: Math.max(...rects.map((r) => r.bottom)) + pad - offsetTop,
  }
}

// Split the union of boxes into disjoint rectangles on the grid of their edges.
export function cells(boxes) {
  const xs = [...new Set(boxes.flatMap((b) => [b.left, b.right]))].sort((a, b) => a - b)
  const ys = [...new Set(boxes.flatMap((b) => [b.top, b.bottom]))].sort((a, b) => a - b)
  const out = []
  for (let i = 0; i < xs.length - 1; i++) {
    for (let j = 0; j < ys.length - 1; j++) {
      const cx = (xs[i] + xs[i + 1]) / 2
      const cy = (ys[j] + ys[j + 1]) / 2
      if (boxes.some((b) => cx > b.left && cx < b.right && cy > b.top && cy < b.bottom)) {
        out.push({ left: xs[i], right: xs[i + 1], top: ys[j], bottom: ys[j + 1] })
      }
    }
  }
  return out
}

export function keepToNegativeSpace(canvas, contentEls, { offsetTop = 0, pad = PAD } = {}) {
  let queued = false
  const update = () => {
    if (queued) return
    queued = true
    requestAnimationFrame(() => {
      queued = false
      const w = innerWidth
      const h = innerHeight - offsetTop
      const boxes = contentEls().filter(Boolean).map((el) => boxOf(el, pad, offsetTop)).filter(Boolean)
      const holes = cells(boxes)
        .map((c) => `M${c.left} ${c.top} H${c.right} V${c.bottom} H${c.left} Z`)
        .join(' ')
      canvas.style.clipPath = `path(evenodd, 'M0 0 H${w} V${h} H0 Z ${holes}')`
    })
  }
  addEventListener('resize', update)
  addEventListener('scroll', update, { passive: true })
  const ro = new ResizeObserver(update)
  const mo = new MutationObserver(update)
  for (const el of contentEls().filter(Boolean)) {
    ro.observe(el)
    mo.observe(el, { subtree: true, attributes: true, attributeFilter: ['class', 'hidden'] })
  }
  update()
  return update
}
