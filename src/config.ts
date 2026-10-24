import { z } from 'zod';

const positiveInt=(fallback:number,max=2_147_483_647)=>z.coerce.number().int().min(1).max(max).default(fallback);
const schema=z.object({
  DATABASE_URL:z.string().url().default('postgres://arcana:arcana@localhost:5432/arcana'),
  API_HOST:z.enum(['127.0.0.1','0.0.0.0']).default('127.0.0.1'),
  WORKER_POLL_MS:positiveInt(5000,60000),
  MOCK_SIMULATOR_TOKEN:z.string().min(32).optional(),
  PORT:positiveInt(8080,65535),
  WORKER_PORT:positiveInt(8081,65535),
  PUBLIC_ORIGIN:z.string().url().default('http://localhost:8080'),
  ZCASH_NETWORK:z.enum(['test','regtest']).default('test'),
  WALLET_DRIVER:z.enum(['mock','zallet']).default('mock'),
  ZALLET_TESTNET_ACK:z.string().optional(),
  PRICE_SOURCE:z.enum(['fixed','market']).default('fixed'),
  // Comma-separated IPs/CIDRs of the reverse proxy allowed to set X-Forwarded-For. Never 'true'.
  TRUST_PROXY:z.string().regex(/^[0-9a-f.:/,]+$/i).optional(),
  PRICE_MAX_AGE_SECONDS:positiveInt(120,900),
  MIN_CONFIRMATIONS:positiveInt(2,1000),
  ZEC_USD_FIXED:z.string().regex(/^(?:0|[1-9][0-9]{0,6})(?:\.[0-9]{1,6})?$/).default('40'),
  STORAGE_DIR:z.string().min(1).default('./storage'),
  SESSION_DAYS:positiveInt(30,90),
  SESSION_ABSOLUTE_DAYS:positiveInt(90,365),
  ADMIN_TOKEN:z.string().optional(),
  NODE_ENV:z.enum(['development','test']).default('development'),
});
export function parseConfig(env:NodeJS.ProcessEnv){
  const parsed=schema.safeParse(env);
  if(!parsed.success)throw new Error(`Invalid configuration: ${[...new Set(parsed.error.issues.map(i=>i.path.join('.')))].join(', ')}. Mainnet, production and real wallets remain disabled.`);
  const v=parsed.data;
  const origin=new URL(v.PUBLIC_ORIGIN);
  if(!['http:','https:'].includes(origin.protocol)||origin.origin!==v.PUBLIC_ORIGIN)throw new Error('PUBLIC_ORIGIN must be an exact HTTP(S) origin');
  if(origin.protocol==='http:'&&!['localhost','127.0.0.1','[::1]'].includes(origin.hostname))throw new Error('Non-local HTTP is disabled; configure HTTPS');
  if(!['postgres:','postgresql:'].includes(new URL(v.DATABASE_URL).protocol))throw new Error('DATABASE_URL must be PostgreSQL');
  const [whole,fraction='']=v.ZEC_USD_FIXED.split('.');
  const rate=BigInt(whole!)*1_000_000n+BigInt(fraction.padEnd(6,'0'));
  if(rate<=0n)throw new Error('ZEC_USD_FIXED must be positive');
  if(v.SESSION_DAYS>v.SESSION_ABSOLUTE_DAYS)throw new Error('Session idle lifetime exceeds absolute lifetime');
  // The live adapter is testnet-only and unverified until the gate in docs/ZALLET_GAP.md passes.
  if(v.WALLET_DRIVER==='zallet'&&v.ZALLET_TESTNET_ACK!=='unverified-testnet-only')throw new Error('WALLET_DRIVER=zallet requires ZALLET_TESTNET_ACK=unverified-testnet-only (testnet acceptance gate not yet passed)');
  if(v.ZCASH_NETWORK==='regtest'&&v.WALLET_DRIVER!=='zallet')throw new Error('ZCASH_NETWORK=regtest is only for verifying the Zallet adapter against a local regtest stack');
  // Regtest coins have no market value, so only testnet needs a live price.
  if(v.WALLET_DRIVER==='zallet'&&v.ZCASH_NETWORK==='test'&&v.PRICE_SOURCE!=='market')throw new Error('WALLET_DRIVER=zallet requires PRICE_SOURCE=market; the fixed demo quote is mock-only');
  return {host:v.API_HOST,workerPollMs:v.WORKER_POLL_MS,simulatorToken:v.MOCK_SIMULATOR_TOKEN,databaseUrl:v.DATABASE_URL,port:v.PORT,workerPort:v.WORKER_PORT,network:v.ZCASH_NETWORK,walletDriver:v.WALLET_DRIVER,
    minConfirmations:v.MIN_CONFIRMATIONS,priceSource:v.PRICE_SOURCE,trustProxy:v.TRUST_PROXY??false,priceMaxAgeSeconds:v.PRICE_MAX_AGE_SECONDS,rateMicroUsd:rate,publicOrigin:v.PUBLIC_ORIGIN,storageDir:v.STORAGE_DIR,
    sessionDays:v.SESSION_DAYS,sessionAbsoluteDays:v.SESSION_ABSOLUTE_DAYS,addressPoolTarget:30,
    adminToken:v.ADMIN_TOKEN&&v.ADMIN_TOKEN.length>=32&&!/replace|change-me/i.test(v.ADMIN_TOKEN)?v.ADMIN_TOKEN:null};
}
export const config=parseConfig(process.env);
