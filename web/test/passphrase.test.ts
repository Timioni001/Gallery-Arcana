import { test } from 'node:test'
import assert from 'node:assert/strict'
import { wordlist } from '@scure/bip39/wordlists/english.js'
import { generatePassphrase } from '../src/lib/passphrase.ts'

test('generator uses eight independent, unbiased 11-bit word selections', () => {
  const original = crypto.getRandomValues
  const choices = [0, 2047, 2048, 65535, 4096, 4097, 5000, 12345]
  let calls = 0
  Object.defineProperty(crypto, 'getRandomValues', { configurable: true, value: (array: Uint16Array) => {
    assert.ok(array instanceof Uint16Array)
    assert.equal(array.length, 8)
    array.set(choices); calls++; return array
  } })
  try {
    assert.equal(wordlist.length, 2048)
    assert.equal(new Set(wordlist).size, 2048)
    assert.deepEqual(generatePassphrase().split(' '), choices.map(n => wordlist[n % 2048]))
    assert.equal(calls, 1)
  } finally { Object.defineProperty(crypto, 'getRandomValues', { configurable: true, value: original }) }
})

test('generated phrases fit the existing account limits', () => {
  for (let i = 0; i < 100; i++) {
    const pass = generatePassphrase()
    assert.equal(pass.split(' ').length, 8)
    assert.ok(pass.length >= 12 && pass.length <= 200)
    assert.ok(pass.split(' ').every(w => wordlist.includes(w)))
  }
})
