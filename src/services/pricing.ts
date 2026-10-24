import { config } from '../config.ts';

/** USD per ZEC x 1e6. Replace with a real feed (and a staleness guard) before launch. */
export interface PriceOracle { rateMicroUsd(): Promise<bigint>; }

export const fixedOracle: PriceOracle = {
  async rateMicroUsd() { return BigInt(Math.round(config.zecUsdFixed * 1e6)); },
};

let oracle: PriceOracle = fixedOracle;
export const getOracle = () => oracle;
export const setOracle = (o: PriceOracle) => { oracle = o; };
