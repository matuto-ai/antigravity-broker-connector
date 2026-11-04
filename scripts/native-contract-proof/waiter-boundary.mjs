// Broker stimulus is gated by real native lifecycle evidence, not the renderer's
// fully-idle composer: a legitimate background waiter keeps that UI active.
// This function never authorizes terminal input or permission confirmation.
export function stoppedNativeWaiter(hooks,{conversationId,hostPid,hostStart}={}) {
 if(!Array.isArray(hooks)||typeof conversationId!=='string'||!Number.isSafeInteger(hostPid)||typeof hostStart!=='string')return false;
 const same=event=>event.conversationId===conversationId&&event.environmentConversationId===conversationId&&event.hostPid===hostPid&&event.hostStart===hostStart&&event.denied===false;
 const command=hooks.findLastIndex(event=>event.event==='PreToolUse'&&event.toolName==='run_command');
 if(command<0||!same(hooks[command]))return false;
 const stop=hooks.findLastIndex(event=>event.event==='Stop');
 return stop>command&&same(hooks[stop])&&hooks[stop].fullyIdle===false&&['model_stop','NO_TOOL_CALL'].includes(hooks[stop].terminationReason)&&
  !hooks.slice(stop+1).some(event=>['PreInvocation','PreToolUse','SessionStart'].includes(event.event));
}

// Bounded setup remainder ends after the full explicit-read/ACK sequence. This
// proves first delivery only and must never be reported as re-arm acceptance.
export function completedNativeDelivery(hooks,{conversationId,hostPid,hostStart}={}) {
 if(!Array.isArray(hooks)||typeof conversationId!=='string'||!Number.isSafeInteger(hostPid)||typeof hostStart!=='string')return false;
 const same=event=>event.conversationId===conversationId&&event.environmentConversationId===conversationId&&event.hostPid===hostPid&&event.hostStart===hostStart&&event.denied===false;
 const tool=hooks.findLastIndex(event=>event.event==='PreToolUse');
 if(tool<0||hooks[tool].toolName!=='call_mcp_tool'||hooks[tool].tool!=='broker_receive'||!same(hooks[tool]))return false;
 const stop=hooks.findLastIndex(event=>event.event==='Stop');
 return stop>tool&&same(hooks[stop])&&hooks[stop].fullyIdle===true&&['model_stop','NO_TOOL_CALL'].includes(hooks[stop].terminationReason)&&
  !hooks.slice(stop+1).some(event=>['PreInvocation','PreToolUse','SessionStart'].includes(event.event));
}
