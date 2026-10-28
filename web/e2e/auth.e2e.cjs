// Local PostgreSQL API via Vite; independent browser contexts model two devices.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { chromium } = require('playwright');
const base = process.env.ARCANA_WEB_URL || 'http://127.0.0.1:5194';
(async () => {
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || (fs.existsSync('/usr/bin/chromium') ? '/usr/bin/chromium' : undefined), args: ['--no-sandbox'] });
  try {
    const a = await browser.newContext({ viewport: { width: 390, height: 844 }, acceptDownloads: true });
    const b = await browser.newContext({ viewport: { width: 390, height: 844 } });
    const page = await a.newPage(), second = await b.newPage(); page.setDefaultTimeout(15000); second.setDefaultTimeout(15000);
    const alias = 'words' + Date.now().toString(36);
    await page.goto(base + '/auth?mode=signup');
    await page.getByRole('button', { name: 'Generate random words', exact: true }).click();
    const first = await page.locator('#pass').inputValue(); assert.equal(first.split(' ').length, 8);
    await page.getByRole('button', { name: 'Generate random words', exact: true }).click();
    const pass = await page.locator('#pass').inputValue(); assert.notEqual(pass, first); assert.equal(pass.split(' ').length, 8);
    assert.equal(await page.locator('#pass').getAttribute('type'), 'text');
    await page.getByRole('button', { name: 'Hide passphrase', exact: true }).click();
    assert.equal(await page.locator('#pass').getAttribute('type'), 'password');
    await page.fill('#alias', alias); await page.locator('button[type=submit]').click(); await page.waitForURL('**/studio');
    const progress = await page.evaluate(async alias => {
      const headers = { 'content-type': 'application/json', 'x-arcana-action': '1' };
      const payout = await fetch('/api/me/payout', { method: 'PUT', headers, body: JSON.stringify({ address: 'utest1mockpayout1234567890' }) });
      const listing = await fetch('/api/listings', { method: 'POST', headers, body: JSON.stringify({ title: 'Resume ' + alias, delivery: 'manual', visibility: 'unlisted', priceUsdCents: 500 }) });
      return { payout: payout.status, listing: listing.status };
    }, alias);
    assert.deepEqual(progress, { payout: 200, listing: 200 });
    await page.goto(base + '/studio?tab=keys'); await page.getByRole('button', { name: 'Create my keys', exact: true }).click();
    await page.getByText('Keys active in this browser').waitFor();
    await page.getByRole('button', { name: 'Save account backup', exact: true }).click();
    const download = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Encrypt & save backup', exact: true }).click(); await download;
    await page.getByText('Encrypted backup saved to your account.', { exact: false }).waitFor(); console.log('PASS: generated passphrase, signup and encrypted account backup');
    const recovery = (await page.locator('p.select-all').textContent()).trim(); assert.ok(recovery.length >= 43);
    const saved = await page.evaluate(async () => (await fetch('/api/me/vault-backup')).json());
    assert.equal(saved.revision, 1); assert.equal(JSON.stringify(saved).includes(recovery), false); assert.equal(JSON.stringify(saved).includes(pass), false);
    await second.goto(base + '/auth'); await second.fill('#alias', alias); await second.fill('#pass', 'wrong passphrase for test');
    await second.locator('button[type=submit]').click(); await second.getByText('Incorrect account details', { exact: false }).waitFor();
    await second.fill('#pass', pass); await second.locator('button[type=submit]').click(); await second.waitForURL('**/studio');
    await second.getByText('Resume ' + alias, { exact: true }).waitFor();
    await second.goto(base + '/studio?tab=keys'); await second.getByText('they are not in this browser', { exact: false }).waitFor();
    await second.getByRole('button', { name: 'Restore backup', exact: true }).click();
    await second.getByRole('button', { name: 'Load account backup', exact: true }).click(); await second.getByText('Selected: account-backup.json').waitFor();
    await second.getByPlaceholder('Recovery key', { exact: true }).fill('A'.repeat(43));
    await second.locator('[role=dialog]').getByRole('button', { name: 'Restore', exact: true }).click();
    await second.getByText('Wrong recovery key or damaged backup', { exact: false }).waitFor();
    await second.getByPlaceholder('Recovery key', { exact: true }).fill(recovery);
    await second.locator('[role=dialog]').getByRole('button', { name: 'Restore', exact: true }).click(); await second.getByText('Keys active in this browser').waitFor();
    await second.reload(); await second.getByText('Keys active in this browser').waitFor();
    const fingerprint = await page.locator('span[title]').filter({ hasText: /[a-f0-9]{4} / }).first().getAttribute('title');
    assert.ok(fingerprint); assert.ok(await second.locator(`span[title="${fingerprint}"]`).count());
    console.log('PASS: generated words; login; account backup; separate-browser activity and key restore; wrong-key rejection; persisted keys after reload');
    await a.close(); await b.close();
  } finally { await browser.close(); }
})().catch(e => { console.error(e.message); process.exit(1); });
