// Hub panel: how many times a search has to be made before it's kept. Searches
// already in history follow the same rule automatically (see background.js).
import { settings } from './searches.js'

export async function mount(box) {
  box.innerHTML = `
    <div class="prow">
      <div class="prow-text">
        <div class="prow-title">Keep a search once I've made it</div>
        <div class="prow-desc" data-el="stat"></div>
      </div>
      <div class="pseg" role="group" aria-label="Keep a search after">
        <button type="button" data-n="2">2 times</button>
        <button type="button" data-n="3">3 times</button>
      </div>
    </div>`
  const el = Object.fromEntries([...box.querySelectorAll('[data-el]')].map((n) => [n.dataset.el, n]))
  const render = async () => {
    const s = await settings()
    box.querySelectorAll('[data-n]').forEach((b) => b.setAttribute('aria-pressed', String(Number(b.dataset.n) === s.keepAfter)))
    el.stat.textContent = s.forgotten
      ? `${s.forgotten} one-time ${s.forgotten === 1 ? 'search' : 'searches'} forgotten so far.`
      : 'Searches already in history follow the same rule.'
  }
  box.querySelectorAll('[data-n]').forEach((b) =>
    b.addEventListener('click', () => chrome.storage.local.set({ searchKeepAfter: Number(b.dataset.n) })),
  )
  chrome.storage.onChanged.addListener((c) => ('searchKeepAfter' in c || 'searchForgotten' in c) && render())
  render()
}
