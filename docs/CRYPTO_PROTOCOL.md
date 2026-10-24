# Arcana client cryptography protocol v1 / commerce v0.5

This document describes implemented contracts, not an independent cryptographic audit. Production custody remains disabled. The client SDK is the versioned workspace `@gallery-arcana/client-crypto@1.0.0` in `packages/client-crypto`. `npm run crypto:build` emits browser ESM and declarations. It uses native WebCrypto and pinned `@hpke/core@1.9.0`, implementing RFC 9180 HPKE; no custom cipher, KDF or elliptic-curve arithmetic is implemented here. Protocol composition still requires independent review.

## Primitives and encoding

HPKE: DHKEM(P-256, HKDF-SHA256), HKDF-SHA256, AES-256-GCM, RFC 9180 base mode. Sender authentication is an outer ECDSA P-256/SHA-256 signature over domain-separated context, HPKE encapsulated key and ciphertext. Public EC keys use raw uncompressed 65-byte SEC1 encoding; signatures use WebCrypto's 64-byte IEEE-P1363 encoding. Binary fields use canonical unpadded base64url. JSON canonical signing inputs are fixed arrays, not object insertion order. Metadata and payloads use UTF-8. No Signal-style forward secrecy, group messaging, deniable authentication or post-compromise security is claimed.

Identity and envelope protocol versions are `v:1`. Capsule format is `v:1`. Existing acquisition attestations remain version 1; new Trade Passport claims are version 2. Unknown API fields in public identity/envelope structures are rejected. Never serialize a whole SDK `Identity` to a server: only its `.public` value is a registration input.

## Authenticated encryption identities

`generateIdentity(accountId, origin)` generates separate HPKE encryption and ECDSA signing key pairs locally. The public fingerprint is SHA-256 of UTF-8 JSON:

`["arcana-identity/v1",keyId,accountId,origin,encryptionKey,signingKey]`.

1. Authenticated account posts its proposed public identity to `/api/encryption/challenges`. Account UUID and exact configured origin must match. Server validates public key encodings and fingerprint.
2. Server generates a random 256-bit challenge, stores its hash and a five-minute registration statement, and HPKE-encrypts the challenge to the proposed encryption key. This proves possession of the encryption private key, not just a signature from a separate key.
3. Client `answerRegistration` decrypts the challenge, validates its account/origin/fingerprint binding and signs `["arcana-registration/v1",statement,challenge]`. A rotation also signs the same statement with the previous signing key.
4. Completion checks fresh expiry, challenge hash, new signature, old signature, epoch and current identity while serializing on the account. Only one current identity exists. Per-account monotonically increasing revisions avoid timestamp inversion/fork bugs. The used challenge is deleted. A public binding record retains the now-consumed registration nonce so clients can verify the signature chain; it is not a content key.

`verifyIdentityBinding` verifies continuity; it deliberately rejects a fresh trust root after a recovery epoch without an out-of-band decision. **Initial fingerprints require trusted out-of-band comparison or previously pinned trust.** An authenticated directory/self-signature alone cannot protect first contact against a malicious directory/server or a writable database. The SDK requires explicit peer fingerprints for encryption/decryption; a future client must not silently replace those pins with a newly fetched value.

Rotation revokes the old identity for new envelopes/messages/checkouts, revokes that account's passports, and preserves key history. Historical purchased capsule envelopes remain encrypted to the original buyer key. Keep old private keys for old messages and purchased files. Existing conversations pin their original pair: after rotation create a new conversation with the new pinned identities. A passphrase-confirmed `/api/encryption/reset` revokes identities/passports and increments the continuity epoch. It restores the ability to register new keys, **not old plaintext**.

`backupIdentity(identity, recoveryKey)` encrypts private JWKs using AES-256-GCM, a random 96-bit IV and AAD `["arcana-identity-backup/v1"]`. Recovery material must be a cryptographically random 32-byte key retained separately offline, not a padded password. `restoreIdentity` verifies the public identity and both restored private-key relationships. Keys are exportable for this backup facility; no secure memory erasure or protection against compromised client code is promised. Keep purchased ciphertext/key envelopes and old identity backups; without those keys no server reset can recover plaintext.

## Capsules: local encryption and chunk authentication

`encryptCapsule(bytes,{name,mime},chunkSize?)` generates a new random 32-byte content key and random 8-byte nonce prefix per product. Plaintext size is 1 byte–16 MiB; chunk size is 64 KiB–1 MiB (default 256 KiB). The complete encoded upload fits the 24 MiB capsule endpoint. Encryption is chunked but this version materializes the bundle in memory; it is not an unlimited streaming storage service.

The clear bundle header contains `v,id,chunkSize,size,prefix`; `metadata` and `chunks[]` contain AES-GCM ciphertext/tag. Metadata contains the encrypted filename, MIME and plaintext SHA-256. Nonces are `prefix || uint32_be(index)`, using 0 for metadata and 1..N for chunks. Each encryption authenticates:

`["arcana-capsule/v1",capsuleId,chunkSize,size,prefix,chunkCount,index]`.

Count, order, truncation and size are authenticated, then local decryption verifies the plaintext digest. SDK encryption never accepts a caller-reused content key. File size/chunk count remain visible; no length-hiding or padding guarantee is made.

Post `encode(capsule)` as octet-stream to `/api/capsules`. The server validates the bounded format, stores only ciphertext inside the existing server-at-rest encryption layer, and returns a storage key and ciphertext SHA-256. Listing mode derives from the owned upload and cannot be upgraded merely by a caller-supplied label. Existing `/api/assets/private` products remain explicitly `server` mode and operator-decryptable. Public listing titles/descriptions are still plaintext; use generic labels, unlisted visibility or private invitations for sensitive products.

The seller calls `capsuleKeyEnvelope` after learning the pinned buyer identity and listing UUID. The HPKE-encrypted payload contains `{capsuleId,ciphertextSha256,contentKey}`. Its signed context binds the origin, purpose `capsule-key`, listing, sender/recipient accounts and key IDs, random nonce and expiry. Seller uploads this encrypted envelope before checkout. The server cannot validate the underlying key's correctness; a malicious seller can prepare a bad key. The buyer's independent decryption/acceptance and dispute hold address this failure, not a claim of trustless fair exchange.

Checkout requires a prepared envelope for the current listing revision and active seller/buyer identities with at least one hour of remaining eligibility. It snapshots the envelope reference. No buyer-accessible API exposes the envelope before funded/paid/disputed state plus buyer session and receipt checks. After funding, pre-checkout envelope expiry no longer prevents historical delivery: ciphertext is not cryptographically made undecryptable by a timestamp. This allows seller disappearance/rotation after checkout without needing another seller action. `openCapsule` accepts such historical key envelopes while still checking signatures, pins and product binding. Payment review/refund blocks new API delivery, but cannot undo an already released key or file.

For capsule orders, the server's existing `file_sha256`, acceptance digest and version-1 acquisition proof refer to **encoded ciphertext bytes**, not the private plaintext digest. The buyer verifies the inner digest locally and submits the ciphertext digest when accepting. No plaintext digest is uploaded by the SDK.

## Encrypted conversations and attachments

Create a conversation for a listing using both active identities. It pins buyer/seller key IDs, membership and an expiry (1–30 days). Invitation-only listings additionally require the invitation capability in the request body. `encryptConversation` produces two fresh HPKE envelopes of the same payload, one for each participant, signed by the sender. Each signed context includes purpose `message`, conversation UUID, exact origin, sender/recipient accounts/key IDs, message UUID and expiry. Both copies use the same message UUID but fresh HPKE encapsulations and recipient-bound contexts; they do not reuse an AEAD key/nonce.

The server checks membership, both recipient identities, sender signature and context, caps expiry at the conversation deadline, serializes sequence allocation, and rejects duplicate message UUIDs. It stores ciphertext only. A malicious sender could intentionally send different signed payloads to each participant; equal-plaintext consistency across copies is not proven.

Plaintext payload is at most 64 KiB including attachments. `attachment(name, bytes)` creates a digest-bearing attachment (max 32 KiB); `openConversation` checks attachment digests after authenticated decryption. Up to eight attachments are supported within the aggregate size limit. This is a bounded encrypted attachment facility, not arbitrary large-file chat storage. Each conversation holds at most 500 messages; each buyer has at most 25 active conversations.

Financial offer/counter amounts and state transitions still use the existing backend-verifiable offer services and remain visible to the custodial operator. Only the optional conversation body/attachments are E2E encrypted. Legacy offers and dispute reason fields are plaintext access-controlled records. There is no claim that invoice amounts, timing, membership or every negotiation field are concealed.

Messages expire server-side; a participant can delete a conversation immediately. Hourly cleanup cascades expired message deletion. No server deletion can erase downloaded copies, recipient backups or infrastructure snapshots.

## Consent-based evidence

An operator assigns an independent reviewer account/identity to a disputed order. Participants fetch that assignment, explicitly pin the reviewer, choose content themselves, and submit an HPKE envelope with purpose `evidence`, order UUID, nonce and `consent:true`. The server never automatically decrypts conversations or products. Evidence is sender-signed and capped at 64 KiB; content/attachments are authenticated as part of the encrypted payload.

Only the assigned reviewer account can retrieve evidence; only its recipient private key decrypts it. A shared admin token alone cannot fetch/decrypt it. Assignment replacement is explicit (`replaceAssignment:true`); participants must pin the replacement and re-encrypt selected new evidence. Historical packages cannot be automatically re-encrypted, and disclosure to a previous reviewer cannot be undone.

Packages expire at their signed deadline or 30 days, whichever is earlier. Successful resolution atomically writes one append-only decision with submitted package hashes and queues release/refund. Hashes record packages present at the decision, not proof someone reviewed them. Database triggers reject application-level UPDATE/DELETE of decisions; a privileged database owner can disable triggers or restore a backup. Shared-token decisions are not attributable to an individual operator.

A selected statement establishes who submitted that signed package, not that its text is true, originally written by the counterparty, legally licensed or satisfactory. Reviewers cannot verify undisclosed context automatically. No zero-knowledge dispute protocol, automated truth adjudication or external ownership transfer is implemented.

## Trade Passport v2

Authenticated users explicitly request an audience-bound certificate for their completed buyer-confirmed acquisition or a minimum number of their seller deliveries. Exact counts are opt-in. A proof carries a fresh serial, issuer key ID, kind, issue/expiry times, audience, holder fingerprint and the selected fact. It excludes source order/listing IDs, asset hashes, amounts, addresses and counterparties. It is not publicly listed/searchable; only its owner receives it for consent-based sharing.

Canonical bytes are UTF-8 JSON:
`["arcana-trade-passport/v2",2,id,keyId,kind,issuedAt,expiresAt,audience,holderFingerprint,minimum,disclosedCountOrNull]`.

The issuer uses existing Ed25519 keys; key ID is SHA-256 of public SPKI DER. The registry retains verification-key history. Online verification checks strict format, signature, audience, expiry and proof/issuer revocation. Owners can revoke proofs; the protected operator endpoint revokes compromised issuer keys. A revoked current issuer blocks new acquisition release/passport issuance/readiness until keys are rotated. Provision a new pair in a new directory and change configured paths; never overwrite existing keys. Old version-2 proofs remain verifiable with their historical key unless revoked/expired. Version-1 acquisition receipts retain their legacy format/current-key verification endpoint; old public keys allow independent historical verification.

`verifyPassportSignature` performs browser-compatible offline signature/key-ID/audience/time checks. It does not check live revocation. `passportPresentation` and `verifyPassportPresentation` bind a holder signature to a fresh relying-party nonce. The relying party must generate, expire and consume that nonce itself, separately verify the issuer proof, and check online revocation when required. Issuer validity alone is not proof that a presenter controls the holder key.

Holder fingerprints and repeated serials are linkable. This is selective issuance of small signed claims, not zero-knowledge selective disclosure or demonstrated unlinkability. Payment review revokes affected acquisition and seller-threshold proofs conservatively. Current operator/database records remain a trust dependency.

## Outside the guarantees

Malicious server-delivered client code, browser extensions, compromised endpoints, lost/reused weak recovery keys, dishonest counterparties, initial directory substitution without independent pins, privileged early release of prepared envelopes, recipient redistribution, traffic analysis and client-memory compromise are outside ordinary ciphertext-storage protection. A database/storage-only observer without client keys cannot decrypt capsules, messages or evidence; writable database compromise can alter policy/state, substitute unpinned first-contact keys, roll back revocation or deny service. The operator still knows identities, routing metadata, amounts, invoice/payout information and timing. Purchased capsule envelope routing is retained for recovery even after financial-link cleanup; do not claim complete transaction unlinking.

Modern secure-context browsers with WebCrypto are required; offline Ed25519 verification additionally needs Ed25519 WebCrypto support. Browser-target TypeScript compilation and Node 22/24 exercises are available; a real-browser interoperability/security review remains outstanding. Real shielded Zcash is separately blocked in ZALLET_GAP.md. No UI or production-custody activation is included.
