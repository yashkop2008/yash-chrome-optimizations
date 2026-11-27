// Hub panel: how many separate visits a page needs before it's kept.
import { settings } from './pages.js'

export async function mount(box) {
  box.innerHTML = `
    <div class="prow">
      <div class="prow-text">
        <div class="prow-title">Keep a page once I've opened it</div>
        <div class="prow-desc" data-el="stat"></div>
      </div>
      <div class="pseg" role="group" aria-label="Keep a page after">
        <button type="button" data-n="2">2 times</button>
        <button type="button" data-n="3">3 times</button>
      </div>
    </div>`
  const stat = box.querySelector('[data-el=stat]')
  const render = async () => {
    const s = await settings()
    box.querySelectorAll('[data-n]').forEach((b) => b.setAttribute('aria-pressed', String(Number(b.dataset.n) === s.keepAfter)))
    stat.textContent = s.forgotten
      ? `${s.forgotten} one-time ${s.forgotten === 1 ? 'page' : 'pages'} forgotten so far.`
      : 'Visits less than half an hour apart count as one time.'
  }
  box.querySelectorAll('[data-n]').forEach((b) =>
    b.addEventListener('click', () => chrome.storage.local.set({ pageKeepAfter: Number(b.dataset.n) })),
  )
  chrome.storage.onChanged.addListener((c) => ('pageKeepAfter' in c || 'pagesForgotten' in c) && render())
  render()
}
