# Yash's Chrome Optimizations

One personal Chrome extension for making Chrome feel right, from big redesigns to small
quality-of-life fixes. Every change is a **feature** with its own on/off switch in Settings,
and the extension updates itself from this repository with one click.

## Features

| Feature | Site | What it does |
| --- | --- | --- |
| YouTube gate | YouTube | Opening YouTube lands on a gate: go back to work, park the urge for later, search one thing with recommendations hidden, or hold to fall in for a timed pass (the hold gets longer each time). |
| Fresh home feed | YouTube | Videos you looked at on the home page and didn't click are hidden the next time. |
| Cats or Fern feed | YouTube | Swap the home page for only cat videos or only videos by [Fern](https://www.youtube.com/@fern-tv). |

## Install (once)

1. Download this repository (**Code → Download ZIP**) and unzip it somewhere permanent,
   e.g. `Documents/extensions/yash-chrome-optimizations`.
2. Open `chrome://extensions`, turn on **Developer mode**, click **Load unpacked** and pick
   that folder.
3. Pin it from the puzzle-piece menu.
4. Open the popup → **Updates** → **Choose folder…** and pick the same folder. That lets
   it install future versions itself.

The extension ID is fixed (`pjmhgefekklkhikffpjdpidfhbbmcmed`) by the `key` in
`manifest.json`, so moving or renaming the folder never resets your data.

## Updates

Every six hours the extension compares its version with `manifest.json` here. When this
repo is newer, the toolbar icon shows `↑`. Open **Updates** and press **Install**: it
downloads the repo, writes the files into your folder and reloads. See
[`updater/README.md`](updater/README.md).

## How it's organised

```
manifest.json          one manifest for everything
background.js          service worker: registers enabled features, runs the updater
core/
  features.js          the registry: every feature, its scripts and popup section
  settings.js          on/off switches; registers content scripts for enabled features only
  tokens.css           the design system and shared components (TasteCode-style)
features/<id>/         one folder per feature: content scripts, pages, popup section
features/youtube-shared/corner.js   the hover panel shared by YouTube features
popup/                 the toolbar popup (a hub of feature sections)
settings/              the settings page (switches, updates, about)
updater/               self-updater, reusable in other extensions
tests/run.js           end-to-end checks against fake YouTube and GitHub
```

## Adding a feature

1. Make `features/<id>/` with its content script(s), CSS and, if useful, `popup.js`
   exporting `mount(container)`.
2. Add an entry to `core/features.js` (name, site, one-line summary, default, scripts).
3. If it needs background work, add `features/<id>/background.js` and import it in
   `background.js`. It should check `isEnabled('<id>')` before acting.
4. New sites need their host in `host_permissions` in `manifest.json`.
5. Raise `version` in `manifest.json`, run `node tests/run.js`, push. The extension
   picks it up from there.
