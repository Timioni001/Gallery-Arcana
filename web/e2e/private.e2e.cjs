const { chromium } = require('playwright');
const fs = require('fs');
const { SS, B, launch, resetLocalRateLimits, mockPay, admin } = require('./env.cjs');
const step = (m) => console.log('✓', m);
(async () => {
  await resetLocalRateLimits(); const b = await launch(chromium);
  const mk = async () => { const c = await b.newContext({ viewport: { width: 1280, height: 900 }, acceptDownloads: true }); const p = await c.newPage(); p.on('pageerror', (e) => console.log('PAGEERROR', e.message)); return p };
  const S = await mk(), U = await mk(), R = await mk(); global.U = U; global.S = S; global.R = R;
  const sfx = Date.now().toString(36).slice(-5);
  const signup = async (p, alias) => { await p.goto(B + '/auth?mode=signup'); await p.fill('#alias', alias); await p.fill('#pass', 'correct horse battery staple'); await p.click('button[type=submit]'); await p.waitForURL('**/studio') };
  const keys = async (p) => { await p.goto(B + '/studio?tab=keys'); await p.click('text=Create my keys'); await p.waitForSelector('text=Keys active in this browser') };
  // Seller with server-encrypted listing
  await signup(S, 'inv' + sfx); await keys(S);
  const [bk] = await Promise.all([S.waitForEvent('download'), S.click('text=Download backup')]);
  await bk.saveAs(SS + '/vault-backup.json'); const recovery = await S.locator('p.select-all').textContent(); step('seller vault backup saved');
  await S.goto(B + '/studio?tab=settings'); await S.fill('input[placeholder^="utest1"]', 'utest1mockdemopayout1234567890'); await S.click('text=Save address'); await S.waitForTimeout(600);
  await S.goto(B + '/studio/new'); await S.fill('#t', 'Exclusive drop ' + sfx); await S.fill('#p', '40');
  await S.locator('input[type=file]').nth(1).setInputFiles(SS + '/secret-source.txt'); await S.click('button[type=submit]'); await S.waitForURL('**/listing/*');
  const listingUrl = S.url();
  // Private invitation at a private price
  await S.fill('input[placeholder^="Private price"]', '30'); await S.click('text=Create link'); await S.waitForSelector('input[value*="/invite/"]');
  const link = await S.locator('input[value*="/invite/"]').inputValue(); step('invitation link created: ' + link.replace(/#.*/, '#…'));
  // Outsider sees the listing gone from public market
  const pub = await (await fetch(B + '/api/listings?limit=80')).json();
  if (pub.some((l) => l.title === 'Exclusive drop ' + sfx)) throw new Error('invitation-only listing still public'); step('listing hidden from public market');
  // Buyer redeems
  await signup(U, 'vip' + sfx); await U.goto(link); await U.waitForSelector('text=$30');
  await U.click('text=Create my keys'); await U.click('button:has-text("Request capsule key"):not([disabled])'); await U.waitForSelector('text=Redeeming before'); step('invited buyer requested capsule key');
  await S.goto(B + '/studio?tab=offers'); await S.click('text=Seal key & accept'); await S.click('text=Trust this key'); await S.waitForSelector('text=Key sealed'); step('seller sealed key for invited buyer');
  await U.click('text=Redeem & check out'); await U.waitForURL('**/orders/*');
  const orderId = U.url().split('/').pop(); step('invitation redeemed at private price → order');
  const again = await U.evaluate(async (l) => { const [id, cap] = l.split('/invite/')[1].split('#'); return (await fetch(`/api/invitations/${id}/inspect`, { method: 'POST', headers: { 'x-arcana-action': '1', 'content-type': 'application/json' }, body: JSON.stringify({ capability: cap }) })).status }, link);
  if (again !== 404) throw new Error('invitation reusable'); step('invitation is single-use (second inspect → 404)');
  const pay = await U.evaluate(async (id) => (await fetch(`/api/orders/${id}/payment`)).json(), orderId);
  await mockPay(pay.payment);
  await U.waitForSelector('text=Decrypt locally', { timeout: 60000 });
  // Dispute and reviewer evidence
  await U.click('button:has-text("Dispute")'); await U.fill('[role=dialog] textarea', 'File does not match the description given.'); await U.click('text=Open dispute'); await U.waitForSelector('text=Funds are frozen');
  step('buyer opened dispute; funds frozen');
  await signup(R, 'rev' + sfx); await keys(R);
  admin(`assign ${orderId} rev${sfx}`); step('operator assigned independent reviewer');
  await U.reload(); await U.waitForSelector('text=Only the assigned reviewer');
  await U.fill('textarea[placeholder^="Describe"]', 'Expected PNG renders; received a text file.'); await U.check('input[type=checkbox]'); await U.click('text=Seal & send');
  await U.click('text=Trust this key'); await U.waitForSelector('text=sent · ciphertext'); step('buyer sealed evidence to reviewer with consent');
  await R.goto(B + '/review/' + orderId); await R.waitForSelector('text=Expected PNG renders; received a text file.'); step('reviewer decrypted evidence locally');
  await R.screenshot({ path: SS + '/review.png' });
  admin(`resolve ${orderId} release`); step('operator released after review');
  // Vault restore on a fresh browser
  const S2 = await mk(); await S2.goto(B + '/auth'); await S2.fill('#alias', 'inv' + sfx); await S2.fill('#pass', 'correct horse battery staple'); await S2.click('button[type=submit]'); await S2.waitForURL('**/studio');
  await S2.goto(B + '/studio?tab=keys'); await S2.waitForSelector('text=they are not in this browser');
  await S2.click('text=Restore backup'); await S2.locator('[role=dialog] input[type=file]').setInputFiles(SS + '/vault-backup.json');
  await S2.fill('[role=dialog] input[placeholder="Recovery key"]', recovery.trim()); await S2.click('[role=dialog] button:text-is("Restore")');
  await S2.waitForSelector('text=Keys active in this browser'); step('vault restored in a fresh browser from backup + recovery key');
  await b.close();
})().catch(async (e) => { console.error('FAIL', e.message); for (const k of ['U', 'S', 'R']) await global[k]?.screenshot({ path: SS + `/fail-${k}.png` }); process.exit(1) });
