// End-to-end checks against a fake YouTube and a fake GitHub, in headless Chromium.
//
//   node tests/run.js [screenshot-dir]
//
// Needs Playwright with a Chromium build (`npm i -D playwright` then
// `npx playwright install chromium` if it isn't already on the machine).
// Prints one line per check and exits non-zero if any fail.
const { chromium } = require('playwright')
const fs = require('fs')
const os = require('os')
const path = require('path')
const { execFileSync } = require('child_process')

const EXT = path.resolve(__dirname, '..')
const SHOTS = process.argv[2]
const EXPECTED_ID = 'pjmhgefekklkhikffpjdpidfhbbmcmed'
let failed = 0
const ok = (name, cond, detail = '') => {
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`)
  if (!cond) failed++
}
const wait = (ms) => new Promise((r) => setTimeout(r, ms))
const shot = (page, name) => SHOTS && page.screenshot({ path: path.join(SHOTS, `${name}.png`) })

/* ---------- fake YouTube ---------- */

const vr = (id, title, ch) => ({
  videoRenderer: { videoId: id, title: { runs: [{ text: title }] }, ownerText: { runs: [{ text: ch }] }, lengthText: { simpleText: '4:20' }, viewCountText: { simpleText: '1M views' } },
})
const searchData = (q) => ({
  contents: [vr(`c1${q.length}xxxxxxxx`.slice(0, 11), `Cats being cats (${q})`, 'Paws'), vr(`c2${q.length}xxxxxxxx`.slice(0, 11), 'Kitten vs mirror', 'Whisker'), vr(`d1${q.length}xxxxxxxx`.slice(0, 11), 'Top dog tricks', 'Doggo')],
})
const fernData = { contents: [1, 2, 3, 4, 5].map((n) => ({ lockupViewModel: { contentId: `fern000000${n}`, contentType: 'LOCKUP_CONTENT_TYPE_VIDEO', metadata: { lockupMetadataViewModel: { title: { content: `Fern documentary ${n}` }, metadata: { contentMetadataViewModel: { metadataRows: [{ metadataParts: [{ text: { content: '2M views' } }] }] } } } } } })) }
const dataPage = (d) => `<html><body><script>var ytInitialData = ${JSON.stringify(d)};</script></body></html>`
const homeIds = Array.from({ length: 12 }, (_, i) => `HOMEVID${String(i).padStart(4, '0')}`)
const home = `<!doctype html><html dark><head><meta charset="utf-8"><style>body{margin:0;background:#0f0f0f;color:#fff;font-family:sans-serif}
#contents{display:flex;flex-wrap:wrap;gap:16px;padding:24px}ytd-rich-item-renderer{display:block;width:300px}.t{height:170px;background:#333;border-radius:12px}</style></head>
<body><ytd-browse page-subtype="home"><div id="primary"><div id="contents">${homeIds
  .map((id, i) => `<ytd-rich-item-renderer><a href="/watch?v=${id}"><div class="t"></div></a><p>Home video ${i + 1}</p></ytd-rich-item-renderer>`)
  .join('')}</div></div></ytd-browse></body></html>`

/* ---------- fake GitHub: serves this very folder as version 9.9.9 ---------- */

function buildRelease(dir) {
  const top = path.join(dir, 'yashkop2008-yash-chrome-optimizations-abc1234')
  fs.cpSync(EXT, top, { recursive: true, filter: (p) => !p.includes(`${path.sep}.git`) && !p.includes('node_modules') })
  const m = JSON.parse(fs.readFileSync(path.join(top, 'manifest.json'), 'utf8'))
  m.version = '9.9.9'
  fs.writeFileSync(path.join(top, 'manifest.json'), JSON.stringify(m, null, 2))
  fs.writeFileSync(path.join(top, 'NEW-IN-9.txt'), 'new file')
  execFileSync('zip', ['-qr', 'release.zip', path.basename(top)], { cwd: dir })
  return { zip: fs.readFileSync(path.join(dir, 'release.zip')), manifest: JSON.stringify(m), config: fs.readFileSync(path.join(top, 'updater/config.json')) }
}

;(async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'yco-test-'))
  const profile = path.join(tmp, 'profile')
  fs.mkdirSync(path.join(profile, 'Default'), { recursive: true })
  // Developer mode on, as with "Load unpacked"; otherwise Chrome disables
  // the extension the moment it reloads itself.
  fs.writeFileSync(path.join(profile, 'Default/Preferences'), JSON.stringify({ extensions: { ui: { developer_mode: true } } }))
  const release = buildRelease(tmp)

  const ctx = await chromium.launchPersistentContext(profile, {
    headless: true,
    channel: 'chromium',
    ignoreDefaultArgs: ['--disable-extensions'],
    viewport: { width: 1366, height: 768 },
    colorScheme: 'dark',
    args: [`--disable-extensions-except=${EXT}`, `--load-extension=${EXT}`],
  })
  const errors = []
  ctx.on('page', (p) => p.on('pageerror', (e) => errors.push(`${p.url()}: ${e.message}`)))
  await ctx.route(/i\.ytimg\.com/, (r) => r.fulfill({ contentType: 'image/svg+xml', body: '<svg xmlns="http://www.w3.org/2000/svg" width="480" height="360"><rect width="480" height="360" fill="#8a7"/></svg>' }))
  await ctx.route(/youtube\.com/, (r) => {
    const u = new URL(r.request().url())
    if (u.pathname === '/results') return r.fulfill({ contentType: 'text/html', body: dataPage(searchData(u.searchParams.get('search_query'))) })
    if (u.pathname.startsWith('/@fern-tv')) return r.fulfill({ contentType: 'text/html', body: dataPage(fernData) })
    if (u.pathname === '/watch') return r.fulfill({ contentType: 'text/html', body: '<html><body>watch</body></html>' })
    r.fulfill({ contentType: 'text/html', body: home })
  })
  await ctx.route(/google\.com|bing\.com/, (r) => r.fulfill({ contentType: 'text/html', body: '<html><head><title>Search</title></head><body>results</body></html>' }))
  await ctx.route(/api\.github\.com/, (r) => {
    const u = new URL(r.request().url())
    if (u.pathname.endsWith('/contents/manifest.json')) return r.fulfill({ contentType: 'application/json', body: release.manifest })
    if (u.pathname.endsWith('/contents/updater/config.json')) return r.fulfill({ contentType: 'application/json', body: release.config })
    if (u.pathname.endsWith('/commits')) return r.fulfill({ contentType: 'application/json', body: JSON.stringify([{ commit: { message: 'Test release', author: { date: new Date().toISOString() } } }]) })
    if (u.pathname.includes('/zipball/')) return r.fulfill({ contentType: 'application/zip', body: release.zip })
    r.fulfill({ status: 404, body: '{}' })
  })

  let [sw] = ctx.serviceWorkers()
  if (!sw) sw = await ctx.waitForEvent('serviceworker')
  const id = new URL(sw.url()).host
  ok('extension id is fixed by the manifest key', id === EXPECTED_ID, id)
  await wait(800)
  const page = async (p) => {
    const pg = await ctx.newPage()
    await pg.goto(`chrome-extension://${id}/${p}`)
    return pg
  }

  /* hub & registration */
  const manifest = JSON.parse(fs.readFileSync(path.join(EXT, 'manifest.json'), 'utf8'))
  ok('toolbar icon opens the hub, not a popup', !manifest.action.default_popup)
  const settings = await page('settings/settings.html')
  await wait(800)
  ok('hub shows YouTube, and the paused Address bar group is gone', (await settings.locator('#groups .sec h2').allTextContents()).join('|') === 'YouTube' && !(await settings.locator('#address-bar').count()))
  ok('header is just the name, no logo', !(await settings.locator('.bar img').count()))
  ok('hub has a switch per feature plus one per group', (await settings.locator('.switch').count()) === 3 + 1)
  const fish = await settings.evaluate(() => {
    const c = document.querySelector('.ocean')
    const px = c.getContext('2d').getImageData(1, c.height - 2, 1, 1).data
    return { clip: c.style.clipPath.startsWith('path(evenodd'), clicks: getComputedStyle(c).pointerEvents, corner: px[3] }
  })
  ok('hub fish: clipped to the empty space, never block clicks, no backdrop', fish.clip && fish.clicks === 'none' && fish.corner === 0, JSON.stringify(fish))
  ok('groups start folded', (await settings.locator('#groups .sec.folded').count()) === 1 && !(await settings.isVisible('#youtube .group')))
  ok('folded groups show how many features are on', (await settings.textContent('#youtube .count')) === '3 of 3 on')
  await settings.click('#youtube .sec-toggle')
  await wait(300)
  ok('the arrow opens a group', await settings.isVisible('#youtube .group'))
  const regs = await settings.evaluate(async () => (await chrome.scripting.getRegisteredContentScripts()).map((s) => s.id))
  ok('content scripts registered per feature', regs.length === 3, regs.join(', '))
  // Flip the YouTube group off and on in quick bursts, as the "All" switch does.
  const burst = await settings.evaluate(async () => {
    const m = await import('../core/settings.js')
    const ids = ['youtube-gate', 'youtube-feeds', 'youtube-fresh-feed']
    for (let i = 0; i < 6; i++) await Promise.all(ids.map((id) => m.setEnabled(id, i % 2 === 1)))
    await new Promise((r) => setTimeout(r, 1500))
    return (await chrome.scripting.getRegisteredContentScripts()).map((s) => s.id).sort()
  })
  ok('rapid switching leaves exactly the right scripts registered', burst.join() === regs.slice().sort().join(), burst.join(', '))

  /* gate */
  const yt = await ctx.newPage()
  await yt.goto('https://www.youtube.com/').catch(() => {})
  await wait(600)
  ok('youtube.com lands on the gate', yt.url().includes('/features/youtube-gate/gate.html'))
  await shot(yt, 'gate')

  /* switching the gate off */
  await settings.evaluate(() => import('../core/settings.js').then((m) => m.setEnabled('youtube-gate', false)))
  await wait(800)
  await yt.goto('https://www.youtube.com/').catch(() => {})
  await wait(800)
  ok('gate switched off lets YouTube through', yt.url() === 'https://www.youtube.com/', yt.url())
  const regsOff = await settings.evaluate(async () => (await chrome.scripting.getRegisteredContentScripts()).map((s) => s.id))
  ok('switched-off feature unregisters its scripts', !regsOff.some((s) => s.includes('youtube-gate')))

  /* fresh feed + corner (gate off, so no pass needed) */
  await yt.goto('https://www.youtube.com/')
  await wait(2600)
  await yt.goto('https://www.youtube.com/')
  await wait(1800)
  const hidden = await yt.evaluate(() => document.querySelectorAll('[data-rh-passed]').length)
  ok('fresh feed hides videos seen on the last visit', hidden > 0, `${hidden} hidden`)
  const cornerClosed = await yt.evaluate(() => document.querySelector('yco-corner')?.hasAttribute('data-open'))
  await yt.mouse.move(120, 740)
  await wait(300)
  const cornerOpen = await yt.evaluate(() => document.querySelector('yco-corner')?.hasAttribute('data-open'))
  ok('corner panel hidden until hovered', cornerClosed === false && cornerOpen === true)
  await shot(yt, 'corner')

  /* cats / fern */
  await settings.evaluate(() => chrome.storage.local.set({ feedMode: 'cats' }))
  await wait(1500)
  const cats = await sw.evaluate(async () => (await chrome.storage.local.get('feedCache')).feedCache?.cats?.items || [])
  ok('cats feed keeps only cat videos', cats.length > 0 && cats.every((v) => /cat|kitten/i.test(v.title)), `${cats.length} items`)
  ok('cats feed replaces the home grid', await yt.evaluate(() => document.documentElement.classList.contains('rh-themed') && !!document.querySelector('yco-feed')))
  await yt.mouse.move(800, 300)
  await wait(400)
  await shot(yt, 'cats')
  await settings.evaluate(() => chrome.storage.local.set({ feedMode: 'fern' }))
  await wait(1200)
  const fern = await sw.evaluate(async () => (await chrome.storage.local.get('feedCache')).feedCache?.fern?.items || [])
  ok('fern feed reads the channel page', fern.length === 5 && fern[0].channel === 'Fern')
  await settings.evaluate(() => chrome.storage.local.set({ feedMode: 'normal' }))

  ok('no status in the YouTube header while the gate is off', !(await settings.isVisible('#youtube .status')))
  const folded = await settings.evaluate(() => chrome.storage.local.get('hubCollapsed'))
  ok('open/folded state is remembered', folded.hubCollapsed?.youtube === false)

  /* address bar: paused, so it must leave history and Chrome's settings alone */
  const hist = (text) => settings.evaluate((t) => chrome.history.search({ text: t, startTime: 0, maxResults: 1000 }).then((r) => r.map((h) => h.url)), text)
  await yt.goto('https://www.google.com/search?q=male+turkey+name')
  await wait(800)
  await yt.goto('https://www.youtube.com/watch?v=abcdefghijk')
  await wait(1500)
  ok('paused: searches stay in history', (await hist('turkey')).length === 1)
  ok('paused: youtube pages stay in history', (await hist('abcdefghijk')).length === 1)
  const lv = await settings.evaluate(() => chrome.privacy.services.searchSuggestEnabled.get({}))
  ok("paused: Google's suggestions are left to Chrome", lv.levelOfControl !== 'controlled_by_this_extension', JSON.stringify(lv))
  const paused = await settings.evaluate(() => import('../core/settings.js').then((m) => m.enabledMap()))
  ok('paused: every address bar feature counts as off', !paused['forget-searches'] && !paused['site-pages'] && !paused['forget-pages'] && !paused['live-suggestions'])

  /* the gate shows up as YouTube itself */
  await settings.evaluate(() => import('../core/settings.js').then((m) => m.setEnabled('youtube-gate', true)))
  await wait(800)
  await yt.goto('https://www.youtube.com/feed/subscriptions').catch(() => {})
  await wait(800)
  ok('the gate presents itself as YouTube', (await yt.title()) === 'YouTube')
  await settings.evaluate(() => import('../core/settings.js').then((m) => m.setEnabled('youtube-gate', false)))
  await wait(600)

  /* gate back on, hub panels */
  await settings.evaluate(() => import('../core/settings.js').then((m) => m.setEnabled('youtube-gate', true)))
  await wait(900)
  ok('hub shows a panel under each enabled feature that has one', (await settings.locator('.panel:not([hidden])').count()) === 3)
  ok('gate status shows in the YouTube header', (await settings.textContent('#youtube .status-text')) === 'Guarding')
  await settings.setViewportSize({ width: 1366, height: 2200 })
  await wait(300)
  await shot(settings, 'hub')
  await settings.click('#youtube .all .switch')
  await wait(600)
  const ytOff = await settings.evaluate(() => import('../core/settings.js').then((m) => m.enabledMap()))
  ok('the group switch turns all of YouTube off', !ytOff['youtube-gate'] && !ytOff['youtube-feeds'] && !ytOff['youtube-fresh-feed'])
  await settings.click('#youtube .all .switch')
  await wait(400)

  /* updater */
  const upd = await page('updater/updates.html')
  await wait(1500)
  const msg = await upd.textContent('#message')
  ok('updater finds the newer version in the repo', /9\.9\.9/.test(msg), msg)
  await shot(upd, 'updates')
  const result = await upd.evaluate(async () => {
    const m = await import('./updater.js')
    const dir = await (await navigator.storage.getDirectory()).getDirectoryHandle('ext', { create: true })
    // A stand-in for the real folder: same updater id, so it's accepted.
    const u = await dir.getDirectoryHandle('updater', { create: true })
    const w = await (await u.getFileHandle('config.json', { create: true })).createWritable()
    await w.write(JSON.stringify({ id: 'yash-chrome-optimizations' }))
    await w.close()
    const mf = await (await dir.getFileHandle('manifest.json', { create: true })).createWritable()
    await mf.write('{}')
    await mf.close()
    chrome.runtime.reload = () => {}
    await m.install(dir)
    const names = []
    for await (const [k] of dir.entries()) names.push(k)
    const man = JSON.parse(await (await (await dir.getFileHandle('manifest.json')).getFile()).text())
    let wrong = ''
    try {
      const other = await (await navigator.storage.getDirectory()).getDirectoryHandle('other', { create: true })
      await other.getFileHandle('manifest.json', { create: true })
      await m.install(other)
    } catch (e) {
      wrong = e.message
    }
    return { version: man.version, names, wrong }
  })
  ok('install writes the new version', result.version === '9.9.9')
  ok('install skips repo-only files', !result.names.includes('tests') && !result.names.includes('CLAUDE.md'), result.names.join(' '))
  ok('install refuses a folder holding another extension', /isn’t this extension|different extension/.test(result.wrong), result.wrong)

  ok('no page errors', errors.length === 0, errors.join(' | '))
  await ctx.close()
  fs.rmSync(tmp, { recursive: true, force: true })
  console.log(failed ? `\n${failed} check(s) failed` : '\nall checks passed')
  process.exit(failed ? 1 : 0)
})()
