import {probeZallet,ZalletReadOnlyRpc,ZalletProbeError} from '../src/wallet/zalletProbe.ts';

try{
  const rpc=new ZalletReadOnlyRpc({url:process.env.ZALLET_RPC_URL??'http://127.0.0.1:8232',user:process.env.ZALLET_RPC_USER,password:process.env.ZALLET_RPC_PASS});
  const accountId=process.env.ZALLET_ACCOUNT_ID,address=process.env.ZALLET_RECEIVE_ADDRESS;
  if(!!accountId!==!!address)throw new ZalletProbeError('CONFIGURATION');
  const report=await probeZallet(rpc,accountId&&address?{accountId,address}:undefined);
  console.log(JSON.stringify(report));
  if(!report.synchronized||report.binding!=='matched')process.exitCode=1;
}catch(error){
  console.log(JSON.stringify({readOnly:true,livePaymentsEnabled:false,status:'blocked',code:error instanceof ZalletProbeError?error.code:'INTERNAL'}));
  process.exitCode=1;
}
