# @gallery-arcana/client-crypto 1.0.0

Browser-compatible WebCrypto/RFC 9180 HPKE utilities for Gallery Arcana protocol v1. Build from the repository with `npm ci && npm run crypto:build`. The workspace exports ESM and declarations from `dist`; it is not published to a package registry.

Use `generateIdentity`, `answerRegistration` and pinned `PublicIdentity` values for registration. Keep private `Identity` objects client-side. `encryptCapsule` returns the ciphertext bundle plus a fresh content key: upload only `encode(capsule)`, and use `capsuleKeyEnvelope` to deliver the key to the pinned buyer. After authorized funding, `openCapsule` verifies and decrypts locally. Financial acceptance uses the ciphertext digest returned by the upload, not the encrypted plaintext digest.

`encryptConversation`, `attachment`, and `openConversation` protect bounded participant messages/attachments. `sealEnvelope`/`openEnvelope` provide reviewer evidence packages with explicit purpose/resource/recipient binding. Use `backupIdentity`/`restoreIdentity` with a separate cryptographically random 32-byte recovery key, retain old private keys and keep delivered key envelopes offline. Resetting an account identity does not recover old plaintext.

`verifyPassportSignature` checks an issuer's signature, key ID, audience and time offline. Online revocation must be checked separately. `passportPresentation`/`verifyPassportPresentation` bind possession to a relying-party-generated nonce, which that party must expire and consume.

Compare first-contact fingerprints out of band. Static recipient keys provide no Signal-like forward secrecy. Malicious client code or privileged early envelope release bypasses the ordinary storage threat model. Full encodings, nonce/AAD layouts, limits, key history, recovery and caveats are in [docs/CRYPTO_PROTOCOL.md](../../docs/CRYPTO_PROTOCOL.md). Executable Node utility: `npm run journey:capsule` (authenticated local mock worker required). No genuine Zcash settlement is claimed.
