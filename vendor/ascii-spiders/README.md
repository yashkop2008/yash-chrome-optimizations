# ascii-spiders (vendored)

ASCII orb weavers, a jumping spider and flies on a canvas, from
https://github.com/stackedlol/ascii-spiders (commit 89a7721, MIT, see LICENSE).
Used on the YouTube gate.

`ascii-spiders.js` is `src/index.ts` bundled with esbuild (ESM, minified), with one
change in `src/renderer.ts`: both palettes get a transparent `bg` and `grid`, the
canvas context keeps its alpha channel (upstream asks for `alpha: false`), and
`render()` clears the canvas before drawing, so only the spiders, silk and flies are painted.
