// YouTube gate's section of the popup: running pass, today's numbers, the
// parked list, and the hold-to-pause control.
import { load, save, today, holdSecondsFor, passActive, pauseActive, clock, PAUSE_MINUTES } from './state.js'

const PAUSE_HOLD_MS = 5000
const ICON = (path) =>
  `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${path}</svg>`

function ago(ts) {
  const m = Math.round((Date.now() - ts) / 60000)
  if (m < 1) return 'just now'
  if (m < 60) return `${m}m ago`
  const h = Math.round(m / 60)
  return h < 24 ? `${h}h ago` : `${Math.round(h / 24)}d ago`
}

export async function mount(box) {
  box.innerHTML = `
    <section class="pass" data-el="pass" hidden>
      <div>
        <div class="pass-title" data-el="pass-title"></div>
        <div class="pass-time mono" data-el="pass-time"></div>
      </div>
      <button class="btn-outline" data-el="end" type="button">End now</button>
    </section>
    <section class="stats" aria-label="Today">
      <div class="stat"><div class="num mono" data-el="knocks">0</div><div class="lbl">Knocks</div></div>
      <div class="stat"><div class="num mono" data-el="back">0</div><div class="lbl">Turned back</div></div>
      <div class="stat"><div class="num mono" data-el="passes">0</div><div class="lbl">Fell in</div></div>
    </section>
    <p class="note muted" data-el="note"></p>
    <section class="parked">
      <div class="section-title"><span>Parked for later</span><span class="mono muted" data-el="count"></span></div>
      <ul data-el="list"></ul>
      <p class="empty muted" data-el="empty">Nothing parked. When the urge hits, write it down on the gate instead of following it.</p>
    </section>
    <div class="foot">
      <button class="hold" data-el="pause" type="button"><span data-el="pause-label"></span></button>
      <button class="btn-outline" data-el="resume" type="button" hidden>Guard YouTube again now</button>
    </div>`
  const el = Object.fromEntries([...box.querySelectorAll('[data-el]')].map((n) => [n.dataset.el, n]))
  let state = await load()
  let holding = false
  let progress = 0
  let last = 0

  function render() {
    const day = today(state)
    const now = Date.now()
    const passing = passActive(state, now)
    const paused = pauseActive(state, now)
    window.hubSetStatus?.(
      paused ? `Paused · ${clock(state.pauseUntil - now)}` : passing ? 'In the hole' : 'Guarding',
      paused ? 'paused' : passing ? 'pass' : 'guard',
    )
    el.pass.hidden = !passing
    if (passing) {
      el['pass-title'].textContent = state.pass.kind === 'search' ? 'Search pass, blinders on' : 'Fall-in pass'
      el['pass-time'].textContent = `${clock(state.pass.until - now)} left`
    }
    el.knocks.textContent = day.knocks
    el.back.textContent = day.back
    el.passes.textContent = day.passes
    el.note.textContent =
      day.knocks === 0
        ? 'No knocks yet today. Keep it that way.'
        : `You turned back ${Math.round((day.back / day.knocks) * 100)}% of the time today. ` +
          `Falling in next takes a ${holdSecondsFor(day.passes)}s hold.`

    el.list.replaceChildren(
      ...state.parked.map((item) => {
        const li = document.createElement('li')
        li.innerHTML = `<span class="item-text"></span><span class="item-age"></span>
          <button class="icon-btn" data-act="open" type="button">${ICON('<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>')}</button>
          <button class="icon-btn" data-act="del" type="button">${ICON('<path d="M6 6l12 12M18 6 6 18"/>')}</button>`
        li.querySelector('.item-text').textContent = item.text
        li.querySelector('.item-text').title = item.text
        li.querySelector('.item-age').textContent = ago(item.at)
        const [openBtn, delBtn] = li.querySelectorAll('button')
        openBtn.title = 'Search for it on YouTube'
        openBtn.setAttribute('aria-label', `Search YouTube for ${item.text}`)
        delBtn.title = 'Remove'
        delBtn.setAttribute('aria-label', `Remove ${item.text}`)
        openBtn.addEventListener('click', () =>
          chrome.tabs.create({ url: `https://www.youtube.com/results?search_query=${encodeURIComponent(item.text)}` }),
        )
        delBtn.addEventListener('click', () => save({ parked: state.parked.filter((p) => p.id !== item.id) }))
        return li
      }),
    )
    el.count.textContent = state.parked.length || ''
    el.empty.hidden = state.parked.length > 0
    el.pause.hidden = paused
    el.resume.hidden = !paused
    if (!holding && !paused) el['pause-label'].textContent = `Hold to pause the gate for ${PAUSE_MINUTES / 60} hour`
  }

  chrome.storage.onChanged.addListener(async () => {
    state = await load()
    render()
  })
  setInterval(render, 1000)

  el.end.addEventListener('click', () => chrome.runtime.sendMessage({ type: 'end-pass' }))
  el.resume.addEventListener('click', () => chrome.runtime.sendMessage({ type: 'resume' }))

  // Pausing is deliberate: a five-second hold, same as the gate.
  function loop(now) {
    const dt = last ? now - last : 16
    last = now
    progress = holding ? Math.min(1, progress + dt / PAUSE_HOLD_MS) : Math.max(0, progress - dt / 400)
    el.pause.style.setProperty('--p', progress.toFixed(4))
    if (holding) el['pause-label'].textContent = `Keep holding… ${Math.ceil(((1 - progress) * PAUSE_HOLD_MS) / 1000)}s`
    if (progress >= 1) {
      holding = false
      progress = 0
      last = 0
      el.pause.style.setProperty('--p', 0)
      chrome.runtime.sendMessage({ type: 'pause' })
      return
    }
    if (holding || progress > 0) requestAnimationFrame(loop)
    else {
      last = 0
      render()
    }
  }
  const start = (e) => {
    e.preventDefault()
    if (holding) return
    holding = true
    if (!last) requestAnimationFrame(loop)
  }
  const stop = () => (holding = false)
  el.pause.addEventListener('pointerdown', (e) => {
    el.pause.setPointerCapture(e.pointerId)
    start(e)
  })
  el.pause.addEventListener('pointerup', stop)
  el.pause.addEventListener('pointercancel', stop)
  el.pause.addEventListener('lostpointercapture', stop)
  el.pause.addEventListener('keydown', (e) => (e.key === ' ' || e.key === 'Enter') && !e.repeat && start(e))
  el.pause.addEventListener('keyup', (e) => (e.key === ' ' || e.key === 'Enter') && stop())

  render()
}
