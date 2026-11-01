import { createToolScope } from './tool-scope.mjs';
import { createHash, randomUUID } from 'node:crypto';
import { writeFileSync, readFileSync, openSync, closeSync, fstatSync, fsyncSync, linkSync, unlinkSync, constants } from 'node:fs';
import { join } from 'node:path';
import { Inbox, newSessionIdentity } from '../vendor/psst/reference/inbox.mjs';
import { BrokerClient } from '../vendor/psst/reference/client.mjs';
import { AdapterRuntime } from '../vendor/psst/reference/runtime.mjs';
import { createTools } from '../vendor/psst/reference/tools.mjs';
import { createCooperativeInbox } from './cooperative-inbox.mjs';
import { prepareStateRoot } from './connector-config.mjs';

/** Experimental native session. Caller owns the native hook permit boundary. */
export async function startNativeSession({config,conversationId,isAlive,signal,onDiagnostic=()=>{},onUnavailable=()=>{}}) {
  prepareStateRoot(config.stateRoot);
  const partition=createHash('sha256').update(JSON.stringify([config.brokerUrl,config.enrollment?.credentialId??config.tokenFile,conversationId])).digest('hex');
  const directory=join(config.stateRoot,`native-${partition}`);prepareStateRoot(directory);
  const identityFile=join(directory,'identity.json');
  const temporary=join(directory,`.identity-${randomUUID()}`),newFd=openSync(temporary,constants.O_CREAT|constants.O_EXCL|constants.O_WRONLY,0o600);
  try{writeFileSync(newFd,JSON.stringify(newSessionIdentity('antigravity-cli')));fsyncSync(newFd);}finally{closeSync(newFd);}
  try{linkSync(temporary,identityFile);const d=openSync(directory,constants.O_RDONLY);try{fsyncSync(d);}finally{closeSync(d);}}catch(error){if(error.code!=='EEXIST')throw error;}finally{unlinkSync(temporary);}
  const fd=openSync(identityFile,constants.O_RDONLY|constants.O_NOFOLLOW);let identity;
  try{const s=fstatSync(fd);if(!s.isFile()||(s.mode&0o077)||s.size>4096||(process.getuid&&s.uid!==process.getuid()))throw Error('private_identity_required');identity=JSON.parse(readFileSync(fd,'utf8'));}finally{closeSync(fd);}
  const inbox=new Inbox({directory,identity});
  let client;
  try {client=new BrokerClient({url:config.brokerUrl,tokenFile:config.tokenFile,caFile:config.caFile,insecureDevelopment:config.insecureDevelopment===true,inbox});}
  catch(error){inbox.close();throw error;}
  const toolScope=createToolScope();
  const recoveryAbort=new AbortController();let recoveryPromise;
  let active=true,stopping,monitor,notified=false;
  const unavailable=()=>{if(!notified){notified=true;queueMicrotask(()=>{try{onUnavailable();}catch{}});}};
  const alive=()=>{
    let result=false;try{result=active&&!signal?.aborted&&isAlive()===true&&(!config.enrollment||Date.parse(config.enrollment.expiresAt)>Date.now());}catch{}
    if(!result)unavailable();return result;
  };
  const diagnostic=value=>{
    try{onDiagnostic(value);}catch{}
    if(['unauthenticated','forbidden','session_closed','session_mismatch','invalid_response','retry_window_elapsed'].includes(value.code)){active=false;unavailable();void close().catch(()=>{});}
  };
  const runtime=new AdapterRuntime({client,inbox,verifySession:alive,isAlive:alive,onDiagnostic:diagnostic});
  const close=()=>stopping??=(async()=>{active=false;recoveryAbort.abort();clearInterval(monitor);try{await toolScope.close();await recoveryPromise?.catch(()=>{});await runtime.stop({closeSession:!isAlive()});}finally{inbox.close();}})();
  const abort=()=>{void close().catch(()=>{});};signal?.addEventListener('abort',abort,{once:true});
  try {
    if(!alive())throw Error('native_host_unavailable');
    monitor=setInterval(()=>{if(!alive())void close().catch(()=>{});},1000);monitor.unref?.();
    await runtime.start(config.metadata);
    if(!alive())throw Error('native_host_unavailable');
    recoveryPromise=client.recoverOutgoing({limit:10,signal:AbortSignal.any([recoveryAbort.signal,...signal?[signal]:[],AbortSignal.timeout(5000)])});
    await recoveryPromise.catch(()=>onDiagnostic({code:'outgoing_recovery_incomplete'}));
    if(!alive())throw Error('native_host_unavailable');
    const facade={...createTools({client,inbox}),...createCooperativeInbox({inbox,isActive:alive}),
      broker_identity:async()=>({...identity,conversation_id:conversationId,endpoint_scope:'experimental_native_conversation',native_session_binding:true,mode:'automatic_required',delivery:'native_waiter',readiness:'native_wakeup_acceptance_unverified',automatic_delivery_certified:false})};
    const tools=Object.fromEntries(Object.entries(facade).map(([name,fn])=>[name,(args,context={})=>toolScope.run(async operationSignal=>{if(!alive())throw Error('native_host_unavailable');return fn(args,{...context,signal:signal?AbortSignal.any([signal,operationSignal]):operationSignal});},context.signal)]));
    return {identity,inbox,tools,async close(){signal?.removeEventListener('abort',abort);await close();}};
  } catch(error){signal?.removeEventListener('abort',abort);await close();throw error;}
}
