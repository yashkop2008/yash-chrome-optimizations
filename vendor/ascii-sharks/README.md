# ascii-sharks (vendored)

ASCII fish on a canvas, from https://github.com/stackedlol/ascii-sharks
(commit fff1af0, MIT, see LICENSE). Used for the fish in the hub's empty space.

`ascii-sharks.js` is `src/index.ts` bundled with esbuild (ESM, minified), with one
change in `src/renderer.ts`: both palettes get a transparent `bg` and `grid`, and
`render()` clears the canvas before drawing, and the canvas context keeps its
alpha channel (upstream asks for `alpha: false`), so only the fish are painted.
