// Popup section: switch the YouTube home page between Normal, Cats and Fern.
const DESC = { normal: 'Whatever YouTube picks.', cats: 'Only cat videos.', fern: 'Only videos by Fern.' }

export async function mount(box) {
  box.innerHTML = `
    <section class="setting">
      <div class="setting-text">
        <div class="setting-title">Home feed</div>
        <div class="setting-desc" data-el="desc"></div>
      </div>
      <div class="pseg" role="group" aria-label="Home feed">
        <button type="button" data-mode="normal">Normal</button>
        <button type="button" data-mode="cats">Cats</button>
        <button type="button" data-mode="fern">Fern</button>
      </div>
    </section>`
  const render = async () => {
    const { feedMode = 'normal' } = await chrome.storage.local.get('feedMode')
    box.querySelectorAll('[data-mode]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.mode === feedMode)))
    box.querySelector('[data-el=desc]').textContent = DESC[feedMode]
  }
  box.querySelectorAll('[data-mode]').forEach((b) =>
    b.addEventListener('click', () => chrome.storage.local.set({ feedMode: b.dataset.mode })),
  )
  chrome.storage.onChanged.addListener((c) => 'feedMode' in c && render())
  render()
}
