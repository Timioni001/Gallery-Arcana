# Gallery Arcana — product demonstration audit

Reviewed 2026-10-25, repository `Timioni001/Gallery-Arcana`, source revision `15cb1f8` (latest fetched `main`). Application inspected read-only in a separate worktree. No application code or production data is changed by this audit. No AGENTS.md instructions were present.

## Scope surveyed

Reviewed repository history since `55ae732`, root and web package/configuration, README, capability/validation/threat/protocol/operations documentation, browser client and demo guides, real-wallet and regtest runbooks, HTTP routes and domain-service boundaries, worker jobs, wallet adapter implementation, migration inventory through 014, unit/integration/browser test inventory, CI workflows, deployment stack, Cloudflare Worker and waitlist, all web page/component and design-token inventory, static-demo implementation and generative art collection.

This is a product/source audit for video production, not a new security certification or claim that every historical test was rerun. Test results recorded during video capture should be reported separately.

## Changes beyond the prior backend delivery

- React 19 / Vite / Tailwind browser application, real browser cryptography, private commerce workspaces and Playwright journeys.
- Warm paper/ink visual identity, bespoke wordmark, isometric vault, dot-matrix typography and illustrations.
- Arcana Fragments: 15 seeded CMYK generative SVG works, public previews and encrypted originals in the browser demo.
- Zallet worker adapter, history snapshots, durable submission reconciliation, market price quorum and transparent per-order platform-fee snapshots.
- Regtest tooling, operator CLI, WSL setup, full-stack development command, Cloudflare Tunnel deployment and backup scripts.
- Browser-only interactive demo with simulated counterparties/autopay; Cloudflare static assets plus waitlist endpoint/storage.

## What can be shown accurately

| Product statement | Implementation / evidence boundary |
| --- | --- |
| Create an alias without email or phone | Real account API and browser signup. Do not equate pseudonyms with anonymity. |
| Encrypt a product before upload | Browser client invokes shared SDK; authenticated AES-GCM chunks, private metadata, ciphertext digest cross-check. Maximum plaintext capsule 16 MiB. |
| Seal a key to one buyer | Seller prepares a signed HPKE key envelope bound to the listing/revision and buyer identity before checkout. |
| Negotiate privately | Offer/counter access is participant-only. Conversation bodies and small attachments are encrypted client-side. Financial amounts and routing metadata remain operator-visible. |
| Verify locally, then approve delivery | Buyer receives funded envelope, downloads ciphertext, checks integrity, decrypts locally and explicitly accepts. Operator dispute resolution is an alternate release/refund path. |
| Keep transaction history private | No public offer/order/history feed. Public listing data remains visible, including seller alias/title/price/status. |
| Share a minimal passport | Platform-signed, audience-bound claim and holder-nonce proof; not zero-knowledge, legal title, unlinkability or independent chain proof. |
| One-time private invitations | Expiring, revocable, optionally buyer-restricted capability with atomic redemption. Browser carries capability in URL fragment and sends in request body. |
| Choose evidence to disclose | Participant explicitly encrypts selected evidence to an assigned reviewer. No automatic conversation decryption. |
| Check asset control | DNS/public GitHub/signed EVM-message challenges show technical control at a time. No automatic external asset transfer or custody. |

## Architecture and trust boundaries

1. Browser: private identity keys and seller capsule keys in IndexedDB; plaintext processed locally; encrypted offline backup with independent recovery key. Browser profile compromise or malicious delivered JavaScript can expose those keys.
2. Same-origin web/API: React client, Fastify sessions, CSRF checks, participant authorization, public previews, private ciphertext delivery.
3. PostgreSQL: transactional listings/offers/reservations/orders, invoice attribution, key-envelope routing, job state, receipts, fees and administrative decisions. It stores metadata the operator needs.
4. Worker: independent wallet adapter, readiness/heartbeat, exact output attribution, confirmations, payout queue/reconciliation, retention and optional price refresh.
5. Storage: legacy files are operator-decryptable at rest; Capsules contain an additional client encryption layer whose content keys the real backend does not receive.
6. Settlement: local capture should use real API/PostgreSQL/worker plus the durable mock wallet. Simulated payment is not live Zcash activity. The newer Zallet adapter is configurable only with explicit in-progress testnet acknowledgment; public testnet acceptance remains unverified. Mainnet is not an accepted network configuration.

Initial fingerprints require trusted comparison. Static recipient keys do not provide Signal-style forward secrecy. A platform signature does not establish authenticity, licensing, legal ownership or satisfaction. Previously delivered files/keys cannot be revoked from a recipient.

## Static demo differs from the full application

`VITE_DEMO=1` activates `web/src/demo/server.ts`; it answers the API contract inside the visitor's browser and persists state in IndexedDB. Sample sellers respond automatically and payments fund after approximately six seconds. The real SDK still performs local encryption, sealing, signatures and decryption.

However, simulated sellers' private keys/content keys live in the same browser demo state. This deployment is not evidence of separate-party/server isolation. Demo receipt signing uses ECDSA, while the actual backend signs Ed25519 receipts. Its account persistence and authentication are demonstration implementations, not the server session boundary.

If browser-demo footage is used, retain or add: **“Interactive browser demo · simulated sellers & payments.”** If full-stack mock capture is used, label: **“Local product demo · simulated settlement.”** Do not edit a simulated status into a live-chain status.

## Existing design language

| Element | Source / value |
| --- | --- |
| Paper | `oklch(0.958 0.006 85)` |
| Card / surface | `oklch(0.988 0.003 85)` |
| Ink | `oklch(0.2 0.006 70)` |
| Signal orange | `oklch(0.645 0.19 38)` |
| Stone | `oklch(0.6 0.012 75)` |
| Display | Doto variable, heavy uppercase dot matrix; full stops become orange square pixels |
| Interface / technical labels | Geist / Geist Mono, self-hosted Fontsource |
| Brand | Custom `Mark` and `Wordmark` SVG in `web/src/components/brand.tsx` |
| Illustration | Code-generated halftone padlock, sphere, isometric line-art vault and connector diagram |
| Artwork | `web/src/lib/fragments.ts`: 15 deterministic CMYK SVG works, white art plates on a black collection section |

Use restrained paper backgrounds, fine lines, grid textures, orange detail and slow camera pushes. Existing design comments explicitly prefer line art/dot texture over decorative gradients. Use warm ambient music and concise on-screen language rather than dense security claims.

## Proposed 90-second editorial map / exact short copy

| Time | Real footage / explanation | Main text | Supporting text |
| --- | --- | --- | --- |
| 00–08 | Brand and original vault motif | **Discover. Negotiate. Exchange. Privately.** | Gallery Arcana |
| 08–20 | Collection → filtered market → listing | **Work worth protecting.** | Browse digital originals. Keep the transaction private. |
| 20–30 | Alias and browser-key creation | **Your alias. Your keys.** | Encryption begins on your device. |
| 30–43 | Buyer message / seller reply and offer | **A private conversation.** | Encrypted messages. Participant-only offers. |
| 43–54 | Seller sealing action + animated key path | **Sealed to one buyer.** | Prepared before checkout. Released after funding. |
| 54–65 | Checkout and funded state | **Reserved. Funded. Protected.** | Simulated payment in this demonstration. |
| 65–77 | Local decrypt/download/accept | **Verify. Then approve.** | Decrypt locally. Check integrity. Release seller proceeds. |
| 77–84 | Signed receipt / passport verification | **Share proof. Keep your history.** | A minimal platform-signed claim. |
| 84–90 | Brand end card / repository | **Private commerce, made simple.** | Gallery Arcana · Local demonstration |

Keep the mock-settlement badge visible on payment scenes and any claim about funding. Short lower-third on final card: **“Live Zcash testnet verification pending.”** An operator-visible metadata note may accompany the encrypted-conversation explanation: **“Settlement amounts remain visible to the platform.”**

## Documentary limitations and inconsistencies

- No source or record examined establishes a successful genuine public-testnet purchase/payout/refund. Fake-RPC adapter tests do not establish real binary interoperability.
- Regtest scripts/instructions exist, but their existence is not proof they were executed successfully.
- Older paragraphs in CAPABILITIES/VALIDATION/ZALLET_GAP still say no frontend, no browser testing, or all real-wallet modes disabled. They conflict with newer source and later documentation; avoid repeating those stale statements.
- New browser documentation says Chromium journeys passed; Firefox/Safari and independent protocol review remain outstanding. This audit does not certify those results anew.
- Landing-page copy mentions shielded payment ambitions. The film must separately label the actual recording's settlement mode.
- External NFT/domain/repository transfers, legal-title verification, a privacy guarantee against malicious client code, and trustless custody must not be inferred from marketplace listings.
- Full-stack deployment/backup scripts exist but do not demonstrate production security or successful recovery testing.
- Filming should use generated demo accounts and sample products only. Do not record real secrets, recovery keys, private tokens or customers.


## Final production refresh
Final captured revision: 728f3ce (2026-10-25). Re-read current README and latest changes including browser auctions, mobile layout, legal/privacy pages, and migration015 escrow review deadlines. Narration and on-screen footnotes reflect 72-hour automatic release unless disputed. The full actual browser purchase was re-recorded successfully against this revision; verification.json records decrypted-byte equality and receipt verification. Uploaded screenshots were used as visual references. No live-chain result is claimed.
