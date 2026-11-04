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
