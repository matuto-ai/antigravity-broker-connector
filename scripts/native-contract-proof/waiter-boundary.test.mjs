import test from 'node:test';
import assert from 'node:assert/strict';
import {stoppedNativeWaiter,completedNativeDelivery} from './waiter-boundary.mjs';
const identity={conversationId:'fixture-root',hostPid:18,hostStart:'4454'};
const context={...identity,environmentConversationId:identity.conversationId,denied:false};
const command={...context,event:'PreToolUse',toolName:'run_command'};
const stop={...context,event:'Stop',fullyIdle:false,terminationReason:'NO_TOOL_CALL'};
test('real stopped model with live background task does not require a fully idle renderer',()=>{
 assert.equal(stoppedNativeWaiter([command,stop],identity),true);
 assert.equal(stoppedNativeWaiter([command,{...stop,terminationReason:'model_stop'}],identity),true);
});
test('unknown, foreign, stale or resumed native turns cannot seed external arrival',()=>{
 for(const hooks of [[],[stop],[stop,command],[command,{...stop,fullyIdle:true}],[command,{...stop,terminationReason:'aborted'}],[command,stop,{...context,event:'PreInvocation'}],[command,stop,{...context,event:'SessionStart'}]])assert.equal(stoppedNativeWaiter(hooks,identity),false);
 for(const key of ['conversationId','environmentConversationId','hostPid','hostStart','denied']){
  assert.equal(stoppedNativeWaiter([{...command,[key]:'wrong'},stop],identity),false);
  assert.equal(stoppedNativeWaiter([command,{...stop,[key]:'wrong'}],identity),false);
 }
});

test('bounded first delivery ends only after native idle stop following final receive',()=>{
 const receive={...context,event:'PreToolUse',toolName:'call_mcp_tool',tool:'broker_receive'},done={...stop,fullyIdle:true};
 assert.equal(completedNativeDelivery([command,stop,receive,done],identity),true);
 for(const hooks of [[receive,stop],[receive,done,command],[done,receive],[command,done],[{...receive,tool:'broker_acknowledge'},done],[receive,{...done,denied:true}],[receive,done,{...context,event:'PreInvocation'}]])assert.equal(completedNativeDelivery(hooks,identity),false);
});
