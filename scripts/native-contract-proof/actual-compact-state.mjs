// CLI 1.4.7 native evidence shows /compact preserves the root; this is continuity, not rotation.
export function actualCompactContinuity(identities,snapshots){
 if(identities.length!==2||snapshots.length!==2)return false;
 const [a,b]=identities,[x,y]=snapshots;
 return typeof a.conversation_id==='string'&&typeof a.client_id==='string'&&
  a.conversation_id===b.conversation_id&&a.client_id===b.client_id&&
  x.admittedRoot===a.conversation_id&&y.admittedRoot===b.conversation_id&&
  typeof x.inboxPath==='string'&&x.inboxPath===y.inboxPath&&
  Number.isSafeInteger(x.rootGeneration)&&x.rootGeneration>=1&&x.rootGeneration===y.rootGeneration&&
  typeof x.ownerEpoch==='string'&&x.ownerEpoch===y.ownerEpoch&&
  Boolean(x.host&&x.connectorProcess)&&JSON.stringify(x.host)===JSON.stringify(y.host)&&JSON.stringify(x.connectorProcess)===JSON.stringify(y.connectorProcess);
}
export function matchingIdleStop(hook,snapshot){return hook.event==='Stop'&&hook.fullyIdle===true&&['model_stop','NO_TOOL_CALL'].includes(hook.terminationReason)&&hook.conversationId===snapshot.admittedRoot&&hook.environmentConversationId===snapshot.admittedRoot&&hook.hostPid===snapshot.host.pid&&hook.hostStart===snapshot.host.start;}

// /new is optional until the metadata fixture independently demonstrates real native rotation.
export function actualRootRotation(identities,snapshots){
 if(identities.length!==2||snapshots.length!==2)return false;
 const [a,b]=identities,[x,y]=snapshots;
 return typeof a.conversation_id==='string'&&typeof b.conversation_id==='string'&&typeof a.client_id==='string'&&typeof b.client_id==='string'&&
  a.conversation_id!==b.conversation_id&&a.client_id!==b.client_id&&
  x.admittedRoot===a.conversation_id&&y.admittedRoot===b.conversation_id&&
  typeof x.inboxPath==='string'&&typeof y.inboxPath==='string'&&x.inboxPath!==y.inboxPath&&
  Number.isSafeInteger(x.rootGeneration)&&x.rootGeneration>=1&&y.rootGeneration===x.rootGeneration+1&&
  typeof x.ownerEpoch==='string'&&x.ownerEpoch===y.ownerEpoch&&
  Boolean(x.host&&x.connectorProcess)&&JSON.stringify(x.host)===JSON.stringify(y.host)&&JSON.stringify(x.connectorProcess)===JSON.stringify(y.connectorProcess);
}
