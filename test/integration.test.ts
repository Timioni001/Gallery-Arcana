import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes,createHash } from 'node:crypto';
import { unlinkSync } from 'node:fs';
import { pool, tx } from '../src/db.ts';
import { buildServer } from '../src/http/server.ts';
import { MockWallet } from '../src/wallet/mock.ts';
import { scanOnce } from '../src/jobs/watcher.ts';
import { releaseExpired } from '../src/services/checkout.ts';

const enabled = process.env.RUN_DB_TESTS === '1' && process.env.ARCANA_ISOLATED_TEST_DB==='1';
process.env.ASSET_ENCRYPTION_KEY ??= randomBytes(32).toString('hex');

test('Postgres/API integration: auth, ownership, private offers, checkout, expiry, refund and delivery',
  { skip: !enabled && 'set RUN_DB_TESTS=1 to run the local Postgres integration test' }, async t => {
    await pool.query('SELECT 1');
    // Mock addresses are disposable test fixtures. Ignore unclaimed mock fixtures
    // left by interrupted runs so checkouts use this test's in-memory wallet.
    await pool.query("DELETE FROM address_pool WHERE NOT claimed AND address LIKE 'utest1mock%'");
    const app = buildServer();
    await app.ready();
    const wallet = new MockWallet();
    const tag = randomBytes(5).toString('hex');
    const aliases = [`seller${tag}`, `buyer${tag}`, `other${tag}`];
    const accountIds: string[] = [];
    const assetKeys: string[] = [];
    const listingIds: string[] = [];
    let orderIds: string[] = [];
    const addresses: string[] = [];

    const request = (method: string, url: string, body?: unknown, cookie?: string, headers: Record<string, string> = {}): Promise<any> =>
      app.inject({ method, url, ...(body === undefined ? {} : { payload: body }),
        headers: { ...(cookie ? { cookie } : {}), ...headers } } as any) as Promise<any>;
    const mutate = (method: string, url: string, body?: unknown, cookie?: string, headers: Record<string, string> = {}) =>
      request(method, url, body, cookie, { 'x-arcana-action': '1', ...headers });
    const signup = async (alias: string) => {
      const response = await mutate('POST', '/api/signup', { alias, passphrase: 'integration-passphrase-2026' });
      assert.equal(response.statusCode, 200, response.body);
      const sessionCookie = String(response.headers['set-cookie']).split(';')[0];
      const account = response.json().account as { id: string };
      accountIds.push(account.id);
      return { cookie: sessionCookie, account };
    };
    const createListing = async (sellerCookie: string, fileKey: string, title: string) => {
      const response = await mutate('POST', '/api/listings', {
        title, category: 'digital', delivery: 'download', fileKey, priceUsdCents: 500,
      }, sellerCookie);
      assert.equal(response.statusCode, 200, response.body);
      const id = response.json().listingId as string;
      listingIds.push(id);
      return id;
    };
    const uploadPrivate = async (cookie: string, content: Buffer) => {
      const response = await mutate('POST', '/api/assets/private', content, cookie, {
        'content-type': 'application/octet-stream', 'x-asset-type': 'image/png', 'x-asset-filename': 'product.bin',
      });
      assert.equal(response.statusCode, 200, response.body);
      const key = response.json().key as string;
      assetKeys.push(key);
      return key;
    };
    const seedAddress = async () => {
      const address = await wallet.newAddress();
      addresses.push(address);
      await pool.query('INSERT INTO address_pool(address) VALUES($1)', [address]);
      return address;
    };

    t.after(async () => {
      try {
        await pool.query('DELETE FROM payouts WHERE ref_id IN (SELECT id FROM orders WHERE buyer_id=ANY($1::uuid[]) OR listing_id=ANY($2::uuid[]))', [accountIds, listingIds]);
        await pool.query('UPDATE orders SET payment_id=NULL WHERE buyer_id=ANY($1::uuid[]) OR listing_id=ANY($2::uuid[])', [accountIds, listingIds]);
        await pool.query('DELETE FROM payments WHERE ref_id IN (SELECT id FROM orders WHERE buyer_id=ANY($1::uuid[]) OR listing_id=ANY($2::uuid[]))', [accountIds, listingIds]);
        await pool.query('DELETE FROM orders WHERE buyer_id=ANY($1::uuid[]) OR listing_id=ANY($2::uuid[])', [accountIds, listingIds]);
        await pool.query('DELETE FROM offers WHERE buyer_id=ANY($1::uuid[]) OR listing_id=ANY($2::uuid[])', [accountIds, listingIds]);
        await pool.query('DELETE FROM listings WHERE id=ANY($1::uuid[])', [listingIds]);
        await pool.query('DELETE FROM uploaded_assets WHERE owner_id=ANY($1::uuid[])', [accountIds]);
        await pool.query('DELETE FROM accounts WHERE id=ANY($1::uuid[])', [accountIds]);
        await pool.query('DELETE FROM address_pool WHERE address=ANY($1::text[])', [addresses]);
        for (const key of assetKeys) { try { unlinkSync(`./storage/private/${key}`); } catch {} }
      } finally { await app.close(); await pool.end(); }
    });

    const seller = await signup(aliases[0]!);
    const buyer = await signup(aliases[1]!);
    const other = await signup(aliases[2]!);
    assert.equal((await request('GET', '/api/listings/mine')).statusCode, 401);
    assert.equal((await request('POST', '/api/logout')).statusCode, 403, 'mutations require the CSRF header');
    assert.equal((await request('GET', '/api/offers', undefined, other.cookie)).statusCode, 200);

    assert.equal((await mutate('PUT', '/api/me/payout', { address: 'utest1sellerpayoutaddress123456' }, seller.cookie)).statusCode, 200);
    const fileKey = await uploadPrivate(seller.cookie, Buffer.from('private integration item'));
    const preview = await mutate('POST', '/api/assets/previews', Buffer.from('<script>'), seller.cookie, {
      'content-type': 'application/octet-stream', 'x-asset-type': 'image/png',
    });
    assert.equal(preview.statusCode, 400, 'spoofed preview MIME must be rejected');
    const listingId = await createListing(seller.cookie, fileKey, `Artwork ${tag}`);
    assert.equal((await mutate('POST', '/api/listings', {
      title: `Stolen ${tag}`, delivery: 'download', fileKey, priceUsdCents: 500,
    }, buyer.cookie)).statusCode, 403, 'uploads belong to their uploader');

    const offerResponse = await mutate('POST', `/api/listings/${listingId}/offers`, { amountUsdCents: 300 }, buyer.cookie);
    assert.equal(offerResponse.statusCode, 200, offerResponse.body);
    const offerId = offerResponse.json().offerId as string;
    assert.equal((await request('GET', '/api/offers', undefined, other.cookie)).json().length, 0,
      'an unrelated account cannot view private offers');
    const publicListing = (await request('GET', `/api/listings/${listingId}`)).json();
    assert.equal('amount_usd_cents' in publicListing, false, 'public listing does not expose offer value');
    assert.equal((await request('GET', '/api/offers', undefined, seller.cookie)).json()[0].amount_usd_cents, 300);
    assert.equal((await mutate('POST', `/api/offers/${offerId}/action`, { action: 'accept' }, other.cookie)).statusCode, 403);
    assert.equal((await mutate('POST', `/api/offers/${offerId}/action`, { action: 'accept' }, seller.cookie)).statusCode, 200);

    await seedAddress(); await seedAddress(); await seedAddress();
    const checkout = await mutate('POST', `/api/listings/${listingId}/checkout`, { offerId }, buyer.cookie);
    assert.equal(checkout.statusCode, 200, checkout.body);
    const purchase = checkout.json();
    orderIds.push(purchase.orderId);
    assert.equal((await request('GET', `/api/orders/${purchase.orderId}`, undefined, other.cookie)).statusCode, 404,
      'orders are private to the buyer');
    assert.equal((await request('GET', `/api/orders/${purchase.orderId}/payment`, undefined, buyer.cookie)).statusCode, 200);
    wallet.simulatePayment(purchase.payment.address, BigInt(purchase.payment.amountZat), 'wrong-invoice-memo');
    await scanOnce(wallet);
    assert.equal((await pool.query('SELECT status FROM orders WHERE id=$1', [purchase.orderId])).rows[0].status,
      'awaiting_payment', 'a note with the wrong memo cannot pay this order');
    wallet.simulatePayment(purchase.payment.address, BigInt(purchase.payment.amountZat), purchase.payment.memo);
    await scanOnce(wallet);
    await scanOnce(wallet);
    assert.equal((await pool.query('SELECT status FROM orders WHERE id=$1', [purchase.orderId])).rows[0].status, 'funded');
    assert.equal((await pool.query("SELECT count(*)::int AS n FROM payouts WHERE kind='seller_sale' AND ref_id=$1", [purchase.orderId])).rows[0].n, 0,
      'funding does not enqueue a seller payout');
    const download = await mutate('POST', `/api/files/${listingId}`, { receiptCode: purchase.receiptCode },buyer.cookie);
    assert.equal(download.statusCode, 200, download.body);
    assert.equal(download.body, 'private integration item');
    const confirmed=await mutate('POST',`/api/orders/${purchase.orderId}/confirm-delivery`,{receiptCode:purchase.receiptCode,assetSha256:createHash('sha256').update(download.rawPayload).digest('hex')},buyer.cookie);
    assert.equal(confirmed.statusCode,200,confirmed.body);
    assert.equal((await pool.query('SELECT status FROM orders WHERE id=$1',[purchase.orderId])).rows[0].status,'paid');
    assert.equal((await pool.query("SELECT count(*)::int AS n FROM payouts WHERE kind='seller_sale' AND ref_id=$1",[purchase.orderId])).rows[0].n,1,'acceptance queues exactly one payout');
    assert.equal((await mutate('POST', `/api/files/${listingId}`, { receiptCode: 'invalid-receipt-code' })).statusCode, 404);

    const secondListing = await createListing(seller.cookie, fileKey, `Late artwork ${tag}`);
    await seedAddress();
    const lateCheckout = await mutate('POST', `/api/listings/${secondListing}/checkout`, {}, other.cookie);
    assert.equal(lateCheckout.statusCode, 200, lateCheckout.body);
    const latePurchase = lateCheckout.json();
    orderIds.push(latePurchase.orderId);
    await pool.query("UPDATE orders SET expires_at=now()-interval '1 second' WHERE id=$1", [latePurchase.orderId]);
    await tx(c => releaseExpired(c));
    assert.equal((await pool.query('SELECT status FROM orders WHERE id=$1', [latePurchase.orderId])).rows[0].status, 'expired');
    wallet.simulatePayment(latePurchase.payment.address, BigInt(latePurchase.payment.amountZat), latePurchase.payment.memo);
    await scanOnce(wallet);
    assert.equal((await pool.query('SELECT status FROM orders WHERE id=$1', [latePurchase.orderId])).rows[0].status, 'refund_due');
    const refund = await mutate('POST', '/api/refunds/late', {
      receiptCode: latePurchase.receiptCode, address: 'utest1buyerrefundaddress123456',
    });
    assert.equal(refund.statusCode, 200, refund.body);
    assert.equal((await pool.query('SELECT status FROM orders WHERE id=$1', [latePurchase.orderId])).rows[0].status, 'refund_queued');
    assert.equal((await mutate('POST', '/api/refunds/late', {
      receiptCode: latePurchase.receiptCode, address: 'utest1buyerrefundaddress123456',
    })).statusCode, 409, 'a refund claim cannot be replayed');

    const raceListing = await createListing(seller.cookie, fileKey, `Race artwork ${tag}`);
    const [left, right] = await Promise.all([
      mutate('POST', `/api/listings/${raceListing}/checkout`, {}, buyer.cookie),
      mutate('POST', `/api/listings/${raceListing}/checkout`, {}, other.cookie),
    ]);
    assert.deepEqual([left.statusCode, right.statusCode].sort(), [200, 409], 'only one concurrent checkout reserves a listing');
    const winner = left.statusCode === 200 ? left.json() : right.json();
    orderIds.push(winner.orderId);
  });
