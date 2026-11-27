// What the address bar actually suggests, checked with Chromium's own
// suggestion engine (chrome://omnibox) rather than by reading history.
//
//   node tests/omnibox.js
//
// Builds up YouTube history in a profile the way a real person does, installs
// or updates the extension on top, and asks the engine what "youtube" offers.
const { chromium } = require('playwright')
const fs = require('fs')
const os = require('os')
const path = require('path')
const { execFileSync } = require('child_process')
const { enableDebugPages, suggestions } = require('./omnibox-lib.js')

const EXT = path.resolve(__dirname, '..')
let failed = 0
const ok = (name, cond, detail = '') => {
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`)
  if (!cond) failed++
}
const wait = (ms) => new Promise((r) => setTimeout(r, ms))

// A YouTube stand-in that behaves like the real one: a single-page app that
// switches videos with history.pushState instead of loading new pages.
const fakeYouTube = (route) => {
  const u = new URL(route.request().url())
  const title = u.pathname === '/' ? 'YouTube' : `${u.searchParams.get('v') || u.pathname} - YouTube`
  route.fulfill({
    contentType: 'text/html',
    body: `<!doctype html><title>${title}</title><body>
      <a id="next" href="/watch?v=SPAnext0001">next</a>
      <script>
        document.getElementById('next').onclick = (e) => {
          e.preventDefault(); history.pushState({}, '', '/watch?v=SPAnext0001'); document.title = 'SPA next - YouTube'
        }
      </script></body>`,
  })
}

function profile() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'yco-omni-'))
  fs.mkdirSync(path.join(dir, 'Default'), { recursive: true })
  fs.writeFileSync(path.join(dir, 'Default/Preferences'), JSON.stringify({ extensions: { ui: { developer_mode: true } } }))
  return dir
}

async function launch(dir, ext) {
  const args = ext ? [`--disable-extensions-except=${ext}`, `--load-extension=${ext}`] : []
  const ctx = await chromium.launchPersistentContext(dir, {
    headless: true,
    channel: 'chromium',
    ignoreDefaultArgs: ['--disable-extensions'],
    args,
  })
  await ctx.route(/youtube\.com/, fakeYouTube)
  await ctx.route(/google\.com/, (r) => r.fulfill({ contentType: 'text/html', body: '<title>Search</title>' }))
  return ctx
}

async function browseYouTube(ctx) {
  const p = await ctx.newPage()
  for (const u of [
    'https://www.youtube.com/',
    'https://www.youtube.com/watch?v=75O11W5EZAU&list=RDZ3m7HXeiHpg&index=3',
    'https://www.youtube.com/watch?v=FG2YmNakmEc',
    'https://www.youtube.com/@moodafps',
    'https://www.youtube.com/feed/subscriptions',
  ]) {
    await p.goto(u).catch(() => {})
    await wait(300)
  }
  await p.goto('https://www.youtube.com/watch?v=yk4XMhqwz6E&pp=kggYc3Zp').catch(() => {})
  await p.click('#next').catch(() => {})
  await wait(500)
  await p.close()
}

const youtubeSuggestions = async (ctx) => {
  await enableDebugPages(ctx)
  const o = await ctx.newPage()
  const all = await suggestions(o, 'youtube')
  await o.close()
  return [...new Set(all.filter((u) => /youtube\.com/.test(u) && !/youtube\.com.*https?:/.test(u)).map((u) => u.replace(/^https?:\/\/(www\.)?/, '')))]
}
const onlyHome = (list) => list.length > 0 && list.every((u) => u.replace(/\/$/, '') === 'youtube.com')

async function waitForSweep(ctx) {
  let [sw] = ctx.serviceWorkers()
  if (!sw) sw = await ctx.waitForEvent('serviceworker', { timeout: 15000 })
  for (let i = 0; i < 40; i++) {
    const done = await sw.evaluate(() => chrome.storage.local.get('sitePagesSweptAll')).then((s) => s.sitePagesSweptAll).catch(() => false)
    if (done) return sw
    await wait(250)
  }
  return sw
}

;(async () => {
  /* 1. history from before the extension existed */
  {
    const dir = profile()
    let ctx = await launch(dir)
    await browseYouTube(ctx)
    const before = await youtubeSuggestions(ctx)
    ok('without the extension, "youtube" suggests videos (the problem)', before.some((u) => u.includes('watch')), before.join(' '))
    await ctx.close()
    ctx = await launch(dir, EXT)
    await waitForSweep(ctx)
    await wait(1000)
    const after = await youtubeSuggestions(ctx)
    ok('installing it leaves only youtube.com', onlyHome(after), after.join(' '))
    await ctx.close()
  }

  /* 2. updating from 2.1.0 the way the updater does: write the files, then reload */
  {
    const dir = profile()
    const old = fs.mkdtempSync(path.join(os.tmpdir(), 'yco-old-'))
    execFileSync('git', ['-C', EXT, 'archive', '72a3b2e', '-o', path.join(old, 'v.tar')])
    execFileSync('tar', ['-xf', 'v.tar'], { cwd: old })
    const ctx = await launch(dir, old)
    let [sw] = ctx.serviceWorkers()
    if (!sw) sw = await ctx.waitForEvent('serviceworker')
    const id = new URL(sw.url()).host
    // 2.1.0 only removed pages on new visits; history from before stayed.
    await sw.evaluate(() => chrome.storage.local.set({ features: { 'youtube-gate': false, 'site-pages': false } }))
    await browseYouTube(ctx)
    await sw.evaluate(() => chrome.storage.local.set({ features: { 'youtube-gate': false, 'site-pages': true } }))
    await wait(500)
    const before = await youtubeSuggestions(ctx)
    ok('on 2.1.0, old videos are still suggested', before.some((u) => u.includes('watch')), before.join(' '))
    fs.cpSync(EXT, old, { recursive: true, filter: (p) => !p.includes(`${path.sep}.git`) })
    const hub = await ctx.newPage()
    await hub.goto(`chrome-extension://${id}/settings/settings.html`)
    await hub.evaluate(() => chrome.runtime.reload()).catch(() => {})
    await wait(5000)
    const after = await youtubeSuggestions(ctx)
    ok('after updating, only youtube.com', onlyHome(after), after.join(' '))
    await ctx.close()
  }

  /* 2b. Chrome restarts with new files on disk and never says "updated" */
  {
    const dir = profile()
    const copy = fs.mkdtempSync(path.join(os.tmpdir(), 'yco-copy-'))
    fs.cpSync(EXT, copy, { recursive: true, filter: (p) => !p.includes(`${path.sep}.git`) })
    let ctx = await launch(dir, copy)
    let sw = await waitForSweep(ctx)
    await sw.evaluate(() => chrome.storage.local.set({ features: { 'youtube-gate': false, 'site-pages': false } }))
    await browseYouTube(ctx)
    await sw.evaluate(async () => {
      await chrome.storage.local.set({ features: { 'youtube-gate': false } }) // site-pages back to its default (on) without a toggle event
      await chrome.storage.local.remove(['sitePagesLastFull', 'sitePagesSweptAll'])
    })
    await ctx.close()
    ctx = await launch(dir, copy)
    await wait(4000)
    const after = await youtubeSuggestions(ctx)
    ok('after a restart without an update event, only youtube.com', onlyHome(after), after.join(' '))
    await ctx.close()
  }

  /* 3. browsing with the extension on: page loads, in-page video switches, gate passes */
  {
    const dir = profile()
    const ctx = await launch(dir, EXT)
    const sw = await waitForSweep(ctx)
    await sw.evaluate(async () => {
      const f = (await chrome.storage.local.get('features')).features || {}
      await chrome.storage.local.set({ features: { ...f, 'youtube-gate': false } })
    })
    await wait(800)
    await browseYouTube(ctx)
    await wait(4500)
    const after = await youtubeSuggestions(ctx)
    ok('while browsing YouTube, still only youtube.com', onlyHome(after), after.join(' '))

    await sw.evaluate(async () => {
      const f = (await chrome.storage.local.get('features')).features || {}
      await chrome.storage.local.set({ features: { ...f, 'youtube-gate': true } })
    })
    await wait(800)
    const p = await ctx.newPage()
    await p.goto('https://www.youtube.com/feed/subscriptions').catch(() => {})
    await wait(800)
    await p.goto('https://www.youtube.com/watch?v=GATEDvideo1').catch(() => {})
    await wait(4500)
    const gated = await youtubeSuggestions(ctx)
    ok('pages the gate opened in place of are gone too', onlyHome(gated), gated.join(' '))
    await ctx.close()
  }

  /* 4. old one-time searches: each search left two entries (Chrome's URL + Google's rewrite) */
  {
    const dir = profile()
    let ctx = await launch(dir)
    const p = await ctx.newPage()
    for (const q of ['what genre is daniel caesar', 'what time does king of prussia mall close']) {
      const base = `https://www.google.com/search?q=${encodeURIComponent(q).replace(/%20/g, '+')}`
      await p.goto(`${base}&sourceid=chrome&ie=UTF-8`)
      await wait(300)
      await p.goto(`${base}&sca_esv=abc123&ei=XYZ&ved=0`) // Google's own follow-up URL for the same search
      await wait(300)
    }
    await ctx.close()
    const searchRows = async (c, text) => {
      await enableDebugPages(c)
      const o = await c.newPage()
      const all = await suggestions(o, text)
      await o.close()
      return [...new Set(all.filter((u) => /google\.com\/search\?q=/.test(u) && !/google\.com.*https?:/.test(u)).map((u) => decodeURIComponent(new URL(u).searchParams.get('q').replace(/\+/g, ' '))))].filter((q) => q !== text)
    }
    ctx = await launch(dir)
    const before = await searchRows(ctx, 'what')
    ok('one-time searches show up for "what" (the problem)', before.length === 2, before.join(' | '))
    await ctx.close()
    ctx = await launch(dir, EXT)
    await waitForSweep(ctx)
    await wait(3000)
    const after = await searchRows(ctx, 'what')
    ok('after install, one-time searches are gone', after.length === 0, after.join(' | '))
    await ctx.close()
  }

  /* 4b. your path: 2.3.1's cleanup already ran and wrongly kept those searches; then the update */
  {
    const dir = profile()
    const old = fs.mkdtempSync(path.join(os.tmpdir(), 'yco-231-'))
    execFileSync('git', ['-C', EXT, 'archive', 'e5e5573', '-o', path.join(old, 'v.tar')])
    execFileSync('tar', ['-xf', 'v.tar'], { cwd: old })
    let ctx = await launch(dir)
    const p = await ctx.newPage()
    for (const q of ['what genre is daniel caesar', 'what is c++ used for finance']) {
      const base = `https://www.google.com/search?q=${encodeURIComponent(q).replace(/%20/g, '+')}`
      await p.goto(`${base}&sourceid=chrome&ie=UTF-8`)
      await wait(300)
      await p.goto(`${base}&sca_esv=abc123&ei=XYZ&ved=0`)
      await wait(300)
    }
    await ctx.close()
    const searchRows = async (c) => {
      await enableDebugPages(c)
      const o = await c.newPage()
      const all = await suggestions(o, 'what')
      await o.close()
      return [...new Set(all.filter((u) => /google\.com\/search\?q=/.test(u) && !/google\.com.*https?:/.test(u)).map((u) => new URL(u).searchParams.get('q')))].filter((q) => q !== 'what')
    }
    ctx = await launch(dir, old)
    let [sw] = ctx.serviceWorkers()
    if (!sw) sw = await ctx.waitForEvent('serviceworker')
    const id = new URL(sw.url()).host
    await wait(4000)
    const on231 = await searchRows(ctx)
    ok('on 2.3.1, its cleanup ran and kept the one-time searches (the bug)', on231.length === 2, on231.join(' | '))
    fs.cpSync(EXT, old, { recursive: true, filter: (p) => !p.includes(`${path.sep}.git`) })
    const hub = await ctx.newPage()
    await hub.goto(`chrome-extension://${id}/settings/settings.html`)
    await hub.evaluate(() => chrome.runtime.reload()).catch(() => {})
    await wait(6000)
    const after = await searchRows(ctx)
    ok('after updating from 2.3.1, they are gone', after.length === 0, after.join(' | '))
    await ctx.close()
  }

  /* 5. one-time pages ("Forget one-time pages", off by default) */
  {
    const dir = profile()
    let ctx = await launch(dir)
    await ctx.route(/x\.com|arealme\.com|example\.org/, (r) => {
      const u = new URL(r.request().url())
      const title = u.hostname.includes('x.com') ? 'OriginAI on X: "what a young person should learn"' : u.hostname.includes('arealme') ? 'APM Test - What is your APM?' : 'Example'
      r.fulfill({ contentType: 'text/html', body: `<title>${title}</title>` })
    })
    const p = await ctx.newPage()
    for (const u of ['https://x.com/OriginAI/status/1', 'https://www.arealme.com/apm-actions-per-minute-test/en/', 'https://example.org/']) {
      await p.goto(u)
      await wait(300)
    }
    await ctx.close()
    const pageRows = async (c, text) => {
      await enableDebugPages(c)
      const o = await c.newPage()
      const all = await suggestions(o, text)
      await o.close()
      return [...new Set(all.filter((u) => /x\.com|arealme|example\.org/.test(u) && !/\.(com|org).*https?:/.test(u)).map((u) => u.replace(/^https?:\/\/(www\.)?/, '').replace(/\/$/, '')))]
    }
    ctx = await launch(dir, EXT)
    const sw = await waitForSweep(ctx)
    const before = await pageRows(ctx, 'what')
    ok('one-time pages show up for "what" while the feature is off', before.length === 2, before.join(' | '))
    await sw.evaluate(async () => {
      const f = (await chrome.storage.local.get('features')).features || {}
      await chrome.storage.local.set({ features: { ...f, 'forget-pages': true } })
    })
    await wait(3000)
    const after = await pageRows(ctx, 'what')
    ok('switched on, one-time pages are gone', after.length === 0, after.join(' | '))
    const home = await pageRows(ctx, 'example')
    ok('a site itself stays', home.some((u) => /example\.org\/?$/.test(u)), home.join(' | '))
    await ctx.close()
  }

  console.log(failed ? `\n${failed} check(s) failed` : '\nall checks passed')
  process.exit(failed ? 1 : 0)
})()
