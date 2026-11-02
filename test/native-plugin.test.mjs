import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { PassThrough } from 'node:stream';
import { randomUUID } from 'node:crypto';
import { serveNativePlugin, hookDecision, NATIVE_SERVER, waiterCommand } from '../src/native-plugin.mjs';
import { processIdentity, NativeBinding } from '../src/native-binding.mjs';
import { waitNativeProcess } from '../src/native-process-waiter.mjs';
import { httpFixture, registration, sendBody } from '../../ai-agent-msg-broker/test/helpers.mjs';

test('gated native wiring: disconnected start, hook permits, HTTP FIFO, waiter notices, ACK and cancellation', {timeout:15000}, async t=>{
  const root=mkdtempSync(join(tmpdir(),'agy-native-plugin-'));t.after(()=>rmSync(root,{recursive:true,force:true}));
  const broker=await httpFixture(t),tokenFile=join(root,'token');writeFileSync(tokenFile,broker.b.token,{mode:0o600});
  const host=processIdentity(process.pid),context={host,conversationId:randomUUID()};
  let configReads=0;
  const input=new PassThrough(),output=new PassThrough(),frames=[];let wire='';output.on('data',chunk=>{wire+=chunk;while(wire.includes('\n')){const at=wire.indexOf('\n');frames.push(JSON.parse(wire.slice(0,at)));wire=wire.slice(at+1);}});
  const ask=async(method,params,id)=>{input.write(JSON.stringify({jsonrpc:'2.0',method,params,...id?{id}:{}})+'\n');if(!id)return;for(let i=0;i<100;i++){const found=frames.find(row=>row.id===id);if(found)return found;await new Promise(r=>setTimeout(r,5));}throw Error('native_rpc_timeout');};
  const server=await serveNativePlugin({base:join(root,'native'),host,input,output,
    configReader:()=>{configReads++;return {brokerUrl:broker.base,tokenFile,stateRoot:join(root,'state'),insecureDevelopment:true,metadata:{name:'Native fixture',model:{provider:null,id:null,source:'unknown'},project:null}};}});
  t.after(()=>server.close());assert.equal(configReads,0);
  const nativeCall=async(tool,args={})=>{
    const decision=hookDecision({input:{toolCall:{name:'call_mcp_tool',args:{ServerName:NATIVE_SERVER,ToolName:tool,Arguments:args}}},context,binding:server.binding,directory:server.directory});
    assert.equal(decision.decision,'allow');assert.equal(Object.hasOwn(decision,'permissionOverrides'),false);
    return server.tools[tool](decision.overwrite.Arguments);
  };
  await assert.rejects(server.tools.broker_identity({}),/native_binding_rejected/);
  const connected=await nativeCall('broker_connect',{connection_file:'/synthetic/fixture.json'});
  assert.equal(connected.connected,true);assert.equal(connected.automatic_delivery_certified,false);
  assert.equal(connected.waiter_command,waiterCommand(server.directory));
  assert.equal((await nativeCall('broker_connect',{connection_file:'/synthetic/fixture.json'})).client_id,connected.client_id);
  await assert.rejects(nativeCall('broker_connect',{pairing_file:'/synthetic/new-grant.json'}),/disconnect_before_repair/);
  assert.equal((await nativeCall('broker_identity')).conversation_id,context.conversationId);
  const other=hookDecision({input:{toolCall:{name:'call_mcp_tool',args:{ServerName:NATIVE_SERVER,ToolName:'broker_receive',Arguments:{}}}},context:{...context,conversationId:randomUUID()},binding:server.binding,directory:server.directory});
  assert.equal(other.decision,'deny');
  const arm=()=>{
    const decision=hookDecision({input:{toolCall:{name:'run_command',args:{CommandLine:connected.waiter_command}}},context,binding:server.binding,directory:server.directory});
    assert.equal(decision.decision,'allow');const permit=decision.overwrite.CommandLine.match(/'([0-9a-f-]{36})'$/)[1];
    return waitNativeProcess({directory:server.directory,permit});
  };
  const sender=registration('pi');await broker.request('/v1/sessions',{method:'POST',body:sender});
  assert(Array.isArray((await nativeCall('broker_list_clients')).clients));
  const waiting=arm();
  const sent=await broker.request('/v1/messages',{method:'POST',session:sender.client_id,key:randomUUID(),body:sendBody(connected.client_id,'synthetic untrusted inbox text')});
  assert.equal(sent.status,202);assert.match(await waiting,/durable pending/);
  // A lost first notice can be retried once; no implicit ACK.
  assert.match(await arm(),/durable pending/);
  assert.match(await arm(),/attention required/);
  const silent=arm();
  const received=await nativeCall('broker_receive');assert.equal(received.message_id,sent.body.message_id);
  await ask('initialize',{protocolVersion:'2025-06-18',capabilities:{},clientInfo:{name:'native-receive-fixture',version:'1'}},1);await ask('notifications/initialized',{});
  const shown=await ask('tools/call',{name:'broker_receive',arguments:server.binding.issue({context,tool:'broker_receive',args:{}})},2);
  assert.deepEqual(shown.result.structuredContent,received);assert.match(shown.result.content[0].text,/^Psst · mensagem de outro agente/);assert.match(shown.result.content[0].text,/\n    synthetic untrusted inbox text/);
  await nativeCall('broker_acknowledge',{message_id:received.message_id});
  assert.equal((await nativeCall('broker_receive')).message,null);
  await nativeCall('broker_disconnect');assert.match(await silent,/disconnected/);
  await assert.rejects(nativeCall('broker_receive'),/native_not_connected/);
});

test('disconnect during delayed connect closes the candidate and never publishes it',async t=>{
 const root=mkdtempSync(join(tmpdir(),'agy-native-race-'));t.after(()=>rmSync(root,{recursive:true,force:true}));
 const host=processIdentity(process.pid),context={host,conversationId:randomUUID()};let release,closed=0;
 const started=new Promise(resolve=>{release=resolve;});
 const server=await serveNativePlugin({base:root,host,input:new PassThrough(),output:new PassThrough(),configReader:()=>({}),sessionFactory:async()=>{await started;return {identity:{client_id:randomUUID()},inbox:{directory:root},tools:{},close:async()=>{closed++;}};}});t.after(()=>server.close());
 const call=(tool,args={})=>server.tools[tool](server.binding.issue({context,tool,args}));
 const connecting=call('broker_connect',{connection_file:'/fixture'});
 await call('broker_disconnect');release();await assert.rejects(connecting,/native_host_unavailable/);assert.equal(closed,1);
});

test('credential expiry stops native transport and releases an idle waiter', {timeout:5000}, async t=>{
 const root=mkdtempSync(join(tmpdir(),'agy-native-expiry-'));t.after(()=>rmSync(root,{recursive:true,force:true}));
 const broker=await httpFixture(t),tokenFile=join(root,'token');writeFileSync(tokenFile,broker.b.token,{mode:0o600});
 const host=processIdentity(process.pid),context={host,conversationId:randomUUID()};
 const server=await serveNativePlugin({base:join(root,'native'),host,input:new PassThrough(),output:new PassThrough(),configReader:()=>({brokerUrl:broker.base,tokenFile,stateRoot:join(root,'state'),insecureDevelopment:true,
   enrollment:{expiresAt:new Date(Date.now()+100).toISOString()},metadata:{name:'Expiry fixture',model:{provider:null,id:null,source:'unknown'},project:null}})});t.after(()=>server.close());
 const call=(tool,args={})=>server.tools[tool](server.binding.issue({context,tool,args}));
 await call('broker_connect',{connection_file:'/synthetic/expiry.json'});
 const permit=server.binding.issue({context,tool:'broker_wait',args:{}}).__psst_permit;
 const result=await waitNativeProcess({directory:server.directory,permit});
 assert.match(result,/disconnected/);await assert.rejects(call('broker_receive'),/native_not_connected/);
});

test('MCP EOF/restart preserves conversation fence, rejects concurrent owner and invalidates stale permits',async t=>{
 const root=mkdtempSync(join(tmpdir(),'agy-native-restart-'));t.after(()=>rmSync(root,{recursive:true,force:true}));
 const host=processIdentity(process.pid),context={host,conversationId:randomUUID()};let closed=0;
 const options={base:root,host,configReader:()=>({}),sessionFactory:async()=>({identity:{client_id:randomUUID()},inbox:{directory:root},tools:{broker_identity:async()=>({})},close:async()=>{closed++;}})};
 const start=()=>serveNativePlugin({...options,input:new PassThrough(),output:new PassThrough()});
 const first=await start();const call=(server,tool,args={})=>server.tools[tool](server.binding.issue({context,tool,args}));
 const original=await call(first,'broker_connect',{connection_file:'/fixture'});
 const stale=first.binding.issue({context,tool:'broker_identity',args:{}});
 const oldHook=new NativeBinding({path:join(first.directory,'binding.sqlite'),host,ownerEpoch:first.binding.ownerEpoch});t.after(()=>oldHook.dispose());
 await assert.rejects(start(),/native_owner_unavailable/);
 await first.close();assert.equal(closed,1);
 const second=await start();t.after(()=>second.close());
 await assert.rejects(second.tools.broker_identity(stale),/native_binding_rejected/);
 assert.throws(()=>oldHook.issue({context,tool:'broker_identity',args:{}}),/native_binding_rejected/);
 assert.throws(()=>second.binding.issue({context:{...context,conversationId:randomUUID()},tool:'broker_connect',args:{connection_file:'/fixture'}}));
 const replacement=await call(second,'broker_connect',{connection_file:'/fixture'});
 assert.notEqual(replacement.client_id,original.client_id);
});
