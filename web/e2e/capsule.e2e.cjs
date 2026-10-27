const { chromium } = require('playwright');
const fs = require('fs');
const { SS, B, launch, resetLocalRateLimits, mockPay, admin } = require('./env.cjs');
const step = (m) => console.log('✓', m);
(async () => {
  await resetLocalRateLimits(); const b = await launch(chromium);
  const mk = async () => { const c = await b.newContext({ viewport: { width: 1280, height: 900 }, acceptDownloads: true }); const p = await c.newPage(); p.on('pageerror', (e) => console.log('PAGEERROR', e.message)); return p };
  const S = await mk(), U = await mk(); global.U = U; global.S = S;
  const sfx = Date.now().toString(36).slice(-5);
  const signup = async (p, alias) => { await p.goto(B + '/auth?mode=signup'); await p.fill('#alias', alias); await p.fill('#pass', 'correct horse battery staple'); await p.click('button[type=submit]'); await p.waitForURL('**/studio') };
  // Seller: account, keys, payout, capsule listing
  await signup(S, 'vend' + sfx);
  await S.goto(B + '/studio?tab=keys'); await S.click('text=Create my keys'); await S.waitForSelector('text=Keys active in this browser'); step('seller keys created + registered');
  await S.click('text=Download backup'); await S.waitForSelector('text=Recovery key, shown once'); step('vault backup + recovery key');
  await S.goto(B + '/studio?tab=settings'); await S.fill('input[placeholder^="utest1"]', 'utest1mockdemopayout1234567890'); await S.click('text=Save address'); await S.waitForTimeout(800);
  await S.goto(B + '/studio/new');
  await S.fill('#t', 'Sealed source drop'); await S.fill('#p', '25');
  await S.locator('input[type=file]').nth(1).setInputFiles(SS + '/secret-source.txt');
  await S.click('button[type=submit]'); await S.waitForURL('**/listing/*', { timeout: 20000 });
  const listingUrl = S.url(); step('capsule encrypted in browser + listed ' + listingUrl);
  await S.waitForSelector('text=Arcana Capsule');
  // Buyer: account, keys, request
  await signup(U, 'coll' + sfx);
  await U.goto(listingUrl); await U.click('text=Create my keys'); await U.waitForSelector('button:has-text("Request to buy"):not([disabled])');
  await U.click('text=Request to buy'); await U.waitForSelector('text=Waiting for'); step('buyer keys + purchase request');
  // Buyer messages seller (E2EE)
  await U.click('text=privately'); await U.waitForURL('**/studio?tab=messages*');
  await U.click('text=Trust this key'); await U.fill('textarea', 'Is the drop the full source?'); await U.locator('button:has(svg.lucide-send)').click();
  await U.waitForSelector('text=Is the drop the full source?'); step('buyer sent encrypted message');
  // Seller seals key and accepts
  await S.goto(B + '/studio?tab=offers'); await S.click('text=Seal key & accept'); await S.click('text=Trust this key');
  await S.waitForSelector('text=Key sealed', { timeout: 15000 }); step('seller sealed content key to buyer fingerprint');
  await S.goto(B + '/studio?tab=messages'); await S.click('text=Trust this key', { timeout: 2500 }).catch(() => console.log('  (buyer already pinned by seller; no prompt)')); await S.waitForSelector('text=Is the drop the full source?'); step('seller decrypted message');
  await S.fill('textarea', 'Yes, full repo.'); await S.locator('button:has(svg.lucide-send)').click();
  await U.waitForSelector('text=Yes, full repo.', { timeout: 10000 }); step('buyer decrypted reply');
  // Buyer checkout, pay, decrypt
  await U.goto(listingUrl); await U.click('button:has-text("Checkout")'); await U.waitForURL('**/orders/*');
  const orderId = U.url().split('/').pop();
  const pay = await U.evaluate(async (id) => (await fetch(`/api/orders/${id}/payment`)).json(), orderId);
  await mockPay(pay.payment);
  await U.waitForSelector('text=Decrypt locally', { timeout: 60000 }); step('order funded');
  const [dl] = await Promise.all([U.waitForEvent('download'), U.click('text=Decrypt locally & verify')]);
  const out = SS + '/decrypted-' + dl.suggestedFilename(); await dl.saveAs(out);
  if (fs.readFileSync(out, 'utf8') !== fs.readFileSync(SS + '/secret-source.txt', 'utf8')) throw new Error('plaintext mismatch');
  step('decrypted locally; plaintext identical to original (' + dl.suggestedFilename() + ')');
  await U.screenshot({ path: SS + '/capsule-order.png' });
  await U.waitForSelector('text=Paid', { timeout: 15000 }); step('verified delivery released instantly → paid');
  // Passport + public verification with holder proof
  await U.goto(B + '/studio?tab=proofs'); await U.selectOption('select', { index: 1 });
  await U.fill('input[placeholder^="Audience"]', 'demo-verifier'); await U.click('text=Issue passport'); await U.waitForSelector('text=Signed passport');
  const passport = await U.locator('pre').first().textContent();
  const V = await mk(); await V.goto(B + '/verify'); const nonce = await V.locator('input[readonly]').inputValue();
  await U.fill('input[placeholder="Verifier nonce"]', nonce); await U.click('button:text-is("Sign")'); await U.waitForTimeout(500);
  const pres = await U.locator('pre').nth(1).textContent();
  await V.fill('input[placeholder="Audience you are verifying as"]', 'demo-verifier'); await V.fill('textarea[placeholder="Passport JSON"]', passport); await V.fill('textarea[placeholder="Holder proof JSON"]', pres);
  await V.click('text=Verify passport'); await V.waitForSelector('text=Holder signed your one-time nonce'); step('passport + holder proof verified by unrelated verifier');
  await V.screenshot({ path: SS + '/verify.png' });
  await b.close();
})().catch(async (e) => { console.error('FAIL', e.message); await global.U?.screenshot({ path: SS + '/fail-U.png' }); await global.S?.screenshot({ path: SS + '/fail-S.png' }); process.exit(1) });
