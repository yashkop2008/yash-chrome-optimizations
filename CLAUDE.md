# Working on Yash's Chrome Optimizations

A personal Chrome extension (Manifest V3, plain JS, no build step). Yash lists things
they dislike about Chrome or websites; each fix becomes a feature here.

## Rules

- **One fix = one feature** in `features/<id>/` plus one entry in `core/features.js`,
  inside a group (YouTube, Address bar, …). Related features share a group; the hub
  (`settings/`, opened by the toolbar icon, no popup) shows one card per group.
  Every feature must be switchable off in Settings, and switched off means it does
  nothing (its content scripts aren't registered; background code checks `isEnabled`).
- **Keep the UI consistent.** Use `core/tokens.css`: its tokens and components
  (`.btn-light` for the one primary action, `.btn-ghost`, `.btn-outline`, `.field`,
  `.hold`, `.switch`, `.pseg`, `.link`). Neutral greyscale; colour only for meaning
  (success, warning, error, attention); sentence-case labels, no uppercase micro-labels;
  hairline borders; grouped settings-style lists (`.group` / `.row`); a feature's extra
  controls go in its hub panel (`panel.js`, `.prow` rows). Pages get the
  `Yash's Chrome / <page>` header bar. UI injected into websites lives in a closed
  shadow root and follows the site's light/dark theme.
- **Every change raises `version` in `manifest.json`.** The self-updater only compares
  versions; without a bump nobody gets the change.
- **Never change `key` in `manifest.json` or `id` in `updater/config.json`.** The key
  fixes the extension ID (and so all stored data); the id is how the updater recognises
  this extension.
- Keep `features/youtube-shared/corner.js` as the only bottom-left panel on YouTube;
  YouTube features add rows to it via `globalThis.ycoCorner.row(key, order)`.
- Ask Yash before any matter of taste (look, copy, behaviour) that isn't settled by the
  rules above; otherwise follow the existing patterns.

## Look of Chrome itself

`theme/` is a separate theme extension (Chrome won't mix a theme with other features).
Its colours come from `core/tokens.css`: `#0f0f0f` frame, `#1a1a1a` toolbar and active
tab, greys for text and icons. Keep the two in step if the palette changes.

## Paused work

The Address bar group (`forget-searches`, `site-pages`, `forget-pages`,
`live-suggestions`) is paused in `core/features.js`: hidden from the hub and every
feature in it counts as off. Yash wasn't satisfied it works. To bring it back, fix it,
run `node tests/omnibox.js` (it skips while the group is paused), and remove `paused`.

## Checking work

`node tests/run.js [screenshot-dir]` loads the extension in headless Chromium against
a fake YouTube and a fake GitHub and prints PASS/FAIL per check. Add checks for new
features there. The real youtube.com is usually not reachable from cloud sessions, so
fake pages must mirror the real page structure (e.g. `ytInitialData`).

`node tests/omnibox.js` checks what the address bar really suggests, using Chromium's
own suggestion engine (`chrome://omnibox`), across a fresh install, an update from an
older version (files written, then `chrome.runtime.reload()`, as the updater does) and
a restart without an update event. Run it for any change to the address bar features;
reading `chrome.history` alone has missed real bugs.

Don't rely on `chrome.runtime.onInstalled` for one-time work: Chrome doesn't always
deliver it (e.g. a restart with new files on disk). Do it when the background wakes,
guarded by a timestamp in storage.
