// The registry: every group and feature, in the order the hub lists them.
// Adding a feature = a folder in features/ plus one entry here.
//
// Groups
//   id, name, summary       one card in the hub per group, with a switch for all of it
//
// Features
//   id          folder name in features/, and the key its on/off switch is stored under
//   group       which group card it sits in
//   name        shown in the hub, sentence case
//   summary     one line, what it does for you
//   enabled     default for a fresh install
//   content     content scripts, registered only while the feature is on
//               (paths are relative to the extension root)
//   panel       optional module exporting mount(container, ctx), shown under the
//               feature in the hub while it's on (stats, lists, quick controls)

const YOUTUBE = ['*://www.youtube.com/*', '*://m.youtube.com/*', '*://youtube.com/*']

export const GROUPS = [
  {
    id: 'youtube',
    name: 'YouTube',
    summary: 'Keeps YouTube from eating schoolwork, and makes the home page worth opening.',
  },
  {
    id: 'address-bar',
    name: 'Address bar',
    summary: 'Curates what the dropdown suggests as you type, so it only offers things you actually go back to.',
  },
]

export const FEATURES = [
  {
    id: 'youtube-gate',
    group: 'youtube',
    name: 'YouTube gate',
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
    panel: 'features/youtube-gate/panel.js',
  },
  {
    id: 'youtube-feeds',
    group: 'youtube',
    name: 'Cats or Fern feed',
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
    panel: 'features/youtube-feeds/panel.js',
  },
  {
    id: 'youtube-fresh-feed',
    group: 'youtube',
    name: 'Fresh home feed',
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
    panel: 'features/youtube-fresh-feed/panel.js',
  },
  {
    id: 'forget-searches',
    group: 'address-bar',
    name: 'Forget one-time searches',
    summary:
      'A search you only make once (“male turkey name”) is dropped from history, so it never comes back as a suggestion. Searches you repeat stay.',
    enabled: true,
    panel: 'features/forget-searches/panel.js',
  },
  {
    id: 'site-pages',
    group: 'address-bar',
    name: 'Just the site, not every page',
    summary:
      'For sites you pick, history keeps only the site itself. Typing “you” suggests youtube.com, not old videos and channels.',
    enabled: true,
    panel: 'features/site-pages/panel.js',
  },
  {
    id: 'forget-pages',
    group: 'address-bar',
    name: 'Forget one-time pages',
    summary:
      'A page you only open once (a random post, a quiz) is dropped from history, so the dropdown only offers pages you come back to. Off by default: it removes a lot of history.',
    enabled: false,
    panel: 'features/forget-pages/panel.js',
  },
  {
    id: 'live-suggestions',
    group: 'address-bar',
    name: 'Hide Google’s live suggestions',
    summary:
      'Turns off the magnifier rows Google adds while you type. Chrome only allows all or none, so this is off unless you want it.',
    enabled: false,
  },
]

export const byId = (id) => FEATURES.find((f) => f.id === id)
export const inGroup = (groupId) => FEATURES.filter((f) => f.group === groupId)
