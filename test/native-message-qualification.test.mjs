import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {execFileSync} from 'node:child_process';
import {randomUUID} from 'node:crypto';
import {prepareActualPluginFixture} from '../scripts/native-contract-proof/actual-plugin-fixture.mjs';
import {messageProviderStep,MESSAGE_TOOLS} from '../scripts/native-contract-proof/message-provider-step.mjs';
import {readConnectorConfig} from '../src/connector-config.mjs';
import {startNativeSession} from '../src/native-session.mjs';
import {readableReceive} from '../src/receive-presentation.mjs';
const prefix='Created At: 2026-11-03T00:00:00Z\nCompleted At: 2026-11-03T00:00:00Z\nA pre-tool hook changed the arguments of this tool call before it ran. Changed: Arguments.\n\n';
test('cheap real TLS runtime validates message fixture before isolated official CLI qualification',async t=>{
 const p=mkdtempSync(join(tmpdir(),'ag-message-qualification-'));t.after(()=>rmSync(p,{recursive:true,force:true}));
 const tls=join(p,'tls');mkdirSync(tls);
 execFileSync('openssl',['req','-x509','-newkey','rsa:2048','-nodes','-days','1','-subj','/CN=fixture','-addext','subjectAltName=IP:127.0.0.1','-keyout',join(tls,'key.pem'),'-out',join(tls,'cert.pem')],{stdio:'ignore'});
 const f=await prepareActualPluginFixture({root:join(p,'root'),home:join(p,'home'),pluginRoot:resolve('.'),brokerRoot:resolve(process.env.PSST_MESSAGE_TEST_SOURCE??'../ai-agent-msg-broker'),tlsDirectory:tls,messages:true});t.after(()=>f.close());
 assert.deepEqual(f.permissions.allow,['broker_setup_status','broker_identity','broker_send','broker_receive','broker_acknowledge'].map(tool=>`mcp(psst-native_psst/${tool})`));
 const session=await startNativeSession({config:readConnectorConfig(f.connectionFile,{}),conversationId:randomUUID(),isAlive:()=>true});t.after(()=>session.close());
 const proof=f.seedMessages(session.identity.client_id);
 const until=Date.now()+5000;
 while(!session.inbox.head()&&Date.now()<until)await new Promise(resolve=>setTimeout(resolve,20));
 assert.equal(session.inbox.head()?.message_id,proof.messageId,'transport readiness');
 let step=messageProviderStep({}, {sent:0,completed:0},proof);
 for(let index=0;index<MESSAGE_TOOLS.length;index++){
  const call=step.parts[0].functionCall;
  const result=await session.tools[call.args.ToolName](call.args.Arguments);
  // This wrapping is synthetic in the cheap test; the Docker suite observes it from CLI.
  const text=readableReceive(result)?.content[0].text??JSON.stringify(result);
  step=messageProviderStep({contents:[{role:'model',parts:[{functionCall:call}]},{role:'user',parts:[{functionResponse:{name:'call_mcp_tool',response:{output:prefix+text}}}]}]},step.state,proof);
  const row=session.inbox.db.prepare('SELECT state,native_receipt FROM inbox WHERE message_id=?').get(proof.messageId);
  assert.equal(row.state,index<3?'pending':'consumed');assert.equal(row.native_receipt,null);
  if(index<3)assert.equal(session.inbox.db.prepare('SELECT COUNT(*) n FROM cooperative_receipts WHERE acknowledged_at IS NOT NULL').get().n,0);
 }
 assert.equal(step.state.completed,6);f.verifyMessages(proof,step.state.outgoingId);
 assert.equal(session.inbox.db.prepare('SELECT COUNT(*) n FROM cooperative_receipts WHERE acknowledged_at IS NOT NULL').get().n,1);
});
