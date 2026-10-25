// Local key vault. Private identity keys and capsule content keys live only in
// this browser's IndexedDB; the server receives public keys and ciphertext.
import * as sdk from '@arcana/client-crypto'
import { api, type Account } from './api'

type CapsuleKey = { capsuleId: string; ownerId: string; listingId?: string; ciphertextSha256: string; contentKey: string; name: string; createdAt: string }
type Pin = { id: string; fingerprint: string; keyId: string; pinnedAt: string }
type StoredIdentity = { accountId: string; identity: sdk.Identity }

const DB = 'arcana-vault'
function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1)
    req.onupgradeneeded = () => {
      const db = req.result
      db.createObjectStore('identities', { keyPath: 'accountId' })
      db.createObjectStore('capsules', { keyPath: 'capsuleId' }).createIndex('listingId', 'listingId')
      db.createObjectStore('pins', { keyPath: 'id' })
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}
async function run<T>(store: string, mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await open()
  return new Promise((resolve, reject) => {
    const r = fn(db.transaction(store, mode).objectStore(store))
    r.onsuccess = () => resolve(r.result)
    r.onerror = () => reject(r.error)
  })
}

let originCache: string | null = null
/** Identities bind to the API's public origin, which differs from the page origin in development. */
export async function serverOrigin() {
  if (!originCache) originCache = (await api.health()).origin ?? window.location.origin
  return originCache
}

export const shortFingerprint = (fp: string) => fp.slice(0, 24).match(/.{4}/g)!.join(' ')

export async function localIdentity(accountId: string) {
  return (await run<StoredIdentity | undefined>('identities', 'readonly', (s) => s.get(accountId)))?.identity ?? null
}

/** The account's active server-side identity, validated locally. */
export async function activePeerIdentity(accountId: string): Promise<sdk.PublicIdentity | null> {
  const history = await api.identityHistory(accountId)
  const active = history.find((h) => !h.revoked_at)?.public_identity
  if (!active) return null
  await sdk.validatePublicIdentity(active)
  return active
}

/** Any historical identity by key id, for opening envelopes sealed before a rotation. */
export async function peerKey(accountId: string, keyId: string) {
  const entry = (await api.identityHistory(accountId)).find((h) => h.public_identity.keyId === keyId)
  if (!entry) throw new Error('Sender key not found in their published history')
  await sdk.validatePublicIdentity(entry.public_identity)
  return entry.public_identity
}

export type VaultState =
  | { state: 'ready'; identity: sdk.Identity }
  | { state: 'none' }
  | { state: 'missing-local'; fingerprint: string }
  | { state: 'stale-local'; fingerprint: string }

export async function vaultState(account: Account): Promise<VaultState> {
  const [local, server] = await Promise.all([localIdentity(account.id), activePeerIdentity(account.id)])
  if (!server) return { state: 'none' }
  if (!local) return { state: 'missing-local', fingerprint: server.fingerprint }
  if (local.public.keyId !== server.keyId) return { state: 'stale-local', fingerprint: server.fingerprint }
  return { state: 'ready', identity: local }
}

/** Generate keys, prove possession through the sealed registration challenge, then store locally. */
export async function createIdentity(account: Account) {
  const identity = await sdk.generateIdentity(account.id, await serverOrigin())
  const challenge = await api.identityChallenge(identity.public)
  await api.completeIdentity(challenge.challengeId, await sdk.answerRegistration(identity, challenge))
  await run('identities', 'readwrite', (s) => s.put({ accountId: account.id, identity }))
  return identity
}

/** Explicit continuity break: old envelopes and passports stop working. */
export async function resetIdentity(account: Account, passphrase: string) {
  await api.resetIdentity(passphrase)
  await run('identities', 'readwrite', (s) => s.delete(account.id))
  return createIdentity(account)
}

export async function saveCapsuleKey(rec: CapsuleKey) {
  await run('capsules', 'readwrite', (s) => s.put(rec))
}
export async function capsuleKeyForListing(listingId: string) {
  return (await run<CapsuleKey | undefined>('capsules', 'readonly', (s) => s.index('listingId').get(listingId))) ?? null
}
export async function listCapsuleKeys(ownerId: string) {
  return (await run<CapsuleKey[]>('capsules', 'readonly', (s) => s.getAll())).filter((c) => c.ownerId === ownerId)
}

export type PinCheck = { status: 'new' | 'match' | 'changed'; fingerprint: string; previous?: string }
export async function checkPin(ownerId: string, peer: sdk.PublicIdentity): Promise<PinCheck> {
  const pin = await run<Pin | undefined>('pins', 'readonly', (s) => s.get(`${ownerId}:${peer.accountId}`))
  if (!pin) return { status: 'new', fingerprint: peer.fingerprint }
  return pin.fingerprint === peer.fingerprint ? { status: 'match', fingerprint: peer.fingerprint } : { status: 'changed', fingerprint: peer.fingerprint, previous: pin.fingerprint }
}
export async function pinPeer(ownerId: string, peer: sdk.PublicIdentity) {
  await run('pins', 'readwrite', (s) => s.put({ id: `${ownerId}:${peer.accountId}`, fingerprint: peer.fingerprint, keyId: peer.keyId, pinnedAt: new Date().toISOString() }))
}

/** Encrypt a file into a capsule locally and upload only the ciphertext. */
export async function sealCapsule(account: Account, file: File) {
  if (file.size > 16 * 1024 * 1024) throw new Error('Capsules are limited to 16 MB')
  const { capsule, contentKey } = await sdk.encryptCapsule(new Uint8Array(await file.arrayBuffer()), { name: file.name.slice(0, 200), mime: (file.type || 'application/octet-stream').slice(0, 100) })
  const encoded = sdk.encode(capsule)
  const ciphertextSha256 = await sdk.digest(encoded)
  const uploaded = await api.uploadCapsule(encoded)
  if (uploaded.sha256 !== ciphertextSha256) throw new Error('Server stored different ciphertext than was uploaded')
  await saveCapsuleKey({ capsuleId: capsule.id, ownerId: account.id, ciphertextSha256, contentKey: sdk.b64(contentKey), name: file.name, createdAt: new Date().toISOString() })
  return { key: uploaded.key, capsuleId: capsule.id }
}

/** Seal the capsule content key to one buyer's pinned identity (the seller-side half of a capsule sale). */
export async function sealKeyForBuyer(seller: sdk.Identity, buyer: sdk.PublicIdentity, listingId: string) {
  const rec = await capsuleKeyForListing(listingId)
  if (!rec) throw new Error('This capsule’s content key is not in this browser. Restore your vault backup first.')
  const expiresAt = new Date(Date.now() + 30 * 86400000).toISOString()
  const envelope = await sdk.sealEnvelope(seller, buyer, buyer.fingerprint, {
    origin: seller.public.origin, purpose: 'capsule-key', resourceId: listingId, nonce: crypto.randomUUID(),
    senderAccountId: seller.public.accountId, recipientAccountId: buyer.accountId, expiresAt,
  }, sdk.encode({ capsuleId: rec.capsuleId, ciphertextSha256: rec.ciphertextSha256, contentKey: rec.contentKey }))
  await api.prepareCapsuleEnvelope(listingId, buyer.accountId, envelope)
}

/** Buyer-side: open the released envelope and decrypt the downloaded capsule locally. */
export async function openPurchasedCapsule(buyer: sdk.Identity, listingId: string, envelope: sdk.Envelope, ciphertext: Uint8Array) {
  const seller = await peerKey(envelope.context.senderAccountId, envelope.senderKeyId)
  const pin = await checkPin(buyer.public.accountId, seller)
  const result = await sdk.openCapsule(buyer, seller, seller.fingerprint, listingId, sdk.decode(ciphertext), envelope)
  if (pin.status === 'new') await pinPeer(buyer.public.accountId, seller)
  return { ...result, seller, pin }
}

const BACKUP_KIND = 'arcana-vault-backup/v1'
/** Offline recovery: identity and capsule keys encrypted under a random 256-bit recovery key. */
export async function exportBackup(account: Account) {
  const identity = await localIdentity(account.id)
  if (!identity) throw new Error('No local identity to back up')
  const recovery = crypto.getRandomValues(new Uint8Array(32))
  const key = await crypto.subtle.importKey('raw', recovery, 'AES-GCM', false, ['encrypt'])
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const capsules = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv, additionalData: sdk.encode([BACKUP_KIND, account.id]) }, key, sdk.encode(await listCapsuleKeys(account.id))))
  const file = { kind: BACKUP_KIND, accountId: account.id, alias: account.alias, createdAt: new Date().toISOString(), identity: await sdk.backupIdentity(identity, recovery), capsules: { iv: sdk.b64(iv), ciphertext: sdk.b64(capsules) } }
  return { recoveryKey: sdk.b64(recovery), blob: new Blob([JSON.stringify(file, null, 2)], { type: 'application/json' }) }
}

export async function importBackup(account: Account, text: string, recoveryKey: string) {
  const file = JSON.parse(text)
  if (file.kind !== BACKUP_KIND || file.accountId !== account.id) throw new Error('This backup belongs to a different account')
  const recovery = sdk.unb64(recoveryKey.trim())
  const identity = await sdk.restoreIdentity(file.identity, recovery)
  const key = await crypto.subtle.importKey('raw', recovery.slice(), 'AES-GCM', false, ['decrypt'])
  const capsules: CapsuleKey[] = sdk.decode(new Uint8Array(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: sdk.unb64(file.capsules.iv).slice(), additionalData: sdk.encode([BACKUP_KIND, account.id]) }, key, sdk.unb64(file.capsules.ciphertext).slice())))
  await run('identities', 'readwrite', (s) => s.put({ accountId: account.id, identity }))
  for (const c of capsules) await saveCapsuleKey(c)
  return { identity, capsules: capsules.length }
}

/** Attach a newly created listing id to the capsule key so the seller can find it later. */
export async function linkCapsuleToListing(capsuleId: string, listingId: string) {
  const rec = await run<CapsuleKey | undefined>('capsules', 'readonly', (s) => s.get(capsuleId))
  if (rec) await saveCapsuleKey({ ...rec, listingId })
}
