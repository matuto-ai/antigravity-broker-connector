import test from 'node:test';import assert from 'node:assert/strict';
import {actualProviderStep,actualResponseDiagnostics,nativeNoticeShape} from './actual-provider-step.mjs';
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

test('status diagnostics expose only allowlisted classification, never secrets or raw text',()=>{
 const secret='secret-token-and-permit';const value={unexpected:secret,content:[{type:'text',text:'```json\n{"connected":false,"mode":"automatic_required","state":"attention_required","token":"'+secret+'"}\n```'},{type:'text',text:'native_binding_rejected '+secret}],isError:true};
 const diag=actualResponseDiagnostics(value);assert(!JSON.stringify(diag).includes(secret));assert(diag.textShape.fencedJson);assert(diag.textShape.hasConnectedFalse);assert.deepEqual(diag.knownErrors,['native_binding_rejected']);
 assert.throws(()=>actualProviderStep(input({connected:false,state:'attention_required',token:secret}),{sent:1,completed:0}),error=>error.proofDiagnostics.connected[0]===false&&!JSON.stringify(error.proofDiagnostics).includes(secret));
});

test('native notice diagnostic vocabulary masks tokens, paths, identifiers and unknown words',()=>{
 const text='Note: Hook PreToolUse modified Arguments with /private/secret-file secret-token 123e4567-e89b-12d3-a456-426614174000.\n{"connected":true,"token":"SECRET"}';
 const diag=actualResponseDiagnostics({output:text,privateKey:'unknown-secret'});const wire=JSON.stringify(diag);
 for(const secret of ['private','secret-file','secret-token','123e4567','SECRET','unknown-secret','privateKey'])assert(!wire.includes(secret));
 assert(diag.wrapperKeys.output);assert(!diag.wrapperKeys.content);assert(diag.noticeShapes[0].shape.includes('Hook PreToolUse modified Arguments'));assert(diag.noticeShapes[0].trailingObject);
 assert.equal(nativeNoticeShape('Note: {"ok":true} trailing').trailingObject,false);assert.equal(nativeNoticeShape('Note: {} {}').trailingObject,false);assert.equal(nativeNoticeShape('Note: {"ok":').trailingObject,false);
 assert(nativeNoticeShape('x'.repeat(600)+' {}').prefixTruncated);
 assert.throws(()=>actualProviderStep({tools,contents:[{parts:[{functionResponse:{name:'call_mcp_tool',response:{output:text}}}]}]},{sent:1,completed:0}),/actual setup status not connected/);
});

test('verified static native notice words remain visible without allowing unknown material',()=>{
 const notice='A pre-tool hook changed the arguments of this tool call before it ran.';
 const result=nativeNoticeShape(notice+'\n{"connected":true}');assert.equal(result.shape,notice);assert(result.trailingObject);
});

test('notice projection preserves line boundaries and masks times with only fixed new words',()=>{
 const shape=nativeNoticeShape('Start Time: 2026-11-03 00:52:23 UTC\nEnd Time: 2026-11-03 00:52:24 UTC\nA pre-tool hook changed the arguments of this tool call before it ran. Changed: Arguments.\n{"connected":true}').shape;
 assert.equal(shape,'Start Time: ? ?:?:? UTC\nEnd Time: ? ?:?:? UTC\nA pre-tool hook changed the arguments of this tool call before it ran. Changed: Arguments.');assert(!/2026|52|23/.test(shape));
});
