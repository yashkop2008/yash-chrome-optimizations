// Hub panel: how many visits a search needs before it's kept, and a one-off
// clean-up of searches already in history.
import { settings, cleanUpPast } from './searches.js'

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
    </div>
    <div class="prow">
      <div class="prow-text">
        <div class="prow-title">Searches already in history</div>
        <div class="prow-desc" data-el="result">Applies the same rule to everything you've searched before.</div>
      </div>
      <button class="btn-outline" data-el="clean" type="button">Clean up</button>
    </div>`
  const el = Object.fromEntries([...box.querySelectorAll('[data-el]')].map((n) => [n.dataset.el, n]))
  const render = async () => {
    const s = await settings()
    box.querySelectorAll('[data-n]').forEach((b) => b.setAttribute('aria-pressed', String(Number(b.dataset.n) === s.keepAfter)))
    el.stat.textContent = s.forgotten
      ? `${s.forgotten} one-time ${s.forgotten === 1 ? 'search' : 'searches'} forgotten so far.`
      : 'Nothing forgotten yet.'
  }
  box.querySelectorAll('[data-n]').forEach((b) =>
    b.addEventListener('click', () => chrome.storage.local.set({ searchKeepAfter: Number(b.dataset.n) })),
  )
  el.clean.addEventListener('click', async () => {
    el.clean.disabled = true
    el.result.textContent = 'Going through your history…'
    const { removed, kept } = await cleanUpPast()
    el.result.textContent = `Removed ${removed} one-time ${removed === 1 ? 'search' : 'searches'}, kept ${kept} you repeat.`
    el.clean.disabled = false
  })
  chrome.storage.onChanged.addListener((c) => ('searchKeepAfter' in c || 'searchForgotten' in c) && render())
  render()
}
