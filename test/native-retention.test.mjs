import test from 'node:test';import assert from 'node:assert/strict';
import {writeFileSync,readFileSync,renameSync} from 'node:fs';import {join} from 'node:path';import {pathToFileURL} from 'node:url';
import {startNativeSession} from '../src/native-session.mjs';import {Inbox} from '../vendor/psst/reference/inbox.mjs';
const {httpFixture}=await import(process.env.PSST_TEST_ROOT?pathToFileURL(join(process.env.PSST_TEST_ROOT,'test/helpers.mjs')):new URL('../../ai-agent-msg-broker/test/helpers.mjs',import.meta.url));
function factory(f,version=2){const tokenFile=join(f.dir,'token');writeFileSync(tokenFile,f.b.token,{mode:0o600});return (conversationId,extra={})=>startNativeSession({config:{brokerUrl:f.base,tokenFile,stateRoot:join(f.dir,'ag-state'),insecureDevelopment:true,registrationVersion:version,metadata:{name:'AG retention test',model:{provider:null,id:null,source:'unknown'},project:null}},conversationId,isAlive:()=>true,clientOptions:{now:()=>f.now,maxAttempts:1},...extra});}
for(const version of [1,2])test(`native v${version} cleanup off resumes same isolated identity`,async t=>{const f=await httpFixture(t),make=factory(f,version);let a=await make('A'),b=await make('B');t.after(async()=>{await a.close();await b.close();});const id=a.identity.client_id;assert.notEqual(id,b.identity.client_id);await a.close();a=await make('A');assert.equal(a.identity.client_id,id);});
test('expiry creates empty successor, persists pointer, preserves old uncertainty and original owner lock',async t=>{
 const f=await httpFixture(t,{requireRegistrationV2:true,limits:{session_retention_seconds:172800}}),make=factory(f);let a=await make('A');t.after(()=>a.close());
 const old=a.identity,root=a.inbox.directory;const send=a.inbox.prepareSend({recipient_id:old.client_id,content:{type:'text/plain',text:'never replay'}});await a.close();const archived=new Inbox({directory:root,identity:old});archived.setState('claim_pending',{key:'old-claim'});archived.close();
 f.advance(172800001);f.store.sweep();a=await make('A');assert.notEqual(a.identity.client_id,old.client_id);assert.notEqual(a.inbox.getState('claim_pending')?.key,'old-claim');assert.equal(a.inbox.unresolvedSends().length,0);assert.equal((await a.tools.broker_identity({})).client_id,a.identity.client_id);
 assert.throws(()=>new Inbox({directory:root,identity:old}),e=>e.code==='owner_conflict');
 const fresh=a.identity;await a.close();a=await make('A');assert.deepEqual(a.identity,fresh);await a.close();
 const oldJournal=new Inbox({directory:root,identity:old});assert.deepEqual(oldJournal.getState('claim_pending'),{key:'old-claim'});assert.ok(oldJournal.outgoing(send));oldJournal.close();
 await assert.rejects(factory(f,1)('A'),/native_incarnation_invalid/);
 const pointer=JSON.parse(readFileSync(join(root,'current-incarnation.json'))),child=join(root,'incarnation-'+pointer.generation);renameSync(join(child,'inbox.sqlite'),join(child,'saved.sqlite'));await assert.rejects(make('A')); 
});
test('native mismatch after expiry does not allocate successor',async t=>{const f=await httpFixture(t,{requireRegistrationV2:true,limits:{session_retention_seconds:172800}}),make=factory(f);const a=await make('A');await a.close();f.advance(172800001);f.store.sweep();await assert.rejects(make('A',{isAlive:()=>false}),/native_host_unavailable/);});
