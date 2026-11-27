// The focus gate's "which sites, and when" controls in the hub.
import { gateSites, gateHours, normaliseSite, DEFAULT_HOURS } from './state.js'

const X =
  '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18"/></svg>'
const DAYS = ['S', 'M', 'T', 'W', 'T', 'F', 'S']
const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

export async function mountSites(box) {
  box.innerHTML = `
    <div class="prow">
      <div class="prow-text">
        <div class="prow-title">Sites</div>
      </div>
    </div>
    <div class="chips" data-el="chips"></div>
    <form class="add" data-el="form" autocomplete="off">
      <input class="field" data-el="input" placeholder="Add a site, e.g. tracker.gg" spellcheck="false" aria-label="Add a site" />
      <button class="btn-outline" type="submit">Add</button>
    </form>
    <div class="prow hours-row">
      <div class="prow-text">
        <div class="prow-title">Only during school hours</div>
        <div class="prow-desc" data-el="hours-desc"></div>
      </div>
      <button class="switch" data-el="hours-on" type="button" role="switch" aria-label="Only during school hours"></button>
    </div>
    <div class="hours" data-el="hours">
      <div class="pseg days" role="group" aria-label="Days" data-el="days"></div>
      <input class="field time" type="time" data-el="from" aria-label="From" />
      <span class="prow-desc">to</span>
      <input class="field time" type="time" data-el="to" aria-label="To" />
    </div>`
  const el = Object.fromEntries([...box.querySelectorAll('[data-el]')].map((n) => [n.dataset.el, n]))
  DAYS.forEach((d, i) => {
    const b = document.createElement('button')
    b.type = 'button'
    b.textContent = d
    b.dataset.day = i
    b.title = DAY_NAMES[i]
    b.setAttribute('aria-label', DAY_NAMES[i])
    el.days.append(b)
  })

  const setSites = (sites) => chrome.storage.local.set({ gateSites: [...new Set(sites)] })
  const setHours = async (patch) => chrome.storage.local.set({ gateHours: { ...(await gateHours()), ...patch } })

  async function renderSites() {
    const sites = await gateSites()
    el.chips.replaceChildren(
      ...sites.map((s) => {
        const chip = document.createElement('span')
        chip.className = 'chip'
        chip.innerHTML = `<span></span><button type="button">${X}</button>`
        chip.firstChild.textContent = s
        const b = chip.querySelector('button')
        b.title = 'Remove'
        b.setAttribute('aria-label', `Remove ${s}`)
        b.addEventListener('click', () => setSites(sites.filter((x) => x !== s)))
        return chip
      }),
    )
    if (!sites.length) el.chips.textContent = 'No sites. The gate has nothing to guard.'
  }

  async function renderHours() {
    const h = await gateHours()
    el['hours-on'].setAttribute('aria-checked', String(h.on))
    el.hours.hidden = !h.on
    el.days.querySelectorAll('button').forEach((b) => b.setAttribute('aria-pressed', String(h.days.includes(Number(b.dataset.day)))))
    if (document.activeElement !== el.from) el.from.value = h.from
    if (document.activeElement !== el.to) el.to.value = h.to
    el['hours-desc'].textContent = h.on ? 'Outside these hours every site opens normally.' : 'Off: the gate is always up.'
  }

  el.form.addEventListener('submit', async (e) => {
    e.preventDefault()
    const site = normaliseSite(el.input.value)
    if (!site) return el.input.focus()
    el.input.value = ''
    await setSites([...(await gateSites()), site])
  })
  el['hours-on'].addEventListener('click', async () => setHours({ on: !(await gateHours()).on }))
  el.days.addEventListener('click', async (e) => {
    const b = e.target.closest('button')
    if (!b) return
    const d = Number(b.dataset.day)
    const { days } = await gateHours()
    await setHours({ days: days.includes(d) ? days.filter((x) => x !== d) : [...days, d].sort() })
  })
  el.from.addEventListener('change', () => setHours({ from: el.from.value || DEFAULT_HOURS.from }))
  el.to.addEventListener('change', () => setHours({ to: el.to.value || DEFAULT_HOURS.to }))

  chrome.storage.onChanged.addListener((c) => {
    if ('gateSites' in c) renderSites()
    if ('gateHours' in c) renderHours()
  })
  renderSites()
  renderHours()
}
