// Synthetic native-session adapter gate, not an authenticated Antigravity model.
import {mkdirSync} from 'node:fs';import {setTimeout as delay} from 'node:timers/promises';import assert from 'node:assert/strict';
import {beginApproval,pollApproval} from '../vendor/psst/approval.mjs';import {openInstallation} from '../src/installation.mjs';import {startNativeSession} from '../src/native-session.mjs';
import {CONNECTOR_RUNTIME} from '../src/runtime-info.mjs';
let input='';for await(const chunk of process.stdin)input+=chunk;const {phase,brokerUrl,conversations,expectedRuntime}=JSON.parse(input);assert.deepEqual(CONNECTOR_RUNTIME,expectedRuntime,'container connector runtime mismatch');mkdirSync(process.env.HOME,{recursive:true,mode:0o700});const installation=openInstallation('/persist'),options={brokerUrl,directory:'/persist',clientType:'antigravity-cli'};
if(phase===1){installation.beginPending({brokerUrl,previousRevision:null});let result=await beginApproval(options);installation.beginPending({brokerUrl,requestId:result.requestId,previousRevision:null});console.log(JSON.stringify({pending:result.requestId}));for(let i=0;result.state==='pending'&&i<30;i++){await delay(2000);result=await pollApproval(options);}assert.equal(result.state,'approved');installation.commit({...result,previousRevision:null});}
const selected=installation.selected();assert(selected);const sessions=[];
try{for(const conversationId of conversations)sessions.push(await startNativeSession({config:selected.config,conversationId,isAlive:()=>true}));assert.equal(new Set(sessions.map(s=>s.identity.client_id)).size,30);
 if(phase===1){const sent=await sessions[0].tools.broker_send({recipient_id:sessions[1].identity.client_id,text:'container-recreation-durable-message'});assert(sent.message_id);}
 let received;for(let i=0;i<100;i++){received=await sessions[1].tools.broker_receive({});if(received.message)break;await delay(20);}assert(received.message_id);for(const s of sessions.slice(2))assert.equal((await s.tools.broker_receive({})).message,null);
 console.log(JSON.stringify({phase,connector_runtime:CONNECTOR_RUNTIME,clients:sessions.map(s=>s.identity.client_id),messageId:received.message_id,receipt:received.receipt_token}));
}finally{for(const s of sessions)await s.close();}
