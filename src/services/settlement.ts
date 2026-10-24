import type {PoolClient} from 'pg';
import {settlePurchase} from './checkout.ts';
export type PaymentRow={id:string;ref_id:string;usd_cents:number;expected_zat:string;received_zat:string};
export async function settle(c:PoolClient,p:PaymentRow,late:boolean){
  return settlePurchase(c,p,late);
}
