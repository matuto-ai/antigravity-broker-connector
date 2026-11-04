import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {setupProviderStep as step} from './setup-provider-step.mjs';
const expectedRuntime={name:'fixture-connector',version:'9.8.7'};
const setupProviderStep=(input,state,url)=>step(input,state,url,expectedRuntime);
const prefix='Created At: 2026-11-03T00:00:00Z\nCompleted At: 2026-11-03T00:00:00Z\nA pre-tool hook changed the arguments of this tool call before it ran. Changed: Arguments.\n\n';
const tools=[{functionDeclarations:[{name:'call_mcp_tool'}]}];
function input(call,value){return {tools,contents:[{role:'model',parts:[{functionCall:call}]},{role:'user',parts:[{functionResponse:{name:'call_mcp_tool',response:{output:prefix+JSON.stringify(call.args.ToolName==='broker_setup_status'?{connector_runtime:expectedRuntime,...value}:value)}}}]}]};}
test('native setup proves empty startup, URL-only explicit setup and real pending request',()=>{
 const url='https://127.0.0.1:12345';let step=setupProviderStep({tools},{sent:0,completed:0},url);
 assert.equal(step.parts[0].functionCall.args.ToolName,'broker_setup_status');
 step=setupProviderStep(input(step.parts[0].functionCall,{state:'setup_needed',connected:false}),step.state,url);
 assert.deepEqual(step.parts[0].functionCall.args.Arguments,{broker_url:url});
 const requestId=randomUUID();step=setupProviderStep(input(step.parts[0].functionCall,{state:'pending',requestId,waiter_command:'opaque verified later'}),step.state,url);
 assert.equal(step.state.requestId,requestId);assert.equal(step.state.completed,2);assert.equal(step.parts[0].text,'OFFLINE_APPROVAL_PENDING');
});
test('preseeded/connected startup and fake success before pending cannot satisfy setup proof',()=>{
 const url='https://127.0.0.1:12345',first=setupProviderStep({tools},{sent:0,completed:0},url);
 for(const value of [{state:'approved',connected:true},{state:'setup_needed',connected:true}])assert.throws(()=>setupProviderStep(input(first.parts[0].functionCall,value),first.state,url));
 const pending=setupProviderStep(input(first.parts[0].functionCall,{state:'setup_needed',connected:false}),first.state,url);
 for(const value of [{state:'approved',requestId:randomUUID(),waiter_command:'x'},{state:'pending',requestId:'bad',waiter_command:'x'},{state:'pending',requestId:randomUUID()}])assert.throws(()=>setupProviderStep(input(pending.parts[0].functionCall,value),pending.state,url));
});
test('setup refuses missing or stale connector metadata before enrollment',()=>{
 const url='https://127.0.0.1:12345',first=setupProviderStep({tools},{sent:0,completed:0},url);
 for(const connector_runtime of [undefined,{...expectedRuntime,version:'0.1.1'},{...expectedRuntime,name:'other'}])assert.throws(()=>setupProviderStep(input(first.parts[0].functionCall,{state:'setup_needed',connected:false,connector_runtime}),first.state,url),/runtime mismatch/);
 assert.throws(()=>step({tools},{sent:0,completed:0},url),/expected connector runtime required/);
});
