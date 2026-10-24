import {test} from 'node:test';
import assert from 'node:assert/strict';
import {aggregate,decimalToMicroUsd,SOURCES} from '../src/services/priceFeed.ts';

test('exchange decimals become exact integer microdollars',()=>{
  assert.equal(decimalToMicroUsd('1161.36000'),1_161_360_000n);
  assert.equal(decimalToMicroUsd('1161.6'),1_161_600_000n);
  assert.equal(decimalToMicroUsd('0.1234567'),123_456n,'sub-microdollar digits are truncated');
  for(const bad of ['','-1','1e3','NaN','01.2','1,161.00','0','0.0000001',' 12.5x'])assert.throws(()=>decimalToMicroUsd(bad),bad);
});
test('aggregation takes the median and refuses thin or divergent quotes',()=>{
  const q=(...v:number[])=>v.map((n,i)=>({name:`s${i}`,micro:BigInt(n)}));
  assert.equal(aggregate(q(100_000_000,101_000_000,100_500_000)),100_500_000n);
  assert.equal(aggregate(q(100_000_000,101_000_000)),100_500_000n);
  assert.throws(()=>aggregate(q(100_000_000)),/Not enough/);
  assert.throws(()=>aggregate(q(100_000_000,103_000_000)),/disagree/);
});
test('source extractors read the published decimal text, not floats',()=>{
  const by=Object.fromEntries(SOURCES.map(s=>[s.name,s]));
  assert.equal(by.kraken!.extract('{"error":[],"result":{"XZECZUSD":{"c":["1161.36000","0.004"]}}}'),'1161.36000');
  assert.equal(by.coinbase!.extract('{"data":{"amount":"1161.6","base":"ZEC","currency":"USD"}}'),'1161.6');
  assert.throws(()=>by.coinbase!.extract('{"data":{"amount":"1","base":"BTC","currency":"USD"}}'));
  assert.equal(by.gemini!.extract('{"last":"1161.37000"}'),'1161.37000');
  assert.equal(by.coingecko!.extract('{"zcash":{"usd":1161.72}}'),'1161.72');
});
