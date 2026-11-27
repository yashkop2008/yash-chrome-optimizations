// Hub panel: switch the YouTube home page between Normal, Cats and Fern.
const DESC = { normal: 'Whatever YouTube picks.', cats: 'Only cat videos.', fern: 'Only videos by Fern, newest first.' }

export async function mount(box) {
  box.innerHTML = `
    <div class="prow">
      <div class="prow-text">
        <div class="prow-title">Home feed</div>
        <div class="prow-desc" data-el="desc"></div>
      </div>
      <div class="pseg" role="group" aria-label="Home feed">
        <button type="button" data-mode="normal">Normal</button>
        <button type="button" data-mode="cats">Cats</button>
        <button type="button" data-mode="fern">Fern</button>
      </div>
    </div>`
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
