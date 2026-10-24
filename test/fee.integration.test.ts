import {test} from 'node:test';
import assert from 'node:assert/strict';
import {randomBytes,createHash} from 'node:crypto';
import {pool,tx} from '../src/db.ts';
import {config} from '../src/config.ts';
import {buildServer} from '../src/http/server.ts';
import {DatabaseMockWallet} from '../src/wallet/databaseMock.ts';
import {scanOnce,topUpAddressPool} from '../src/jobs/watcher.ts';
const enabled=process.env.RUN_DB_TESTS==='1'&&process.env.ARCANA_ISOLATED_TEST_DB==='1';
test('transparent completed-sale fee: disclosed, snapshotted per order, applied only on completion',{skip:!enabled},async t=>{
  const app=buildServer();await app.ready();t.after(async()=>{await app.close();await pool.end();});
  const wallet=new DatabaseMockWallet();await topUpAddressPool(wallet);let ip=80;
  const call=(method:any,url:string,body?:any,c?:{cookie:string;ip:string},extra:Record<string,string>={})=>app.inject({method,url,payload:body,remoteAddress:c?.ip??'127.0.0.1',headers:{'x-arcana-action':'1',...(c?{cookie:c.cookie}:{}),...extra}});
  const signup=async()=>{const address=`127.0.0.${ip++}`;const r=await app.inject({method:'POST',url:'/api/signup',remoteAddress:address,headers:{'x-arcana-action':'1'},payload:{alias:'f'+randomBytes(4).toString('hex'),passphrase:'fee-transparency-pass'}});return {cookie:String(r.headers['set-cookie']).split(';')[0]!,ip:address};};
  const setFee=(bps:number)=>tx(async c=>{await c.query("UPDATE settings SET value=$1::jsonb WHERE key='platform_cut_bps'",[JSON.stringify(bps)]);await c.query('INSERT INTO fee_history(fee_bps) VALUES($1)',[bps]);});
  const seller=await signup();await call('PUT','/api/me/payout',{address:'utest1mockpayout1234567890'},seller);
  const content=Buffer.from('fee test file'),digest=createHash('sha256').update(content).digest('hex');
  const order=async()=>{
    const key=(await call('POST','/api/assets/private',content,seller,{'content-type':'application/octet-stream'})).json().key;
    const listingId=(await call('POST','/api/listings',{title:'Fee '+randomBytes(3).toString('hex'),fileKey:key,priceUsdCents:1000},seller)).json().listingId;
    const buyer=await signup();return {...(await call('POST',`/api/listings/${listingId}/checkout`,{},buyer)).json(),listingId,buyer};
  };
  assert.equal((await call('GET','/api/terms')).json().platformFeeBps,0);
  await setFee(250);
  const terms=(await call('GET','/api/terms')).json();
  assert.equal(terms.platformFeeBps,250);assert.equal(terms.feeHistory[0].fee_bps,250);assert.match(terms.feeAppliesTo,/completed sales only/);
  const o=await order();
  await setFee(900); // a later change must not affect an order already checked out
  await wallet.simulatePayment(o.payment.address,BigInt(o.payment.amountZat),o.payment.memo,config.minConfirmations);await scanOnce(wallet);
  assert.equal((await call('POST',`/api/files/${o.listingId}`,{receiptCode:o.receiptCode},o.buyer)).statusCode,200);
  assert.equal((await call('POST',`/api/orders/${o.orderId}/confirm-delivery`,{receiptCode:o.receiptCode,assetSha256:digest},o.buyer)).statusCode,200);
  const expected=BigInt(o.payment.amountZat),payout=BigInt((await pool.query("SELECT zat FROM payouts WHERE ref_id=$1",[o.orderId])).rows[0].zat);
  assert.equal(payout,expected*9750n/10000n,'seller receives price minus the 2.5% snapshotted fee');
  const sale=(await call('GET','/api/sales',undefined,seller)).json().find((s:any)=>s.id===o.orderId);
  assert.equal(sale.platform_fee_bps,250);assert.equal(BigInt(sale.price_zat),expected);assert.equal(BigInt(sale.seller_payout_zat)+BigInt(sale.platform_fee_zat),expected);
  await assert.rejects(pool.query('UPDATE fee_history SET fee_bps=0'),/append-only/);
  await assert.rejects(pool.query('DELETE FROM fee_history'),/append-only/);
});
