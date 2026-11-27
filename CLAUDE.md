# Working on Yash's Chrome Optimizations

A personal Chrome extension (Manifest V3, plain JS, no build step). Yash lists things
they dislike about Chrome or websites; each fix becomes a feature here.

## Rules

- **One fix = one feature** in `features/<id>/` plus one entry in `core/features.js`.
  Every feature must be switchable off in Settings, and switched off means it does
  nothing (its content scripts aren't registered; background code checks `isEnabled`).
- **Keep the UI consistent.** Use `core/tokens.css`: its tokens and components
  (`.btn-light` for the one primary action, `.btn-ghost`, `.btn-outline`, `.field`,
  `.hold`, `.switch`, `.pseg`, `.link`). Neutral greyscale; colour only for meaning
  (success, warning, error, attention); sentence-case labels, no uppercase micro-labels;
  hairline borders; grouped settings-style lists (`.group` / `.row`). Pages get the
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

## Checking work

`node tests/run.js [screenshot-dir]` loads the extension in headless Chromium against
a fake YouTube and a fake GitHub and prints PASS/FAIL per check. Add checks for new
features there. The real youtube.com is usually not reachable from cloud sessions, so
fake pages must mirror the real page structure (e.g. `ytInitialData`).
