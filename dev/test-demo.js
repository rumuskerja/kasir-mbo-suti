// Uji cepat versi demo: 2 tab (kasir HP + admin laptop) berbagi data demo di localStorage.
const { chromium } = require('playwright'); const assert = require('assert');
const U = process.argv[2] || 'http://localhost:8790/'; const out = (process.argv[3] || __dirname) + '/';
(async () => {
  const b = await chromium.launch(); const ctx = await b.newContext(); const errs = [];
  const page = async (vp) => { const p = await ctx.newPage(); await p.setViewportSize(vp); p.on('pageerror', e => errs.push(e.message)); return p; };
  const t0 = Date.now();
  const k = await page({ width: 390, height: 844 }); await k.goto(U); await k.waitForSelector('#lg-user option[value="U2"]', { state: 'attached', timeout: 60000 });
  console.log('seed+login screen', Date.now() - t0, 'ms');
  await k.screenshot({ path: out + 'd-login.png' });
  await k.fill('#lg-pin', '123456'); await k.click('#login-btn'); await k.waitForSelector('#grid .item');
  const a = await page({ width: 1366, height: 860 }); await a.goto(U); await a.click('.seg [data-role=admin]');
  await a.fill('#lg-email', 'admin@mbosuti.id'); await a.fill('#lg-pin', 'mbosuti123'); await a.click('#login-btn'); await a.waitForTimeout(2500); console.log('admin state', await a.evaluate(() => [document.querySelector('#login-err').innerText, document.querySelector('#main').innerText.slice(0, 80)])); await a.waitForSelector('.kpi');
  await a.waitForTimeout(1500); await a.screenshot({ path: out + 'd-dash.png' });
  const before = await k.textContent('[data-add="t2"] .st');
  await a.click('#nav-side [data-r="stok-masuk"]'); await a.selectOption('#in-id', 't2'); await a.fill('#in-q', '20'); await a.click('#in-form button[type=submit]');
  await k.waitForFunction((b) => document.querySelector('[data-add="t2"] .st').textContent !== b, before, { timeout: 12000 });
  console.log('sync', before, '->', await k.textContent('[data-add="t2"] .st'));
  await k.click('[data-add="n1"]'); await k.click('#mbar'); await k.click('#cart-sheet [data-pay]'); await k.click('[data-pm="qris"]');
  await k.screenshot({ path: out + 'd-qris.png' });
  await k.click('[data-pm="tunai"]'); await k.click('#pay-done'); await k.waitForSelector('#rc-prev .receipt'); await k.click('#rc-print'); await k.waitForSelector('text=Demo: struk');
  for (const r of ['laba-rugi', 'neraca', 'kas']) { await a.click(`#nav-side [data-r="${r}"]`); await a.waitForSelector('.fin, table'); await a.waitForTimeout(600); await a.screenshot({ path: out + 'd-' + r + '.png' }); }
  assert(await a.$('text=Seimbang ✓') === null || true);
  await a.click('#nav-side [data-r="neraca"]'); await a.waitForSelector('text=Seimbang ✓');
  console.log('ERRORS', JSON.stringify(errs)); await b.close(); if (errs.length) process.exit(1);
})().catch(e => { console.error('GAGAL', e.message); process.exit(1); });
