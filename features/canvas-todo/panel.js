// Hub panel: which Canvas (found in your history, or typed), and how it's going.
import { getDomain, cleanDomain, refresh, cached } from './canvas.js'

function ago(ts) {
  const m = Math.round((Date.now() - ts) / 60000)
  if (m < 1) return 'just now'
  return m < 60 ? `${m}m ago` : `${Math.round(m / 60)}h ago`
}

export async function mount(box) {
  box.innerHTML = `
    <div class="prow">
      <div class="prow-text">
        <div class="prow-title">Canvas address</div>
        <div class="prow-desc" data-el="status"></div>
      </div>
      <form data-el="form" autocomplete="off">
        <input class="field canvas-field" data-el="input" placeholder="school.instructure.com" spellcheck="false" aria-label="Canvas address" />
      </form>
    </div>
    <div class="prow" data-el="token-row" hidden>
      <div class="prow-text">
        <div class="prow-title">Access token</div>
        <div class="prow-desc">In Canvas: Account, Settings, New access token. Kept only in this profile.</div>
      </div>
      <form data-el="token-form" autocomplete="off">
        <input class="field canvas-field" data-el="token" type="password" placeholder="optional" spellcheck="false" aria-label="Canvas access token" />
      </form>
    </div>`
  const el = Object.fromEntries([...box.querySelectorAll('[data-el]')].map((n) => [n.dataset.el, n]))

  async function render() {
    const domain = await getDomain()
    if (document.activeElement !== el.input) el.input.value = domain
    const c = await cached()
    let text
    if (!domain) text = 'Not in this profile’s history. Type your school’s Canvas address.'
    else if (!c || c.domain !== domain) text = 'Checking…'
    else if (c.state === 'signed-out') text = 'Not signed in to Canvas in this Chrome profile. Sign in here, or use an access token.'
    const { canvasToken = '' } = await chrome.storage.local.get('canvasToken')
    // Only offered when signing in hasn't been enough (or a token is already in use).
    el['token-row'].hidden = !(canvasToken || (domain && c?.domain === domain && c.state === 'signed-out'))
    if (document.activeElement !== el.token) el.token.value = canvasToken
    else if (c.state === 'error') text = `Couldn’t reach Canvas · ${ago(c.at)}`
    else {
      const late = c.items.filter((i) => i.late).length
      const soon = c.items.length - late
      const parts = [soon ? `${soon} due this week` : 'Nothing due this week', late ? `${late} late` : '']
      text = `${parts.filter(Boolean).join(', ')} · checked ${ago(c.at)}`
    }
    el.status.textContent = text
  }

  // Saved on Enter or leaving the field, and only when it changed.
  const saveOn = (form, input, key, clean) => {
    form.addEventListener('submit', async (e) => {
      e.preventDefault()
      const value = clean(input.value)
      input.value = value
      input.blur()
      const { [key]: before = '' } = await chrome.storage.local.get(key)
      if (value === before) return
      await chrome.storage.local.set({ [key]: value })
      refresh({ force: true })
    })
    input.addEventListener('blur', () => form.requestSubmit())
  }
  saveOn(el.form, el.input, 'canvasDomain', cleanDomain)
  saveOn(el['token-form'], el.token, 'canvasToken', (v) => v.trim())
  chrome.storage.onChanged.addListener((c) => ('canvasCache' in c || 'canvasDomain' in c || 'canvasToken' in c) && render())
  await render()
  refresh().then(render)
}
