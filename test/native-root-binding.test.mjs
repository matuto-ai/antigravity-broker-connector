import test from 'node:test';import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';import {tmpdir} from 'node:os';import {join} from 'node:path';import {randomUUID} from 'node:crypto';
import {NativeBinding} from '../src/native-binding.mjs';import {nativeRootConversation} from '../src/native-root-context.mjs';
const meta=id=>({'antigravity.google/root_conversation_id':id,'antigravity.google/conversation_id':id});
function setup(t){const dir=mkdtempSync(join(tmpdir(),'strict-root-'));t.after(()=>rmSync(dir,{recursive:true,force:true}));const host={pid:12,start:'1',boot:'unit-test-boot',executable:'/fixture/cli'},path=join(dir,'binding.sqlite');let time=100;const b=new NativeBinding({verifyHost:()=>true,path,host,create:true,strictRoot:true,now:()=>time});b.startOwner(randomUUID());t.after(()=>b.dispose());const issue=(id,tool='broker_setup_status',args={})=>({tool,args:b.issue({context:{host,conversationId:id},tool,args}),nativeMeta:meta(id)});const activate=call=>{const i=b.inspectRoot(call);return b.activateRoot({...call,expectedRoot:i.previousRoot,expectedGeneration:i.generation,expectedOwnerEpoch:i.ownerEpoch});};return {b,host,path,issue,activate,advance:()=>time+=31000};}
test('root metadata requires native root=self UUID, never tool argument metadata',t=>{const f=setup(t),id=randomUUID(),call=f.issue(id);for(const bad of [undefined,{},[],meta('bad'),{...meta(id),'antigravity.google/root_conversation_id':randomUUID()}]){assert.throws(()=>f.b.inspectRoot({...call,nativeMeta:bad}));assert.throws(()=>nativeRootConversation(bad));}assert.throws(()=>f.b.inspectRoot({...call,nativeMeta:undefined,args:{...call.args,_meta:meta(id)}}));assert.equal(f.b.assertHost().conversation,null);});
test('observe and provisional issue do not bind; activation consumes, pins and invalidates old permits',t=>{const f=setup(t),a=randomUUID(),b=randomUUID();f.b.observe({host:f.host,conversationId:a});const first=f.issue(a);assert.equal(f.b.assertHost().conversation,null);assert.throws(()=>f.b.consume(first));f.activate(first);assert(f.b.isBound(a));const old=f.issue(a),candidate=f.issue(b);assert(f.b.isBound(a));assert.throws(()=>f.b.consume(candidate));f.activate(candidate);assert(f.b.isBound(b));assert.throws(()=>f.b.consume(old));assert.throws(()=>f.issue(a));assert.throws(()=>f.activate(candidate));});
test('activation CAS rejects stale root/generation and owner epoch, expiry or changed arguments',t=>{const f=setup(t),a=randomUUID(),b=randomUUID(),c=randomUUID();f.activate(f.issue(a));const candidate=f.issue(b),i=f.b.inspectRoot(candidate);const expected={expectedRoot:i.previousRoot,expectedGeneration:i.generation,expectedOwnerEpoch:i.ownerEpoch};assert.throws(()=>f.b.activateRoot({...candidate,...expected,expectedOwnerEpoch:randomUUID()}));assert.throws(()=>f.b.activateRoot({...candidate,...expected,args:{...candidate.args,unexpected:true}}));f.activate(f.issue(c));assert.throws(()=>f.b.activateRoot({...candidate,...expected}));assert(f.b.isBound(c));const expiring=f.issue(randomUUID());const e=f.b.inspectRoot(expiring);f.advance();assert.throws(()=>f.b.activateRoot({...expiring,expectedRoot:e.previousRoot,expectedGeneration:e.generation,expectedOwnerEpoch:e.ownerEpoch}));});
test('waiters only consume active-root issued permits, never bind and never call other tools',t=>{const f=setup(t),a=randomUUID(),b=randomUUID();assert.throws(()=>f.issue(a,'broker_wait'));f.activate(f.issue(a));const wait=f.issue(a,'broker_wait');assert.throws(()=>f.issue(b,'broker_wait'));assert.equal(f.b.consumeWaiter(wait).conversationId,a);assert.throws(()=>f.b.consumeWaiter(wait));assert.throws(()=>f.b.consumeWaiter(f.issue(a,'broker_identity')));});
test('retired roots and strict policy persist across owner restart; old epoch permits are invalid',t=>{const f=setup(t),a=randomUUID(),b=randomUUID();f.activate(f.issue(a));f.activate(f.issue(b));const pending=f.issue(b);f.b.endOwner();const next=new NativeBinding({verifyHost:()=>true,path:f.path,host:f.host,strictRoot:true,now:()=>100});t.after(()=>next.dispose());next.startOwner(randomUUID());assert(next.isBound(b));assert.throws(()=>next.issue({context:{host:f.host,conversationId:a},tool:'broker_identity',args:{}}));assert.throws(()=>next.consume(pending));assert.throws(()=>new NativeBinding({verifyHost:()=>true,path:f.path,host:f.host}));});
test('uncertain activation commit fences handle rather than allowing rollback to retired identity',t=>{const f=setup(t),a=randomUUID(),b=randomUUID();f.activate(f.issue(a));const call=f.issue(b),i=f.b.inspectRoot(call);f.b.failurePoint=p=>{if(p==='after_commit')throw Error('uncertain');};assert.throws(()=>f.b.activateRoot({...call,expectedRoot:i.previousRoot,expectedGeneration:i.generation,expectedOwnerEpoch:i.ownerEpoch}));assert.equal(f.b.unusable,true);const read=new NativeBinding({verifyHost:()=>true,path:f.path,host:f.host,strictRoot:true,now:()=>100});t.after(()=>read.dispose());assert(read.isBound(b));assert.throws(()=>read.issue({context:{host:f.host,conversationId:a},tool:'broker_identity',args:{}}));});

test('separate native observations never select roots or let child metadata replace active root',t=>{
 const f=setup(t),root=randomUUID(),child=randomUUID();
 const model=id=>({model:{provider:null,id,source:'observed'},project:'workspace'});
 f.b.observe({host:f.host,conversationId:root,metadata:model('root-model')});
 f.b.observe({host:f.host,conversationId:child,metadata:model('child-model')});
 assert.equal(f.b.assertHost().conversation,null);
 const call=f.issue(root),inspect=f.b.inspectRoot(call);assert.equal(inspect.observation.metadata.model.id,'root-model');
 assert.deepEqual(inspect.observation.host,f.host);
 const selected=f.activate(call);assert.equal(selected.observation.conversationId,root);assert.equal(selected.observation.metadata.model.id,'root-model');
 f.b.observe({host:f.host,conversationId:child,metadata:model('child-update')});
 assert.equal(f.b.rootObservation(root).metadata.model.id,'root-model');assert(f.b.isBound(root));
 f.b.observe({host:f.host,conversationId:root,metadata:model('root-update')});
 assert.equal(f.b.inspectRoot(f.issue(root)).observation.metadata.model.id,'root-update');
 const absent=f.issue(randomUUID());assert.equal(f.b.inspectRoot(absent).observation,null);
});
test('native observations are capped at32 preserving active and most-recent candidate records',t=>{
 const f=setup(t),root=randomUUID();f.b.observe({host:f.host,conversationId:root,metadata:{project:'active'}});f.activate(f.issue(root));
 const ids=Array.from({length:40},()=>randomUUID());for(const conversationId of ids)f.b.observe({host:f.host,conversationId,metadata:{project:'candidate'}});
 assert.equal(f.b.db.prepare('SELECT count(*) AS n FROM root_observations').get().n,32);
 assert.equal(f.b.rootObservation(root).metadata.project,'active');assert.equal(f.b.rootObservation(ids[0]),null);assert.equal(f.b.rootObservation(ids.at(-1)).metadata.project,'candidate');
 f.b.observe({host:f.host,conversationId:ids[0],metadata:{project:'refreshed'}});assert.equal(f.b.rootObservation(ids[0]).metadata.project,'refreshed');
 assert.equal(f.b.db.prepare('SELECT count(*) AS n FROM root_observations').get().n,32);
});
test('arbitrary hook events, paths, environment and malformed native labels are never persisted',t=>{
 const f=setup(t),conversationId=randomUUID();
 for(const metadata of [{workspacePaths:['/secret']},{env:{TOKEN:'secret'}},{project:'/private/path'},{project:'C:\\private\\path'},{project:'secret\nvalue'},{project:'x'.repeat(257)},{model:{provider:'guessed',id:'model',source:'observed'}},{model:{provider:null,id:'model',source:'configured'}},{model:{provider:null,id:'secret\nvalue',source:'observed'}}])assert.throws(()=>f.b.observe({host:f.host,conversationId,metadata}));
 assert.equal(f.b.rootObservation(conversationId),null);assert.equal(f.b.db.prepare('SELECT count(*) AS n FROM root_observations').get().n,0);
 const a=randomUUID(),b=randomUUID();f.b.observe({host:f.host,conversationId:a,metadata:{project:'first'}});f.activate(f.issue(a));f.activate(f.issue(b));
 assert.throws(()=>f.b.observe({host:f.host,conversationId:a,metadata:{project:'retired-update'}}));assert.equal(f.b.rootObservation(a).metadata.project,'first');
});
test('retired root set caps at256 without eviction and fences both inspection and activation',t=>{
 const f=setup(t),first=randomUUID();f.activate(f.issue(first));
 for(let i=0;i<255;i++)f.activate(f.issue(randomUUID()));
 const candidate=f.issue(randomUUID()),inspected=f.b.inspectRoot(candidate);
 f.activate(f.issue(randomUUID()));assert.equal(f.b.db.prepare('SELECT count(*) AS n FROM retired_roots').get().n,256);
 const active=f.b.assertHost().conversation,call=f.issue(randomUUID());assert.throws(()=>f.b.inspectRoot(call));
 assert.throws(()=>f.b.activateRoot({...call,expectedRoot:active,expectedGeneration:f.b.db.prepare('SELECT generation FROM root_state').get().generation,expectedOwnerEpoch:f.b.ownerEpoch}));
 assert(f.b.isBound(active));assert.throws(()=>f.issue(first));assert.equal(f.b.consume(f.issue(active)).conversationId,active);
 const reopened=new NativeBinding({verifyHost:()=>true,path:f.path,host:f.host,strictRoot:true,now:()=>100});t.after(()=>reopened.dispose());assert.throws(()=>reopened.inspectRoot(call));assert(reopened.isBound(active));
});
test('binding activation cannot switch root via ordinary identity even with verified permit',t=>{
 const f=setup(t),a=randomUUID(),b=randomUUID();f.activate(f.issue(a));const call=f.issue(b,'broker_identity');assert.throws(()=>f.activate(call));assert(f.b.isBound(a));assert.equal(f.b.db.prepare('SELECT count(*) AS n FROM retired_roots').get().n,0);
});
test('strict construction and hook-only observations do not migrate legacy admission',t=>{
 const f=setup(t),a=randomUUID(),b=randomUUID();const legacy=new NativeBinding({verifyHost:()=>true,path:f.path,host:f.host,now:()=>100});t.after(()=>legacy.dispose());
 f.b.observe({host:f.host,conversationId:b});f.issue(b);assert.equal(f.b.db.prepare('SELECT strict_admission_required FROM root_state').get().strict_admission_required,0);
 const args=legacy.issue({context:{host:f.host,conversationId:a},tool:'broker_setup_status',args:{}});assert.equal(legacy.consume({tool:'broker_setup_status',args}).conversationId,a);
 assert.equal(f.b.db.prepare('SELECT strict_admission_required FROM root_state').get().strict_admission_required,0);
});
test('verified strict same-root consume fences preopened legacy handles, not forged metadata',t=>{
 const f=setup(t),a=randomUUID();const legacy=new NativeBinding({verifyHost:()=>true,path:f.path,host:f.host,now:()=>100});t.after(()=>legacy.dispose());legacy.observe({host:f.host,conversationId:a});
 const call=f.issue(a),pending=legacy.issue({context:{host:f.host,conversationId:a},tool:'broker_identity',args:{}});
 for(const bad of [undefined,{...meta(a),'antigravity.google/root_conversation_id':randomUUID()}])assert.throws(()=>f.b.consume({...call,nativeMeta:bad}));
 assert.equal(f.b.db.prepare('SELECT strict_admission_required FROM root_state').get().strict_admission_required,0);assert(legacy.isBound(a));
 const wait=f.issue(a,'broker_wait');f.b.consumeWaiter(wait);assert.equal(f.b.db.prepare('SELECT strict_admission_required FROM root_state').get().strict_admission_required,0);
 f.b.consume(call);assert.equal(f.b.db.prepare('SELECT strict_admission_required FROM root_state').get().strict_admission_required,1);
 for(const operation of [()=>legacy.assertHost(),()=>legacy.observe({host:f.host,conversationId:a}),()=>legacy.issue({context:{host:f.host,conversationId:a},tool:'broker_identity',args:{}}),()=>legacy.consume({tool:'broker_identity',args:pending}),()=>legacy.invalidatePermits(),()=>legacy.startOwner(randomUUID()),()=>legacy.notice({conversationId:a,clientId:randomUUID(),messageId:randomUUID()})])assert.throws(operation);
 assert(!legacy.isBound(a));assert.throws(()=>new NativeBinding({verifyHost:()=>true,path:f.path,host:f.host}));assert(f.b.isBound(a));
});
test('strict admission marker rolls back with failed consume or activation commit',t=>{
 const f=setup(t),a=randomUUID();const legacy=new NativeBinding({verifyHost:()=>true,path:f.path,host:f.host,now:()=>100});t.after(()=>legacy.dispose());legacy.observe({host:f.host,conversationId:a});const call=f.issue(a);
 f.b.failurePoint=p=>{if(p==='before_commit')throw Error('injected');};assert.throws(()=>f.b.consume(call));assert.equal(f.b.db.prepare('SELECT strict_admission_required FROM root_state').get().strict_admission_required,0);assert(legacy.isBound(a));
 f.b.failurePoint=()=>{};const b=f.issue(randomUUID()),i=f.b.inspectRoot(b);f.b.failurePoint=p=>{if(p==='before_commit')throw Error('injected');};assert.throws(()=>f.b.activateRoot({...b,expectedRoot:i.previousRoot,expectedGeneration:i.generation,expectedOwnerEpoch:i.ownerEpoch}));assert.equal(f.b.db.prepare('SELECT strict_admission_required FROM root_state').get().strict_admission_required,0);assert(legacy.isBound(a));
});
test('positive verified generation fences legacy even if old migration left defined zero marker',t=>{
 const f=setup(t),legacy=new NativeBinding({verifyHost:()=>true,path:f.path,host:f.host,now:()=>100});t.after(()=>legacy.dispose());
 f.b.db.exec('UPDATE root_state SET generation=1,strict_admission_required=0');
 assert.throws(()=>legacy.assertHost());assert.throws(()=>legacy.observe({host:f.host,conversationId:randomUUID()}));assert.throws(()=>new NativeBinding({verifyHost:()=>true,path:f.path,host:f.host}));
});
test('older root-state schema migrates positive generation to marker without enabling legacy handles',t=>{
 const f=setup(t);f.b.db.exec('DROP TABLE root_state; CREATE TABLE root_state(id INTEGER PRIMARY KEY,generation INTEGER NOT NULL); INSERT INTO root_state VALUES(1,1)');
 assert.throws(()=>new NativeBinding({verifyHost:()=>true,path:f.path,host:f.host}));
 const strict=new NativeBinding({verifyHost:()=>true,path:f.path,host:f.host,strictRoot:true,now:()=>100});t.after(()=>strict.dispose());assert.equal(strict.db.prepare('SELECT strict_admission_required FROM root_state').get().strict_admission_required,1);assert.throws(()=>new NativeBinding({verifyHost:()=>true,path:f.path,host:f.host}));
});
