export type ReceivedNote={outputId:string;txid:string;address:string;zat:bigint;memo:string|null;confirmations:number;shielded:boolean;canonical:boolean};
export type SendLookup={state:'found';txid:string;to:string;zat:bigint}|{state:'unknown'|'not_found'};
/** Worker-only boundary. received() MUST return a complete historical snapshot, including spent notes. */
export interface WalletAdapter{
  syncStatus():Promise<{ready:boolean}>;
  newAddress():Promise<string>;
  received(address:string):Promise<ReceivedNote[]>;
  send(to:string,zat:bigint,memo?:string,idempotencyKey?:string):Promise<string>;
  lookupSend(idempotencyKey:string):Promise<SendLookup>;
  balance():Promise<bigint>;
}
