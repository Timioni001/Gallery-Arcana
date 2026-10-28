import { wordlist } from '@scure/bip39/wordlists/english.js'

/** Eight independent uniform choices from 2048 words: 88 bits of entropy.
 * This is a login passphrase, not a wallet seed or encryption-key backup.
 */
export function generatePassphrase(): string {
  if (wordlist.length !== 2048) throw new Error('Unexpected passphrase word list')
  const random = crypto.getRandomValues(new Uint16Array(8))
  // 2048 divides 65536 exactly, so masking introduces no modulo bias.
  return Array.from(random, n => wordlist[n & 2047]).join(' ')
}
