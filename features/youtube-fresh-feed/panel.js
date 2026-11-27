// Hub panel: how many passed-over videos are hidden, with a way to forget them.
export async function mount(box) {
  box.innerHTML = `
    <div class="prow">
      <div class="prow-text">
        <div class="prow-title">Passed-over videos</div>
        <div class="prow-desc" data-el="desc"></div>
      </div>
      <button class="btn-outline" data-el="forget" type="button">Forget them</button>
    </div>`
  const desc = box.querySelector('[data-el=desc]')
  const forget = box.querySelector('[data-el=forget]')
  const render = async () => {
    const { seen = {} } = await chrome.storage.local.get('seen')
    const n = Object.values(seen).filter((r) => !r.c).length
    desc.textContent = `${n} ${n === 1 ? 'video is' : 'videos are'} hidden from your home feed. They come back after 30 days.`
    box.classList.toggle('blank', !n) // nothing to show until something is hidden
  }
  forget.addEventListener('click', () => chrome.storage.local.set({ seen: {} }))
  chrome.storage.onChanged.addListener((c) => 'seen' in c && render())
  render()
}
