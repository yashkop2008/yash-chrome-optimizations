// Hub panel: how long before an untouched tab is parked, and the parked tabs.
import { settings, restore, IDLE_CHOICES } from './tabs.js'

const label = (h) => (h < 24 ? `${h} hours` : h === 24 ? '1 day' : `${h / 24} days`)
function ago(ts) {
  const m = Math.round((Date.now() - ts) / 60000)
  if (m < 60) return `${Math.max(1, m)}m ago`
  const h = Math.round(m / 60)
  return h < 24 ? `${h}h ago` : `${Math.round(h / 24)}d ago`
}

export async function mount(box) {
  box.innerHTML = `
    <div class="prow">
      <div class="prow-text">
        <div class="prow-title">Park a tab after</div>
        <div class="prow-desc">Never pinned, playing or grouped tabs.</div>
      </div>
      <div class="pseg" role="group" aria-label="Park a tab after" data-el="idle"></div>
    </div>
    <section class="parked" data-el="parked">
      <div class="section-title"><span>Parked tabs</span><button class="link" type="button" data-el="all" hidden>Reopen all</button></div>
      <ul data-el="list"></ul>
    </section>`
  const el = Object.fromEntries([...box.querySelectorAll('[data-el]')].map((n) => [n.dataset.el, n]))
  for (const h of IDLE_CHOICES) {
    const b = document.createElement('button')
    b.type = 'button'
    b.dataset.h = h
    b.textContent = label(h)
    el.idle.append(b)
  }
  el.idle.addEventListener('click', (e) => {
    const b = e.target.closest('button')
    if (b) chrome.storage.local.set({ tabsIdleHours: Number(b.dataset.h) })
  })
  el.all.addEventListener('click', () => restore(null, { all: true }))

  async function render() {
    const s = await settings()
    el.idle.querySelectorAll('button').forEach((b) => b.setAttribute('aria-pressed', String(Number(b.dataset.h) === s.idleHours)))
    el.list.replaceChildren(
      ...s.parked.slice(0, 30).map((p) => {
        const li = document.createElement('li')
        li.innerHTML = `<span class="item-text"></span><span class="item-age"></span>
          <button class="icon-btn" type="button" title="Reopen"><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M7 17 17 7M9 7h8v8"/></svg></button>`
        li.querySelector('.item-text').textContent = p.title
        li.querySelector('.item-text').title = p.url
        li.querySelector('.item-age').textContent = ago(p.at)
        const b = li.querySelector('button')
        b.setAttribute('aria-label', `Reopen ${p.title}`)
        b.addEventListener('click', () => restore(p.url))
        return li
      }),
    )
    el.parked.hidden = !s.parked.length
    el.all.hidden = s.parked.length < 2
  }
  chrome.storage.onChanged.addListener((c) => ('parkedTabs' in c || 'tabsIdleHours' in c) && render())
  render()
}
