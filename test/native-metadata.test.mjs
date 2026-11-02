import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { nativeMetadataObservation, nativeMetadata } from '../src/native-metadata.mjs';
import { readConnectorConfig } from '../src/connector-config.mjs';
const host={pid:12,start:'1',boot:randomUUID(),executable:'/fixture/cli'};
const conversationId=randomUUID(), context={host,conversationId};
const config={metadata:{name:'Antigravity',project:null,model:{provider:null,id:null,source:'unknown'}}};
test('native observation exposes bounded labels, never full workspace paths or inferred provider',()=>{
 const metadata=nativeMetadataObservation({modelName:'gemini-test',workspacePaths:['/private/projects/example']});
 assert.deepEqual(metadata,{model:{provider:null,id:'gemini-test',source:'observed'},project:'example'});
 assert.equal(JSON.stringify(metadata).includes('/private'),false);
 assert.deepEqual(nativeMetadataObservation({modelName:'secret\nvalue',workspacePaths:['/a','/b']}),{});
 assert.deepEqual(nativeMetadataObservation({modelName:'x'.repeat(257),workspacePaths:['relative']}),{});
});
test('only exact native context supplies observed model/project and configuration keeps precedence',()=>{
 const event={...context,metadata:nativeMetadataObservation({modelName:'native-model',workspacePaths:['/private/project']})};
 assert.deepEqual(nativeMetadata(config,event,context,{}),{name:'Antigravity',project:'project',model:{provider:null,id:'native-model',source:'observed'}});
 assert.equal(nativeMetadata({...config,project:'explicit'},event,context,{AI_AGENTS_SANDBOX_PROJECT_NAME:'environment'}).project,'explicit');
 assert.equal(nativeMetadata(config,event,context,{AI_AGENTS_SANDBOX_PROJECT_NAME:'environment'}).project,'environment');
 assert.strictEqual(nativeMetadata(config,{...event,conversationId:randomUUID()},context,{}),config.metadata);
 assert.strictEqual(nativeMetadata(config,{...event,host:{...host,start:'other'}},context,{}),config.metadata);
 assert.strictEqual(nativeMetadata(config,undefined,context,{}),config.metadata);
 const configured={...config,metadata:{...config.metadata,model:{provider:null,id:'configured',source:'configured'}}};
 assert.equal(nativeMetadata(configured,{...context,metadata:{}},context,{}).model.source,'configured');
});
test('connector config project selector validates only the selected operator environment value',t=>{
 const root=mkdtempSync(join(tmpdir(),'agy-project-metadata-'));t.after(()=>rmSync(root,{recursive:true,force:true}));
 const path=join(root,'config.json'),base={brokerUrl:'https://broker.example',tokenFile:join(root,'token'),stateRoot:join(root,'state'),name:'Antigravity',projectEnv:'PROJECT_LABEL'};
 writeFileSync(path,JSON.stringify(base),{mode:0o600});
 assert.equal(readConnectorConfig(path,{PROJECT_LABEL:'chosen'}).metadata.project,'chosen');
 assert.equal(readConnectorConfig(path,{PSST_PROJECT_ENV:'OTHER',OTHER:'selected',PROJECT_LABEL:'not-selected'}).metadata.project,'selected');
 writeFileSync(path,JSON.stringify({...base,project:'explicit'}));
 assert.equal(readConnectorConfig(path,{PROJECT_LABEL:'not-selected'}).metadata.project,'explicit');
});

test('native connection registration and send observer read only the bound private event',async t=>{
 const {serveNativePlugin}=await import('../src/native-plugin.mjs');
 const {processIdentity}=await import('../src/native-binding.mjs');
 const {PassThrough}=await import('node:stream');
 const root=mkdtempSync(join(tmpdir(),'agy-native-metadata-'));t.after(()=>rmSync(root,{recursive:true,force:true}));
 const host=processIdentity(process.pid),conversationId=randomUUID(),context={host,conversationId};let captured;
 const server=await serveNativePlugin({base:root,host,input:new PassThrough(),output:new PassThrough(),configReader:()=>config,
  sessionFactory:async options=>{captured=options;return {identity:{client_id:randomUUID()},inbox:{directory:root},tools:{},close:async()=>{}};}});
 t.after(()=>server.close());
 const eventFile=join(server.directory,'native-event.json');
 const save=(model,id=conversationId)=>writeFileSync(eventFile,JSON.stringify({host,conversationId:id,metadata:{model:{provider:null,id:model,source:'observed'},project:'project'}}),{mode:0o600});
 save('first-model');
 await server.tools.broker_connect(server.binding.issue({context,tool:'broker_connect',args:{connection_file:'/synthetic/config'}}));
 assert.equal(captured.config.metadata.model.id,'first-model');
 assert.equal(captured.config.metadata.project,'project');
 save('next-model');assert.equal(captured.observeMetadata().model.id,'next-model');
 save('foreign-model',randomUUID());assert.equal(captured.observeMetadata().model.source,'unknown');
 assert.equal(config.metadata.model.source,'unknown');
});

test('real native HTTP registration and send publish observed metadata without changing identity or retry snapshot',async t=>{
 const {httpFixture,registration}=await import('../../ai-agent-msg-broker/test/helpers.mjs');
 const {startNativeSession}=await import('../src/native-session.mjs');
 const broker=await httpFixture(t),peer=registration('pi');
 await broker.request('/v1/sessions',{method:'POST',body:peer});
 const root=mkdtempSync(join(tmpdir(),'agy-native-metadata-http-'));t.after(()=>rmSync(root,{recursive:true,force:true}));
 const tokenFile=join(root,'token');writeFileSync(tokenFile,broker.b.token,{mode:0o600});
 let observed={name:'Antigravity',project:'first-project',model:{provider:null,id:'first-model',source:'observed'}};
 const session=await startNativeSession({config:{brokerUrl:broker.base,tokenFile,stateRoot:join(root,'state'),insecureDevelopment:true,metadata:observed},conversationId:randomUUID(),isAlive:()=>true,observeMetadata:()=>observed});
 t.after(()=>session.close());const id=session.identity.client_id;
 const self=async()=>(await session.tools.broker_list_clients({})).clients.find(row=>row.client_id===id);
 assert.equal((await self()).model.id,'first-model');
 observed={...observed,project:'next-project',model:{provider:null,id:'next-model',source:'observed'}};
 const args={recipient_id:peer.client_id,text:'metadata fixture'},operation={operationId:'same-operation'};
 const sent=await session.tools.broker_send(args,operation);assert(sent.message_id,JSON.stringify(sent));
 assert.equal((await self()).project,'next-project');assert.equal((await self()).model.id,'next-model');
 observed={...observed,model:{provider:null,id:'later-model',source:'observed'}};
 const replay=await session.tools.broker_send(args,operation);assert.equal(replay.message_id,sent.message_id);
 assert.equal((await self()).model.id,'next-model');assert.equal(session.identity.client_id,id);
});

test('real hook subprocess records bounded observations only for its first verified native conversation',async t=>{
 const {execFileSync}=await import('node:child_process');
 const {readFileSync}=await import('node:fs');
 const {processIdentity}=await import('../src/native-binding.mjs');
 const {ownerDirectory}=await import('../src/native-plugin.mjs');
 const root=mkdtempSync(join(tmpdir(),'agy-native-observation-'));t.after(()=>rmSync(root,{recursive:true,force:true}));
 const conversationId=randomUUID(),host=processIdentity(process.pid),file=join(ownerDirectory(root,host),'native-event.json');
 const moduleUrl=new URL('../src/native-plugin.mjs',import.meta.url).href;
 const quote=value=>`'${value.replaceAll("'", "'\\''")}'`;
 const observe=(id,model)=>{
  const input={conversationId:id,modelName:model,workspacePaths:['/private/work/project']};
  const code=`import {handleNativeHook} from ${JSON.stringify(moduleUrl)}; process.stdout.write(JSON.stringify(handleNativeHook(${JSON.stringify(input)},{base:${JSON.stringify(root)},observe:true})));`;
  return JSON.parse(execFileSync('/bin/sh',['-c',`${quote(process.execPath)} --input-type=module -e ${quote(code)}; result=$?; exit "$result"`],{env:{...process.env,ANTIGRAVITY_CONVERSATION_ID:id},encoding:'utf8',timeout:5000}));
 };
 observe(conversationId,'first');assert.equal(JSON.parse(readFileSync(file,'utf8')).metadata.model.id,'first');
 observe(conversationId,'second');assert.equal(JSON.parse(readFileSync(file,'utf8')).metadata.model.id,'second');
 assert.deepEqual(observe(randomUUID(),'foreign'),{});
 const stored=JSON.parse(readFileSync(file,'utf8'));assert.equal(stored.conversationId,conversationId);assert.equal(stored.metadata.model.id,'second');assert.equal(stored.metadata.project,'project');
});
