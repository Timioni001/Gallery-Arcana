# Deploy behind Cloudflare

Gallery Arcana runs as one Docker Compose stack: PostgreSQL, migrations, API, wallet worker, web server, nightly backups and a Cloudflare Tunnel. Cloudflare provides HTTPS, DNS and DDoS protection. The tunnel makes an outbound connection, so the server opens **no inbound ports**. Every service restarts on its own after crashes and reboots, and you never need to keep a terminal open.

The backend can't run on Cloudflare's serverless platform. It needs PostgreSQL, a continuously running settlement worker, native image processing and, later, a Zallet wallet. It runs on any machine with Docker, and Cloudflare sits in front.

```
visitor ──HTTPS──▶ Cloudflare ──tunnel──▶ cloudflared ─▶ Caddy (web app + /api proxy) ─▶ API ─▶ PostgreSQL
                                                                                  worker ─┘ (settlement, payouts)
```

## 1. Choose the host

- **Small VPS (recommended):** any Linux server that stays on 24/7. 2 vCPU, 4 GB RAM and 40 GB disk is plenty for mock or testnet use, before adding a Zcash node.
- **Your own machine:** this works, but the site is down whenever the machine is off. On Windows/WSL, use Docker Desktop with "Start Docker Desktop when you sign in" enabled.

Install Docker with Compose v2.24+ (Ubuntu: `sudo apt install -y docker.io docker-compose-v2 git openssl`, then `sudo usermod -aG docker $USER` and log in again).

## 2. Create the tunnel in Cloudflare

1. Add your domain to Cloudflare (Websites → Add a site) and switch its nameservers.
2. Go to **Zero Trust → Networks → Tunnels → Create a tunnel → Cloudflared**, name it `gallery-arcana`, and copy the **token** from the install command. You don't need to run their installer.
3. Under **Public Hostname**, add your hostname (for example `arcana.example.com`) with **Service** set to `HTTP` and `web:80`.
4. Recommended domain settings:
   - SSL/TLS: Edge Certificates → **Always Use HTTPS** on, and **HSTS** optional.
   - Speed: **Rocket Loader off**. It rewrites scripts and conflicts with the app's Content-Security-Policy.
   - Security: optional **WAF rate-limiting rule** on `/api/signup` and `/api/login` as defence in depth. The app also limits per IP.

## 3. Start it

```bash
git clone https://github.com/timioni001/gallery-arcana.git && cd gallery-arcana/deploy
./init.sh                       # asks for the public URL + tunnel token, generates every secret
docker compose up -d --build    # first build takes a few minutes
docker compose ps               # api and worker should become "healthy"
```

Open your hostname. The badge reads **Testnet · mock settlement**.

`init.sh` writes `deploy/.env` and `deploy/.env.worker` with `chmod 600`. Both are git-ignored. Wallet and simulator credentials exist only in `.env.worker`, which only the worker container receives.

## 4. Everyday operations

| Task | Command (run in `deploy/`) |
| --- | --- |
| Status / health | `docker compose ps` |
| Logs | `docker compose logs -f api worker` |
| Update to latest code | `git pull && docker compose up -d --build` (migrations run automatically) |
| Pay a mock invoice (demo) | `docker compose exec worker arcana-entrypoint mock-pay <memo>` |
| Operator console | `docker compose exec api arcana-entrypoint admin disputes` (`assign`, `resolve`, `set-fee`, `submissions`, …) |
| Stop / start | `docker compose stop` / `docker compose start` |

`/api/admin/*` is blocked at the web server and is reachable only from inside the API container.

## 5. Backups and recovery

- **Database:** the `backup` service writes a `pg_dump` every 24 hours to `deploy/backups/` and keeps 14 days (`BACKUP_KEEP_DAYS`). Copy that folder off the server regularly.
- **Files and signing keys** live in Docker volumes. Archive them as well:
  ```bash
  docker run --rm -v gallery-arcana_storage:/s -v gallery-arcana_secrets:/k -v "$PWD/backups":/b alpine \
    tar czf /b/files-and-keys-$(date +%F).tgz -C / s k
  ```
- **`deploy/.env`** contains `ASSET_ENCRYPTION_KEY`. Without it, server-encrypted files can't be read. Keep a copy offline.
- **Restore a database dump:**
  ```bash
  docker compose stop api worker
  docker compose exec -T db pg_restore -U arcana -d arcana --clean --if-exists < backups/arcana-<stamp>.dump
  docker compose start api worker
  ```

Capsule content keys are never on the server. Each seller keeps them in their own browser vault backup.

## 6. Live Zcash testnet later

1. Run the Z3 testnet stack on the same server (see [TESTNET_RUNBOOK.md](TESTNET_RUNBOOK.md)).
2. Add the `ZALLET_*` lines to `deploy/.env.worker`, with `ZALLET_RPC_URL=http://127.0.0.1:28232`.
3. In `deploy/.env`, set `WALLET_DRIVER=zallet`, `ZALLET_TESTNET_ACK=testnet-in-progress` and `PRICE_SOURCE=market`.
4. Start with the loopback bridge, setting `ZALLET_HOST_PORT` to the host port where Z3 publishes Zallet:
   ```bash
   ZALLET_HOST_PORT=<port> docker compose -f docker-compose.yml -f compose.zallet.yml up -d
   ```
   The bridge exposes Zallet on `127.0.0.1` inside the worker only, so the wallet RPC never touches the public network or the API container.

## What was verified

The stack was built and run end to end with a local stand-in for the tunnel:

- **Health:** all services healthy, with migrations and keys created on first boot.
- **Web server:** security headers present and `/api/admin` blocked. The app loads with no Content-Security-Policy violations.
- **Browser journeys:** both journeys passed through the web server. The first covered a capsule sale, local decryption, encrypted chat and passport verification. The second covered an invitation, dispute evidence, reviewer decryption, operator release and vault restore.
- **Operations:** mock payouts were sent, the first backup was written, the API and worker recovered after being killed, and the Zallet loopback bridge carried RPC traffic.

The Cloudflare side (tunnel token and hostname) needs your account and wasn't exercised.

## Static demo on Cloudflare Pages (no server)

This option needs no server and no machine left on. The demo build (`npm run build:demo` in `web/`) runs the marketplace entirely in the visitor's browser:

- A simulated API stores data in that browser's IndexedDB.
- Sample sellers accept offers, seal capsule keys and reply to messages automatically.
- Every payment is simulated a few seconds after checkout.
- The client cryptography is real: capsule encryption and decryption, sealed key envelopes, end-to-end encrypted chat, and signed receipts and passports (signed with a demo key held in the browser).
- A banner and the nav badge state that it is a demo, and the banner offers **Reset demo**.

Each visitor gets their own private copy. Visitors don't share data with each other.

**Cloudflare dashboard → Workers & Pages → Create → Pages → Connect to Git**, pick this repository, then set:

| Setting | Value |
| --- | --- |
| Production branch | `ccr-ba774958-2lfu3x` (or `main` after merging) |
| Framework preset | None |
| Root directory | `web` |
| Build command | `npm ci && npm run build:demo` |
| Build output directory | `dist` |
| Environment variable | `NODE_VERSION` = `22` |

Click **Save and Deploy**. After a couple of minutes the site is at `https://<project>.pages.dev`, and you can attach your own domain under **Custom domains**. Page routing falls back to `index.html` automatically, and `web/public/_headers` sets the security headers. Every push to the branch redeploys automatically.

### Cloudflare Workers (newer "Import a repository" flow)

`web/wrangler.jsonc` deploys the same static demo as a Worker. `web/worker/index.ts` serves the app and handles `POST /api/waitlist`, and on the first deploy Wrangler creates the `WAITLIST` KV namespace automatically.

| Field | Value |
| --- | --- |
| Project name | `gallery-arcana` |
| Build command | `npm ci && npm run build:demo` |
| Deploy command | `npx wrangler deploy` |
| Advanced settings → Path (root directory) | `web` |
| Advanced settings → Build variable | `NODE_VERSION` = `22` |
| Production branch | `ccr-ba774958-2lfu3x` (or `main` after merging) |

To read the waitlist, go to Storage & Databases → KV → the `WAITLIST` namespace. Each key is `waitlist:<sha256 of email>` and its value is `{ email, role, at }`. On the Docker backend, use `npm run admin -- waitlist`.
