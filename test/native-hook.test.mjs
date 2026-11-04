import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { handleNativeHook, hookDecision, NATIVE_SERVER, waiterCommand, approvalWaiterCommand } from '../src/native-plugin.mjs';

test('unrelated PreToolUse calls explicitly delegate without binding, mutation or permission overrides',()=>{
 const directory='/synthetic/psst-owner';
 const binding={issue(){assert.fail('unrelated calls must not issue Psst permits');}};
 const calls=[
  {name:'run_command',args:{CommandLine:'echo fixture'}},
  {name:'call_mcp_tool',args:{ServerName:'other_server',ToolName:'broker_identity',Arguments:{}}},
 ];
 for(const toolCall of calls){
  const input={conversationId:randomUUID(),toolCall},before=structuredClone(input);
  assert.deepEqual(hookDecision({input,binding,directory}),{decision:'allow'});
  // An impossible parent proves unrelated calls do not depend on native Psst state.
  assert.deepEqual(handleNativeHook(input,{parentPid:-1,base:'/nonexistent/psst-fixture',env:{}}),{decision:'allow'});
  assert.deepEqual(input,before);
 }
});

test('Psst calls still deny invalid bindings while unrelated pass-through never approves them',()=>{
 const directory='/synthetic/psst-owner';
 const binding={issue(){throw Error('synthetic_rejected_binding');}};
 const calls=[
  {name:'call_mcp_tool',args:{ServerName:NATIVE_SERVER,ToolName:'broker_identity',Arguments:{}}},
  {name:'call_mcp_tool',args:{ServerName:NATIVE_SERVER,ToolName:'broker_setup_status',Arguments:{}}},
  {name:'run_command',args:{CommandLine:waiterCommand(directory)}},
  {name:'run_command',args:{CommandLine:approvalWaiterCommand(directory)}},
 ];
 for(const toolCall of calls){
  const result=hookDecision({input:{toolCall},binding,directory});
  assert.equal(result.decision,'deny');
  assert.equal(Object.hasOwn(result,'permissionOverrides'),false);
  assert.equal(Object.hasOwn(result,'overwrite'),false);
 }
});
