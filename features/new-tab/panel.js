// Hub panel: which creatures take turns on new tabs (at least one stays in).
import { CREATURES } from './creatures.js'

export async function mount(box) {
  box.innerHTML = `
    <div class="prow">
      <div class="prow-text">
        <div class="prow-title">In the rotation</div>
        <div class="prow-desc">Each new tab is the next one in line.</div>
      </div>
      <div class="pseg" role="group" aria-label="Creatures in the rotation"></div>
    </div>`
  const seg = box.querySelector('.pseg')
  for (const c of CREATURES) {
    const b = document.createElement('button')
    b.type = 'button'
    b.dataset.id = c.id
    b.textContent = c.name
    seg.append(b)
  }
  const current = async () => (await chrome.storage.local.get('ntCreatures')).ntCreatures || CREATURES.map((c) => c.id)
  const render = async () => {
    const on = await current()
    seg.querySelectorAll('button').forEach((b) => b.setAttribute('aria-pressed', String(on.includes(b.dataset.id))))
  }
  seg.addEventListener('click', async (e) => {
    const b = e.target.closest('button')
    if (!b) return
    const on = await current()
    const next = on.includes(b.dataset.id) ? on.filter((id) => id !== b.dataset.id) : [...on, b.dataset.id]
    if (next.length) await chrome.storage.local.set({ ntCreatures: next })
  })
  chrome.storage.onChanged.addListener((c) => 'ntCreatures' in c && render())
  render()
}
