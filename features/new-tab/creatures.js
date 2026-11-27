// The ASCII creatures new tabs take turns with. Adding one = one entry here:
// an id, a name for the hub, and start(canvas, theme) returning its engine
// (anything with destroy()). Engines live in vendor/, bundled to plain JS.
import { lilyPads } from './lily-pads.js'

const ocean = async (canvas, theme, sharks, options = {}) => {
  const { OceanEngine } = await import('../../vendor/ascii-sharks/ascii-sharks.js')
  return new OceanEngine(canvas, sharks, { theme, clearCentre: false, contain: false, pointer: true, ...options })
}
const webs = async (canvas, theme, spiders, options = {}) => {
  const { SpiderEngine } = await import('../../vendor/ascii-spiders/ascii-spiders.js')
  return new SpiderEngine(canvas, spiders, { theme, build: true, pointer: true, ...options })
}

export const CREATURES = [
  {
    id: 'sharks',
    name: 'Sharks',
    start: (canvas, theme) =>
      ocean(canvas, theme, [
        { kind: 'classic', size: 1 },
        { kind: 'hammerhead', size: 0.85 },
      ]),
  },
  {
    id: 'spiders',
    name: 'Spiders',
    start: (canvas, theme) => webs(canvas, theme, undefined),
  },
  {
    // Two whale sharks, huge and slow, spotted, through the schools.
    id: 'whale-sharks',
    name: 'Whale sharks',
    start: (canvas, theme) =>
      ocean(canvas, theme, [
        { kind: 'whale', size: 1.25 },
        { kind: 'whale', size: 0.95 },
      ]),
  },
  {
    // Golden orb weavers: very long legs, few and large webs.
    id: 'golden-orbs',
    name: 'Golden orbs',
    start: (canvas, theme) => webs(canvas, theme, [{ kind: 'nephila' }, { kind: 'nephila' }, { kind: 'nephila' }], { webs: 3 }),
  },
  {
    // Only sardines, which mill into rotating bait balls, and one mako cutting through.
    id: 'bait-ball',
    name: 'Bait ball',
    start: (canvas, theme) => ocean(canvas, theme, [{ kind: 'mako', size: 0.75 }], { fishSpecies: ['sardine'], schoolSize: [70, 110], fish: 240 }),
  },
  {
    // Manta rays (added to the vendored engine): wide flapping wings, whip tails.
    id: 'manta-rays',
    name: 'Manta rays',
    start: (canvas, theme) =>
      ocean(canvas, theme, [
        { kind: 'manta', size: 0.62 },
        { kind: 'manta', size: 0.48 },
      ]),
  },
  {
    // An orca pod (added to the vendored engine): black and white, travelling together,
    // a calf among them, surfacing now and then to blow. They hunt the mackerel.
    id: 'orcas',
    name: 'Orcas',
    start: (canvas, theme) =>
      ocean(
        canvas,
        theme,
        [
          { kind: 'orca', size: 0.92 },
          { kind: 'orca', size: 0.8 },
          { kind: 'orca', size: 0.52 },
        ],
        { fishSpecies: ['mackerel', 'silverside'], contain: true },
      ),
  },
  {
    // A koi pond from above (koi added to the vendored engine): slow koi of different
    // varieties under lily pads. Click to scatter food and they come to it.
    id: 'koi-pond',
    name: 'Koi pond',
    start: (canvas, theme) =>
      ocean(
        canvas,
        theme,
        [0.9, 0.82, 0.76, 0.7, 0.62, 0.56].map((size) => ({ kind: 'koi', size })),
        { fish: 0, contain: true, decor: lilyPads() },
      ),
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
