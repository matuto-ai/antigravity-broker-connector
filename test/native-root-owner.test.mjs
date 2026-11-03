import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync,writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {randomUUID} from 'node:crypto';
import {PassThrough,Writable} from 'node:stream';
import {serveNativePlugin} from '../src/native-plugin.mjs';
import {processIdentity} from '../src/native-binding.mjs';
import {openInstallation} from '../src/installation.mjs';
import {httpFixture,registration,sendBody} from '../../ai-agent-msg-broker/test/helpers.mjs';
const meta=(root,self=root)=>({'antigravity.google/conversation_id':self,'antigravity.google/root_conversation_id':root});
const until=async fn=>{for(let i=0;i<200;i++){if(fn())return;await new Promise(r=>setTimeout(r,5));}throw Error('fixture timeout');};
async function fixture(t,{factory,approvalApi,saved=true,output=new PassThrough()}={}){
 const base=mkdtempSync(join(tmpdir(),'ag-root-owner-'));t.after(()=>rmSync(base,{recursive:true,force:true}));
 const host=processIdentity(process.pid),sessions=[],config={brokerUrl:'https://fixture.test',metadata:{name:'fixture',model:{provider:null,id:null,source:'unknown'},project:null},enrollment:{credentialId:'fixture-credential'}};
 const configReader=()=>config,installation=openInstallation(join(base,'installation'),configReader);
 if(saved){installation.beginPending({brokerUrl:config.brokerUrl,requestId:'saved',previousRevision:null});installation.commit({requestId:'saved',connectionFile:'/saved',credentialId:'fixture-credential',previousRevision:null});}
 const options={base,host,input:new PassThrough(),output,configReader,approvalApi,sessionFactory:async options=>{
  const entry={options,identity:{client_id:randomUUID()},closes:[]};sessions.push(entry);
  return factory?factory(entry):{identity:entry.identity,inbox:{directory:base},tools:{broker_identity:async()=>entry.identity},close:async opts=>entry.closes.push(opts)};
 }};
 const server=await serveNativePlugin(options);t.after(()=>server.close());
 const issue=(root,tool,args={})=>server.binding.issue({context:{host,conversationId:root},tool,args});
 const call=(root,tool,args={},nativeMeta=meta(root))=>server.tools[tool](issue(root,tool,args),{nativeMeta});
 return {base,host,server,sessions,call,issue,options,installation};
}
test('verified root A B C get isolated fresh owners, pause old journal and fence retired roots and waiters',async t=>{
 const f=await fixture(t),a=randomUUID(),b=randomUUID(),c=randomUUID();
 assert.equal((await f.call(a,'broker_setup_status')).connected,true);
 const first=await f.call(a,'broker_identity');
 const waiter=f.issue(a,'broker_wait');
 await assert.rejects(f.call(b,'broker_identity'),/Call broker_setup_status/);
 await f.call(b,'broker_setup_status');assert.notEqual((await f.call(b,'broker_identity')).client_id,first.client_id);
 assert.deepEqual(f.sessions[0].closes,[{closeSession:false}]);
 assert.throws(()=>f.server.binding.consumeWaiter({tool:'broker_wait',args:waiter}),/native_binding_rejected/);
 assert.throws(()=>f.issue(a,'broker_identity'),/native_binding_rejected/);
 await f.call(c,'broker_setup_status');
 assert.equal(new Set(f.sessions.map(e=>e.identity.client_id)).size,3);
 assert.deepEqual(f.sessions[1].closes,[{closeSession:false}]);
});
test('child metadata and missing transport metadata cannot select even with provisional hook permit',async t=>{
 const f=await fixture(t),root=randomUUID(),child=randomUUID();
 await f.call(root,'broker_setup_status');
 await assert.rejects(f.call(child,'broker_setup_status',{},meta(root,child)),/native_binding_rejected/);
 await assert.rejects(f.server.tools.broker_setup_status(f.issue(child,'broker_setup_status'),{}),/native_binding_rejected/);
 assert(f.server.binding.isBound(root));assert.equal(f.sessions.length,1);
});
test('new root waits for admitted old operation drain and fences its late response',async t=>{
 let release;const gate=new Promise(r=>release=r);let entered=false;
 const f=await fixture(t,{factory:e=>({identity:e.identity,inbox:{directory:'/tmp'},tools:{broker_identity:async()=>{entered=true;await gate;return e.identity;}},close:async opts=>{e.closes.push(opts);}})}),a=randomUUID(),b=randomUUID();
 await f.call(a,'broker_setup_status');const old=f.call(a,'broker_identity');old.catch(()=>{});await until(()=>entered);
 const next=f.call(b,'broker_setup_status');await until(()=>f.sessions[0].closes.length===1);
 assert.equal(f.sessions.length,1);release();await assert.rejects(old,/native_session_changed_receipt_retained/);
 assert.equal((await next).connected,true);assert.equal(f.sessions.length,2);
});
test('restart preserves selected root and retired-root fence while new root remains admissible',async t=>{
 const f=await fixture(t),a=randomUUID(),b=randomUUID(),c=randomUUID();await f.call(a,'broker_setup_status');await f.call(b,'broker_setup_status');await f.server.close();
 const server=await serveNativePlugin({...f.options,input:new PassThrough(),output:new PassThrough()});t.after(()=>server.close());
 const call=(root)=>server.tools.broker_setup_status(server.binding.issue({context:{host:f.host,conversationId:root},tool:'broker_setup_status',args:{}}),{nativeMeta:meta(root)});
 assert.throws(()=>server.binding.issue({context:{host:f.host,conversationId:a},tool:'broker_setup_status',args:{}}),/native_binding_rejected/);
 assert.equal((await call(b)).connected,true);assert.equal((await call(c)).connected,true);
});
test('automatic recovery uncertainty remains latched until a new verified root',async t=>{
 let made=0;const f=await fixture(t,{factory:e=>{if(made++===0)throw Object.assign(Error('uncertain'),{code:'native_incarnation_uncertain'});return {identity:e.identity,inbox:{directory:'/tmp'},tools:{broker_identity:async()=>e.identity},close:async opts=>e.closes.push(opts)};}}),a=randomUUID(),b=randomUUID();
 assert.equal((await f.call(a,'broker_setup_status')).connected,false);
 await f.call(a,'broker_setup_status');
 assert.equal(f.sessions.length,1);assert.equal((await f.call(b,'broker_setup_status')).connected,true);assert.equal(f.sessions.length,2);
});
test('late approval poll is drained before new-root activation and cannot commit old selected state',async t=>{
 let release,entered=false;const gate=new Promise(r=>release=r);
 const f=await fixture(t,{saved:false,approvalApi:{readApprovalState:async()=>({state:'pending',requestId:'pending'}),pollApproval:async()=>{entered=true;await gate;return {state:'approved',requestId:'pending',connectionFile:'/late',credentialId:'fixture-credential'};}}});
 f.installation.beginPending({brokerUrl:'https://fixture.test',requestId:'pending',previousRevision:null});
 const a=randomUUID(),b=randomUUID();await f.call(a,'broker_setup_status');await until(()=>entered);
 const next=f.call(b,'broker_setup_status');release();await next;
 // Resume on B may inspect the same installation request, but A never selects it.
 assert(!f.sessions.some(e=>e.options.conversationId===a));
});
test('real HTTP root switch retains A pending journal without replaying it into B',async t=>{
 const b=await httpFixture(t),tokenFile=join(b.dir,'token');writeFileSync(tokenFile,b.b.token,{mode:0o600});
 const base=join(b.dir,'native'),host=processIdentity(process.pid),config={brokerUrl:b.base,tokenFile,stateRoot:join(b.dir,'state'),insecureDevelopment:true,metadata:{name:'Root HTTP',model:{provider:null,id:null,source:'unknown'},project:null}};
 const server=await serveNativePlugin({base,host,input:new PassThrough(),output:new PassThrough(),configReader:()=>config});t.after(()=>server.close());
 const call=(root,tool,args={})=>server.tools[tool](server.binding.issue({context:{host,conversationId:root},tool,args}),{nativeMeta:meta(root)});
 const a=randomUUID(),c=randomUUID(),first=await call(a,'broker_connect',{connection_file:'/fixture'});
 const sender=registration('pi');
 await b.request('/v1/sessions',{method:'POST',body:sender});
 const sent=await b.request('/v1/messages',{method:'POST',session:sender.client_id,key:randomUUID(),body:sendBody(first.client_id,'root A pending')});assert.equal(sent.status,202);
 let received;for(let i=0;i<100;i++){received=await call(a,'broker_receive');if(received.message)break;await new Promise(r=>setTimeout(r,5));}assert.equal(received.message_id,sent.body.message_id);
 const second=await call(c,'broker_connect',{connection_file:'/fixture'});assert.notEqual(second.client_id,first.client_id);
 assert.equal((await call(c,'broker_receive')).message,null);
 const {DatabaseSync}=await import('node:sqlite');const {readdirSync}=await import('node:fs');let found=false;
 for(const folder of readdirSync(config.stateRoot)){if(!folder.startsWith('native-'))continue;const db=new DatabaseSync(join(config.stateRoot,folder,'inbox.sqlite'),{readOnly:true});try{const row=db.prepare('SELECT state FROM inbox WHERE message_id=?').get(sent.body.message_id);if(row){assert.notEqual(row.state,'consumed');found=true;}}finally{db.close();}}
 assert(found);
});

test('new root aborts and drains pending old connect before publishing its own session',async t=>{
 let release,entered=false;const gate=new Promise(r=>release=r);let made=0;
 const f=await fixture(t,{saved:false,factory:async e=>{if(made++===0){entered=true;await gate;}return {identity:e.identity,inbox:{directory:'/tmp'},tools:{broker_identity:async()=>e.identity},close:async opts=>e.closes.push(opts)};}}),a=randomUUID(),b=randomUUID();
 const old=f.call(a,'broker_connect',{connection_file:'/old'});old.catch(()=>{});await until(()=>entered);
 const fresh=f.call(b,'broker_connect',{connection_file:'/new'});await new Promise(r=>setTimeout(r,10));assert.equal(f.sessions.length,1);
 release();await assert.rejects(old,/native_host_unavailable/);const connected=await fresh;
 assert.equal(connected.client_id,f.sessions[1].identity.client_id);assert.deepEqual(f.sessions[0].closes,[{closeSession:false}]);
});
test('queued competing root permit is invalidated atomically instead of reviving a stale admission',async t=>{
 let release;const gate=new Promise(r=>release=r);
 const f=await fixture(t,{factory:e=>({identity:e.identity,inbox:{directory:'/tmp'},tools:{broker_identity:async()=>e.identity},close:async opts=>{e.closes.push(opts);if(e===f.sessions[0])await gate;}})}),a=randomUUID(),b=randomUUID(),c=randomUUID();
 await f.call(a,'broker_setup_status');const next=f.call(b,'broker_setup_status');await until(()=>f.sessions[0].closes.length>0);
 const competing=f.call(c,'broker_setup_status');competing.catch(()=>{});release();await next;await assert.rejects(competing,/native_binding_rejected/);
 assert(f.server.binding.isBound(b));await f.call(c,'broker_setup_status');assert(f.server.binding.isBound(c));
});
test('old setup-status response is fenced after a new root begins draining',async t=>{
 let release,entered=false;const gate=new Promise(r=>release=r);
 const f=await fixture(t,{saved:false,approvalApi:{readApprovalState:async()=>{entered=true;await gate;return null;}}}),a=randomUUID(),b=randomUUID();
 f.installation.beginPending({brokerUrl:'https://fixture.test',requestId:'pending',previousRevision:null});
 const old=f.call(a,'broker_setup_status');old.catch(()=>{});await until(()=>entered);
 const fresh=f.call(b,'broker_setup_status');await new Promise(r=>setTimeout(r,10));release();
 await assert.rejects(old,/native_root_changed_receipt_retained/);await fresh;assert(f.server.binding.isBound(b));
});
test('permit expiry during root drain fences owner instead of selecting or retrying another root',async t=>{
 let now=Date.now();const f=await fixture(t,{factory:e=>({identity:e.identity,inbox:{directory:'/tmp'},tools:{broker_identity:async()=>e.identity},close:async opts=>{e.closes.push(opts);now+=31000;}})}),a=randomUUID(),b=randomUUID();
 f.server.binding.now=()=>now;await f.call(a,'broker_setup_status');await assert.rejects(f.call(b,'broker_setup_status'),/native_binding_rejected/);
 assert.equal(f.sessions.length,1);assert.throws(()=>f.server.binding.assertHost(),/native_binding_rejected/);
});
test('root transition drains superseded approval loop, not only its replacement',async t=>{
 let release,entered=false;const gate=new Promise(r=>release=r);
 const pending={state:'pending',requestId:'pending'};
 const f=await fixture(t,{saved:false,approvalApi:{readApprovalState:async()=>pending,beginApproval:async()=>pending,pollApproval:async()=>{entered=true;await gate;return pending;}}});
 f.installation.beginPending({brokerUrl:'https://fixture.test',requestId:'pending',previousRevision:null});
 const a=randomUUID(),b=randomUUID();await f.call(a,'broker_setup_status');await until(()=>entered);
 await f.call(a,'broker_setup',{broker_url:'https://fixture.test'});
 let activated=false;const next=f.call(b,'broker_setup_status').then(r=>{activated=true;return r;});await new Promise(r=>setTimeout(r,20));
 assert.equal(activated,false);assert(f.server.binding.isBound(a));release();await next;assert(f.server.binding.isBound(b));assert.equal(f.installation.selected(),null);
});
for(const fail of [false,true])test(`actual native owner fences ${fail?'error':'success'} queued behind stdout across root activation`,async t=>{
 let blocked=false,release,called=false;const frames=[];
 const output=new Writable({write(bytes,enc,done){frames.push(JSON.parse(bytes.toString()));if(blocked){blocked=false;release=done;}else done();}});
 const f=await fixture(t,{output,factory:e=>({identity:e.identity,inbox:{directory:'/tmp'},tools:{broker_identity:async()=>{called=true;return fail?{error:{code:'private_A_error',details:'private_A_receipt'}}:{client_id:e.identity.client_id,private_A_body:'receipt'};}},close:async opts=>e.closes.push(opts)})});
 const a=randomUUID(),b=randomUUID();await f.call(a,'broker_setup_status');
 const send=(id,method,params)=>f.options.input.write(JSON.stringify({jsonrpc:'2.0',id,method,params})+'\n');
 send(1,'initialize',{protocolVersion:'2025-06-18',capabilities:{},clientInfo:{name:'fixture',version:'1'}});await until(()=>frames.length===1);
 f.options.input.write(JSON.stringify({jsonrpc:'2.0',method:'notifications/initialized'})+'\n');
 blocked=true;send(2,'ping');await until(()=>release);
 send('A-exact-id','tools/call',{name:'broker_identity',arguments:f.issue(a,'broker_identity'),_meta:meta(a)});await until(()=>called);await new Promise(r=>setImmediate(r));
 await f.call(b,'broker_setup_status');assert(f.server.binding.isBound(b));release();await until(()=>frames.some(r=>r.id==='A-exact-id'));
 const response=frames.find(r=>r.id==='A-exact-id');assert.equal(response.error.code,-32603);assert.match(response.error.message,/Native root changed/);assert(!response.result);assert(!JSON.stringify(response).includes('private_A'));assert(!JSON.stringify(response).includes(f.sessions[0].identity.client_id));
});
test('new root ordinary tools require explicit native bootstrap without changing old root or permits',async t=>{
 const f=await fixture(t),a=randomUUID(),b=randomUUID();await f.call(a,'broker_setup_status');
 const pending=f.issue(a,'broker_identity'),epoch=f.server.binding.assertHost().owner_epoch;
 const generation=f.server.binding.db.prepare('SELECT generation FROM root_state').get().generation;
 for(const [tool,args] of [['broker_identity',{}],['broker_send',{recipient_id:randomUUID(),text:'not sent'}],['broker_cancel',{message_id:randomUUID()}],['broker_setup',{broker_url:'https://fixture.test'}],['broker_disconnect',{}]])await assert.rejects(f.call(b,tool,args),/Call broker_setup_status/);
 assert(f.server.binding.isBound(a));assert.equal(f.sessions.length,1);assert.deepEqual(f.sessions[0].closes,[]);assert.equal(f.server.binding.assertHost().owner_epoch,epoch);assert.equal(f.server.binding.db.prepare('SELECT generation FROM root_state').get().generation,generation);
 assert.equal((await f.server.tools.broker_identity(pending,{nativeMeta:meta(a)})).client_id,f.sessions[0].identity.client_id);
 await f.call(b,'broker_setup_status');assert(f.server.binding.isBound(b));assert.equal(f.sessions.length,2);
});
test('retired-root capacity refuses before owner drain and preserves current session',async t=>{
 const f=await fixture(t),a=randomUUID(),b=randomUUID();await f.call(a,'broker_setup_status');
 for(let i=0;i<256;i++)f.server.binding.db.prepare('INSERT INTO retired_roots VALUES(?)').run(randomUUID());
 await assert.rejects(f.call(b,'broker_setup_status'),/native_binding_rejected/);assert(f.server.binding.isBound(a));assert.equal(f.sessions.length,1);assert.deepEqual(f.sessions[0].closes,[]);assert.equal((await f.call(a,'broker_identity')).client_id,f.sessions[0].identity.client_id);
});
test('initial identity remains supported but second-root stdio identity explains bootstrap without switching',async t=>{
 const f=await fixture(t),a=randomUUID(),b=randomUUID();assert.equal((await f.call(a,'broker_identity')).client_id,f.sessions[0].identity.client_id);
 let output='';f.options.output.on('data',b=>output+=b);const send=(id,method,params)=>f.options.input.write(JSON.stringify({jsonrpc:'2.0',id,method,params})+'\n');
 send(1,'initialize',{protocolVersion:'2025-06-18',capabilities:{},clientInfo:{name:'fixture',version:'1'}});await until(()=>output.includes('\n'));f.options.input.write(JSON.stringify({jsonrpc:'2.0',method:'notifications/initialized'})+'\n');
 send(2,'tools/call',{name:'broker_identity',arguments:f.issue(b,'broker_identity'),_meta:meta(b)});await until(()=>output.split('\n').filter(Boolean).length===2);
 const response=JSON.parse(output.trim().split('\n')[1]);assert.equal(response.result.isError,true);const body=JSON.parse(response.result.content[0].text);assert.equal(body.error.code,'native_root_setup_required');assert.equal(body.error.effect,'not_applied');assert.match(body.error.message,/Call broker_setup_status/);assert(!JSON.stringify(body).includes(a));assert(!JSON.stringify(body).includes(b));assert(f.server.binding.isBound(a));assert.deepEqual(f.sessions[0].closes,[]);
});
test('rejected new-root identity neither waits for nor fences an admitted old response',async t=>{
 let release,entered=false;const gate=new Promise(r=>release=r);
 const f=await fixture(t,{factory:e=>({identity:e.identity,inbox:{directory:'/tmp'},tools:{broker_identity:async()=>{entered=true;await gate;return e.identity;}},close:async opts=>e.closes.push(opts)})}),a=randomUUID(),b=randomUUID();
 await f.call(a,'broker_setup_status');const old=f.call(a,'broker_identity');await until(()=>entered);
 await assert.rejects(f.call(b,'broker_identity'),/Call broker_setup_status/);assert.deepEqual(f.sessions[0].closes,[]);release();assert.equal((await old).client_id,f.sessions[0].identity.client_id);assert(f.server.binding.isBound(a));
});
