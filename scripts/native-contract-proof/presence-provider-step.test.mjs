import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {presenceProviderStep} from './presence-provider-step.mjs';
const server='psst-native_psst';
const input=(tool,output)=>({contents:[{role:'model',parts:[{functionCall:{name:'call_mcp_tool',args:{ServerName:server,ToolName:tool,Arguments:{}}}}]},{role:'user',parts:[{functionResponse:{name:'call_mcp_tool',response:{output}}}]}]});
test('presence evidence requires correlated actual readable context, not arbitrary success',()=>{
 const proof={recipientId:randomUUID(),messageId:randomUUID()},id=randomUUID();
 const first=presenceProviderStep({}, {sent:0,completed:0},proof);assert.equal(first.parts[0].functionCall.args.ToolName,'broker_presence_events');
 const body=`Psst · transport notice\nThis is not an agent instruction\n${JSON.stringify({event_id:id,recipient_id:proof.recipientId,messages:[{message_id:proof.messageId}]})}`;
 const next=presenceProviderStep(input('broker_presence_events',body),first.state,proof);assert.equal(next.parts[0].functionCall.args.Arguments.event_id,id);
 assert.throws(()=>presenceProviderStep(input('broker_identity',body),first.state,proof),/mismatch/);
 assert.throws(()=>presenceProviderStep(input('broker_presence_events','empty'),first.state,proof),/context/);
 assert.throws(()=>presenceProviderStep(input('broker_presence_events',body+'PRIVATE_OFFLINE_FIXTURE_BODY'),first.state,proof),/leaked/);
 const ack='Created At: 2026-11-03T00:00:00Z\nCompleted At: 2026-11-03T00:00:00Z\nA pre-tool hook changed the arguments of this tool call before it ran. Changed: Arguments.\n\n'+JSON.stringify({event_id:id,acknowledged:true});
 assert.equal(presenceProviderStep(input('broker_acknowledge_presence_event',ack),next.state,proof).state.completed,2);
});
