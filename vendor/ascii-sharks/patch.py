#!/usr/bin/env python3
"""Apply this extension's changes to a clean copy of ascii-sharks' src/.

    python3 -I patch.py <upstream>/src <out-dir>
    npx esbuild <out-dir>/index.ts --bundle --format=esm --target=chrome120 \
        --minify --legal-comments=none --outfile=ascii-sharks.js

Every change is an exact text replacement that must apply once; if upstream
moves on and one no longer matches, this stops instead of half-patching.
"""
import shutil
import sys
from pathlib import Path

src, out = Path(sys.argv[1]), Path(sys.argv[2])
if out.exists():
    shutil.rmtree(out)
shutil.copytree(src, out)


def patch(file, old, new):
    p = out / file
    s = p.read_text()
    if s.count(old) != 1:
        sys.exit(f"patch no longer applies in {file}:\n{old[:200]}")
    p.write_text(s.replace(old, new))


# 1. Transparent canvas: no backdrop, no grid, keep the alpha channel, clear each frame.
patch("renderer.ts", 'bg: "#000",\n    grid: "rgba(255,255,255,0.055)",', 'bg: "rgba(0,0,0,0)",\n    grid: "rgba(0,0,0,0)",')
patch("renderer.ts", 'bg: "#f7f6f3",\n    grid: "rgba(35,35,35,0.08)",', 'bg: "rgba(0,0,0,0)",\n    grid: "rgba(0,0,0,0)",')
patch("renderer.ts", 'const ctx = canvas.getContext("2d", { alpha: false });', 'const ctx = canvas.getContext("2d");')
patch("renderer.ts", "    ctx.setTransform(1, 0, 0, 1, 0, 0);\n    ctx.drawImage(this.bg, 0, 0);",
      "    ctx.setTransform(1, 0, 0, 1, 0, 0);\n    ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);\n    ctx.drawImage(this.bg, 0, 0);")

# 2. fishSpecies option: limit the schools to some species (the bait ball is all sardines).
patch("species.ts", "export function pickSpecies() {", """let allowed: number[] | null = null;

/** Limit new schools to these species names (empty or unknown names: no limit). */
export function setSpeciesFilter(names?: string[]) {
  const idx = (names ?? []).map((n) => SPECIES.findIndex((s) => s.name === n)).filter((i) => i >= 0);
  allowed = idx.length ? idx : null;
}

export function pickSpecies() {
  if (allowed) return allowed[Math.floor(Math.random() * allowed.length)];""")
patch("engine.ts", 'import { World, type SharkSpec } from "./world";', 'import { World, type SharkSpec } from "./world";\nimport { setSpeciesFilter } from "./species";')
patch("engine.ts", "  life?: (life: Life) => void;\n}", "  life?: (life: Life) => void;\n  /** Only these fish species school (e.g. [\"sardine\"] for a bait ball). */\n  fishSpecies?: string[];\n}")
patch("engine.ts", "    this.world = new World(", "    setSpeciesFilter(options.fishSpecies);\n    this.world = new World(")

# 3. Manta ray: a new kind. Its wings are too wide to follow the flexing spine (they
# would fold over in a turn), so they're a rigid plate around a straight head-to-
# shoulders axis; only the narrow body and whip tail ride the spine.
patch("world.ts", '| "nurse" | "whale";', '| "nurse" | "whale" | "manta";')
patch("renderer.ts", "/** One lobe of a crescent tail:", """/** Manta wings from above, half-width at s along the head-to-shoulders axis (fraction of length). */
const MANTA_WING: [number, number][] = [
  [0, 0.1], [0.03, 0.15], [0.1, 0.46], [0.19, 0.8], [0.25, 0.86], [0.3, 0.66], [0.36, 0.32], [0.42, 0.1], [0.45, 0.06],
];
function outline(points: [number, number][], s: number) {
  for (let i = 1; i < points.length; i++) {
    const [s1, w1] = points[i];
    if (s > s1) continue;
    const [s0, w0] = points[i - 1];
    return w0 + (w1 - w0) * smoothstep(s0, s1, s);
  }
  return points[points.length - 1][1];
}
/** The manta's body down its spine: narrow under the wings, then a long thin whip. */
const MANTA_BODY: [number, number][] = [[0, 0.08], [0.3, 0.07], [0.45, 0.05], [0.52, 0.022], [0.7, 0.012], [1, 0.005]];
const mantaBody = (s: number) => outline(MANTA_BODY, s);

/** One lobe of a crescent tail:""")
patch("renderer.ts", "  /** Pale spots on a lattice, sized to the raster so each is one cell. */\n  spots?: boolean;\n}",
      """  /** Pale spots on a lattice, sized to the raster so each is one cell. */
  spots?: boolean;
  /**
   * Rigid flapping wings (manta): outline is the half-width along a straight head-to-shoulders
   * axis up to s = to; depth is how much the span narrows at the top of a stroke.
   */
  wing?: { to: number; depth: number; outline: [number, number][] };
  /** Pale patches across the shoulders (s range), as on a manta's back. */
  shoulders?: [number, number];
}""")
patch("renderer.ts", "const SHAPES: Record<SharkKind, SharkShape> = {", """const SHAPES: Record<SharkKind, SharkShape> = {
  // Manta ray: wings almost twice as wide as it is long, flapping slowly; a flat head with a wide mouth
  // and two cephalic fins pointing forward, a long whip tail, pale chevrons over the shoulders.
  manta: {
    halfWidth: mantaBody,
    wing: { to: 0.45, depth: 0.3, outline: MANTA_WING },
    flatHead: true,
    pectoral: [0, 0, 0, 0],
    falcate: false,
    pelvic: [0, 0, 0, 0],
    caudal: 0,
    dorsal: [0.46, 0.49],
    dorsalAcross: 0.9,
    secondDorsal: [0, 0],
    eye: null,
    gills: [0, 0],
    shoulders: [0.09, 0.24],
    tint: [0.82, 0.88, 0.98],
  },""")
patch("renderer.ts", "  private finTipRight = 0;", "  private finTipRight = 0;\n  /** 1 with wings fully out, smaller as the tips rise (manta). */\n  private wingFlap = 1;")
patch("renderer.ts", "  private sampleShark(px: number, py: number, L: number) {\n    const { spine, arc } = this;",
      """  /** The manta's wing plate, measured against the straight axis from the head to the shoulders. */
  private sampleWing(px: number, py: number, L: number) {
    const wing = this.shape.wing!;
    const { spine } = this;
    const k = Math.round(wing.to * (SHARK_NODES - 1));
    const hx = spine[0], hy = spine[1];
    let dx = hx - spine[k * 2], dy = hy - spine[k * 2 + 1];
    const len = Math.hypot(dx, dy) || 1;
    dx /= len;
    dy /= len;
    const rx = px - hx, ry = py - hy;
    const s = -(rx * dx + ry * dy) / L; // distance behind the head, as a fraction of length
    const v = rx * dy - ry * dx; // signed distance across
    const a = Math.abs(v);
    // Cephalic fins: two short lobes pointing forward from the corners of the head.
    if (s < 0 && s > -0.06 && a > L * 0.05 && a < L * 0.1) {
      this.hitFlag = FLAG_FIN;
      this.hitShade = 0.42;
      this.hitS = 0; this.hitV = v; this.hitDist = a;
      return true;
    }
    if (s < 0 || s > wing.to) return false;
    const w = outline(wing.outline, s) * L * (s > 0.06 && s < 0.4 ? this.wingFlap : 1);
    if (a > w) return false;
    const across = a / (w || 1);
    let shade = 0.6 - across * across * 0.4 + (v < 0 ? 0.06 : -0.04);
    let flag = FLAG_BODY;
    if (s < 0.02 && across < 0.55) {
      flag = FLAG_MOUTH; // a wide mouth across the front of the head
      shade = 0;
    } else if (s < 0.05 && across > 0.72) {
      flag = FLAG_EYE;
      shade = 0;
    } else if (s > 0.09 && s < 0.24 && across > 0.12 && across < 0.4 && Math.abs(across - 0.28 + (s - 0.09) * 0.9) < 0.07) {
      shade = Math.max(shade, 0.9); // pale chevrons over the shoulders
    } else if (across > 0.9) {
      shade *= 0.7; // wingtips falling away into shadow
    }
    this.hitFlag = flag;
    this.hitShade = shade;
    this.hitS = s;
    this.hitV = v;
    this.hitDist = a;
    return true;
  }

  private sampleShark(px: number, py: number, L: number) {
    if (this.shape.wing && this.sampleWing(px, py, L)) return true;
    const { spine, arc } = this;""")
patch("renderer.ts", "      const reachFin = this.shape.pectoral[3];",
      """      const reachFin = this.shape.pectoral[3];
      // Wings: a slow stroke; seen from above the span shrinks as the tips rise.
      const wing = this.shape.wing;
      this.wingFlap = wing ? 1 - wing.depth * (0.5 + 0.5 * Math.sin(sh.phase * 0.35)) : 1;""")
patch("renderer.ts", "      const reach = L * 0.36;", "      const reach = this.shape.wing ? L * 0.95 : L * 0.36;")

# A fin with no reach is no fin: the triangle test counts every point as inside a
# zero-size triangle, which would flood the manta (it has no pectoral or pelvic fins).
patch("renderer.ts", "    if (\n      inTriangle(u, a, L * p0, 0, L * p1, 0, L * p2, tip) &&",
      "    if (\n      shape.pectoral[3] > 0 &&\n      inTriangle(u, a, L * p0, 0, L * p1, 0, L * p2, tip) &&")
patch("renderer.ts", "      inTriangle(u, a, L * v0, 0, L * v1, 0, L * v2, L * vr) ||",
      "      (vr > 0 && inTriangle(u, a, L * v0, 0, L * v1, 0, L * v2, L * vr)) ||")

# 4. schoolSize option: bigger schools for the chosen species (a few big bait balls).
patch("species.ts", "export function setSpeciesFilter(names?: string[]) {\n  const idx = (names ?? []).map((n) => SPECIES.findIndex((s) => s.name === n)).filter((i) => i >= 0);\n  allowed = idx.length ? idx : null;",
      "export function setSpeciesFilter(names?: string[], schoolSize?: [number, number]) {\n  const idx = (names ?? []).map((n) => SPECIES.findIndex((s) => s.name === n)).filter((i) => i >= 0);\n  allowed = idx.length ? idx : null;\n  if (allowed && schoolSize) for (const i of allowed) SPECIES[i].schoolSize = schoolSize;")
patch("engine.ts", "  fishSpecies?: string[];\n}", "  fishSpecies?: string[];\n  /** School size range for those species. */\n  schoolSize?: [number, number];\n}")
patch("engine.ts", "    setSpeciesFilter(options.fishSpecies);", "    setSpeciesFilter(options.fishSpecies, options.schoolSize);")
print("patched", out)
