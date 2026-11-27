// Popup section: how many passed-over videos are remembered, with a way to forget them.
export async function mount(box) {
  box.innerHTML = `
    <section class="setting">
      <div class="setting-text">
        <div class="setting-title">Fresh home feed</div>
        <div class="setting-desc" data-el="desc"></div>
      </div>
      <button class="btn-outline" data-el="forget" type="button">Forget</button>
    </section>`
  const desc = box.querySelector('[data-el=desc]')
  const forget = box.querySelector('[data-el=forget]')
  const render = async () => {
    const { seen = {} } = await chrome.storage.local.get('seen')
    const n = Object.values(seen).filter((r) => !r.c).length
    desc.textContent = n
      ? `${n} passed-over ${n === 1 ? 'video' : 'videos'} hidden from your home feed.`
      : 'Hides home-page videos you already scrolled past without clicking.'
    forget.hidden = !n
  }
  forget.addEventListener('click', () => chrome.storage.local.set({ seen: {} }))
  chrome.storage.onChanged.addListener((c) => 'seen' in c && render())
  render()
}
