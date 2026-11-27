# Yash's Chrome Optimizations

One personal Chrome extension for making Chrome feel right, from big redesigns to small
quality-of-life fixes. Every change is a **feature** with its own on/off switch in Settings,
and the extension updates itself from this repository with one click.

## Features

Click the toolbar icon to open the hub. Each group folds to one line with its own switch,
and ASCII fish and sharks ([ascii-sharks](https://github.com/stackedlol/ascii-sharks), MIT)
swim in the empty space around it.

| Group | What it does |
| --- | --- |
| YouTube | A gate instead of the home page (back to work, park the urge, search one thing, or hold to fall in for a timed pass) with ASCII spiders spinning webs around it ([ascii-spiders](https://github.com/stackedlol/ascii-spiders), MIT), a home feed that hides what you skipped, and a cats-only or Fern-only feed. |
| Address bar | *Paused, hidden from the hub.* Keeps the dropdown to what you actually revisit by curating history. The code is in `features/` for when it's fixed. |

## Chrome theme

`theme/` is a separate theme extension that gives Chrome itself (tab strip, toolbar,
address bar, new tab page) the same neutral graphite as the hub. Load it once with
**Load unpacked** on the `theme` folder; see `theme/README.md`.

## Install (once)

1. Download this repository (**Code → Download ZIP**) and unzip it somewhere permanent,
   e.g. `Documents/extensions/yash-chrome-optimizations`.
2. Open `chrome://extensions`, turn on **Developer mode**, click **Load unpacked** and pick
   that folder.
3. Pin it from the puzzle-piece menu.
4. Click the icon → **Updates** → **Open updates** → **Choose folder…** and pick the same folder. That lets
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
  features.js          the registry: groups, features, their scripts and hub panels
  settings.js          on/off switches; registers content scripts for enabled features only
  history.js           helpers for features that curate history
  tokens.css           the design system and shared components (TasteCode-style)
features/<id>/         one folder per feature: content scripts, background, pages, hub panel
features/youtube-shared/corner.js   the hover panel shared by YouTube features
settings/              the hub, opened by the toolbar icon (groups, switches, panels, updates)
updater/               self-updater, reusable in other extensions
tests/run.js           end-to-end checks against fake YouTube and GitHub
```

## Adding a feature

1. Make `features/<id>/` with its content script(s), CSS and, if useful, `panel.js`
   exporting `mount(container, ctx)` for its controls in the hub.
2. Add an entry to `core/features.js` (group, name, one-line summary, default, scripts).
3. If it needs background work, add `features/<id>/background.js` and import it in
   `background.js`. It should check `isEnabled('<id>')` before acting.
4. New sites need their host in `host_permissions` in `manifest.json`.
5. Raise `version` in `manifest.json`, run `node tests/run.js`, push. The extension
   picks it up from there.
