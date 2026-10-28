# Judge presentation and checkout review

This update reviews the repository layout, current README and submission, evidence, API/payment contracts, checkout/delivery services, wallet integration, browser pages, existing tests and CI. It is a targeted engineering review, not an independent full security audit. Existing migrations, wallet workers and settlement state transitions are unchanged.

## Positioning and sources

Lead with the problem shielded payment alone does not solve: confidential delivery of the digital goods. Give judges one short path to inspect: video → simulated browser journey → recorded real local-regtest evidence. Keep v1 custody visible. Avoid speculative feature counts and unsupported claims about awards or competitors. A use-case paragraph distinguishes downloadable art, collector archives and professional files from physical delivery and external asset transfers.

- Official ZIP-321: https://github.com/zcash/zips/blob/main/zips/zip-0321.rst . Its abstract expressly describes clicking payment links and scanning QR codes. The QR and wallet link use the exact generated URI, including amount and memo; neither reconstructs money or drops fields.
- Project evidence: `docs/evidence/settlement-regtest-2026-10-27T23-55-54-663Z.json`, `verified: true`; local private chain, no-value coins. This review did not rerun Zebra/Zallet.
- Event: https://thezecathon.com/ . Access was blocked by the execution environment (CONNECT 403), so current judging weights and eligibility were not independently checked. The positioning recommendations are based on demonstrated product value and inspectable evidence, not claimed official judging rules.

QR generation runs locally using qrcode.react; no invoice is sent to a remote QR service. The wallet action requires a recognized real-wallet mode and an active invoice. Demo and mock invoices remain scannable for demonstration but cannot launch a real wallet. Compatible wallet installation, URI support and the correct network are still required. No live mobile-wallet handoff is claimed.

## Findings outside this change

1. **Checksum mismatch does not persist a hold.** `web/src/pages/Order.tsx` prevents immediate client confirmation on mismatch, but `src/services/acquisitions.ts:releaseDue` releases funded orders when their deadline passes without recording that mismatch. Unless the buyer disputes, fallback may still release. The stronger claim “a mismatch never releases” therefore exceeds the stored state machine. A future fix needs an explicit authenticated failure/hold policy and race tests.
2. **Real settlement receipts label their payment mode as mock.** `src/services/acquisitions.ts:complete` hardcodes `paymentMode:'mock'`. This does not negate the wallet transaction evidence, but the receipt should identify the actual settlement mode/network and preserve historical records.
3. **A dispute deadline is tracked, not a promise of reviewer action.** Open disputes become overdue and can be listed; there is no automatic decision after seven days. Operational reviewer staffing and escalation are required.
4. **README sequence diagram is stale.** It places seller key sealing after funding even though capsule checkout requires the buyer envelope beforehand; it also attributes the platform receipt signature to buyer approval. The prose and implementation should be reconciled in a separate documentation pass.
5. **Demo receipt algorithm label is inaccurate.** The Order page calls all receipts Ed25519; the browser demo returns ECDSA-P256. Signature verification uses the demo contract, but the descriptive label should vary by mode.

Small presentation inaccuracies corrected here: the README no longer says all real Zcash is disabled despite regtest evidence, the footer now discloses custodial v1 escrow, and real invoice addresses are no longer labelled mock on checkout. No unrelated settlement behavior was changed.

## Executed validation

- `npm run build --prefix web`: passed (includes web TypeScript check).
- `npm run build:demo --prefix web`: passed.
- `npm run lint --prefix web`: exit 0; existing warnings remain.
- `npm run typecheck`: passed for backend.
- `npm test`: 35 passed, 8 existing database-guarded skips, 0 failed.
- `npm run e2e:payment --prefix web`: all 9 UI/API-fixture scenarios passed. QR images were decoded and compared byte-for-byte to the complete URI including memo and amount. Covered real-wallet mode, mock, demo, unknown mode, expired, unsafe protocol, oversized input, expiry while open, and funded state, all at mobile width.
- Full PostgreSQL integration and live wallet/mobile handoff were not rerun for this UI/documentation change.

The web CI workflow now runs the same QR contract check after the existing production build; previous steps remain in place.
