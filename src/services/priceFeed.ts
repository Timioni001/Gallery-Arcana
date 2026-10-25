import {fetch,EnvHttpProxyAgent} from 'undici';
import {pool} from '../db.ts';
import {log} from '../lib/log.ts';

/** "1161.36" -> 1_161_360_000n microdollars, exactly. Rejects anything that is not a plain positive decimal. */
export function decimalToMicroUsd(text:string){
  const m=/^(0|[1-9][0-9]{0,8})(?:\.([0-9]{1,12}))?$/.exec(text.trim());
  if(!m)throw new Error('Invalid price');
  const micro=BigInt(m[1]!)*1_000_000n+BigInt((m[2]??'').padEnd(6,'0').slice(0,6));
  if(micro<=0n)throw new Error('Invalid price');
  return micro;
}

export type Source={name:string;url:string;extract:(body:string)=>string};
// Each extractor returns the decimal text as published, never a parsed float.
export const SOURCES:Source[]=[
  {name:'kraken',url:'https://api.kraken.com/0/public/Ticker?pair=ZECUSD',extract:b=>{const j=JSON.parse(b);if(j.error?.length)throw new Error('source error');return String(Object.values(j.result as Record<string,{c:string[]}>)[0]!.c[0]);}},
  {name:'coinbase',url:'https://api.coinbase.com/v2/prices/ZEC-USD/spot',extract:b=>{const j=JSON.parse(b);if(j.data?.base!=='ZEC'||j.data?.currency!=='USD')throw new Error('pair');return String(j.data.amount);}},
  {name:'gemini',url:'https://api.gemini.com/v1/pubticker/zecusd',extract:b=>String(JSON.parse(b).last)},
  {name:'coingecko',url:'https://api.coingecko.com/api/v3/simple/price?ids=zcash&vs_currencies=usd',extract:b=>{const m=/"zcash"\s*:\s*\{\s*"usd"\s*:\s*([0-9]+(?:\.[0-9]+)?)\s*\}/.exec(b);if(!m)throw new Error('shape');return m[1]!;}},
];

/** Median of at least `minSources` quotes, refused when they spread more than `maxSpreadBps`. */
export function aggregate(quotes:{name:string;micro:bigint}[],minSources=2,maxSpreadBps=200){
  if(quotes.length<minSources)throw new Error('Not enough price sources');
  const sorted=[...quotes].sort((a,b)=>a.micro<b.micro?-1:a.micro>b.micro?1:0);
  const lo=sorted[0]!.micro,hi=sorted.at(-1)!.micro;
  if((hi-lo)*10_000n>lo*BigInt(maxSpreadBps))throw new Error('Price sources disagree');
  const mid=Math.floor(sorted.length/2);
  return sorted.length%2?sorted[mid]!.micro:(sorted[mid-1]!.micro+sorted[mid]!.micro)/2n;
}

const dispatcher=new EnvHttpProxyAgent();
async function fetchSource(s:Source){
  const res=await fetch(s.url,{dispatcher,redirect:'error',signal:AbortSignal.timeout(5000),headers:{accept:'application/json'}});
  if(!res.ok){await res.body?.cancel();throw new Error('status');}
  const body=await res.text();if(body.length>65536)throw new Error('size');
  return decimalToMicroUsd(s.extract(body));
}

/** Worker job: fetch, aggregate and store one quote. Failures store nothing, so checkout pauses rather than guessing. */
export async function refreshQuote(sources=SOURCES,fetcher=fetchSource){
  const results=await Promise.allSettled(sources.map(async s=>({name:s.name,micro:await fetcher(s)})));
  const quotes=results.flatMap(r=>r.status==='fulfilled'?[r.value]:[]);
  try{
    const rate=aggregate(quotes);
    await pool.query('INSERT INTO price_quotes(rate_micro_usd,sources) VALUES($1,$2)',[rate.toString(),JSON.stringify(quotes.map(q=>({name:q.name,micro:q.micro.toString()})))]);
    await pool.query("DELETE FROM price_quotes WHERE fetched_at<now()-interval '7 days'");
    return rate;
  }catch(error){log('price_quote_unavailable',{level:'warn',code:(error as Error).message.slice(0,40)});throw error;}
}
