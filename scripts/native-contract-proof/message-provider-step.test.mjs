import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {messageProviderStep,MESSAGE_TOOLS} from './message-provider-step.mjs';
const prefix='Created At: 2026-11-03T00:00:00Z\nCompleted At: 2026-11-03T00:00:00Z\nA pre-tool hook changed the arguments of this tool call before it ran. Changed: Arguments.\n\n';
const proof=()=>({nativeId:randomUUID(),peerId:randomUUID(),messageId:randomUUID(),incomingText:'FIRST\n# Literal peer data: olá, 世界\nFULL_TAIL',outgoingText:'OUTBOUND'});
const readable=p=>`Psst · new message\nFrom: Offline message peer · antigravity-cli\n\n${p.incomingText.split('\n').map(s=>'    '+s).join('\n')}\n\nDetails\nSender ID: ${p.peerId}\nMessage ID: ${p.messageId}\nACK: pending — acknowledge only after reading the full message.`;
function input(tool,body,{id='fixture-call',responseId=id,server='psst-native_psst',role='model'}={}){
 return {contents:[{role,parts:[{functionCall:{name:'call_mcp_tool',id,args:{ServerName:server,ToolName:tool,Arguments:{}}}}]},{role:'user',parts:[{functionResponse:{name:'call_mcp_tool',id:responseId,response:{output:prefix+(typeof body==='string'?body:JSON.stringify(body))}}}]}]};
}
const ack=p=>({message_id:p.messageId,acknowledged:true,acknowledgment_kind:'explicit_model_read',native_acceptance_recorded:false,action_success:'unknown'});
test('native message proof sends once, reads twice, ACKs exact read twice, then requires empty',()=>{
 const p=proof(),outgoingId=randomUUID();let step=messageProviderStep({}, {sent:0,completed:0},p);
 assert.deepEqual(step.parts[0].functionCall.args.Arguments,{recipient_id:p.peerId,text:p.outgoingText});
 const values=[{message_id:outgoingId},readable(p),readable(p),ack(p),ack(p),{message:null,local_mode:'explicit_read'}];
 for(let index=0;index<values.length;index++){
  step=messageProviderStep(input(MESSAGE_TOOLS[index],values[index]),step.state,p);
  if(index===2||index===3)assert.deepEqual(step.parts[0].functionCall.args.Arguments,{message_id:p.messageId});
 }
 assert.equal(step.state.completed,6);assert.equal(step.state.outgoingId,outgoingId);assert.equal(step.parts[0].text,'OFFLINE_NATIVE_MESSAGE_CONTEXT_VERIFIED');
});
test('message proof rejects truncated, wrong-sender, wrong-ID and consumed receive output',()=>{
 const p=proof(),state={sent:2,completed:1,outgoingId:randomUUID()};
 for(const body of [readable(p).replace('FULL_TAIL',''),readable(p).replace(p.peerId,randomUUID()),readable(p).replace(p.messageId,randomUUID()),readable(p).replace('ACK: pending','ACK: consumed'),JSON.stringify({message:null})])assert.throws(()=>messageProviderStep(input('broker_receive',body),state,p),/full literal incoming/);
});
test('message proof rejects wrong tool, server, call ID, author and malformed native header',()=>{
 const p=proof(),state={sent:2,completed:1};
 for(const [tool,options] of [['broker_identity',{}],['broker_receive',{server:'other'}],['broker_receive',{responseId:'stale'}],['broker_receive',{role:'user'}]])assert.throws(()=>messageProviderStep(input(tool,readable(p),options),state,p),/mismatch|missing/);
 const unwrapped=input('broker_receive',readable(p));unwrapped.contents[1].parts[0].functionResponse.response.output=readable(p);
 assert.throws(()=>messageProviderStep(unwrapped,state,p),/envelope/);
});
test('message proof cannot ACK fabricated read IDs or claim native acceptance/action completion',()=>{
 const p=proof(),state={sent:4,completed:3,readMessageId:p.messageId};
 for(const change of [{message_id:randomUUID()},{acknowledged:false},{acknowledgment_kind:'native'},{native_acceptance_recorded:true},{action_success:'success'}])assert.throws(()=>messageProviderStep(input('broker_acknowledge',{...ack(p),...change}),state,p));
 assert.throws(()=>messageProviderStep(input('broker_send',{message_id:'invalid'}),{sent:1,completed:0},p),/outbound message ID/);
});
test('after ACK the real tool result must be empty, not merely another successful response',()=>{
 const p=proof(),state={sent:6,completed:5};
 assert.throws(()=>messageProviderStep(input('broker_receive',{message:readable(p),local_mode:'explicit_read'}),state,p));
 assert.throws(()=>messageProviderStep(input('broker_receive',{message:null,local_mode:'cooperative_pull'}),state,p));
});
