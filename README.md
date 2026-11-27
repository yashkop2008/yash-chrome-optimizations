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
| Focus | A gate in front of every distracting site you list (YouTube, X, Reddit, TikTok, Instagram to start): back to work, park the urge, or hold to fall in for a pass to that one site; optionally only during school hours. ASCII spiders spin webs around it ([ascii-spiders](https://github.com/stackedlol/ascii-spiders), MIT). Quiet tabs park tabs you haven't touched in a day, merge duplicates and clear extra empty new tabs. |
| YouTube | Search one thing with blinders (from the gate), a home feed that hides what you skipped, and a cats-only or Fern-only feed. |
| New tab | Every new tab is the next ASCII creature in line (sharks, spiders, more to come), and your most visited sites appear as plain names along the bottom only when your mouse goes there. |
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
yash.html              the hub (toolbar icon, or type "yash" + Space in the address bar)
focus.html             the focus gate
updates.html           the updates page
newtab.html            the new tab page
background.js          service worker: registers enabled features, runs the updater
core/
  features.js          the registry: groups, features, their scripts and hub panels
  settings.js          on/off switches; registers content scripts for enabled features only
  history.js           helpers for features that curate history
  tokens.css           the design system and shared components (TasteCode-style)
features/<id>/         one folder per feature: content scripts, background, pages, hub panel
features/youtube-shared/corner.js   the hover panel shared by YouTube features
settings/              the hub's scripts and styles (groups, switches, panels, fish)
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
