# Updater kit

Lets an unpacked Chrome extension update itself from GitHub: no re-downloading,
no unzipping, no "Load unpacked" again. Chrome only auto-updates Web Store
extensions, so this kit does the job itself:

1. Every 6 hours the background checks the `manifest.json` version in your repo.
   When it's newer, the toolbar icon gets a blue `↑` badge.
2. **Install** (on `updater/updates.html`) downloads the repo as a zip, unpacks it in
   the browser, writes the files into the extension's own folder and reloads the
   extension. Afterwards a page opens saying what changed (from the commit messages).

Writing to the folder uses Chrome's File System Access API. You pick the extension's
folder once, and Chrome may ask "Allow editing?" again after a browser restart. Nothing
else needs to be installed.

## Safety

- The extension is recognised by `"id"` in `updater/config.json`, not its display name,
  so the name can change freely. A picked folder or a download with a different id is
  refused.
- Everything is downloaded and unpacked before anything is written, and
  `manifest.json` is written last. If an update fails half way it just runs again.
- It only deletes files that an earlier update installed and the new version no
  longer has. Files you added yourself are never touched.
- Paths with `..`, absolute paths and `.git` folders inside the zip are skipped.

## Add it to another extension

1. Copy this `updater/` folder into the extension.
2. In `updater/config.json`, set a unique `"id"` (never change it later), `"repo"`,
   and `"path"`: the extension's folder in the repo, or `""` if it's the repo root.
   `"ignore"` lists repo files that aren't part of the extension (tests, notes).
3. In `manifest.json`:
   ```json
   "permissions": ["storage", "alarms"],
   "host_permissions": ["https://api.github.com/*", "https://codeload.github.com/*"],
   "background": { "service_worker": "background.js", "type": "module" }
   ```
   (Add these to what's already there; the extension needs an `action` for the badge.)
4. In `background.js`:
   ```js
   import { installUpdaterBackground } from './updater/updater.js'
   installUpdaterBackground()
   ```
5. Link to `updater/updates.html` from the popup or options page, e.g.
   `chrome.tabs.create({ url: chrome.runtime.getURL('updater/updates.html') })`.

## Shipping an update

Change the files in the repo and **raise `version` in manifest.json**
(1.3.0 → 1.3.1). The version number is the only thing the updater looks at.
