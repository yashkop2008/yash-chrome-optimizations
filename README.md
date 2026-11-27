# Yash's Chrome Optimizations

One personal Chrome extension for making Chrome feel right, from big redesigns to small
quality-of-life fixes. Every change is a **feature** with its own on/off switch in Settings,
and the extension updates itself from this repository with one click.

## Features

Clicking the toolbar icon opens the hub: every feature, grouped, each with its own
switch and (while on) its own controls.

| Group | Feature | What it does |
| --- | --- | --- |
| YouTube | YouTube gate | Opening YouTube lands on a gate: go back to work, park the urge for later, search one thing with recommendations hidden, or hold to fall in for a timed pass (the hold gets longer each time). |
| YouTube | Cats or Fern feed | Swap the home page for only cat videos or only videos by [Fern](https://www.youtube.com/@fern-tv). |
| YouTube | Fresh home feed | Videos you looked at on the home page and didn't click are hidden the next time. |
| Address bar | Forget one-time searches | Searches you make once are dropped from history so they never come back as suggestions; searches you repeat (2 or 3 times, your choice) stay. One button cleans up everything already there. |
| Address bar | Just the site, not every page | For sites you list (YouTube by default), history keeps only the home page, so typing “you” suggests youtube.com instead of old videos and channels. |
| Address bar | Hide Google's live suggestions | Off by default. Chrome only allows these all or nothing. |

The address bar features work by curating Chrome's history, because that is what the
dropdown suggests from; extensions can't edit the dropdown itself. Removed entries are
also gone from `chrome://history`.

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
