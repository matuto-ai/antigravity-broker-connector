import test from 'node:test';import assert from 'node:assert/strict';
import {actualProviderStep,actualResponseDiagnostics,nativeNoticeShape} from './actual-provider-step.mjs';
const tools=[{functionDeclarations:[{name:'call_mcp_tool',parameters:{properties:{ServerName:{type:'string'},ToolName:{type:'string'},Arguments:{type:'object'}}}}]}];
const nativePrefix='Created At: 2026-11-03T00:56:00Z\nCompleted At: 2026-11-03T00:56:01Z\nA pre-tool hook changed the arguments of this tool call before it ran. Changed: Arguments.\n\n';
const model=tool=>({role:'model',parts:[{functionCall:{name:'call_mcp_tool',args:{ServerName:'psst-native_psst',ToolName:tool,Arguments:{}}}}]});
const input=response=>({tools,contents:response?[model(response.native_session_binding?'broker_identity':'broker_setup_status'),{role:'user',parts:[{functionResponse:{name:'call_mcp_tool',response:{output:nativePrefix+JSON.stringify(response)}}}]}]:[]});
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
 assert.throws(()=>actualProviderStep(input({client_id:'fake',native_session_binding:true}),{sent:2,completed:1}),/identity response/);
});

test('native no-tools warmup is benign without advancing state; pending response still required',()=>{
 const state={sent:0,completed:0};for(const data of [{},{tools:[]},{tools:[{functionDeclarations:[]}]}]){const result=actualProviderStep(data,state);assert.deepEqual(result.state,state);assert.equal(result.parts[0].text,'OFFLINE_ACTUAL_PROBE_READY');}
 assert.throws(()=>actualProviderStep({}, {sent:1,completed:0}),/missing native tool response/);
});

test('status diagnostics expose only allowlisted classification, never secrets or raw text',()=>{
 const secret='secret-token-and-permit';const value={unexpected:secret,content:[{type:'text',text:'```json\n{"connected":false,"mode":"automatic_required","state":"attention_required","token":"'+secret+'"}\n```'},{type:'text',text:'native_binding_rejected '+secret}],isError:true};
 const diag=actualResponseDiagnostics(value);assert(!JSON.stringify(diag).includes(secret));assert(diag.textShape.fencedJson);assert(diag.textShape.hasConnectedFalse);assert.deepEqual(diag.knownErrors,['native_binding_rejected']);
 assert.throws(()=>actualProviderStep(input({connected:false,state:'attention_required',token:secret}),{sent:1,completed:0}),error=>error.proofDiagnostics.textShape.hasConnectedFalse&&!JSON.stringify(error.proofDiagnostics).includes(secret));
});

test('native notice diagnostic vocabulary masks tokens, paths, identifiers and unknown words',()=>{
 const text='Note: Hook PreToolUse modified Arguments with /private/secret-file secret-token 123e4567-e89b-12d3-a456-426614174000.\n{"connected":true,"token":"SECRET"}';
 const diag=actualResponseDiagnostics({output:text,privateKey:'unknown-secret'});const wire=JSON.stringify(diag);
 for(const secret of ['private','secret-file','secret-token','123e4567','SECRET','unknown-secret','privateKey'])assert(!wire.includes(secret));
 assert(diag.wrapperKeys.output);assert(!diag.wrapperKeys.content);assert(diag.noticeShapes[0].shape.includes('Hook PreToolUse modified Arguments'));assert(diag.noticeShapes[0].trailingObject);
 assert.equal(nativeNoticeShape('Note: {"ok":true} trailing').trailingObject,false);assert.equal(nativeNoticeShape('Note: {} {}').trailingObject,false);assert.equal(nativeNoticeShape('Note: {"ok":').trailingObject,false);
 assert(nativeNoticeShape('x'.repeat(600)+' {}').prefixTruncated);
 assert.throws(()=>actualProviderStep({tools,contents:[model('broker_setup_status'),{parts:[{functionResponse:{name:'call_mcp_tool',response:{output:text}}}]}]},{sent:1,completed:0}),/unsupported_native_response_envelope/);
});

test('verified static native notice words remain visible without allowing unknown material',()=>{
 const notice='A pre-tool hook changed the arguments of this tool call before it ran.';
 const result=nativeNoticeShape(notice+'\n{"connected":true}');assert.equal(result.shape,notice);assert(result.trailingObject);
});

test('notice projection preserves line boundaries and masks times with only fixed new words',()=>{
 const shape=nativeNoticeShape('Start Time: 2026-11-03 00:52:23 UTC\nEnd Time: 2026-11-03 00:52:24 UTC\nA pre-tool hook changed the arguments of this tool call before it ran. Changed: Arguments.\n{"connected":true}').shape;
 assert.equal(shape,'Start Time: ? ?:?:? UTC\nEnd Time: ? ?:?:? UTC\nA pre-tool hook changed the arguments of this tool call before it ran. Changed: Arguments.');assert(!/2026|52|23/.test(shape));
});
test('strict native envelope accepts only exact pinned observed notice and time headers',async()=>{
 const {decodeNativeToolResponse}=await import('./actual-provider-step.mjs');
 const prefix='Created At: 2026-11-03T00:56:00Z\nCompleted At: 2026-11-03T00:56:01Z\nA pre-tool hook changed the arguments of this tool call before it ran. Changed: Arguments.\n\n';
 const data={connected:true,mode:'automatic_required'};
 assert.deepEqual(decodeNativeToolResponse({output:prefix+JSON.stringify(data)}),data);
 assert.throws(()=>decodeNativeToolResponse({output:prefix+'\n'+JSON.stringify(data)}));
 for(const text of [prefix.replace('Created','Spoofed')+'{}',prefix.replace('00:56:00','24:56:00')+'{}',prefix.replace('Arguments.','Other.')+'{}',prefix+'{} suffix',prefix+'{} {}',prefix+'{"bad":',prefix+'{"error":"forbidden"}',prefix+'{"isError":true}',prefix+'[]',prefix+'null',prefix+'\n\n{}'])assert.throws(()=>decodeNativeToolResponse({output:text}));
 assert.throws(()=>decodeNativeToolResponse({output:prefix+'{}',error:false}));
});

test('response binds preceding wrapper call and any supplied id',async()=>{
 const {correlateNativeResponse}=await import('./actual-provider-step.mjs');
 const x=input({connected:true});assert(correlateNativeResponse(x,'broker_setup_status'));
 assert.throws(()=>correlateNativeResponse(x,'broker_identity'),/call mismatch/);
 x.contents[0].parts[0].functionCall.id='call1';x.contents[1].parts[0].functionResponse.id='call2';assert.throws(()=>correlateNativeResponse(x,'broker_setup_status'),/id mismatch/);
 x.contents[1].parts[0].functionResponse.id='call1';assert(correlateNativeResponse(x,'broker_setup_status'));
 x.contents[0].role='user';assert.throws(()=>correlateNativeResponse(x,'broker_setup_status'),/model call missing/);
});

test('no legacy envelope fallback or nested fake connected status is accepted',async()=>{
 const {decodeNativeToolResponse}=await import('./actual-provider-step.mjs');
 for(const value of [{connected:true},{content:[{text:'{"connected":true}'}]},null,[]])assert.throws(()=>decodeNativeToolResponse(value),/unsupported_native_response_envelope/);
 assert.throws(()=>actualProviderStep(input({nested:{connected:true,mode:'automatic_required'}}),{sent:1,completed:0}),/actual setup status not connected/);
});

test('header format diagnostics mask all digits and unknown text, count exact separators',async()=>{
 const {nativeHeaderFormat}=await import('./actual-provider-step.mjs');
 const text='Created At: 2026-11-03 01:03:45.123Z\n\nCompleted At: 01:03:46+01:00\nA pre-tool hook changed the arguments of this tool call before it ran. Changed: Arguments.\n\n{}';
 const d=nativeHeaderFormat(text);assert.equal(d.createdShape,' dddd-dd-dd dd:dd:dd.dddZ');assert.equal(d.completedShape,' dd:dd:dd+dd:dd');assert.equal(d.headerNewlines,2);assert.equal(d.noticeNewlines,1);assert.equal(d.bodyNewlines,2);assert.deepEqual(d.carriageReturns,[0,0,0]);
 const wire=JSON.stringify(nativeHeaderFormat(text.replace('2026-11-03 01:03:45.123Z','SECRET/token')));assert(!wire.includes('SECRET'));assert(!wire.includes('token'));assert.deepEqual(nativeHeaderFormat('other header secret'),{matchedHeaders:false});
 assert.equal(actualResponseDiagnostics({output:text,extra:'SECRET'}).wrapperKeyCount,2);
});

test('recorded native envelope shape uses exact real UTC calendar timestamps',async()=>{
 const {readFileSync}=await import('node:fs');const {decodeNativeToolResponse}=await import('./actual-provider-step.mjs');
 const record=JSON.parse(readFileSync(new URL('./recorded-actual-envelope.json',import.meta.url)));assert.equal(record.provenance.run,'41557405226');assert(record.provenance.synthetic_dates);
 assert.deepEqual(decodeNativeToolResponse(record.response),{connected:true,mode:'automatic_required'});
 for(const stamp of ['00:56:00','2026-02-30T00:56:00Z','2026-13-01T00:56:00Z','2026-11-03T00:56:00.123Z','2026-11-03T00:56:00+00:00','2026-11-03X00:56:00Z'])assert.throws(()=>decodeNativeToolResponse({output:record.response.output.replace('2026-11-03T00:56:00Z',stamp)}));
 assert.throws(()=>decodeNativeToolResponse({output:record.response.output.replace('Arguments.\n\n','Arguments.\n')}));
 const request=input({connected:true,mode:'automatic_required'});request.contents[1].parts[0].functionResponse.response=record.response;const next=actualProviderStep(request,{sent:1,completed:0});assert.equal(next.parts[0].functionCall.args.ToolName,'broker_identity');
});
