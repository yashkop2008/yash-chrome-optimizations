// The ASCII creatures new tabs take turns with. Adding one = one entry here:
// an id, a name for the hub, and start(canvas, theme) returning its engine
// (anything with destroy()). Engines live in vendor/, bundled to plain JS.

export const CREATURES = [
  {
    id: 'sharks',
    name: 'Sharks',
    async start(canvas, theme) {
      const { OceanEngine } = await import('../../vendor/ascii-sharks/ascii-sharks.js')
      return new OceanEngine(
        canvas,
        [
          { kind: 'classic', size: 1 },
          { kind: 'hammerhead', size: 0.85 },
        ],
        { theme, clearCentre: false, contain: false, pointer: true },
      )
    },
  },
  {
    id: 'spiders',
    name: 'Spiders',
    async start(canvas, theme) {
      const { SpiderEngine } = await import('../../vendor/ascii-spiders/ascii-spiders.js')
      return new SpiderEngine(canvas, undefined, { theme, build: true, pointer: true })
    },
  },
]

// Which creatures are in the rotation (all by default; at least one).
export async function rotation() {
  const { ntCreatures } = await chrome.storage.local.get('ntCreatures')
  const on = CREATURES.filter((c) => !ntCreatures || ntCreatures.includes(c.id))
  return on.length ? on : CREATURES
}

// The next creature in line, moving the line along by one.
export async function nextCreature() {
  const list = await rotation()
  const { ntNext = 0 } = await chrome.storage.local.get('ntNext')
  await chrome.storage.local.set({ ntNext: (ntNext + 1) % 1e6 })
  return list[ntNext % list.length]
}
