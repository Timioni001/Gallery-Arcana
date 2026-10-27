/** No RPC submission code is loadable until the pinned-release acceptance gate is met.
 * The former prototype mixed unsupported RPCs, account creation on restart, and
 * floating-point values. Removing that executable prototype is intentional.
 * See docs/ZALLET_GAP.md and docs/zcash-versions.json for source inspection evidence.
 */
export class ZalletWallet{
  constructor(){throw new Error('Real Zallet integration is in progress and disabled. No funds may be accepted.');}
}
