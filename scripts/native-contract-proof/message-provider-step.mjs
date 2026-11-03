// Pure fixture provider. Completion requires actual, correlated native tool output.
import assert from 'node:assert/strict';
import {ACTUAL_SERVER} from './actual-plugin-fixture.mjs';
import {correlateNativeResponse,decodeNativeTextResponse,decodeNativeToolResponse} from './actual-provider-step.mjs';
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export const MESSAGE_TOOLS=Object.freeze(['broker_send','broker_receive','broker_receive','broker_acknowledge','broker_acknowledge','broker_receive']);
export function messageProviderStep(input,state,proof){
 const next={...state};
 if(next.sent>next.completed){
  const response=correlateNativeResponse(input,MESSAGE_TOOLS[next.completed]);
  if(next.completed===1||next.completed===2){
   const text=decodeNativeTextResponse(response);
   const body=proof.incomingText.split('\n').map(line=>'    '+line).join('\n');
   const expected=`Psst · new message\nFrom: Offline message peer · antigravity-cli\n\n${body}\n\nDetails\nSender ID: ${proof.peerId}\nMessage ID: ${proof.messageId}\nACK: pending — acknowledge only after reading the full message.`;
   assert.equal(text,expected,'full literal incoming message must reach provider context');
   const id=/\nMessage ID: ([0-9a-f-]{36})\nACK: pending/.exec(text)?.[1];
   assert.equal(id,proof.messageId,'exact incoming read identity required');
   if(next.completed===2)assert.equal(id,next.readMessageId,'repeat receive must not consume');
   next.readMessageId=id;
  }else{
   const value=decodeNativeToolResponse(response);
   if(next.completed===0){assert(uuid.test(value.message_id??''),'outbound message ID missing');next.outgoingId=value.message_id;}
   else if(next.completed===3||next.completed===4){
    assert.equal(value.message_id,next.readMessageId);assert.equal(value.acknowledged,true);
    assert.equal(value.acknowledgment_kind,'explicit_model_read');assert.equal(value.native_acceptance_recorded,false);assert.equal(value.action_success,'unknown');
   }else {assert.equal(value.message,null);assert.equal(value.local_mode,'explicit_read');}
  }
  next.completed++;
 }
 if(next.sent<MESSAGE_TOOLS.length){
  const tool=MESSAGE_TOOLS[next.sent++];
  const args=tool==='broker_send'?{recipient_id:proof.peerId,text:proof.outgoingText}:tool==='broker_acknowledge'?{message_id:next.readMessageId}:{};
  return {state:next,parts:[{functionCall:{name:'call_mcp_tool',args:{ServerName:ACTUAL_SERVER,ToolName:tool,Arguments:args}}}]};
 }
 return {state:next,parts:[{text:'OFFLINE_NATIVE_MESSAGE_CONTEXT_VERIFIED'}]};
}
