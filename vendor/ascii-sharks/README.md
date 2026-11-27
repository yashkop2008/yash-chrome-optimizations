# ascii-sharks (vendored)

ASCII fish on a canvas, from https://github.com/stackedlol/ascii-sharks
(commit fff1af0, MIT, see LICENSE). Used for the fish in the hub's empty space.

`ascii-sharks.js` is built from upstream `src/` by `patch.py` (exact, checked text
replacements) and then esbuild (ESM, minified); the commands are at the top of
`patch.py`. The changes:

1. Transparent canvas: no backdrop or grid, alpha kept, cleared each frame.
2. `fishSpecies` and `schoolSize` options (the bait ball: only sardines, in big schools).
3. A `manta` kind: rigid flapping wings around a straight head-to-shoulders axis
   (they'd fold over on the flexing spine), cephalic fins, pale shoulder chevrons,
   a whip tail.
4. Fins with no reach are skipped (a zero-size triangle otherwise counted as covering
   everything).
