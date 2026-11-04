// URL-only setup: explicit begin is the only operation allowed to POST/create.
import { setTimeout as delay } from 'node:timers/promises';
const origin=value=>{let u;try{u=new URL(value);}catch{throw Error('https_broker_url_required');}if(typeof value!=='string'||u.protocol!=='https:'||u.username||u.password||u.search||u.hash||u.pathname!=='/'||/[\s\u0000-\u001f]/u.test(value))throw Error('https_broker_url_required');return u.origin;};
export function createApprovalManager({installation,api,activate,isAlive=()=>true,onStatus=()=>{},onBegin=()=>{},pollMs=2000,sleep=delay}){
 if(pollMs<2000)throw Error('approval_poll_too_fast');
 let generation=0,controller,busy=false,closed=false,status={state:'setup_needed'};
 const tasks=new Set();
 const alive=()=>!closed&&isAlive();
 const publicState=result=>({state:result.state,requestId:result.requestId??null,...(result.requestExpiresAt?{requestExpiresAt:result.requestExpiresAt}:{}),...(result.approval_state?{approval_state:result.approval_state}:{})});
 const publish=result=>{if(!alive())return status;status=publicState({...result,...(['pending','attention_required','approved'].includes(result.state)&&result.requestId===status.requestId&&status.approval_state==='approved'?{approval_state:'approved'}:{})});onStatus(status);return status;};
 const options=p=>({brokerUrl:p.brokerUrl,directory:installation.directory,clientType:'antigravity-cli'});
 const current=(epoch,p)=>{if(!alive()||generation!==epoch||controller?.signal.aborted)return false;const pending=installation.pending(),selected=installation.selected();return generation===epoch&&!controller.signal.aborted&&alive()&&pending?.requestId===p.requestId&&(pending.cancelled===false||selected?.requestId===p.requestId);};
 async function apply(result,p,epoch){
  if(!current(epoch,p))return;
  if(result.requestId!==p.requestId)throw Error('approval_request_mismatch');
  if(result.state!=='approved')publish(result);
  if(['denied','expired','revoked'].includes(result.state)){installation.cancel(publicState(result));return;}
  if(result.state==='approved'){
   publish({...result,state:'pending',approval_state:'approved'});
   const candidate=await activate.prepare(result.connectionFile);
   let staged,selected=false;
   try{if(!current(epoch,p))throw Error('approval_cancelled');staged=await activate.commit(candidate);if(!current(epoch,p))throw Error('approval_cancelled');installation.commit({...result,previousRevision:p.previousRevision});selected=true;if(current(epoch,p))publish(result);try{await staged?.finalize?.();}catch{/* Old cleanup cannot discard a committed candidate. */}}
   catch(error){if(!selected){try{await staged?.rollback?.();}finally{await candidate.close();}}throw error;}
  }
 }
 async function loop(p,epoch,initial,pendingDeadline,initialPauseMs=0){
  let result=initial,failures=0,expiresAt=pendingDeadline??(initial?.state==='pending'?initial.requestExpiresAt:undefined);
  if(initialPauseMs){try{await sleep(initialPauseMs,undefined,{signal:controller.signal});}catch{return;}}
  while(current(epoch,p)){
   if((!result||result.state==='pending')&&expiresAt&&Date.parse(expiresAt)<=Date.now()){publish({state:'expired',requestId:p.requestId,requestExpiresAt:expiresAt});installation.cancel({state:'expired',requestId:p.requestId,requestExpiresAt:expiresAt});return;}
   try{
    if(!result)result=await api.pollApproval(options(p));
    if(!current(epoch,p))return;
    expiresAt=result.state==='pending'?(result.requestExpiresAt??expiresAt):undefined;await apply(result,p,epoch);if(result.state!=='pending')return;
    failures=0;await sleep(pollMs,undefined,{signal:controller.signal});result=null;
   }catch(error){
    if(!alive()||generation!==epoch||controller.signal.aborted)return;
    if(!error.retryable){publish({state:'attention_required',requestId:p.requestId});return;}
    publish({state:'pending',requestId:p.requestId,requestExpiresAt:expiresAt});result=null;
    try{await sleep(Math.max(Math.min(300000,Math.max(1000,Number.isFinite(error.retryAfterMs)?error.retryAfterMs:0)),Math.min(30000,pollMs*2**Math.min(++failures,4))),undefined,{signal:controller.signal});}catch{return;}
   }
  }
 }
 function launch(p,result,pendingDeadline,initialPauseMs=0){if(!alive())return status;controller?.abort();controller=new AbortController();const epoch=++generation;const task=loop(p,epoch,result,pendingDeadline,initialPauseMs);tasks.add(task);task.then(()=>tasks.delete(task),()=>tasks.delete(task));return status;}
 return {get status(){return status;},get done(){return Promise.allSettled([...tasks]);},
  async begin(brokerUrl){
   if(!alive())throw Error('approval_manager_closed');
   const startedGeneration=generation;
   if(busy)throw Error('setup_in_progress');busy=true;
   try{
    brokerUrl=origin(brokerUrl);const old=installation.selected(),prior=installation.pending();
    const existing=await api.readApprovalState({brokerUrl,directory:installation.directory,clientType:'antigravity-cli'});
    if(!alive()||generation!==startedGeneration)return status;
    // An approved candidate that has not been selected is still the same delivery.
    // Retry attachment rather than rotating it on a repeated slash command.
    const attaching=existing?.state==='approved'&&prior&&!prior.cancelled
      &&(prior.requestId===existing.requestId
        ||(prior.requestId===null&&(existing.parentRequestId??null)===(prior.replacesRequestId??null)));
    const replacing=existing&&existing.state!=='pending'&&!attaching;
    if(prior&&!prior.cancelled&&prior.brokerUrl!==brokerUrl)throw Error('cancel_pending_setup_first');
    const p=installation.beginPending({brokerUrl,previousRevision:old?.revision??null,...(replacing?{replacesRequestId:existing.requestId}:{})});
    onBegin();
    controller?.abort();controller=new AbortController();const epoch=++generation;
    let result,retryPause=0;
    try{result=await api.beginApproval({...options(p),...(replacing?{replaceRequestId:existing.requestId}:{})});}
    catch(error){
     // The helper saves the exact candidate before POST. Reconcile an uncertain
     // transport result from that local state, then GET only. Never replace a key
     // or repeat enrollment as a background recovery action.
     if(!error.retryable||epoch!==generation||!alive())throw error;
     result=await api.readApprovalState(options(p));
     if(!result||(p.requestId!==null&&result.requestId!==p.requestId)
       ||(replacing&&(result.requestId===existing.requestId||result.parentRequestId!==existing.requestId)))throw error;
     retryPause=Math.max(pollMs,Math.min(300000,Number.isFinite(error.retryAfterMs)?error.retryAfterMs:pollMs));
    }
    if(epoch!==generation||!alive()||installation.pending()?.cancelled)return status;
    const saved=installation.beginPending({...p,requestId:result.requestId});publish(result.state==='approved'?{...result,state:'pending'}:result);launch(saved,retryPause?null:result,result.state==='pending'?result.requestExpiresAt:undefined,retryPause);return status;
   }finally{busy=false;}
  },
  async resume(){
   if(!alive())throw Error('approval_manager_closed');
   const startedGeneration=generation;
   const p=installation.pending();if(!p)return status;if(p.cancelled)return p.terminalState?publish({state:p.terminalState,requestId:p.requestId,...(p.requestExpiresAt?{requestExpiresAt:p.requestExpiresAt}:{})}):status;
   const saved=await api.readApprovalState(options(p));if(!alive()||generation!==startedGeneration)return status;if(!saved)return publish({state:'setup_needed',requestId:p.requestId});
   if(p.replacesRequestId&&(p.replacesRequestId===saved.requestId||(p.requestId===null&&saved.parentRequestId!==p.replacesRequestId)))return publish({state:'attention_required',requestId:p.requestId});
   if(p.requestId!==null&&p.requestId!==saved.requestId)throw Error('approval_request_mismatch');
   const recovered=p.requestId===null?installation.beginPending({...p,requestId:saved.requestId}):p;
   publish(saved.state==='approved'?{...saved,state:'pending'}:saved);launch(recovered,null,saved.state==='pending'?saved.requestExpiresAt:undefined);return status; // GET only, never beginApproval.
  },
  attention(){return publish({state:'attention_required',requestId:status.requestId});},
  adopt(selected){return publish({state:'approved',requestId:selected.requestId});},
  reconnect(selected){return publish({state:'reconnecting',requestId:selected.requestId});},
  cancel(){if(closed)return status;generation++;controller?.abort();return publish({state:'cancelled',requestId:status.requestId});},
  close(){if(closed)return;closed=true;generation++;controller?.abort();},
 };
}
