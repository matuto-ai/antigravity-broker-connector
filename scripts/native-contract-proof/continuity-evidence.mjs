// Native observations only: compact preserves identity; /new must change it.
export function continuityEvidence(mode, mcp, hook) {
  if (!['compact', 'new'].includes(mode) || mcp.length !== 2 || !hook.length) return false;
  const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  const roots = mcp.map(call => call.meta?.['antigravity.google/root_conversation_id']);
  if (!mcp.every((call, i) => call.name === 'fixture_identity' && uuid.test(roots[i] ?? '') && call.meta?.['antigravity.google/conversation_id'] === roots[i])) return false;
  if (mode === 'compact' ? roots[0] !== roots[1] : roots[0] === roots[1]) return false;
  if (new Set(hook.map(h => h.hostPid + ':' + h.hostStart)).size !== 1) return false;
  let cursor = -1;
  for (const root of roots) {
    cursor = hook.findIndex((h, i) => i > cursor && h.event === 'PreToolUse' && h.conversationId === root && h.environmentConversationId === root);
    if (cursor < 0) return false;
    cursor = hook.findIndex((h, i) => i > cursor && h.event === 'Stop' && h.fullyIdle === true && ['model_stop', 'NO_TOOL_CALL'].includes(h.terminationReason) && h.conversationId === root && h.environmentConversationId === root);
    if (cursor < 0) return false;
  }
  return true;
}
