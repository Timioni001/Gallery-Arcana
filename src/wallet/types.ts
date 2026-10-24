export type ReceivedNote = { txid: string; zat: bigint; memo: string | null; confirmations: number };

/**
 * The only surface the rest of the system sees. Swap drivers without touching business logic.
 * Only the worker process instantiates a wallet. The API never does.
 */
export interface WalletAdapter {
  /** A fresh single-use receiving address (unified address with a shielded receiver). */
  newAddress(): Promise<string>;
  /** All notes received at this address. */
  received(address: string): Promise<ReceivedNote[]>;
  /** Send from the payout wallet. Returns txid. */
  send(to: string, zat: bigint, memo?: string): Promise<string>;
  balance(): Promise<bigint>;
}
