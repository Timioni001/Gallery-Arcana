/** Allowlisted operational metadata only: never serialize requests, exceptions or wallet responses. */
export function log(event:string,fields:{id?:string;code?:string;level?:'info'|'error'|'warn'}={}){
  const safe={time:new Date().toISOString(),event,level:fields.level??'info',
    ...(fields.id&&/^[a-f0-9-]{36}$/.test(fields.id)?{id:fields.id}:{}),
    ...(fields.code&&/^[A-Z0-9_]{1,40}$/.test(fields.code)?{code:fields.code}:{})};
  console.log(JSON.stringify(safe));
}
export function errorCode(error:unknown){
  const code=(error as {code?:unknown})?.code;
  return typeof code==='string'&&new Set(['23505','23503','23514','40001','40P01','ECONNREFUSED','ECONNRESET','ETIMEDOUT','ENOSPC']).has(code)?code:'INTERNAL';
}
