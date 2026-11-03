import test from 'node:test';
import assert from 'node:assert/strict';
import {writeFileSync,mkdtempSync,rmSync} from 'node:fs';
import {join,resolve} from 'node:path';
import {tmpdir} from 'node:os';
import {pathToFileURL} from 'node:url';
import {randomUUID} from 'node:crypto';
import {PassThrough} from 'node:stream';
import {serveNativePlugin} from '../src/native-plugin.mjs';
import {processIdentity} from '../src/native-binding.mjs';
import {waitNativeProcess} from '../src/native-process-waiter.mjs';
const {httpFixture,registration,sendBody}=await import(pathToFileURL(join(resolve(process.env.PSST_MESSAGE_TEST_SOURCE??'../ai-agent-msg-broker'),'test/helpers.mjs')));

test('real HTTP broker notices reach native-bound MCP separately and ACK only explicit event',async t=>{
 const root=mkdtempSync(join(tmpdir(),'ag-presence-native-'));t.after(()=>rmSync(root,{recursive:true,force:true}));
 const broker=await httpFixture(t),tokenFile=join(root,'token');writeFileSync(tokenFile,broker.b.token,{mode:0o600});
 const host=processIdentity(process.pid),context={host,conversationId:randomUUID()},nativeMeta={'antigravity.google/conversation_id':context.conversationId,'antigravity.google/root_conversation_id':context.conversationId};
 const input=new PassThrough(),output=new PassThrough(),frames=[];let wire='';output.on('data',chunk=>{wire+=chunk;while(wire.includes('\n')){const at=wire.indexOf('\n');frames.push(JSON.parse(wire.slice(0,at)));wire=wire.slice(at+1);}});
 const server=await serveNativePlugin({base:join(root,'native'),host,input,output,configReader:()=>({brokerUrl:broker.base,tokenFile,stateRoot:join(root,'state'),insecureDevelopment:true,metadata:registration().metadata})});t.after(()=>server.close());
 const call=(name,args={})=>server.tools[name](server.binding.issue({context,tool:name,args}),{nativeMeta});
 const connected=await call('broker_connect',{connection_file:'/synthetic/config'});
 const recipient=registration('pi');broker.store.register(broker.a.entry,recipient);
 const sent=await call('broker_send',{recipient_id:recipient.client_id,text:'private agent body'});assert.ok(sent.message_id);
 broker.store.disconnect(broker.a.entry,recipient.client_id,1);broker.advance(600000);
 // Native connector uses wall time; only broker's absence clock advances here.
 const read=await call('broker_presence_events');assert.equal(read.events.length,1);assert.equal((await call('broker_receive')).message,null);
 const id=read.events[0].event_id;assert.doesNotMatch(JSON.stringify(read),/private agent body/);
 const wait=()=>waitNativeProcess({directory:server.directory,permit:server.binding.issue({context,tool:'broker_wait',args:{}}).__psst_permit});
 assert.match(await wait(),/transport notice available/);assert.match(await wait(),/transport notice available/);assert.match(await wait(),/requires attention/);
 assert.equal((await call('broker_presence_events')).events.length,1,'waiter stdout is not acknowledgment');
 const ask=async(method,params,id)=>{input.write(JSON.stringify({jsonrpc:'2.0',method,params,...id?{id}:{}})+'\n');if(!id)return;for(let i=0;i<200;i++){const response=frames.find(r=>r.id===id);if(response)return response;await new Promise(r=>setTimeout(r,5));}throw Error('rpc_timeout');};
 await ask('initialize',{protocolVersion:'2025-06-18',capabilities:{},clientInfo:{name:'fixture',version:'1'}},1);await ask('notifications/initialized',{});
 const shown=await ask('tools/call',{name:'broker_presence_events',arguments:server.binding.issue({context,tool:'broker_presence_events',args:{}}),_meta:nativeMeta},2);
 assert.match(shown.result.content[0].text,/^Psst · transport notice/);assert.equal(shown.result.structuredContent.events[0].event_id,id);assert.equal(shown.result.structuredContent.native_acceptance_recorded,false);
 assert.equal((await call('broker_acknowledge_presence_event',{event_id:id})).acknowledged,true);
 assert.equal((await call('broker_presence_events')).events.length,0);
 assert.equal((await call('broker_message_status',{message_id:sent.message_id})).delivery_state,'queued');
});
