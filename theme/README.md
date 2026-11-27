# Yash's Chrome Theme

Chrome itself (tab strip, toolbar, address bar, new tab page) in exactly the hub's
values from `core/tokens.css`: `#0f0f0f` behind everything, `#1a1a1a` for the active
tab and toolbar, a recessed `#0f0f0f` address bar, `#8a8a8a` toolbar icons, `#ededed` /
`#a3a3a3` text, no colour tint. Behind the tabs runs a faint current of ASCII
characters (`images/frame*.png`, drawn by `make-texture.py`).

Chrome only accepts colours like these from a theme, and a theme has to be its own
extension, so this folder is one:

1. `chrome://extensions` → **Load unpacked** → pick this `theme` folder (inside
   your Yash's Chrome Optimizations folder).
2. If Chrome still shows a colour from **Customize Chrome**, open the side panel on
   a new tab → **Customize Chrome** → **Theme** and make sure the theme is the one
   in use (not a Chrome colour).

The main extension's updater keeps this folder's files current, but Chrome only
re-reads a theme when you press the reload arrow on its card in `chrome://extensions`.
The hub's **Updates** section has a **Chrome theme** line that says whether the theme
is installed, switched on and current, with a button for whatever it needs. Load it
from the `theme` folder inside the main extension's folder, or updates won't reach it.
