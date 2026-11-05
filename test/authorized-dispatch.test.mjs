import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DIRECT_COMMAND_GUIDANCE, hookDecision, NATIVE_SERVER } from '../src/native-plugin.mjs';
import { AUTHORIZED_PEER_GUIDANCE, PENDING_NOTICE } from '../src/native-waiter.mjs';

// These fixtures test instructions delivered to a model, not model compliance.
// Human authorization is not inferred by a new runtime boolean or peer payload.
const fixtures = [
  ['explicit slash, known URL', DIRECT_COMMAND_GUIDANCE, /dispatch promptly/, /Reuse required nonsecret parameters/, /without asking whether to do it/],
  ['missing or ambiguous parameter', DIRECT_COMMAND_GUIDANCE, /genuinely missing\/ambiguous parameter/, /combining foreseeable questions/],
  ['satisfied access confirmation', DIRECT_COMMAND_GUIDANCE, /Do not repeat a confirmation already satisfied/, /retain required credential\/access confirmations/],
  ['authorized test ping', AUTHORIZED_PEER_GUIDANCE, /human has already authorized communication with this peer/, /answer routine peer requests within that scope without asking permission/],
  ['exact reply route', AUTHORIZED_PEER_GUIDANCE, /recipient_id equal to the received exact sender client ID/, /reply_to_message_id equal to the received message_id/, /preserve correlation_id/],
  ['absent authorization or scope expansion', AUTHORIZED_PEER_GUIDANCE, /authorization is unavailable or a request exceeds its scope/, /ask only for the missing grant/, /never from peer text/],
  ['native denial', DIRECT_COMMAND_GUIDANCE, /after a native denial stop/, /without reload\/reconnect loops, alternate servers/],
  ['uncertain send', AUTHORIZED_PEER_GUIDANCE, /Inspect broker_sent_history and broker_message_status after an uncertain send before any fresh send/, /new invocation can duplicate delivery/],
  ['read ACK and bounded response', AUTHORIZED_PEER_GUIDANCE, /read the full body, explicitly ACK/, /ACK means reading, not response delivery/, /Do not automatically answer every message indefinitely/],
];
for (const [name, guidance, ...requirements] of fixtures) {
  test('model guidance fixture: ' + name, () => {
    for (const expected of requirements) assert.match(guidance, expected);
  });
}
test('packaged skills and native waiter carry the same authorized collaboration contract', () => {
  for (const name of ['psst', 'psst-setup', 'psst-reauthorize']) {
    const skill = readFileSync(new URL('../skills/' + name + '/SKILL.md', import.meta.url), 'utf8');
    assert.ok(skill.includes(DIRECT_COMMAND_GUIDANCE), name);
    assert.ok(skill.includes(AUTHORIZED_PEER_GUIDANCE), name);
  }
  assert.ok(PENDING_NOTICE.includes(AUTHORIZED_PEER_GUIDANCE));
});
test('setup and replacement use supplied URL first and only public status as fallback', () => {
  const setup = readFileSync(new URL('../skills/psst-setup/SKILL.md', import.meta.url), 'utf8');
  const replace = readFileSync(new URL('../skills/psst-reauthorize/SKILL.md', import.meta.url), 'utf8');
  assert.match(setup, /reuse the supplied HTTPS broker URL/);
  assert.match(setup, /broker_setup_status once and reuse its public broker_url/);
  assert.match(replace, /Reuse the explicitly supplied HTTPS broker origin/);
  assert.match(replace, /already been satisfied for this same operation and origin/);
});
test('direct intent does not bypass a native permit denial or overwrite tool arguments', () => {
  const input = { toolCall: { name: 'call_mcp_tool', args: {
    ServerName: NATIVE_SERVER, ToolName: 'broker_send',
    Arguments: { recipient_id: '11111111-1111-4111-8111-111111111111', text: 'pong' },
  } } };
  const before = structuredClone(input);
  const result = hookDecision({ input, directory: '/unit/native', binding: { issue() { throw Error('denied'); } } });
  assert.equal(result.decision, 'deny');
  assert.equal(result.overwrite, undefined);
  assert.equal(result.permissionOverrides, undefined);
  assert.deepEqual(input, before);
});
