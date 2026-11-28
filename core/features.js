// The registry: every group and feature, in the order the hub lists them.
// Adding a feature = a folder in features/ plus one entry here.
//
// Groups
//   id, name                one section in the hub per group, with a switch for all of it
//   paused                  hidden from the hub, and every feature in it counts as off;
//                           the code stays in place until it's ready to come back
//
// Features
//   id          folder name in features/, and the key its on/off switch is stored under
//   group       which group card it sits in
//   name        shown in the hub, sentence case
//   summary     one short line, what it does for you
//   enabled     default for a fresh install
//   content     content scripts, registered only while the feature is on
//               (paths are relative to the extension root)
//   panel       optional module exporting mount(container, ctx), shown under the
//               feature in the hub while it's on (stats, lists, quick controls)

const YOUTUBE = ['*://www.youtube.com/*', '*://m.youtube.com/*', '*://youtube.com/*']

export const GROUPS = [
  {
    id: 'focus',
    name: 'Focus',
  },
  {
    id: 'youtube',
    name: 'YouTube',
  },
  {
    id: 'new-tab',
    name: 'New tab',
  },
  {
    id: 'address-bar',
    // Paused: Yash isn't convinced it works yet. Fix, test with tests/omnibox.js, unpause.
    paused: true,
    name: 'Address bar',
  },
]

export const FEATURES = [
  {
    id: 'youtube-gate', // the id predates the gate covering more than YouTube; kept so stats carry over
    group: 'focus',
    name: 'Focus gate',
    summary: 'Listed sites open on a gate first: back to work, park the urge, or hold for a timed pass.',
    enabled: true,
    // Its content script is registered by its background for exactly the listed sites.
    panel: 'features/youtube-gate/panel.js',
  },
  {
    id: 'quiet-tabs',
    group: 'focus',
    name: 'Quiet tabs',
    summary: 'Untouched tabs close into a list you can reopen, and duplicates merge.',
    enabled: true,
    panel: 'features/quiet-tabs/panel.js',
  },
  {
    id: 'youtube-feeds',
    group: 'youtube',
    name: 'Cats or Fern feed',
    summary: 'A YouTube home page of only cats, or only Fern.',
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
    summary: 'Videos you scrolled past are gone next time.',
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
    id: 'newtab-creatures',
    group: 'new-tab',
    name: 'Rotating creatures',
    summary: 'Each new tab is the next ASCII creature in line.',
    enabled: true,
    panel: 'features/new-tab/panel.js',
  },
  {
    id: 'canvas-todo',
    group: 'new-tab',
    name: 'Canvas to-do',
    summary: 'What’s due on Canvas this week, in the corner of every new tab.',
    enabled: true,
    // Reads the planner from Canvas's own pages, where your sign-in always counts.
    content: [{ matches: ['https://*.instructure.com/*'], js: ['features/canvas-todo/page.js'], runAt: 'document_idle' }],
    panel: 'features/canvas-todo/panel.js',
  },
  {
    id: 'newtab-shortcuts',
    group: 'new-tab',
    name: 'Quiet shortcuts',
    summary: 'Your top sites along the bottom, only when your mouse goes there.',
    enabled: true,
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

export const inGroup = (groupId) => FEATURES.filter((f) => f.group === groupId)
export const isPaused = (f) => !!GROUPS.find((g) => g.id === f.group)?.paused
export const VISIBLE_GROUPS = GROUPS.filter((g) => !g.paused)
