/** Address prefixes per supported network. Mainnet is deliberately absent. */
export type Network='test'|'regtest';
const HRP={test:{unified:'utest',sapling:'ztestsapling'},regtest:{unified:'uregtest',sapling:'zregtestsapling'}} as const;
export function unifiedPattern(network:Network){return new RegExp(`^${HRP[network].unified}1[a-z0-9]{15,1000}$`);}
/** Shielded-capable payout destinations: unified or Sapling. Transparent recipients are refused. */
export function shieldedDestination(network:Network){return new RegExp(`^(${HRP[network].unified}1[a-z0-9]{15,1000}|${HRP[network].sapling}1[a-z0-9]{60,100})$`);}
