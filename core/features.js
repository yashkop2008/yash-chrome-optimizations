// The registry: every feature in the extension, in the order the settings page
// lists them. Adding a feature = a folder in features/ plus one entry here.
//
//   id          folder name in features/, and the key its on/off switch is stored under
//   name        shown in settings, sentence case
//   site        groups features in settings ("YouTube", "Everywhere", …)
//   summary     one line, what it does for you
//   enabled     default for a fresh install
//   content     content scripts, registered only while the feature is on
//               (paths are relative to the extension root)
//   popup       optional module exporting mount(container) for a popup section

const YOUTUBE = ['*://www.youtube.com/*', '*://m.youtube.com/*', '*://youtube.com/*']

export const FEATURES = [
  {
    id: 'youtube-gate',
    name: 'YouTube gate',
    site: 'YouTube',
    summary:
      'Opening YouTube lands on a gate instead: go back to work, park the urge, search one thing with blinders, or hold to fall in for a timed pass.',
    enabled: true,
    content: [
      {
        matches: YOUTUBE,
        js: ['features/youtube-gate/content.js'],
        css: ['features/youtube-gate/content.css'],
        runAt: 'document_start',
      },
    ],
    popup: 'features/youtube-gate/popup.js',
  },
  {
    id: 'youtube-fresh-feed',
    name: 'Fresh home feed',
    site: 'YouTube',
    summary: 'Videos you scrolled past without clicking are hidden the next time you open the home page.',
    enabled: true,
    content: [
      {
        matches: YOUTUBE,
        js: ['features/youtube-shared/corner.js', 'features/youtube-fresh-feed/fresh.js'],
        css: ['features/youtube-fresh-feed/fresh.css'],
        runAt: 'document_start',
      },
    ],
    popup: 'features/youtube-fresh-feed/popup.js',
  },
  {
    id: 'youtube-feeds',
    name: 'Cats or Fern feed',
    site: 'YouTube',
    summary: 'Swap the home page for a feed of only cat videos or only videos by Fern.',
    enabled: true,
    content: [
      {
        matches: YOUTUBE,
        js: ['features/youtube-shared/corner.js', 'features/youtube-feeds/feeds.js'],
        css: ['features/youtube-feeds/feeds.css'],
        runAt: 'document_start',
      },
    ],
    popup: 'features/youtube-feeds/popup.js',
  },
]

export const byId = (id) => FEATURES.find((f) => f.id === id)
