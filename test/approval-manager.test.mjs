import test from 'node:test';import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';import {tmpdir} from 'node:os';import {join} from 'node:path';
import {randomUUID} from 'node:crypto';import {openInstallation} from '../src/installation.mjs';import {createApprovalManager} from '../src/approval-manager.mjs';
function fixture(t){const root=mkdtempSync(join(tmpdir(),'agy-approval-'));t.after(()=>rmSync(root,{recursive:true,force:true}));const configs=new Map();const installation=openInstallation(root,path=>{if(!configs.has(path))throw Error('invalid_config');return configs.get(path);});return{root,configs,installation};}
function approved(f,requestId=randomUUID()){const connectionFile=join(f.root,requestId+'.json'),credentialId='enrolled-'+randomUUID();f.configs.set(connectionFile,{brokerUrl:'https://broker.example',enrollment:{credentialId}});return{state:'approved',requestId,connectionFile,credentialId};}
test('startup absent state never enrolls; URL setup persists intent before POST and selects only after attachment',async t=>{
 const f=fixture(t);let calls=0,prepared=0,committed=0;const result=approved(f);const api={readApprovalState:()=>null,beginApproval:async()=>{calls++;assert.equal(f.installation.pending().requestId,null);return result;},pollApproval:async()=>result};
 const m=createApprovalManager({installation:f.installation,api,activate:{prepare:async()=>{prepared++;assert.equal(f.installation.selected(),null);return{close:async()=>{}};},commit:async()=>{committed++;}}});
 await m.resume();assert.equal(calls,0);await m.begin('https://broker.example');await m.done;assert.equal(calls,1);assert.equal(prepared,1);assert.equal(committed,1);assert.equal(f.installation.selected().credentialId,result.credentialId);
});
test('restart pending approval uses GET only and keeps same request; cancellation fences late approval',async t=>{
 const f=fixture(t),r=approved(f);f.installation.beginPending({brokerUrl:'https://broker.example',requestId:r.requestId,previousRevision:null});let release,posts=0,attached=0;const wait=new Promise(resolve=>release=resolve);
 const m=createApprovalManager({installation:f.installation,api:{readApprovalState:()=>({state:'pending',requestId:r.requestId}),beginApproval:()=>{posts++;},pollApproval:()=>wait},activate:{prepare:async()=>{attached++;return{close:async()=>{}};},commit:async()=>{}}});
 await m.resume();m.cancel();release(r);await m.done;assert.equal(posts,0);assert.equal(attached,0);assert.equal(f.installation.selected(),null);
 assert.equal(f.installation.pending().cancelled,false); // Local cancellation must not cancel another native host's setup.
});
test('approved selection survives failed replacement; CAS prevents stale replacement selection',async t=>{
 const f=fixture(t),first=approved(f);f.installation.beginPending({brokerUrl:'https://broker.example',requestId:first.requestId,previousRevision:null});const old=f.installation.commit({...first,previousRevision:null});const next=approved(f);let closed=0;
 const m=createApprovalManager({installation:f.installation,api:{readApprovalState:()=>first,beginApproval:async options=>{assert.equal(options.replaceRequestId,first.requestId);return next;},pollApproval:async()=>next},activate:{prepare:async()=>{throw Error('attach_failed');},commit:async()=>{}}});
 await m.begin('https://broker.example');await m.done;assert.equal(f.installation.selected().revision,old.revision);assert.equal(m.status.state,'attention_required');
 assert.throws(()=>f.installation.commit({...next,previousRevision:'stale'}),/selection_conflict/);m.close();assert.equal(closed,0);
});
test('unknown begin result recovers saved candidate after restart without POST',async t=>{
 const f=fixture(t),r=approved(f);let posts=0;
 const m=createApprovalManager({installation:f.installation,api:{readApprovalState:()=>null,beginApproval:async()=>{posts++;throw Object.assign(Error('network'),{effect:'unknown'});}},activate:{}});
 await assert.rejects(m.begin('https://broker.example'));assert.equal(f.installation.pending().requestId,null);
 const n=createApprovalManager({installation:f.installation,api:{readApprovalState:()=>({state:'pending',requestId:r.requestId}),pollApproval:async()=>r},activate:{prepare:async()=>({close:async()=>{}}),commit:async()=>{}}});await n.resume();await n.done;assert.equal(posts,1);assert.equal(f.installation.selected().credentialId,r.credentialId);
});
test('URL credentials rejected, denied state terminal, no automatic replacement',async t=>{
 const f=fixture(t);let polls=0;const r={state:'denied',requestId:randomUUID()};const m=createApprovalManager({installation:f.installation,api:{readApprovalState:()=>null,beginApproval:async()=>r,pollApproval:()=>{polls++;}},activate:{}});
 await assert.rejects(m.begin('https://secret:password@broker.example'),/https_broker_url_required/);await m.begin('https://broker.example');await m.done;assert.equal(m.status.state,'denied');assert.equal(polls,0);assert.equal(f.installation.pending().cancelled,true);
});
test('thirty pending native hosts share one approved CAS winner; disconnect of one does not cancel peers',async t=>{
 const f=fixture(t),r=approved(f);f.installation.beginPending({brokerUrl:'https://broker.example',requestId:r.requestId,previousRevision:null});let release,attached=0,posts=0;const response=new Promise(resolve=>release=resolve);
 const managers=Array.from({length:30},()=>createApprovalManager({installation:openInstallation(f.root,path=>f.configs.get(path)),api:{readApprovalState:()=>({state:'pending',requestId:r.requestId}),beginApproval:()=>{posts++;},pollApproval:()=>response},activate:{prepare:async()=>({close:async()=>{}}),commit:async()=>{attached++;}}}));
 await Promise.all(managers.map(m=>m.resume()));managers[0].cancel();release(r);await Promise.all(managers.map(m=>m.done));assert.equal(posts,0);assert.equal(attached,29);assert.equal(managers[0].status.state,'cancelled');assert(managers.slice(1).every(m=>m.status.state==='approved'));assert.equal(f.installation.selected().credentialId,r.credentialId);
});
test('retryable server cooldown is honored without startup POST or key rotation',async t=>{
 const f=fixture(t),r=approved(f);f.installation.beginPending({brokerUrl:'https://broker.example',requestId:r.requestId,previousRevision:null});let waits=[],polls=0,m;
 m=createApprovalManager({installation:f.installation,api:{readApprovalState:()=>({state:'pending',requestId:r.requestId}),pollApproval:async()=>{polls++;throw Object.assign(Error('rate_limited'),{retryable:true,retryAfterMs:60000});}},activate:{},sleep:async ms=>{waits.push(ms);m.cancel();}});await m.resume();await m.done;assert.deepEqual(waits,[60000]);assert.equal(polls,1);assert.equal(f.installation.pending().requestId,r.requestId);
});
test('local activation write failure never changes approved installation selection',async t=>{
 const f=fixture(t),r=approved(f);let closed=0;const m=createApprovalManager({installation:f.installation,api:{readApprovalState:()=>null,beginApproval:async()=>r},activate:{prepare:async()=>({close:async()=>closed++}),commit:async()=>{throw Error('injected_state_write_failure');}}});await m.begin('https://broker.example');await m.done;assert.equal(f.installation.selected(),null);assert.equal(closed,1);assert.equal(m.status.state,'attention_required');
});
test('cancel during staged activation rolls back without late selected/approved result',async t=>{
 const f=fixture(t),r=approved(f);let release,entered,rolled=0,closed=0;const started=new Promise(r=>entered=r),barrier=new Promise(r=>release=r);const m=createApprovalManager({installation:f.installation,api:{readApprovalState:()=>null,beginApproval:async()=>r},activate:{prepare:async()=>({close:async()=>closed++}),commit:async()=>{entered();await barrier;return{rollback:async()=>rolled++};}}});await m.begin('https://broker.example');await started;m.cancel();release();await m.done;assert.equal(f.installation.selected(),null);assert.equal(rolled,1);assert.equal(closed,1);assert.equal(m.status.state,'cancelled');
});
test('old cleanup failure after selected candidate cannot close new or overwrite concurrent cancellation',async t=>{
 const f=fixture(t),r=approved(f);let entered,release,closed=0;const started=new Promise(r=>entered=r),barrier=new Promise(r=>release=r);const m=createApprovalManager({installation:f.installation,api:{readApprovalState:()=>null,beginApproval:async()=>r},activate:{prepare:async()=>({close:async()=>closed++}),commit:async()=>({finalize:async()=>{entered();await barrier;throw Error('old_cleanup_failed');}})}});await m.begin('https://broker.example');await started;assert.equal(f.installation.selected().credentialId,r.credentialId);m.cancel();release();await m.done;assert.equal(closed,0);assert.equal(m.status.state,'cancelled');assert.equal(f.installation.selected().credentialId,r.credentialId);
});
test('known expired pending request stops locally without GET, POST or implicit replacement',async t=>{
 const f=fixture(t),requestId=randomUUID();f.installation.beginPending({brokerUrl:'https://broker.example',requestId,previousRevision:null});const m=createApprovalManager({installation:f.installation,api:{readApprovalState:()=>({state:'pending',requestId,requestExpiresAt:'2000-01-01T00:00:00Z'}),pollApproval:()=>{throw Error('expired should not poll');}},activate:{}});await m.resume();await m.done;assert.equal(m.status.state,'expired');
});

const barrier=()=>{let resolve;const promise=new Promise(r=>resolve=r);return{promise,resolve};};
test('close during initial begin read prevents POST, intent writes and late status',async t=>{
 const f=fixture(t),read=barrier(),entered=barrier(),publications=[];let posts=0,writes=0;
 const beginPending=f.installation.beginPending;f.installation.beginPending=(...args)=>{writes++;return beginPending(...args);};
 const m=createApprovalManager({installation:f.installation,api:{readApprovalState:()=>{entered.resolve();return read.promise;},beginApproval:()=>{posts++;throw Error('must not POST');}},activate:{},onStatus:s=>publications.push(s)});
 const pending=m.begin('https://broker.example');await entered.promise;m.close();read.resolve(null);await pending;
 assert.equal(posts,0);assert.equal(writes,0);assert.equal(f.installation.pending(),null);assert.equal(f.installation.selected(),null);assert.deepEqual(publications,[]);
 await assert.rejects(m.begin('https://broker.example'),/approval_manager_closed/);await assert.rejects(m.resume(),/approval_manager_closed/);
 m.attention();m.adopt({requestId:'ignored'});m.cancel();m.close();assert.deepEqual(publications,[]);
});
test('close during begin POST retains recoverable intent and new manager resumes same request GET-only',async t=>{
 const f=fixture(t),r=approved(f),post=barrier(),entered=barrier();let posts=0,polls=0;const publications=[];
 const m=createApprovalManager({installation:f.installation,api:{readApprovalState:()=>null,beginApproval:()=>{posts++;entered.resolve();return post.promise;}},activate:{},onStatus:s=>publications.push(s)});
 const pending=m.begin('https://broker.example');await entered.promise;assert.equal(f.installation.pending().requestId,null);m.close();post.resolve(r);await pending;
 assert.equal(f.installation.pending().cancelled,false);assert.equal(f.installation.selected(),null);assert.deepEqual(publications,[]);
 const n=createApprovalManager({installation:f.installation,api:{readApprovalState:()=>({state:'pending',requestId:r.requestId}),beginApproval:()=>{posts++;throw Error('no replacement POST');},pollApproval:()=>{polls++;return r;}},activate:{prepare:async()=>({close:async()=>{}}),commit:async()=>{}}});
 await n.resume();await n.done;assert.equal(posts,1);assert.equal(polls,1);assert.equal(f.installation.selected().requestId,r.requestId);n.close();
});
test('close during resume read prevents publication, recovered writes and polling',async t=>{
 const f=fixture(t),read=barrier(),entered=barrier(),r=approved(f),publications=[];let polls=0;
 f.installation.beginPending({brokerUrl:'https://broker.example',requestId:null,previousRevision:null});
 const before=f.installation.pending();
 const m=createApprovalManager({installation:f.installation,api:{readApprovalState:()=>{entered.resolve();return read.promise;},pollApproval:()=>{polls++;return r;}},activate:{},onStatus:s=>publications.push(s)});
 const pending=m.resume();await entered.promise;m.close();read.resolve({state:'pending',requestId:r.requestId});await pending;await m.done;
 assert.equal(polls,0);assert.deepEqual(publications,[]);assert.deepEqual(f.installation.pending(),before);assert.equal(f.installation.selected(),null);
});
test('close during preparation drains candidate without attaching or cancelling durable request',async t=>{
 const f=fixture(t),r=approved(f),prepared=barrier(),entered=barrier();let commits=0,closed=0;
 const m=createApprovalManager({installation:f.installation,api:{readApprovalState:()=>null,beginApproval:()=>r},activate:{prepare:async()=>{entered.resolve();await prepared.promise;return{close:async()=>closed++};},commit:async()=>{commits++;}}});
 await m.begin('https://broker.example');await entered.promise;m.close();prepared.resolve();await m.done;
 assert.equal(commits,0);assert.equal(closed,1);assert.equal(f.installation.selected(),null);assert.equal(f.installation.pending().requestId,r.requestId);assert.equal(f.installation.pending().cancelled,false);
});
test('close during staged commit rolls back before selection and suppresses late publication',async t=>{
 const f=fixture(t),r=approved(f),staged=barrier(),entered=barrier(),publications=[];let rollback=0,closed=0;
 const m=createApprovalManager({installation:f.installation,api:{readApprovalState:()=>null,beginApproval:()=>r},activate:{prepare:async()=>({close:async()=>closed++}),commit:async()=>{entered.resolve();await staged.promise;return{rollback:async()=>rollback++};}},onStatus:s=>publications.push(s)});
 await m.begin('https://broker.example');await entered.promise;const count=publications.length;m.close();staged.resolve();await m.done;
 assert.equal(rollback,1);assert.equal(closed,1);assert.equal(f.installation.selected(),null);assert.equal(publications.length,count);assert.equal(f.installation.pending().cancelled,false);
});
test('close joins superseded approval preparation as well as replacement loop',async t=>{
 const f=fixture(t),r=approved(f),prepare=barrier(),entered=barrier(),latest=barrier();let polls=0,closed=0,commits=0;
 f.installation.beginPending({brokerUrl:'https://broker.example',requestId:r.requestId,previousRevision:null});
 const m=createApprovalManager({installation:f.installation,api:{readApprovalState:()=>({state:'pending',requestId:r.requestId}),pollApproval:()=>++polls===1?r:latest.promise},activate:{prepare:async()=>{entered.resolve();await prepare.promise;return{close:async()=>closed++};},commit:async()=>commits++}});
 await m.resume();await entered.promise;await m.resume();assert.equal(polls,2);m.close();let drained=false;const done=m.done.then(()=>{drained=true;});latest.resolve(r);await new Promise(r=>setImmediate(r));assert.equal(drained,false);
 prepare.resolve();await done;assert.equal(closed,1);assert.equal(commits,0);assert.equal(f.installation.selected(),null);
});

test('terminal denial, expiry and revocation survive restart without network or replacement',async t=>{
 for(const state of ['denied','expired','revoked']){
  const f=fixture(t),requestId=randomUUID();let posts=0;
  const first=createApprovalManager({installation:f.installation,api:{readApprovalState:()=>null,beginApproval:()=>{posts++;return {state,requestId};}},activate:{}});
  await first.begin('https://broker.example');await first.done;first.close();
  const restarted=createApprovalManager({installation:openInstallation(f.root,path=>f.configs.get(path)),api:{readApprovalState:()=>{throw Error('terminal must not read helper or network');},pollApproval:()=>{throw Error('terminal must not poll');},beginApproval:()=>{throw Error('terminal must not create replacement');}},activate:{}});
  await restarted.resume();await restarted.done;
  assert.deepEqual(restarted.status,{state,requestId});assert.equal(posts,1);assert.equal(f.installation.selected(),null);restarted.close();
 }
});
test('locally known expiry stays visible after restart without another GET',async t=>{
 const f=fixture(t),requestId=randomUUID(),requestExpiresAt='2000-01-01T00:00:00Z';f.installation.beginPending({brokerUrl:'https://broker.example',requestId,previousRevision:null});
 const first=createApprovalManager({installation:f.installation,api:{readApprovalState:()=>({state:'pending',requestId,requestExpiresAt}),pollApproval:()=>{throw Error('expired');}},activate:{}});
 await first.resume();await first.done;first.close();
 const next=createApprovalManager({installation:f.installation,api:{},activate:{}});await next.resume();assert.deepEqual(next.status,{state:'expired',requestId,requestExpiresAt});next.close();
});
test('stale terminal outcome cannot cancel another selected replacement request',t=>{
 const f=fixture(t),previous=randomUUID(),current=randomUUID();
 f.installation.beginPending({brokerUrl:'https://broker.example',requestId:previous,previousRevision:null});
 assert.equal(f.installation.cancel({requestId:previous,state:'denied'}),true);
 f.installation.beginPending({brokerUrl:'https://broker.example',requestId:current,previousRevision:null});
 assert.equal(f.installation.cancel({requestId:previous,state:'expired'}),false);
 assert.equal(f.installation.pending().requestId,current);assert.equal(f.installation.pending().cancelled,false);assert.equal(f.installation.pending().terminalState,undefined);
});
test('terminal replacement reason survives restart without discarding working authorization',async t=>{
 const f=fixture(t),first=approved(f),requestId=randomUUID();
 f.installation.beginPending({brokerUrl:'https://broker.example',requestId:first.requestId,previousRevision:null});const selected=f.installation.commit({...first,previousRevision:null});
 const replacement=createApprovalManager({installation:f.installation,api:{readApprovalState:()=>first,beginApproval:()=>({state:'denied',requestId})},activate:{}});
 await replacement.begin('https://broker.example');await replacement.done;replacement.close();
 const reopened=createApprovalManager({installation:f.installation,api:{},activate:{}});reopened.adopt(selected);await reopened.resume();
 assert.deepEqual(reopened.status,{state:'denied',requestId});assert.equal(f.installation.selected().revision,selected.revision);assert.equal(f.installation.selected().credentialId,first.credentialId);reopened.close();
});


test('uncertain setup POST resumes the saved request in the same host with GET only', async t => {
 const f=fixture(t),r=approved(f);let reads=0,posts=0,polls=0;const waits=[];
 const manager=createApprovalManager({installation:f.installation,
  api:{readApprovalState:()=>++reads===1?null:{state:'pending',requestId:r.requestId},
   beginApproval:()=>{posts++;throw Object.assign(Error('transport'),{retryable:true,effect:'unknown',retryAfterMs:60000});},
   pollApproval:()=>{polls++;return r;}},
  activate:{prepare:async()=>({close:async()=>{}}),commit:async()=>{}},sleep:async ms=>{waits.push(ms);}});
 const status=await manager.begin('https://broker.example');await manager.done;
 assert.equal(status.requestId,r.requestId);assert.equal(posts,1);assert.equal(polls,1);
 assert.deepEqual(waits,[60000]);assert.equal(f.installation.selected().requestId,r.requestId);
 manager.close();
});

test('uncertain setup recovery never adopts the old request or invents an absent candidate', async t => {
 for(const replacement of [false,true]){
  const f=fixture(t),first=approved(f);let posts=0,polls=0;
  if(replacement){f.installation.beginPending({brokerUrl:'https://broker.example',requestId:first.requestId,previousRevision:null});f.installation.commit({...first,previousRevision:null});}
  const manager=createApprovalManager({installation:f.installation,
   api:{readApprovalState:()=>replacement?first:null,
    beginApproval:()=>{posts++;throw Object.assign(Error('busy'),{retryable:true,effect:'not_applied'});},
    pollApproval:()=>{polls++;throw Error('no exact candidate');}},activate:{}});
  await assert.rejects(manager.begin('https://broker.example'),/busy/);await manager.done;
  assert.equal(posts,1);assert.equal(polls,0);
  assert.equal(f.installation.selected()?.requestId??null,replacement?first.requestId:null);
  manager.close();
 }
});

test('cancel during same-host transport recovery fences GET and late selection', async t => {
 const f=fixture(t),r=approved(f),sleeping=barrier(),wait=barrier();let reads=0,polls=0;
 const manager=createApprovalManager({installation:f.installation,
  api:{readApprovalState:()=>++reads===1?null:{state:'pending',requestId:r.requestId},
   beginApproval:()=>{throw Object.assign(Error('transport'),{retryable:true,effect:'unknown'});},
   pollApproval:()=>{polls++;return r;}},activate:{},sleep:async()=>{sleeping.resolve();await wait.promise;}});
 await manager.begin('https://broker.example');await sleeping.promise;manager.cancel();wait.resolve();await manager.done;
 assert.equal(polls,0);assert.equal(f.installation.selected(),null);
 assert.equal(f.installation.pending().requestId,r.requestId);assert.equal(manager.status.state,'cancelled');manager.close();
});

test('explicit setup after cancelled late approval resumes the same unattached candidate', async t => {
 const f=fixture(t),first=approved(f),next=approved(f),poll=barrier(),entered=barrier();let saved=null,posts=0;
 const api={readApprovalState:()=>saved,beginApproval:options=>{
  posts++;
  if(posts===1){saved={state:'pending',requestId:first.requestId};return saved;}
  assert.equal(options.replaceRequestId,undefined);
  assert.equal(f.installation.pending().requestId,first.requestId);
  return saved;
 },pollApproval:()=>{entered.resolve();return poll.promise;}};
 const manager=createApprovalManager({installation:f.installation,api,sleep:async()=>{},
  activate:{prepare:async()=>({close:async()=>{}}),commit:async()=>{}}});
 await manager.begin('https://broker.example');await entered.promise;manager.cancel();saved=first;poll.resolve(first);await manager.done;
 assert.equal(f.installation.selected(),null);assert.equal(f.installation.pending().requestId,first.requestId);
 await manager.begin('https://broker.example');await manager.done;
 assert.equal(posts,2);assert.equal(f.installation.selected().requestId,first.requestId);manager.close();
});

test('lost replacement response resumes only its exact saved child, without another POST', async t => {
 const f=fixture(t),first=approved(f),next=approved(f);let saved=first,posts=0,polls=0;
 f.installation.beginPending({brokerUrl:'https://broker.example',requestId:first.requestId,previousRevision:null});
 const old=f.installation.commit({...first,previousRevision:null});
 const manager=createApprovalManager({installation:f.installation,sleep:async()=>{},
  api:{readApprovalState:()=>saved,beginApproval:options=>{posts++;assert.equal(options.replaceRequestId,first.requestId);
   saved={...next,parentRequestId:first.requestId};throw Object.assign(Error('network'),{retryable:true,effect:'unknown'});},
   pollApproval:()=>{polls++;return saved;}},activate:{prepare:async()=>({close:async()=>{}}),commit:async()=>{}}});
 await manager.begin('https://broker.example');await manager.done;
 assert.equal(posts,1);assert.equal(polls,1);assert.equal(f.installation.selected().requestId,next.requestId);
 assert.notEqual(f.installation.selected().revision,old.revision);manager.close();
});

test('restart replacement recovery rejects an absent child, unchanged parent and unrelated lineage', async t => {
 for(const kind of ['absent','parent','different-parent','child']){
  const f=fixture(t),first=approved(f),next=approved(f);let polls=0;
  f.installation.beginPending({brokerUrl:'https://broker.example',requestId:first.requestId,previousRevision:null});
  f.installation.beginPending({brokerUrl:'https://broker.example',previousRevision:null,replacesRequestId:first.requestId});
  const saved=kind==='absent'?null:kind==='parent'?first:{...next,parentRequestId:kind==='child'?first.requestId:randomUUID()};
  const manager=createApprovalManager({installation:f.installation,
   api:{readApprovalState:()=>saved,pollApproval:()=>{polls++;return saved;},beginApproval:()=>{throw Error('restart cannot POST');}},
   activate:{prepare:async()=>({close:async()=>{}}),commit:async()=>{}}});
  await manager.resume();await manager.done;
  assert.equal(polls,kind==='child'?1:0);assert.equal(f.installation.selected()?.requestId??null,kind==='child'?next.requestId:null);
  if(kind!=='child')assert.equal(f.installation.pending().requestId,null);
  manager.close();
 }
});

test('shared replacement intent joins one child and rejects a competing parent or stale selection', t => {
 const f=fixture(t),first=randomUUID(),child=randomUUID(),other=randomUUID();
 f.installation.beginPending({brokerUrl:'https://broker.example',requestId:first,previousRevision:null});
 f.installation.beginPending({brokerUrl:'https://broker.example',previousRevision:null,replacesRequestId:first});
 f.installation.beginPending({brokerUrl:'https://broker.example',requestId:child,previousRevision:null,replacesRequestId:first});
 const joined=f.installation.beginPending({brokerUrl:'https://broker.example',previousRevision:null,replacesRequestId:first});
 assert.equal(joined.requestId,child);assert.equal(joined.replacesRequestId,first);
 assert.throws(()=>f.installation.beginPending({brokerUrl:'https://broker.example',previousRevision:null,replacesRequestId:other}),/pending_selection_conflict/);
 assert.throws(()=>f.installation.beginPending({brokerUrl:'https://broker.example',previousRevision:'stale',replacesRequestId:first}),/selection_conflict/);
 assert.equal(f.installation.cancel({requestId:first,state:'denied'}),false);assert.equal(f.installation.pending().requestId,child);
});

test('expired request deadline cannot override an authoritative terminal result or approved activation retry', async t => {
 for(const state of ['approved','denied','revoked']){
  const f=fixture(t),result={...approved(f),state,requestExpiresAt:'2000-01-01T00:00:00Z'};let attempts=0;
  const manager=createApprovalManager({installation:f.installation,sleep:async()=>{},
   api:{readApprovalState:()=>null,beginApproval:()=>result,pollApproval:()=>result},
   activate:{prepare:async()=>{if(++attempts===1)throw Object.assign(Error('network'),{retryable:true});return{close:async()=>{}};},commit:async()=>{}}});
  await manager.begin('https://broker.example');await manager.done;
  assert.equal(manager.status.state,state);
  assert.equal(f.installation.selected()?.requestId??null,state==='approved'?result.requestId:null);
  if(state==='approved')assert.equal(attempts,2);manager.close();
 }
});

test('repeated replacement after failed approved attachment keeps the same candidate and old selection', async t => {
 const f=fixture(t),first=approved(f),next=approved(f);let saved=first,creates=0,attempts=0;
 f.installation.beginPending({brokerUrl:'https://broker.example',requestId:first.requestId,previousRevision:null});
 const old=f.installation.commit({...first,previousRevision:null});
 const manager=createApprovalManager({installation:f.installation,
  api:{readApprovalState:()=>saved,beginApproval:options=>{
   if(options.replaceRequestId){creates++;assert.equal(options.replaceRequestId,first.requestId);saved=next;}
   return saved;
  },pollApproval:()=>saved},
  activate:{prepare:async()=>{if(++attempts===1)throw Error('attach_failed');return{close:async()=>{}};},commit:async()=>{}}});
 await manager.begin('https://broker.example');await manager.done;
 assert.equal(manager.status.state,'attention_required');assert.equal(manager.status.approval_state,'approved');
 assert.equal(f.installation.selected().revision,old.revision);
 await manager.begin('https://broker.example');await manager.done;
 assert.equal(creates,1);assert.equal(attempts,2);assert.equal(f.installation.selected().requestId,next.requestId);
 assert.equal(manager.status.state,'approved');manager.close();
});

test('explicit replacement of stale approved or revoked authorization does not revoke or delete old selection', async t => {
 for(const state of ['approved','revoked']){
  const f=fixture(t),first=approved(f),next={state:'pending',requestId:randomUUID()};let manager,creates=0;
  f.installation.beginPending({brokerUrl:'https://broker.example',requestId:first.requestId,previousRevision:null});
  const old=f.installation.commit({...first,previousRevision:null});
  manager=createApprovalManager({installation:f.installation,
   api:{readApprovalState:()=>({...first,state}),beginApproval:options=>{creates++;assert.equal(options.replaceRequestId,first.requestId);return next;}},
   activate:{},sleep:async()=>manager.cancel()});
  await manager.begin('https://broker.example');await manager.done;
  assert.equal(creates,1);assert.deepEqual(f.installation.selected(),old);assert.equal(f.installation.pending().requestId,next.requestId);
  manager.close();
 }
});

test('explicit retry after uncertain approved child recovers its reserved lineage without another replacement', async t => {
 const f=fixture(t),first=approved(f),next={...approved(f),parentRequestId:first.requestId};let saved=first,posts=0;
 f.installation.beginPending({brokerUrl:'https://broker.example',requestId:first.requestId,previousRevision:null});
 f.installation.commit({...first,previousRevision:null});
 const manager=createApprovalManager({installation:f.installation,
  api:{readApprovalState:()=>saved,beginApproval:options=>{
   posts++;
   if(posts===1){assert.equal(options.replaceRequestId,first.requestId);saved=next;throw Error('uncertain_response');}
   assert.equal(options.replaceRequestId,undefined);return saved;
  },pollApproval:()=>saved},activate:{prepare:async()=>({close:async()=>{}}),commit:async()=>{}}});
 await assert.rejects(manager.begin('https://broker.example'),/uncertain_response/);
 assert.equal(f.installation.pending().requestId,null);
 await manager.begin('https://broker.example');await manager.done;
 assert.equal(posts,2);assert.equal(f.installation.selected().requestId,next.requestId);manager.close();
});
