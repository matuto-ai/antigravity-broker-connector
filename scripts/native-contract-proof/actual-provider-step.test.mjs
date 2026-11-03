import test from 'node:test';import assert from 'node:assert/strict';
import {actualProviderStep} from './actual-provider-step.mjs';
const tools=[{functionDeclarations:[{name:'call_mcp_tool',parameters:{properties:{ServerName:{type:'string'},ToolName:{type:'string'},Arguments:{type:'object'}}}}]}];
const input=response=>({tools,contents:response?[{role:'user',parts:[{functionResponse:{name:'call_mcp_tool',response:{content:[{type:'text',text:JSON.stringify(response)}]}}}]}]:[]});
test('only real status then identity and projects safe identity fields',()=>{
 const first=actualProviderStep(input(),{sent:0,completed:0});assert.equal(first.parts[0].functionCall.args.ToolName,'broker_setup_status');
 const second=actualProviderStep(input({connected:true,mode:'automatic_required'}),first.state);assert.equal(second.parts[0].functionCall.args.ToolName,'broker_identity');
 const third=actualProviderStep(input({native_session_binding:true,endpoint_scope:'experimental_native_conversation',conversation_id:'4f009a93-8efc-4e03-b7ee-f68f0c943905',client_id:'fixture-client',secret:'never project'}),second.state);
 assert.equal(third.parts[0].text,'OFFLINE_ACTUAL_PROBE_FINISHED');assert.equal(third.identity.secret,undefined);assert.equal(third.state.completed,2);
});
test('refuses missing schema, missing response, disconnected status, synthetic identity',()=>{
 assert.throws(()=>actualProviderStep({tools:[{functionDeclarations:[{name:'call_mcp_tool',parameters:{properties:{}}}]}]}, {sent:0,completed:0}),/schema/);
 assert.throws(()=>actualProviderStep(input(),{sent:1,completed:0}),/missing native/);
 assert.throws(()=>actualProviderStep(input({connected:false}),{sent:1,completed:0}),/not connected/);
 assert.throws(()=>actualProviderStep(input({client_id:'fake'}),{sent:2,completed:1}),/identity response/);
});

test('native no-tools warmup is benign without advancing state; pending response still required',()=>{
 const state={sent:0,completed:0};for(const data of [{},{tools:[]},{tools:[{functionDeclarations:[]}]}]){const result=actualProviderStep(data,state);assert.deepEqual(result.state,state);assert.equal(result.parts[0].text,'OFFLINE_ACTUAL_PROBE_READY');}
 assert.throws(()=>actualProviderStep({}, {sent:1,completed:0}),/missing native tool response/);
});
