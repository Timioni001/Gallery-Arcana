# Browser client security model

The web app in `web/` runs the same `@gallery-arcana/client-crypto` source the API and tests use. Vite compiles it from `packages/client-crypto/src`, so there is one implementation.

## What stays in the browser

| Material | Where it lives | Leaves the device? |
| --- | --- | --- |
| Identity private keys (HPKE P-256 encryption, ECDSA P-256 signing) | IndexedDB `arcana-vault/identities` | Never, except inside an encrypted backup the user downloads |
| Capsule content keys (seller) | IndexedDB `arcana-vault/capsules`, linked to the listing id | Only sealed inside a per-buyer HPKE envelope, or in the encrypted backup |
| Pinned counterparty fingerprints | IndexedDB `arcana-vault/pins` | Never |
| Receipt codes | `sessionStorage` for the current tab | Never; the order page can issue a new one |
| Plaintext of capsules, messages and evidence | Memory only, then saved to disk by the user | Never |

The server receives public identities, sealed registration answers, ciphertext capsules, signed envelopes and message/evidence envelopes.

## Identity lifecycle

1. **Create.** The browser runs `generateIdentity(accountId, origin)`, using the `origin` reported by `GET /api/health`, which is the API's `PUBLIC_ORIGIN`. The server seals a challenge to the proposed key, the browser opens it and signs it, and the key is registered (`answerRegistration`).
2. **Back up.** The browser generates a random 256-bit recovery key and downloads a JSON file. The file contains `backupIdentity()` output and every capsule content key, AES-GCM encrypted under the recovery key, with the account id as associated data. The recovery key is shown once. It is never derived from the passphrase.
3. **Restore.** On a new device, after signing in, the user selects the file and enters the recovery key. The identity is checked by `restoreIdentity()`, which performs signing and HPKE round-trip checks, and capsule keys are re-imported.
4. **Reset.** This requires the passphrase. It revokes all keys (a continuity break), creates a new identity and invalidates prepared envelopes and passports. Counterparties see a changed fingerprint.

## Trust on first use

The first time an account seals to or opens from a counterparty, the UI shows that counterparty's fingerprint for out-of-band comparison and pins it. A later mismatch is flagged as "key changed" and needs explicit confirmation. Fingerprints are SHA-256 over the canonical identity binding, shown as six groups of four hex digits.

## Capsule sale sequence

1. The seller encrypts the file locally (`encryptCapsule`). The browser uploads the canonical JSON ciphertext and checks that the server's stored SHA-256 equals its own digest.
2. The buyer, who needs registered keys, sends a request or offer.
3. The seller fetches the buyer's active identity, confirms the pin and seals `{capsuleId, ciphertextSha256, contentKey}` to the buyer (`purpose: capsule-key`, resource = listing id, 30-day expiry). The API verifies the envelope's signature and binding.
4. The buyer checks out and pays. The envelope is released only for a funded order, with the receipt code.
5. The buyer downloads the ciphertext and checks it against the order's snapshotted SHA-256. The browser then verifies the seller's envelope signature against their published key history and decrypts locally. `decryptCapsule` checks plaintext integrity. The buyer accepts using the ciphertext digest.

## Known limits

- **Client code integrity:** a compromised or malicious web bundle could exfiltrate keys. Serve `web/dist` from the same origin over HTTPS, and pin and review deployments.
- **Device storage:** browser profiles, extensions and malware on the device can read IndexedDB. Use a dedicated browser profile for high-value trades.
- **No forward secrecy:** static recipient keys mean a later key compromise exposes past envelopes addressed to that key.
- **Size limits:** capsules are limited to 16 MB and attachments or evidence files to 32 KB, both enforced by the SDK and the API.
- **Interoperability:** browser interoperability has been tested in Chromium, through Playwright journeys. Firefox and Safari have not been tested yet, and an independent cryptography review is still outstanding.


## Wallet-native payment requests

Awaiting-payment orders render a QR locally from the exact server-issued ZIP-321 URI and offer **Open in wallet** on the same device. Amount, address and memo remain unchanged. No external QR service receives invoice data. The wallet must support ZIP-321 and the correct network; this change does not add wallet software or send funds itself. Demo and mock requests are labelled simulated, with wallet launch disabled. Expired requests lose both the QR and wallet link; existing text/copy controls remain available for reference.

UI contract check: after `npm run build` and `npm run preview -- --host 127.0.0.1 --port 5188` in `web/`, run `npm run e2e:payment`. Chromium is required (`npx playwright install chromium` or `CHROMIUM_PATH`). Tests use explicit API fixtures and decode the rendered QR to verify the full URI; they are not real wallet or chain tests.
