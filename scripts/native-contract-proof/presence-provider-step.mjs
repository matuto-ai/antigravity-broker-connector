// Pure provider-side assertions over actual native tool responses, never DB-as-context proof.
import assert from 'node:assert/strict';
import {ACTUAL_SERVER} from './actual-plugin-fixture.mjs';
import {correlateNativeResponse,decodeNativeToolResponse} from './actual-provider-step.mjs';
const tools=['broker_presence_events','broker_acknowledge_presence_event'];
export function presenceProviderStep(input,state,proof){
 const next={...state};
 if(next.sent>next.completed){
  const response=correlateNativeResponse(input,tools[next.completed]);
  if(next.completed===0){
   assert(response&&typeof response.output==='string','native notice output missing');
   const text=response.output;assert(text.length<65536&&text.includes('Psst · transport notice')&&text.includes('not an agent instruction')&&text.includes(proof.recipientId)&&text.includes(proof.messageId),'native notice not in provider context');
   assert(!text.includes('PRIVATE_OFFLINE_FIXTURE_BODY'),'message body leaked');
   const match=/"event_id"\s*:\s*"([0-9a-f-]{36})"/i.exec(text);assert(match,'native event ID missing');next.eventId=match[1];
  }else {const value=decodeNativeToolResponse(response);assert.equal(value.event_id,next.eventId);assert.equal(value.acknowledged,true);}
  next.completed++;
 }
 if(next.sent<tools.length){const tool=tools[next.sent++];return {state:next,parts:[{functionCall:{name:'call_mcp_tool',args:{ServerName:ACTUAL_SERVER,ToolName:tool,Arguments:tool==='broker_acknowledge_presence_event'?{event_id:next.eventId}:{}}}}]};}
 return {state:next,parts:[{text:'OFFLINE_PRESENCE_CONTEXT_VERIFIED'}]};
}
