// Drive chrome://omnibox: the address bar's real suggestion engine.
const deep = `
  window.__deepAll = (sel) => { const out = []; const walk = (root) => { for (const el of root.querySelectorAll('*')) { if (el.matches(sel)) out.push(el); if (el.shadowRoot) walk(el.shadowRoot) } }; walk(document); return out };
`
exports.enableDebugPages = async (ctx) => {
  const c = await ctx.newPage()
  await c.goto('chrome://chrome-urls')
  await c.waitForTimeout(600)
  await c.evaluate(deep + `for (const b of __deepAll('cr-button')) if (/enable/i.test(b.textContent)) b.click()`)
  await c.waitForTimeout(500)
  await c.close()
}
exports.suggestions = async (page, text) => {
  if (!page.url().startsWith('chrome://omnibox')) { await page.goto('chrome://omnibox'); await page.waitForTimeout(1200) }
  await page.evaluate(deep + `
    const input = __deepAll('input, textarea').find((i) => /query|input/i.test(i.id + ' ' + i.placeholder + ' ' + i.className) || i.type === 'text' || i.tagName === 'TEXTAREA');
    input.focus(); input.value = ${JSON.stringify(text)};
    input.dispatchEvent(new Event('input', { bubbles: true, composed: true }));
  `)
  await page.waitForTimeout(2500)
  return page.evaluate(deep + `
    // every link-looking cell that holds a URL in the results tables
    [...new Set(__deepAll('td, a, div, span').map((e) => e.textContent.trim()).filter((t) => /^https?:\\/\\/\\S+$/.test(t)))]
  `)
}
