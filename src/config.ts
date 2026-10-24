const env = process.env;
const need = (name: string, fallback: string) => env[name] || fallback;

export const config = {
  databaseUrl: need('DATABASE_URL', 'postgres://arcana:arcana@localhost:5432/arcana'),
  port: Number(need('PORT', '8080')),
  network: need('ZCASH_NETWORK', 'test') as 'test' | 'main',
  walletDriver: need('WALLET_DRIVER', 'mock') as 'mock' | 'zallet',
  zalletUrl: need('ZALLET_RPC_URL', 'http://127.0.0.1:28232'),
  zalletUser: env.ZALLET_RPC_USER ?? '',
  zalletPass: env.ZALLET_RPC_PASS ?? '',
  adminToken: need('ADMIN_TOKEN', 'change-me'),
  minConfirmations: Number(need('MIN_CONFIRMATIONS','1')),
  zecUsdFixed: Number(need('ZEC_USD_FIXED', '40')),
  publicOrigin: env.PUBLIC_ORIGIN ?? '',
  storageDir: need('STORAGE_DIR', './storage'),
  sessionDays: 30,
  addressPoolTarget: 30,
};

// The real wallet RPC mapping, live exchange-rate source, custody process, and
// payout reconciliation must be verified before mainnet is enabled.
if (config.network === 'main') throw new Error('Mainnet disabled: real wallet integration and oracle have not been production-verified');
if (config.walletDriver !== 'mock') throw new Error('Real Zallet wallet adapter disabled: unsupported payment receiver scanning; use mock locally and read docs/ZALLET_GAP.md');
if (process.env.NODE_ENV === 'production') throw new Error('This reference backend must not run in production: mock checkout can be simulated and real Zcash has not been verified');
if (!Number.isFinite(config.zecUsdFixed) || config.zecUsdFixed <= 0) throw new Error('Invalid ZEC_USD_FIXED');
if (process.env.NODE_ENV==='production' && !/^[a-f0-9]{64}$/i.test(process.env.ASSET_ENCRYPTION_KEY??''))
  throw new Error('Production requires a generated ASSET_ENCRYPTION_KEY');
