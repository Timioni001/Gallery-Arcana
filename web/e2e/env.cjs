// Shared settings for the browser journeys. They drive the real web app, API
// and worker (mock wallet only) and need the local simulator token.
const fs = require('fs'), os = require('os'), path = require('path'), crypto = require('crypto')
const ROOT = path.resolve(__dirname, '../..')
const { execSync } = require('child_process')
const worker = fs.existsSync(path.join(ROOT, '.env.worker')) ? fs.readFileSync(path.join(ROOT, '.env.worker'), 'utf8') : ''
const TOKEN = /^MOCK_SIMULATOR_TOKEN=(.+)$/m.exec(worker)?.[1]
// Against the Docker deployment the worker and admin API are not exposed, so commands run inside the containers:
//   ARCANA_PAY_CMD='docker compose -f deploy/docker-compose.yml exec -T worker arcana-entrypoint mock-pay'
//   ARCANA_ADMIN_CMD='docker compose -f deploy/docker-compose.yml exec -T api arcana-entrypoint admin'
const PAY_CMD = process.env.ARCANA_PAY_CMD, ADMIN_CMD = process.env.ARCANA_ADMIN_CMD
if (!TOKEN && !PAY_CMD) { console.error('MOCK_SIMULATOR_TOKEN missing in .env.worker (npm run setup:wsl creates it)'); process.exit(1) }
async function mockPay(payment) {
  if (PAY_CMD) { execSync(`${PAY_CMD} ${payment.memo}`, { cwd: ROOT, stdio: 'pipe' }); return }
  const r = await fetch('http://127.0.0.1:8081/dev/pay', { method: 'POST', headers: { 'content-type': 'application/json', authorization: 'Bearer ' + TOKEN }, body: JSON.stringify({ address: payment.address, zat: payment.amountZat, memo: payment.memo }) })
  if (!r.ok) throw new Error('mock payment failed ' + r.status)
}
const admin = (args) => execSync(ADMIN_CMD ? `${ADMIN_CMD} ${args}` : `npm run admin -- ${args}`, { cwd: ROOT, stdio: 'pipe' }).toString()
const SS = fs.mkdtempSync(path.join(os.tmpdir(), 'arcana-e2e-'))
fs.writeFileSync(path.join(SS, 'secret-source.txt'), crypto.randomBytes(300).toString('base64'))
const B = process.env.ARCANA_WEB ?? 'http://localhost:5173'
const launch = (chromium) => chromium.launch(process.env.PW_CHROMIUM ? { executablePath: process.env.PW_CHROMIUM } : {})
module.exports = { SS, TOKEN, B, ROOT, launch, mockPay, admin }

// Local-only: journeys create several accounts from one IP, which the API's
// per-IP limits would otherwise block. Refuses anything but a localhost database.
async function resetLocalRateLimits() {
  if (process.env.ARCANA_SKIP_RATE_RESET === '1') return
  const env = fs.readFileSync(path.join(ROOT, '.env'), 'utf8')
  const url = /^DATABASE_URL=(.+)$/m.exec(env)?.[1] ?? 'postgres://arcana:arcana@localhost:5432/arcana'
  if (!['localhost', '127.0.0.1'].includes(new URL(url).hostname)) throw new Error('Refusing to touch a non-local database')
  const pg = require(path.join(ROOT, 'node_modules/pg'))
  const pool = new pg.Pool({ connectionString: url }); await pool.query('DELETE FROM rate_limits'); await pool.end()
}
module.exports.resetLocalRateLimits = resetLocalRateLimits
