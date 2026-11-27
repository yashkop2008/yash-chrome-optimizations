// Hub panel: the list of sites, quick-add from your most visited, and a clean-up.
import { getSites, normaliseSite, cleanUpPast } from './sites.js'
import { hostOf } from '../../core/history.js'

const X = '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18"/></svg>'

export async function mount(box) {
  box.innerHTML = `
    <div class="prow">
      <div class="prow-text">
        <div class="prow-title">Sites</div>
        <div class="prow-desc">Only the home page of these stays in history.</div>
      </div>
    </div>
    <div class="chips" data-el="chips"></div>
    <form class="add" data-el="form" autocomplete="off">
      <input class="field" data-el="input" placeholder="Add a site, e.g. reddit.com" spellcheck="false" aria-label="Add a site" />
      <button class="btn-outline" type="submit">Add</button>
    </form>
    <div class="suggest" data-el="suggest" hidden>
      <span class="prow-desc">Your most visited:</span>
    </div>
    <div class="prow">
      <div class="prow-text">
        <div class="prow-title">Pages already in history</div>
        <div class="prow-desc" data-el="result">Removes old pages from these sites, keeping each home page.</div>
      </div>
      <button class="btn-outline" data-el="clean" type="button">Clean up</button>
    </div>`
  const el = Object.fromEntries([...box.querySelectorAll('[data-el]')].map((n) => [n.dataset.el, n]))

  async function setSites(sites) {
    await chrome.storage.local.set({ sitePages: [...new Set(sites)] })
  }

  async function add(site) {
    const sites = await getSites()
    if (!site || sites.includes(site)) return
    await setSites([...sites, site])
    // Adding a site should show up in the dropdown right away.
    el.result.textContent = `Removing old ${site} pages…`
    const removed = await cleanUpPast([site])
    el.result.textContent = `Added ${site} and removed ${removed} old ${removed === 1 ? 'page' : 'pages'}.`
  }

  async function render() {
    const sites = await getSites()
    el.chips.replaceChildren(
      ...sites.map((s) => {
        const chip = document.createElement('span')
        chip.className = 'chip'
        chip.innerHTML = `<span></span><button type="button">${X}</button>`
        chip.firstChild.textContent = s
        const b = chip.querySelector('button')
        b.setAttribute('aria-label', `Remove ${s}`)
        b.title = 'Remove'
        b.addEventListener('click', () => setSites(sites.filter((x) => x !== s)))
        return chip
      }),
    )
    if (!sites.length) el.chips.textContent = 'No sites yet.'
    // Suggest frequently visited sites that aren't listed yet.
    let top = []
    try {
      top = (await chrome.topSites.get()).map((t) => hostOf(t.url)).filter((h) => h && !sites.includes(h))
    } catch {}
    top = [...new Set(top)].slice(0, 6)
    el.suggest.querySelectorAll('button').forEach((b) => b.remove())
    for (const h of top) {
      const b = document.createElement('button')
      b.type = 'button'
      b.className = 'chip chip-add'
      b.textContent = `+ ${h}`
      b.addEventListener('click', () => add(h))
      el.suggest.append(b)
    }
    el.suggest.hidden = !top.length
  }

  el.form.addEventListener('submit', async (e) => {
    e.preventDefault()
    const site = normaliseSite(el.input.value)
    if (!site) return el.input.focus()
    el.input.value = ''
    await add(site)
  })
  el.clean.addEventListener('click', async () => {
    el.clean.disabled = true
    el.result.textContent = 'Going through your history…'
    const removed = await cleanUpPast()
    el.result.textContent = `Removed ${removed} old ${removed === 1 ? 'page' : 'pages'}. Home pages kept.`
    el.clean.disabled = false
  })
  chrome.storage.onChanged.addListener((c) => 'sitePages' in c && render())
  render()
}
