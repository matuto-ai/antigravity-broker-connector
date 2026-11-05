import test from 'node:test';
import assert from 'node:assert/strict';
import { PassThrough, Writable } from 'node:stream';
import { setTimeout as delay } from 'node:timers/promises';
import { serveStdio, TOOL_DEFINITIONS } from '../src/mcp-stdio.mjs';
import { PEER_GUIDANCE } from '../src/native-waiter.mjs';
const ids=['broker_sent_history','broker_message_content','broker_resend','broker_cancel'];
function rpc(tools,options={}){
 const input=new PassThrough(),responses=[];let text='';
 const output=new Writable({write(bytes,enc,done){text+=bytes;while(text.includes('\n')){const i=text.indexOf('\n');responses.push(JSON.parse(text.slice(0,i)));text=text.slice(i+1);}done();}});
 const server=serveStdio({input,output,tools,...options});let id=0;
 const send=(method,params,requestId=++id)=>input.write(JSON.stringify({jsonrpc:'2.0',id:requestId,method,params})+'\n');
 const call=async(method,params,requestId=++id)=>{const before=responses.length;send(method,params,requestId);for(let i=0;i<100;i++){const found=responses.slice(before).find(r=>r.id===requestId);if(found)return found;await delay(5);}throw Error('rpc_timeout');};
 const ready=async()=>{await call('initialize',{protocolVersion:'2025-06-18',capabilities:{},clientInfo:{name:'fixture',version:'1'}});input.write(JSON.stringify({jsonrpc:'2.0',method:'notifications/initialized'})+'\n');};
 return {server,call,send,ready};
}

test('diagnostic MCP initialization delivers shared peer guidance', async t => {
 const f=rpc({});t.after(()=>f.server.close());
 const response=await f.call('initialize',{protocolVersion:'2025-06-18',capabilities:{},clientInfo:{name:'fixture',version:'1'}});
 assert.ok(response.result.instructions.includes(PEER_GUIDANCE));
 assert.match(response.result.instructions,/Manual pulls are diagnostic\/test-only/);
});

const self='11111111-1111-4111-8111-111111111111',root='22222222-2222-4222-8222-222222222222';
const meta=(id=self,r=root)=>({'antigravity.google/conversation_id':id,'antigravity.google/root_conversation_id':r});
test('opt-in forwards only frozen validated native transport IDs, preserving child distinctions',async t=>{
 const seen=[];const f=rpc({broker_identity:async(args,ctx)=>{ctx.setResponseGuard(()=>true);seen.push({args,ctx});return {ok:true};}},{nativeTransportMetadata:true});t.after(()=>f.server.close());await f.ready();
 for(const m of [meta(self,self),{...meta(),'antigravity.google/parent_conversation_id':root,secret:'not-forwarded'}]){const response=await f.call('tools/call',{name:'broker_identity',arguments:{},_meta:m});assert.equal(response.result.isError,false);assert.deepEqual(seen.at(-1).args,{});assert.equal(seen.at(-1).ctx.nativeMeta['antigravity.google/conversation_id'],self);assert.equal(seen.at(-1).ctx.nativeMeta['antigravity.google/root_conversation_id'],m['antigravity.google/root_conversation_id']);assert.equal(seen.at(-1).ctx.nativeMeta.secret,undefined);assert(Object.isFrozen(seen.at(-1).ctx.nativeMeta));}
 assert.equal(seen[1].ctx.nativeMeta['antigravity.google/parent_conversation_id'],root);
 await f.server.close();assert(seen[0].ctx.signal.aborted);
});
test('invalid present transport identities never invoke handler; model args cannot spoof metadata',async t=>{
 let count=0;const f=rpc({broker_identity:async()=>{count++;return {};}},{nativeTransportMetadata:true});t.after(()=>f.server.close());await f.ready();
 for(const _meta of [null,[],{},meta('bad'),{...meta(),'antigravity.google/parent_conversation_id':null},{...meta(),'antigravity.google/root_conversation_id':'x'.repeat(200)}]){assert.equal((await f.call('tools/call',{name:'broker_identity',arguments:{},_meta})).error.code,-32602);}
 assert.equal((await f.call('tools/call',{name:'broker_identity',arguments:{_meta:meta()},_meta:meta()})).error.code,-32602);assert.equal(count,0);
});
test('missing native metadata explicitly remains null for owner rejection; opt-out retains old context',async t=>{
 for(const enabled of [true,false]){let context;const f=rpc({broker_identity:async(_,ctx)=>{context=ctx;return {};}},{nativeTransportMetadata:enabled});t.after(()=>f.server.close());await f.ready();await f.call('tools/call',{name:'broker_identity',arguments:{},...(enabled?{}:{_meta:'legacy-ignored'})});assert.equal(Object.hasOwn(context,'nativeMeta'),enabled);if(enabled)assert.equal(context.nativeMeta,null);}
});

for (const failure of [false,true]) test(`final stdout fence redacts queued ${failure?'error':'success'} and retains request ID`,async t=>{
 const input=new PassThrough(),frames=[];let release,blocked=false,owner='A',invocations=0;
 const output=new Writable({write(bytes,enc,done){frames.push(JSON.parse(bytes.toString()));if(blocked){blocked=false;release=done;}else done();}});
 const server=serveStdio({input,output,nativeTransportMetadata:true,tools:{broker_identity:async(_,ctx)=>{
   invocations++;const captured=owner;ctx.setResponseGuard(()=>owner===captured);
   return failure?{error:{code:'old_private_error',details:'old_private_receipt'}}:{private_body:'old_private_body',receipt:'old_private_receipt'};
 }}});t.after(()=>server.close());
 const send=(id,method,params)=>input.write(JSON.stringify({jsonrpc:'2.0',id,method,params})+'\n');
 send(1,'initialize',{protocolVersion:'2025-06-18',capabilities:{},clientInfo:{name:'fixture',version:'1'}});await server.flush();
 input.write(JSON.stringify({jsonrpc:'2.0',method:'notifications/initialized'})+'\n');
 blocked=true;send(2,'ping');await delay(10);assert.equal(typeof release,'function');
 send('raw-A','tools/call',{name:'broker_identity',arguments:{},_meta:meta(self,self)});await delay(10);assert.equal(invocations,1);
 send('raw-A','tools/call',{name:'broker_identity',arguments:{},_meta:meta(self,self)});await delay(10);assert.equal(invocations,1,'queued response still owns exact request ID');
 owner='B';release();await server.flush();
 const answers=frames.filter(f=>f.id==='raw-A');assert.equal(answers.length,2);assert.equal(answers[0].error.code,-32603);assert.match(answers[0].error.message,/Native root changed/);assert.equal(answers[1].error.code,-32600);
 assert(!JSON.stringify(answers).includes('old_private'));assert(!answers[0].result);
});
