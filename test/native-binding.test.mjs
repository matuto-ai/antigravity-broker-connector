import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { NativeBinding, processIdentity, nativeHookContext } from '../src/native-binding.mjs';
import { createNativeWaiter } from '../src/native-waiter.mjs';
function setup(t) {
 const dir=mkdtempSync(join(tmpdir(),'agy-binding-'));t.after(()=>rmSync(dir,{recursive:true,force:true}));
 const host=processIdentity(process.pid),path=join(dir,'binding.sqlite');let now=1000;
 const binding=new NativeBinding({path,host,create:true,now:()=>now});t.after(()=>binding.dispose());
 const context={host,conversationId:randomUUID()};
 return {binding,host,path,context,advance:()=>{now+=31000;}};
}
test('hook permits pin one conversation, exact args/tool, single use across handles',t=>{
 const f=setup(t),hook=new NativeBinding({path:f.path,host:f.host,now:()=>1000});t.after(()=>hook.dispose());
 assert.throws(()=>hook.issue({context:f.context,tool:'broker_send',args:{}}));
 const args=hook.issue({context:f.context,tool:'broker_connect',args:{pairing_file:'/private/pair.json'}});
 assert.throws(()=>f.binding.consume({tool:'broker_connect',args:{...args,pairing_file:'/other'}}));
 assert.throws(()=>f.binding.consume({tool:'broker_send',args}));
 assert.equal(f.binding.consume({tool:'broker_connect',args}).conversationId,f.context.conversationId);
 assert.throws(()=>f.binding.consume({tool:'broker_connect',args}));
 assert.throws(()=>hook.issue({context:{...f.context,conversationId:randomUUID()},tool:'broker_connect',args:{}}));
 assert.throws(()=>hook.issue({context:{...f.context,host:{...f.host,start:'0'}},tool:'broker_receive',args:{}}));
 assert.throws(()=>new NativeBinding({path:f.path,host:{...f.host,boot:randomUUID()}}));
 assert.throws(()=>f.binding.consume({tool:'broker_receive',args:{}}));
});
test('expired or closed-host permits cannot act; closing cancels owner waiter',async t=>{
 const f=setup(t);const args=f.binding.issue({context:f.context,tool:'broker_connect',args:{}});f.advance();
 assert.throws(()=>f.binding.consume({tool:'broker_connect',args}));
 const waiting=createNativeWaiter({conversationId:f.context.conversationId,clientId:randomUUID(),inbox:{head:()=>null},
   isBound:()=>f.binding.isBound(f.context.conversationId),subscribe:()=>()=>{}}).wait({signal:f.binding.signal});
 f.binding.closeHost();assert.deepEqual(await waiting,{status:'cancelled'});
 assert.throws(()=>f.binding.issue({context:f.context,tool:'broker_receive',args:{}}));
});
test('failed consumption persistence rolls back; unknown commit fences and prevents replay after reopen',t=>{
 const f=setup(t);const args=f.binding.issue({context:f.context,tool:'broker_connect',args:{}});
 f.binding.failurePoint=p=>{if(p==='before_commit')throw Error('secret');};
 assert.throws(()=>f.binding.consume({tool:'broker_connect',args}),/^Error: native_binding_rejected$/);
 f.binding.failurePoint=p=>{if(p==='after_commit')throw Error('secret');};
 assert.throws(()=>f.binding.consume({tool:'broker_connect',args}));
 assert.equal(f.binding.unusable,true);
 const reopened=new NativeBinding({path:f.path,host:f.host,now:()=>1000});t.after(()=>reopened.dispose());
 assert.throws(()=>reopened.consume({tool:'broker_connect',args}));
});
test('native metadata spoof and wrong process chain fail closed',()=>{
 assert.throws(()=>nativeHookContext({conversationId:randomUUID()},{expectedHost:processIdentity(process.pid),env:{}}));
 const id=randomUUID();assert.throws(()=>nativeHookContext({conversationId:id},{expectedHost:processIdentity(process.pid),parentPid:process.pid,env:{ANTIGRAVITY_CONVERSATION_ID:id}}));
});

test('host death invalidates permits/isBound, and notice budgets persist across handles',t=>{
 const f=setup(t),args=f.binding.issue({context:f.context,tool:'broker_connect',args:{}});
 const key={conversationId:f.context.conversationId,clientId:randomUUID(),messageId:randomUUID()};
 assert.equal(f.binding.notice(key),'pending');assert.equal(f.binding.notice(key),'pending');
 const other=new NativeBinding({path:f.path,host:f.host});t.after(()=>other.dispose());
 assert.equal(other.notice(key),'attention');assert.equal(other.notice(key),'suppressed');
 assert.equal(f.binding.notice(key),'suppressed');
 f.binding.verifyHost=()=>false;
 assert.equal(f.binding.isBound(f.context.conversationId),false);
 assert.throws(()=>f.binding.consume({tool:'broker_connect',args}));
});

test('lifecycle tool permits require the same exact bound conversation, name and single-use arguments',t=>{
 const f=setup(t);const connect=f.binding.issue({context:f.context,tool:'broker_connect',args:{}});f.binding.consume({tool:'broker_connect',args:connect});
 for(const name of ['broker_sent_history','broker_message_content','broker_resend','broker_cancel']){
  const args=name==='broker_sent_history'?{limit:10}:{message_id:randomUUID()};
  const issued=f.binding.issue({context:f.context,tool:name,args});
  assert.throws(()=>f.binding.consume({tool:name,args:{...issued,unexpected:true}}));
  assert.deepEqual(f.binding.consume({tool:name,args:issued}).args,args);
  assert.throws(()=>f.binding.consume({tool:name,args:issued}));
  assert.throws(()=>f.binding.issue({context:{...f.context,conversationId:randomUUID()},tool:name,args}));
 }
});
