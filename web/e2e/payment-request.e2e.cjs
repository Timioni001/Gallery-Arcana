// UI contract test with explicit API fixtures. Does not send a wallet payment.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { chromium } = require('playwright');
const evidence = require('../../docs/evidence/settlement-regtest-2026-10-27T23-55-54-663Z.json');
const base = process.env.ARCANA_WEB_URL || 'http://127.0.0.1:5188';
const uri = `zcash:${evidence.invoice.address}?amount=0.125&memo=${Buffer.from('GA-qr-contract-test').toString('base64url')}`;
(async () => {
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || (fs.existsSync('/usr/bin/chromium') ? '/usr/bin/chromium' : undefined), args: ['--no-sandbox'] });
  try {
    for (const scenario of ['zallet', 'mock', 'demo', 'unknown', 'expired', 'bad-scheme', 'oversized', 'expires-open', 'funded']) {
      const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
      const page = await context.newPage(); const errors = []; page.on('pageerror', e => errors.push(e.message));
      const expiresAt = new Date(Date.now() + (scenario === 'expired' ? -1000 : scenario === 'expires-open' ? 3500 : 300000)).toISOString();
      const value = scenario === 'bad-scheme' ? 'javascript:alert(1)' : scenario === 'oversized' ? 'zcash:' + 'a'.repeat(1900) : uri;
      await page.route('**/api/**', route => {
        const p = new URL(route.request().url()).pathname;
        const data = p === '/api/health' ? { mode: ['mock','demo','unknown'].includes(scenario) ? scenario : 'zallet', network: 'regtest' }
          : p === '/api/me' ? { account: { id: 'qr-buyer', alias: 'qr-buyer' } }
          : p.endsWith('/payment') ? { payment: { address: evidence.invoice.address, memo: 'GA-qr-contract-test', amountZec: '0.125', amountZat: '12500000', uri: value, expiresAt } }
          : p === '/api/orders/qr-order' ? { id: 'qr-order', listing_id: 'qr-listing', title: 'QR test capsule', status: scenario === 'funded' ? 'funded' : 'awaiting_payment', price_usd_cents: 500, received_zat: '0', confirmations: 0, expires_at: expiresAt, crypto_mode: 'server' }
          : {};
        return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(data) });
      });
      await page.goto(base + '/orders/qr-order');
      await page.getByRole('heading', { name: 'QR test capsule' }).waitFor();
      if (scenario === 'funded') { assert.equal(await page.getByText('Open in wallet', { exact: true }).count(), 0); }
      else if (['bad-scheme','oversized','expired'].includes(scenario)) {
        assert.equal(await page.getByRole('button', { name: 'Open in wallet', exact: true }).isDisabled(), true);
        assert.equal(await page.locator('svg:has(title)').count(), 0);
      } else {
        const svg = page.locator('svg:has(title)').first(); await svg.waitFor();
        await page.addScriptTag({ path: require.resolve('jsqr/dist/jsQR.js') });
        const decoded = await svg.evaluate(async el => {
          const image = new Image(); image.src = 'data:image/svg+xml;base64,' + btoa(new XMLSerializer().serializeToString(el)); await image.decode();
          const canvas = document.createElement('canvas'); canvas.width = canvas.height = 672;
          const ctx = canvas.getContext('2d'); ctx.drawImage(image, 0, 0, 672, 672);
          const pixels = ctx.getImageData(0, 0, 672, 672); return window.jsQR(pixels.data, 672, 672)?.data;
        });
        assert.equal(decoded, uri, 'QR must preserve the entire URI, including memo and exact amount');
        if (['mock','demo','unknown'].includes(scenario)) assert.equal(await page.getByRole('button', { name: 'Open in wallet', exact: true }).isDisabled(), true);
        else {
          assert.equal(await page.getByRole('link', { name: 'Open in wallet', exact: true }).getAttribute('href'), uri);
          if (scenario === 'expires-open') { await page.getByText('This invoice has expired. Do not send payment.').waitFor({ timeout: 6000 }); assert.equal(await page.getByRole('link', { name: 'Open in wallet' }).count(), 0); assert.equal(await page.locator('svg:has(title)').count(), 0); }
        }
      }
      assert.deepEqual(errors, []);
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, 'mobile viewport must not overflow');
      await context.close(); console.log('PASS', scenario);
    }
  } finally { await browser.close(); }
})().catch(e => { console.error(e); process.exit(1); });
