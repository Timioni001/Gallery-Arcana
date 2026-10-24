# Gallery Arcana web

The frontend for the Gallery Arcana API. It uses Vite, React 19, Tailwind v4, shadcn (Base UI) primitives and lucide icons. Fonts are self-hosted through Fontsource: Geist for the interface, Instrument Serif for display text and JetBrains Mono for hashes and amounts.

## Run

```bash
npm ci
npm run dev        # http://localhost:5173
npm run build      # typecheck + production bundle in dist/
```

Start the API and worker from the repository root first (`npm run worker`, `npm run api`). The dev server proxies `/api` and `/previews` to `ARCANA_API` (default `http://localhost:8080`) and presents the API's own origin, so the API's origin check passes without changing `PUBLIC_ORIGIN`. If the API is unreachable, the market shows labelled preview listings that can't be bought.

## Routes

| Path | Page |
| --- | --- |
| `/` | Landing page |
| `/market` | Public listings with category, search and sort |
| `/listing/:id` | Listing detail: buy, private offer, counter handling; seller pause/resume |
| `/orders/:id` | Payment details (clearly marked MOCK in mock mode), live status, download with in-browser SHA-256 check, accept or dispute, fetch and verify the signed receipt |
| `/studio` | Seller and buyer workspace: listings, offers, purchases, sales, payout address |
| `/studio/new` | New listing with a public preview and an encrypted private file |
| `/observer` | Live probes made without a session, showing what an unrelated outsider can and can't read (for the demo) |
| `/auth` | Alias and passphrase login or signup |

## Production

The API sets `Content-Security-Policy: default-src 'none'` on every response, so it is not meant to serve HTML. Serve `dist/` from the same origin as the API, with a reverse proxy that forwards `/api/*` and `/previews/*`, and set `PUBLIC_ORIGIN` to that origin. Example Caddyfile:

```
arcana.example {
  handle /api/* { reverse_proxy 127.0.0.1:8080 }
  handle /previews/* { reverse_proxy 127.0.0.1:8080 }
  handle { root * /srv/arcana/web/dist; try_files {path} /index.html; file_server }
}
```

## Design notes

- The look is warm paper and ink, with one signal-orange accent. Tokens are defined in `src/index.css` (`paper`, `surface`, `fg`, `stone`, `signal`).
- Type is Geist for the interface, Geist Mono for tags, hashes and amounts, and Doto (dot-matrix) for display headlines. Full stops in display text are drawn as orange square pixels (`DotText`).
- Illustrations are generated in code, so they cost no image bytes:
  - `halftone.tsx` turns shaded shapes (padlock, sphere, listing plates) into dot matrices whose edges dissolve.
  - `iso-vault.tsx` is isometric line art of the capsule vault on a belt.
  - `connector-hero.tsx` wires the vault tile to the parties of a trade.
- Receipt codes are bearer secrets. They are kept only in `sessionStorage` for the current tab, and the order page can issue a new one.
