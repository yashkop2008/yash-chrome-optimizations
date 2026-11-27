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
# 5. Orca and koi: two new kinds, plus what they need from the renderer.
#    Shapes can now set their own body-wave strength, rounded paddle fins, a pulse
#    for the tail lobes, their own fin glyphs, and a pattern (orca saddle and eye
#    patches, koi blotches). Pale and mid-grey markings are drawn untinted.
patch("world.ts", '| "whale" | "manta";', '| "whale" | "manta" | "orca" | "koi";')
patch("renderer.ts", "const FLECK_GLYPHS = \"·°·\";", """const FLECK_GLYPHS = "·°·";
/** Pale skin (orca eye patches, a koi's white) and mid-grey skin (orca saddle, a koi's red). */
const FLAG_PALE = 10;
const FLAG_HI = 11;
const PALE_GLYPHS = ".:'";
const VARIETIES = ["kohaku", "sanke", "showa", "tancho", "ogon"] as const;

/** A rounded fin: from root to tip along the body (fractions of length), its reach out, and its width. */
interface Paddle { root: number; tip: number; reach: number; width: number; flutter?: number }

/** Orca from above: a blunt rounded head, a thick body, a narrow tail stock ahead of the flukes. */
function orcaHalfWidth(s: number) {
  if (s < 0.16) return 0.11 * Math.pow(Math.sin(((s / 0.16) * Math.PI) / 2), 0.75);
  if (s < 0.34) return 0.11 + 0.022 * smoothstep(0.16, 0.34, s);
  if (s < 0.84) return 0.022 + 0.11 * Math.pow(1 - (s - 0.34) / 0.5, 1.25);
  return 0.022 * (1 - (s - 0.84) / 0.16) + 0.006;
}
/** Koi from above: a round head, a plump body, and a slim stalk into the tail. */
function koiHalfWidth(s: number) {
  if (s < 0.12) return 0.1 * Math.pow(Math.sin(((s / 0.12) * Math.PI) / 2), 0.55);
  if (s < 0.3) return 0.1 + 0.026 * smoothstep(0.12, 0.3, s);
  if (s < 0.68) return 0.028 + 0.098 * Math.pow(1 - (s - 0.3) / 0.38, 1.2);
  return 0.028 * (1 - (s - 0.68) / 0.32) + 0.008;
}""")
patch("renderer.ts", "  /** Pale patches across the shoulders (s range), as on a manta's back. */\n  shoulders?: [number, number];\n}",
      """  /** Pale patches across the shoulders (s range), as on a manta's back. */
  shoulders?: [number, number];
  /** Side-to-side body wave, relative to a shark's (orcas swim with an up-and-down stroke). */
  wave?: number;
  /** Rounded fins (orca and koi pectorals, koi pelvics). */
  paddles?: Paddle[];
  /** How much the tail lobes' span shrinks with each stroke (orca flukes seen from above). */
  lobePulse?: number;
  /** Glyphs for fins (koi: wispy, translucent). */
  finGlyphs?: string;
  pattern?: "orca" | "koi";
  /** Darkens the skin and fins (an orca is black); its glyphs are drawn lighter than the skin instead. */
  skin?: number;
}""")
patch("renderer.ts", "const SHAPES: Record<SharkKind, SharkShape> = {", """const SHAPES: Record<SharkKind, SharkShape> = {
  // Orca: black from above, with white eye patches behind the eyes, a grey saddle behind the tall
  // dorsal fin, broad paddle pectorals and wide flukes that pulse with the stroke.
  orca: {
    halfWidth: orcaHalfWidth,
    pectoral: [0, 0, 0, 0],
    paddles: [{ root: 0.17, tip: 0.31, reach: 0.19, width: 0.048 }],
    falcate: false,
    pelvic: [0, 0, 0, 0],
    caudal: 0,
    lobes: {
      upper: { tipS: 0.99, tipR: 0.19, lead: 0.82, trail: 0.95 },
      lower: { tipS: 0.99, tipR: 0.19, lead: 0.82, trail: 0.95 },
    },
    lobePulse: 0.22,
    dorsal: [0, 0], // drawn by the pattern, as a dark blade
    secondDorsal: [0, 0],
    eye: [0.085, 0.1],
    eyeAcross: 0.82,
    gills: [0, 0],
    wave: 0.3,
    pattern: "orca",
    skin: 0.34,
    tint: [0.95, 0.97, 1.04],
  },
  // Koi: plump, round-headed, with fluttering paddle fins, a long flowing tail, and blotches
  // that differ fish to fish (kohaku, sanke, showa, tancho, ogon).
  koi: {
    halfWidth: koiHalfWidth,
    pectoral: [0, 0, 0, 0],
    paddles: [
      { root: 0.16, tip: 0.3, reach: 0.2, width: 0.05, flutter: 0.18 },
      { root: 0.43, tip: 0.54, reach: 0.12, width: 0.03, flutter: 0.12 },
    ],
    falcate: false,
    pelvic: [0, 0, 0, 0],
    caudal: 0,
    lobes: {
      upper: { tipS: 1, tipR: 0.17, lead: 0.66, trail: 0.9 },
      lower: { tipS: 1, tipR: 0.17, lead: 0.66, trail: 0.9 },
    },
    finGlyphs: "\\"';:`",
    dorsal: [0, 0],
    secondDorsal: [0, 0],
    eye: [0.055, 0.085],
    eyeAcross: 0.68,
    gills: [0, 0],
    wave: 2,
    pattern: "koi",
    tint: [1.14, 1.14, 1.14],
  },""")
patch("renderer.ts", "  private finTipRight = 0;", """  private finTipRight = 0;
  /** Per side reach of paddle fins (banking), the stroke phase, and the tail-lobe span this frame. */
  private bankRight = 1;
  private bankLeft = 1;
  private phase = 0;
  private lobeScale = 1;
  /** Picks each koi's variety, so every tab gets a different mix. */
  private koiSeed = Math.floor(Math.random() * 1000);
  /** Orca blows, drawn as a puff of spray that drifts apart. */
  private puffs: { x: number; y: number; t0: number }[] = [];
  private themeName: Theme = "dark";
  /** Drawn last, over everything (the koi pond's lily pads). */
  decor: ((ctx: CanvasRenderingContext2D, info: DecorInfo) => void) | null = null;""")
patch("renderer.ts", "export class AsciiRenderer {", """export interface DecorInfo {
  cw: number;
  ch: number;
  width: number;
  height: number;
  t: number;
  theme: Theme;
  /** The palette's fill for a 0-255 brightness (tinted like the creatures). */
  tone: (level: number, tr: number, tg: number, tb: number) => string;
  glyphLit: string;
  glyphShadow: string;
}

export class AsciiRenderer {""")
patch("renderer.ts", "const p = (this.palette = PALETTES[theme]);", "this.themeName = theme;\n    const p = (this.palette = PALETTES[theme]);")
# Body wave strength per shape.
patch("renderer.ts", "const amp = L * 0.05 * (0.1 + 0.9 * Math.pow(s, 1.8)) * swim;",
      "const amp = L * 0.05 * (0.1 + 0.9 * Math.pow(s, 1.8)) * swim * (this.shape.wave ?? 1);")
patch("renderer.ts", "this.finTipLeft = L * reachFin * flex * (1 + bank);", """this.finTipLeft = L * reachFin * flex * (1 + bank);
      this.bankRight = flex * (1 - bank * 0.6);
      this.bankLeft = flex * (1 + bank * 0.6);
      this.phase = sh.phase;
      this.lobeScale = 1 - (this.shape.lobePulse ?? 0) * (0.5 + 0.5 * Math.sin(sh.phase));""")
# Patterns: after the eye, before gills and the pale snout (orcas have a black rostrum).
patch("renderer.ts", "      } else if (shape.eye && s > shape.eye[0]", """      } else if (shape.pattern && this.patterned(s, a * bestSign, L, across)) {
        flag = this.hitFlag;
        if (flag === FLAG_HI && shape.pattern === "orca") shade = Math.max(shade, 0.72); // a pale grey saddle
        if (flag === FLAG_BODY) shade = Math.min(1, shade + 0.12); // ogon: a metallic sheen
      } else if (shape.eye && s > shape.eye[0]""")
patch("renderer.ts", "} else if (!shape.flatHead && s < 0.05) {", "} else if (!shape.flatHead && !shape.pattern && s < 0.05) {")
# Orcas heave: the back rises toward the light and sinks with each stroke, front to back.
patch("renderer.ts", "      this.hitFlag = flag;\n      this.hitShade = shade;\n      return true;\n    }\n\n    const tip = bestSign > 0",
      """      if (shape.pattern === "orca") shade = clamp(shade + 0.08 * Math.sin(this.phase - s * 4), 0, 1);
      this.hitFlag = flag;
      this.hitShade = shade;
      return true;
    }

    if (shape.paddles) {
      const side = bestSign > 0 ? this.bankRight : this.bankLeft;
      for (let i = 0; i < shape.paddles.length; i++) {
        const p = shape.paddles[i];
        const flutter = p.flutter ? 1 + p.flutter * Math.sin(this.phase * 1.3 + i + (bestSign > 0 ? 0 : Math.PI)) : 1;
        const ax = L * p.root;
        const ay = shape.halfWidth(p.root) * L * 0.6;
        const sx = L * p.tip - ax;
        const sy = L * p.reach * side * flutter - ay;
        const q = clamp(((u - ax) * sx + (a - ay) * sy) / (sx * sx + sy * sy || 1), 0, 1);
        const d = Math.hypot(u - ax - sx * q, a - ay - sy * q);
        // Narrow at the root, broadest past the middle, rounded at the tip.
        if (d < L * p.width * (0.5 + 0.5 * Math.sin(Math.PI * Math.pow(q, 0.8)))) {
          this.hitFlag = FLAG_FIN;
          this.hitShade = 0.3 + 0.26 * (1 - q);
          return true;
        }
      }
    }

    const tip = bestSign > 0""")
patch("renderer.ts", "if (inLobe(s, a / L, lobe)) {", "if (inLobe(s, a / L / this.lobeScale, lobe)) {")
patch("renderer.ts", "this.hitShade = 0.3 + 0.2 * (1 - a / (L * lobe.tipR));", "this.hitShade = 0.3 + 0.2 * (1 - a / (L * lobe.tipR * this.lobeScale));")
patch("renderer.ts", "  /** Whether a body point (s along, v across) falls on a dark marking. */", """  /** Smooth value noise, so a koi's blotches have soft, irregular edges. */
  private noise(x: number, y: number, seed: number) {
    const x0 = Math.floor(x);
    const y0 = Math.floor(y);
    const fx = x - x0;
    const fy = y - y0;
    const sx = fx * fx * (3 - 2 * fx);
    const sy = fy * fy * (3 - 2 * fy);
    const a = hash3(x0, y0, seed);
    const b = hash3(x0 + 1, y0, seed);
    const c = hash3(x0, y0 + 1, seed);
    const d = hash3(x0 + 1, y0 + 1, seed);
    return a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy;
  }

  /** Orca and koi markings. Sets hitFlag and returns true when the point is marked (or plain koi white). */
  private patterned(s: number, v: number, L: number, across: number) {
    if (this.shape.pattern === "orca") {
      // Eye patch: a white oval behind the eye, angled up the flank.
      const pc = 0.8 + (s - 0.14) * 1.2;
      if (((s - 0.17) / 0.07) ** 2 + ((across - pc) / 0.32) ** 2 < 1) {
        this.hitFlag = FLAG_PALE;
        return true;
      }
      // The tall dorsal fin, seen edge-on from above: a dark blade down the back.
      if (s > 0.33 && s < 0.46 && across < 0.24) {
        this.hitFlag = FLAG_MARK;
        return true;
      }
      // The grey saddle just behind it, swept back along the flanks.
      if (((s - 0.53 - across * 0.04) / 0.085) ** 2 + (across / 1.05) ** 2 < 1) {
        this.hitFlag = FLAG_HI;
        return true;
      }
      // A glimpse of the white flank, low down the sides behind the saddle.
      if (s > 0.56 && s < 0.76 && across > 0.84 - 0.5 * Math.sin(((s - 0.56) / 0.2) * Math.PI) * 0.2) {
        this.hitFlag = FLAG_PALE;
        return true;
      }
      return false;
    }
    const id = this.sharkId;
    const variety = VARIETIES[(id + this.koiSeed) % VARIETIES.length];
    if (s < 0.04 || across > 0.94) return false;
    const red = this.noise(s * 6.5, (v / L) * 11, id * 7 + 1) * 0.7 + this.noise(s * 15, (v / L) * 26, id * 7 + 2) * 0.3;
    const ink = this.noise(s * 12, (v / L) * 20, id * 7 + 3);
    let flag = FLAG_PALE;
    if (variety === "tancho") {
      // One round red spot on the head, nothing else.
      if ((s * L - 0.12 * L) ** 2 + v * v < (0.06 * L) ** 2) flag = FLAG_HI;
    } else if (variety === "showa") {
      // Black base, broken by red and white.
      if (red > 0.56 && s < 0.7) flag = FLAG_HI;
      else if (ink > 0.42 || s > 0.62) flag = FLAG_MARK;
    } else if (variety === "ogon") {
      flag = FLAG_BODY; // one metallic tone all over
    } else {
      // Kohaku: white with red over the back, the red stopping short of the tail.
      if (red > 0.5 && s < 0.66 && across < 0.9) flag = FLAG_HI;
      // Sanke: small black spots over the white and red, none on the head.
      if (variety === "sanke" && s > 0.16 && s < 0.66 && ink > 0.76) flag = FLAG_MARK;
    }
    this.hitFlag = flag;
    return true;
  }

  /** Whether a body point (s along, v across) falls on a dark marking. */""")
patch("renderer.ts", "const [tr, tg, tb] = SHAPES[KINDS[sharkKind[i]]].tint;",
      "const kindShape = SHAPES[KINDS[sharkKind[i]]];\n      let [tr, tg, tb] = kindShape.tint;\n      if (flag === FLAG_PALE || flag === FLAG_HI) tr = tg = tb = 1;")
patch("renderer.ts", "const g = (70 + shade * 80) * dim;", "const g = (70 + shade * 80) * dim * (this.themeName === 'dark' ? 1 : Math.sqrt(kindShape.skin ?? 1));")
patch("renderer.ts", "      level *= dim;", """      // On a dark page a black animal would vanish, so it's only half as dark there.
      const dark = kindShape.skin && flag !== FLAG_PALE && flag !== FLAG_HI && flag !== FLAG_EYE
        ? (this.themeName === "dark" ? Math.sqrt(kindShape.skin) : kindShape.skin)
        : 1;
      level *= dim * dark;""")
patch("renderer.ts", "else color = shade > 0.55 ? palette.glyphLit : palette.glyphShadow;",
      "else if (dark < 1) color = palette.tone(level * 1.6 + 22, tr, tg, tb);\n      else color = shade > 0.55 ? palette.glyphLit : palette.glyphShadow;")
patch("renderer.ts", "glyph = FIN_GLYPHS[(key >>> 8) % FIN_GLYPHS.length];",
      """const fins = kindShape.finGlyphs ?? FIN_GLYPHS;
        glyph = fins[(key >>> 8) % fins.length];
      } else if (flag === FLAG_PALE) {
        level = Math.min(255, 140 + shade * 130);
        glyph = PALE_GLYPHS[(key >>> 8) % PALE_GLYPHS.length];
      } else if (flag === FLAG_HI) {
        level = 70 + shade * 90;
        const jitter = ((key >>> 4) % 3) - 1;
        glyph = SKIN_RAMP[clamp(Math.floor((1 - shade) * 6) + 2 + jitter, 0, SKIN_RAMP.length - 1)];""")

# Events: an orca's breath (a ring and a puff of spray), a koi's gulp (a small ring).
patch("world.ts", 'kind: "eat" | "splash";', 'kind: "eat" | "splash" | "breath" | "gulp";')
patch("renderer.ts", "        this.stamp(this.energy, e.x, e.y, 6, 1.4);",
      """        if (e.kind === "breath") {
          this.stamp(this.energy, e.x, e.y, 4, 1.5);
          this.puffs.push({ x: e.x, y: e.y, t0: world.time });
        } else if (e.kind === "gulp") {
          this.stamp(this.energy, e.x, e.y, 2, 1.1);
        } else this.stamp(this.energy, e.x, e.y, 6, 1.4);""")
patch("renderer.ts", "      else this.drawSharks(t);\n      ctx.globalAlpha = 1;\n    }\n  }",
      """      else this.drawSharks(t);
      ctx.globalAlpha = 1;
    }
    this.drawPuffs(t);
    this.drawFood(world);
    if (this.decor) {
      const { cw: dcw, ch: dch, width, height, themeName: theme, palette } = this;
      this.decor(ctx, { cw: dcw, ch: dch, width, height, t, theme, tone: palette.tone, glyphLit: palette.glyphLit, glyphShadow: palette.glyphShadow });
    }
  }

  /** An orca's blow: spray that bursts up from the blowhole and drifts apart. */
  private drawPuffs(t: number) {
    const { ctx, cw, ch, palette } = this;
    const LIFE = 1.9;
    this.puffs = this.puffs.filter((p) => t - p.t0 < LIFE && t >= p.t0);
    const [r, g, b] = palette.fish;
    for (const p of this.puffs) {
      const age = (t - p.t0) / LIFE;
      const R = 0.8 + age * 3.4;
      const c0 = Math.floor(p.x / cw);
      const r0 = Math.floor(p.y / ch);
      const n = Math.ceil(R) + 1;
      const tick = Math.floor(t * 9);
      ctx.fillStyle = `rgba(${r},${g},${b},${(0.95 * (1 - age * age)).toFixed(3)})`;
      for (let row = r0 - n; row <= r0 + n; row++) {
        for (let col = c0 - n; col <= c0 + n; col++) {
          const d = Math.hypot(col - c0, (row - r0) * 1.45);
          if (d > R) continue;
          const density = (1 - age) * (1 - d / (R + 0.6)) * 1.5;
          const h = hash3(col, row, tick + Math.floor(p.t0 * 13));
          if (h > density) continue;
          ctx.fillText(h < density * 0.25 ? "*" : h < density * 0.6 ? "°" : "·", col * cw + cw / 2, row * ch + ch / 2 + 1);
        }
      }
    }
  }

  /** Koi food floating on the surface, over the fish. */
  private drawFood(world: World) {
    if (!world.food.length) return;
    const { ctx, cw, ch, palette } = this;
    const [r, g, b] = palette.fish;
    ctx.fillStyle = `rgba(${r},${g},${b},0.9)`;
    for (const p of world.food) {
      ctx.fillText("o", Math.floor(p.x / cw) * cw + cw / 2, Math.floor(p.y / ch) * ch + ch / 2 + 1);
    }
  }""")
patch("engine.ts", 'import { AsciiRenderer, type Stage, type Theme } from "./renderer";',
      'import { AsciiRenderer, type DecorInfo, type Stage, type Theme } from "./renderer";')
patch("engine.ts", "  schoolSize?: [number, number];\n}",
      "  schoolSize?: [number, number];\n  /** Drawn over everything each frame, on the same cell grid (the koi pond's lily pads). */\n  decor?: (ctx: CanvasRenderingContext2D, info: DecorInfo) => void;\n}")
patch("engine.ts", "    this.renderer.stage = options.stage ?? \"full\";", "    this.renderer.stage = options.stage ?? \"full\";\n    this.renderer.decor = options.decor ?? null;")

# 6. Orca and koi behaviour.
#    Orcas travel as a pod (same circuit, matching heading, closing up when apart) and
#    surface to breathe every so often. Koi cruise slowly, turn tightly, and a click
#    scatters food: every koi heads for the nearest pellet and gulps it.
patch("world.ts", "  /** 0 far / dim → 1 near / bright. */\n  depth: number;\n}",
      "  /** 0 far / dim → 1 near / bright. */\n  depth: number;\n  /** When an orca next surfaces to breathe. */\n  breathAt: number;\n}")
patch("world.ts", "        depth: clamp(size, 0, 1),", "        depth: clamp(size, 0, 1),\n        breathAt: rand(2, 8) + i * 2.5,")
patch("world.ts", "  pointer = { x: 0, y: 0, active: false };", """  pointer = { x: 0, y: 0, active: false };
  /** Koi food: pellets scattered by a click, drifting on the surface until eaten. */
  food: { x: number; y: number; vx: number; vy: number; until: number }[] = [];
  /** Where an orca pod starts on its circuit, and which way round it goes. */
  private podAngle = rand(0, TAU);
  private podDir: 1 | -1 = Math.random() < 0.5 ? 1 : -1;""")
patch("world.ts", "const orbitDir: 1 | -1 = i % 2 === 0 ? 1 : -1;", "const orbitDir: 1 | -1 = kind === \"orca\" ? this.podDir : i % 2 === 0 ? 1 : -1;")
patch("world.ts", ": minSide * rand(0.28, 0.4);", ": minSide * (kind === \"orca\" ? 0.2 + 0.045 * i : rand(0.28, 0.4));")
patch("world.ts", "const a = (i / sharkCount) * TAU + rand(-0.4, 0.4);", "const a = kind === \"orca\" ? this.podAngle - i * 0.35 * this.podDir : (i / sharkCount) * TAU + rand(-0.4, 0.4);")
# A pond with no fish must not reseed (and scatter the koi) on every resize.
patch("world.ts", "if (first || this.fish.length === 0) {", "if (first || (this.fish.length === 0 && this.fishCount !== 0)) {")
patch("world.ts", '  splash(x: number, y: number) {\n    this.events.push({ kind: "splash", x, y });',
      """  splash(x: number, y: number) {
    this.events.push({ kind: "splash", x, y });
    if (this.sharks.some((s) => s.kind === "koi")) {
      const n = randInt(6, 10);
      for (let i = 0; i < n; i++) {
        const a = rand(0, TAU);
        const sp = rand(10, 46);
        this.food.push({ x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, until: this.time + 45 });
      }
      if (this.food.length > 60) this.food.splice(0, this.food.length - 60);
    }""")
patch("world.ts", "    this.stepSharks(dt);", """    this.stepSharks(dt);
    this.stepFood(dt);""")
patch("world.ts", "  private stepSharks(dt: number) {", """  /** Pellets spread from where they landed, slow down, drift, and edge away from the banks. */
  private stepFood(dt: number) {
    const { food, width: W, height: H, time } = this;
    const drag = Math.exp(-dt * 1.6);
    const m = 110;
    for (let i = food.length - 1; i >= 0; i--) {
      const p = food[i];
      if (time > p.until) {
        food.splice(i, 1);
        continue;
      }
      p.vx *= drag;
      p.vy *= drag;
      if (p.x < m) p.vx += dt * 14;
      else if (p.x > W - m) p.vx -= dt * 14;
      if (p.y < m) p.vy += dt * 14;
      else if (p.y > H - m) p.vy -= dt * 14;
      p.x = clamp(p.x + p.vx * dt + Math.sin(time * 0.3 + i) * dt * 2, 4, W - 4);
      p.y = clamp(p.y + p.vy * dt + Math.cos(time * 0.27 + i) * dt * 2, 4, H - 4);
    }
  }

  private stepSharks(dt: number) {""")
patch("world.ts", "      // Hunt.", """      const koi = sh.kind === "koi";
      const orca = sh.kind === "orca";

      // Hunt.""")
patch("world.ts", "      // Give other sharks room.", """      // Koi: feeding time. Head for the nearest pellet, keener the closer it is.
      let feeding = false;
      if (koi && this.food.length) {
        let best = this.food[0];
        let bd = Infinity;
        for (const p of this.food) {
          const d2 = (p.x - hx) ** 2 + (p.y - hy) ** 2;
          if (d2 < bd) {
            bd = d2;
            best = p;
          }
        }
        const d = Math.sqrt(bd) || 1;
        const w = 2.6 + 2 * clamp(1 - d / (L * 2), 0, 1);
        dx += ((best.x - hx) / d) * w;
        dy += ((best.y - hy) / d) * w;
        feeding = true;
        closing = clamp(1 - d / (L * 0.8), 0, 1);
      }

      // An orca pod: match the others' heading, close up when strung out.
      if (orca && !hunting) {
        let ax = 0, ay = 0, cx = 0, cy = 0, count = 0;
        for (const o of sharks) {
          if (o === sh || o.kind !== "orca") continue;
          ax += Math.cos(o.heading);
          ay += Math.sin(o.heading);
          cx += o.nodes[0];
          cy += o.nodes[1];
          count++;
        }
        if (count) {
          dx += (ax / count) * 1.2;
          dy += (ay / count) * 1.2;
          cx = cx / count - hx;
          cy = cy / count - hy;
          const d = Math.hypot(cx, cy) || 1;
          const w = clamp((d - L * 0.6) / L, 0, 1) * 2.6;
          dx += (cx / d) * w;
          dy += (cy / d) * w;
        }
      }
      // Surfacing to breathe: a blow and a ring of ripples at the blowhole.
      if (orca && time >= sh.breathAt) {
        this.events.push({ kind: "breath", x: nodes[4], y: nodes[5] });
        sh.breathAt = time + rand(10, 24);
      }

      // Give other sharks room.""")
patch("world.ts", "const range = (L + other.length) * 0.45;", "const range = (L + other.length) * (orca ? 0.34 : koi ? 0.26 : 0.45);")
patch("world.ts", "const w = Math.sqrt(Math.min(1, m)) * 8;", "const w = Math.sqrt(Math.min(1, m)) * (feeding ? 3 : 8);")
patch("world.ts", "const agility = Math.min(hunting", "const agility = koi\n        ? Math.min(feeding ? 2.4 : 1.1, sh.speed / (L * 0.08))\n        : orca\n        ? Math.min(hunting ? 0.9 + closing * 0.5 : 0.45, sh.speed / (L * 0.3))\n        : Math.min(hunting")
# An orca's body barely bends; a shark's can curl into a C.
patch("world.ts", "const maxBend = 0.16;", "const maxBend = orca ? 0.075 : 0.16;")
patch("world.ts", "const cruise = 30 + L * 0.04;", "const cruise = koi ? 10 + L * 0.025 : 30 + L * 0.04;")
patch("world.ts", "const targetSpeed = hunting", "const targetSpeed = feeding ? cruise * (2.3 - closing * 1.1) : hunting")
patch("world.ts", "      // Feed.", """      // Koi gulp pellets at the snout.
      if (koi && this.food.length) {
        const mr = L * 0.05 + 6;
        for (let j = this.food.length - 1; j >= 0; j--) {
          const p = this.food[j];
          if ((p.x - nodes[0]) ** 2 + (p.y - nodes[1]) ** 2 < mr * mr) {
            this.food.splice(j, 1);
            this.events.push({ kind: "gulp", x: p.x, y: p.y });
          }
        }
      }

      // Feed.""")

print("patched", out)
