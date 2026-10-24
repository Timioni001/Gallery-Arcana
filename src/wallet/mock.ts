import {randomBytes} from 'node:crypto';
import {config} from '../config.ts';
import type {ReceivedNote,WalletAdapter,SendLookup} from './types.ts';
export class MockWallet implements WalletAdapter{
  private notes=new Map<string,ReceivedNote[]>();
  private transfers=new Map<string,{to:string;zat:bigint;txid:string}>();
  sent:{to:string;zat:bigint;memo?:string;txid:string}[]=[];
  synced=true;
  async syncStatus(){return {ready:this.synced};}
  async newAddress(){const a=`utest1mock${randomBytes(12).toString('hex')}`;this.notes.set(a,[]);return a;}
  async received(address:string){return (this.notes.get(address)??[]).map(n=>({...n}));}
  async send(to:string,zat:bigint,memo?:string,idempotencyKey=randomBytes(16).toString('hex')){
    const prior=this.transfers.get(idempotencyKey);
    if(prior){if(prior.to!==to||prior.zat!==zat)throw new Error('Idempotency conflict');return prior.txid;}
    if(zat<=0n||zat>await this.balance())throw new Error('Invalid mock amount');
    const txid=randomBytes(32).toString('hex');
    this.transfers.set(idempotencyKey,{to,zat,txid});this.sent.push({to,zat,memo,txid});return txid;
  }
  async lookupSend(key:string):Promise<SendLookup>{const result=this.transfers.get(key);return result?{state:'found',...result}:{state:'not_found'};}
  async balance(){return 1_000_000_000_000n-this.sent.reduce((s,n)=>s+n.zat,0n);}
  simulatePayment(address:string,zat:bigint,memo:string|null,confirmations=config.minConfirmations){
    const list=this.notes.get(address);if(!list)throw new Error('Unknown mock address');
    if(zat<=0n||!Number.isSafeInteger(confirmations)||confirmations<0)throw new Error('Invalid mock note');
    const txid=randomBytes(32).toString('hex'),outputId=`${txid}:orchard:0`;
    list.push({outputId,txid,address,zat,memo,confirmations,shielded:true,canonical:true});return outputId;
  }
  setNote(outputId:string,patch:Partial<ReceivedNote>){for(const list of this.notes.values()){const note=list.find(n=>n.outputId===outputId);if(note){Object.assign(note,patch);return;}}throw new Error('Unknown mock output');}
}
