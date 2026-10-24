import { config } from '../config.ts';
/** Demo USD/ZEC quote, exactly parsed into integer microdollars. Never use for real funds. */
export interface PriceOracle { rateMicroUsd(): Promise<bigint>; }
export const fixedOracle:PriceOracle={async rateMicroUsd(){return config.rateMicroUsd;}};
let oracle:PriceOracle=fixedOracle;
export const getOracle=()=>oracle;
export const setOracle=(value:PriceOracle)=>{oracle=value;};
