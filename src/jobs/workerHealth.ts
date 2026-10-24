import type {Db} from '../db.ts';

/** Call only while holding the process-lifetime worker advisory lock. */
export async function registerWorker(db:Db,instanceId:string){
  await db.query(`INSERT INTO worker_health(name,instance_id,ready,heartbeat_at) VALUES('payments',$1,false,now())
    ON CONFLICT(name) DO UPDATE SET instance_id=EXCLUDED.instance_id,ready=false,heartbeat_at=now()`,[instanceId]);
}

/** Ownership fencing prevents a disconnected/draining predecessor from writing. */
export async function heartbeatWorker(db:Db,instanceId:string,ready:boolean){
  const result=await db.query(`UPDATE worker_health SET ready=$2,heartbeat_at=now()
    WHERE name='payments' AND instance_id=$1`,[instanceId,ready]);
  return result.rowCount===1;
}
