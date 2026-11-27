// Is the companion Chrome theme (theme/) installed, switched on and current?
// Chrome only re-reads a theme when its reload arrow is pressed, so after an
// update the hub says so and opens the theme's card.
const NAME = "Yash's Chrome Theme"
const newer = (a, b) => {
  const pa = String(a).split('.').map(Number)
  const pb = String(b).split('.').map(Number)
  for (let i = 0; i < 3; i++) if ((pa[i] || 0) !== (pb[i] || 0)) return (pa[i] || 0) > (pb[i] || 0)
  return false
}

export async function themeStatus() {
  let bundled = null
  try {
    bundled = (await (await fetch(chrome.runtime.getURL('theme/manifest.json'))).json()).version
  } catch {}
  const all = await chrome.management.getAll()
  const theme = all.find((e) => e.type === 'theme' && e.name === NAME)
  if (!theme) return { state: 'missing', bundled }
  if (!theme.enabled) return { state: 'off', id: theme.id, installed: theme.version, bundled }
  if (bundled && newer(bundled, theme.version)) return { state: 'stale', id: theme.id, installed: theme.version, bundled }
  return { state: 'ok', id: theme.id, installed: theme.version, bundled }
}

export async function mountThemeRow(row) {
  const title = row.querySelector('.row-title')
  const desc = row.querySelector('.row-desc')
  const btn = row.querySelector('button')
  const render = async () => {
    const s = await themeStatus()
    title.textContent = 'Chrome theme'
    btn.hidden = s.state === 'ok'
    if (s.state === 'ok') desc.textContent = `Version ${s.installed} · up to date.`
    if (s.state === 'stale') {
      desc.textContent = `Version ${s.installed} is loaded; ${s.bundled} is ready. Press the reload arrow on its card.`
      btn.textContent = 'Open its card'
      btn.onclick = () => chrome.tabs.create({ url: `chrome://extensions/?id=${s.id}` })
    }
    if (s.state === 'off') {
      desc.textContent = 'Installed but switched off (picking a colour in Customize Chrome does that).'
      btn.textContent = 'Switch on'
      btn.onclick = async () => {
        await chrome.management.setEnabled(s.id, true)
        render()
      }
    }
    if (s.state === 'missing') {
      desc.textContent = 'Not installed. In Extensions, use Load unpacked on the “theme” folder inside this extension’s folder.'
      btn.textContent = 'Open extensions'
      btn.onclick = () => chrome.tabs.create({ url: 'chrome://extensions/' })
    }
    return s
  }
  chrome.management.onEnabled.addListener(render)
  chrome.management.onDisabled.addListener(render)
  chrome.management.onInstalled.addListener(render)
  chrome.management.onUninstalled.addListener(render)
  addEventListener('focus', render)
  return render()
}
