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
5. `orca` and `koi` kinds, and what they need from the renderer: per-shape body-wave
   strength, rounded paddle fins, tail lobes that pulse with the stroke (orca flukes),
   a dark-skin option, pale and mid-grey markings (orca eye patches and saddle; koi
   varieties from smooth noise: kohaku, sanke, showa, tancho, ogon), an orca's blow
   drawn as spray, floating food, and a `decor` option drawn over everything on the
   same cell grid (the koi pond's lily pads, in `features/new-tab/lily-pads.js`).
6. Orca and koi behaviour: orcas travel as a pod on a stiff body and surface to
   breathe; koi cruise slowly, and a click (`splash`) scatters food they come to eat.
   Each pellet draws only the two koi nearest it, and once the food is gone they dart
   apart, so they don't end up in one pile. A pond with no fish doesn't reseed on resize.
7. Where one animal swims over another, the lower one is cut back by a cell around the
   upper one's outline, so two crossing koi read as two koi rather than one blob.
