// Browser-only simulation persistence; no blockchain or shared-database claim.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { chromium } = require('playwright');
const base = process.env.ARCANA_WEB_URL || 'http://127.0.0.1:5195';
(async () => {
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || (fs.existsSync('/usr/bin/chromium') ? '/usr/bin/chromium' : undefined), args: ['--no-sandbox'] });
  try {
    const ctx = await browser.newContext(); let p = await ctx.newPage(); p.setDefaultTimeout(15000);
    await p.goto(base + '/auth?mode=signup');
    await p.getByText('Demo accounts and progress are saved in this browser only.', { exact: false }).waitFor();
    await p.fill('#alias', 'resumetester'); await p.getByRole('button', { name: 'Generate random words' }).click();
    const pass = await p.locator('#pass').inputValue(); await p.locator('button[type=submit]').click(); await p.waitForURL('**/studio');
    await p.goto(base + '/studio?tab=keys'); await p.getByRole('button', { name: 'Create my keys' }).click(); await p.getByText('Keys active in this browser').waitFor();
    assert.equal(await p.getByRole('button', { name: 'Save account backup', exact: true }).count(), 0);
    await p.goto(base + '/studio?tab=settings'); await p.getByText('Your demo progress', { exact: true }).waitFor();
    await p.getByRole('button', { name: 'Keep demo data on this device', exact: true }).click();
    await p.getByRole('status').waitFor();
    const modern = await p.evaluate(async pass => {
      const db = await new Promise((ok, no) => { const r = indexedDB.open('arcana-demo-server', 1); r.onsuccess = () => ok(r.result); r.onerror = () => no(r.error); });
      const state = await new Promise((ok, no) => { const r = db.transaction('state').objectStore('state').get('v2'); r.onsuccess = () => ok(r.result); r.onerror = () => no(r.error); }); db.close();
      return state.accounts.find(a => a.alias === 'resumetester').pass.startsWith('pbkdf2-v1$') && !JSON.stringify(state).includes(pass);
    }, pass); assert.equal(modern, true);
    await p.evaluate(() => fetch('/api/logout', { method: 'POST', headers: { 'x-arcana-action': '1' } }));
    // Downgrade just the fixture to the legacy format to exercise non-destructive upgrade.
    await p.evaluate(async pass => {
      const db = await new Promise(ok => { const r = indexedDB.open('arcana-demo-server', 1); r.onsuccess = () => ok(r.result); });
      const state = await new Promise(ok => { const r = db.transaction('state').objectStore('state').get('v2'); r.onsuccess = () => ok(r.result); });
      const a = state.accounts.find(a => a.alias === 'resumetester');
      const bytes = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(a.salt + ':' + pass)));
      a.pass = Array.from(bytes, x => x.toString(16).padStart(2, '0')).join('');
      await new Promise((ok, no) => { const tx = db.transaction('state', 'readwrite'); tx.objectStore('state').put(state, 'v2'); tx.oncomplete = ok; tx.onabort = () => no(tx.error); }); db.close();
    }, pass);
    await p.close(); p = await ctx.newPage(); p.setDefaultTimeout(15000);
    await p.goto(base + '/auth'); await p.fill('#alias', 'resumetester'); await p.fill('#pass', pass); await p.locator('button[type=submit]').click(); await p.waitForURL('**/studio');
    await p.goto(base + '/studio?tab=keys'); await p.getByText('Keys active in this browser').waitFor();
    const upgraded = await p.evaluate(async () => {
      const db = await new Promise(ok => { const r = indexedDB.open('arcana-demo-server', 1); r.onsuccess = () => ok(r.result); });
      const state = await new Promise(ok => { const r = db.transaction('state').objectStore('state').get('v2'); r.onsuccess = () => ok(r.result); }); db.close();
      return state.accounts.find(a => a.alias === 'resumetester').pass.startsWith('pbkdf2-v1$');
    }); assert.equal(upgraded, true);
    console.log('PASS: browser-local persistence; login after tab closure; key continuity; storage control; legacy demo hash upgrade');
    await ctx.close();
  } finally { await browser.close(); }
})().catch(e => { console.error(e.message); process.exit(1); });
