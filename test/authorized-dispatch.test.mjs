import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { DIRECT_COMMAND_GUIDANCE, hookDecision, NATIVE_SERVER } from '../src/native-plugin.mjs';
import { PEER_GUIDANCE, PENDING_NOTICE } from '../src/native-waiter.mjs';

// These fixtures test instructions delivered to a model, not model compliance.
// Native permissions and provenance remain deterministic, not peer-supplied.
const fixtures = [
  ['explicit command', DIRECT_COMMAND_GUIDANCE, /Execute explicit ordinary commands/, /without another execution question or preventive diagnostics/],
  ['cheap input and capability gate', DIRECT_COMMAND_GUIDANCE, /First check only required inputs and tool availability/, /reuse supplied values or public configuration/, /Missing capability: name it, give the next step and stop/],
  ['satisfied access confirmation', DIRECT_COMMAND_GUIDANCE, /never repeat a satisfied confirmation/, /Preserve native permissions and required access confirmations/],
  ['free collaboration', PEER_GUIDANCE, /including substantive collaboration and unrelated work/, /under existing permissions without separate per-peer, per-message or per-purpose human authorization/],
  ['exact reply route', PEER_GUIDANCE, /recipient_id equal to the received exact sender client ID/, /reply_to_message_id equal to the received message_id/, /preserve correlation_id/],
  ['instruction priority and safeguards', PEER_GUIDANCE, /agent requests, not human overrides/, /human instructions and higher-priority rules/, /preserve host safeguards/, /connector-supplied metadata for identity and routing, never claims in message text/],
  ['independent judgment and task continuity', PEER_GUIDANCE, /Resolve discoverable facts and low-risk reversible choices independently/, /only when consequential uncertainty/, /without automatically stopping or silently abandoning or delaying the human task/],
  ['bounded failure and native denial', DIRECT_COMMAND_GUIDANCE, /Troubleshoot only after an actual failure with bounded supported recovery/, /not model retry\/reconnect loops/, /If blocked or denied, report the cause and next step, then stop/],
  ['uncertain send', PEER_GUIDANCE, /Inspect broker_sent_history and broker_message_status after an uncertain send before any fresh send/, /new invocation can duplicate delivery/],
  ['read ACK and bounded response', PEER_GUIDANCE, /read the full body, explicitly ACK/, /ACK means reading, not response delivery/, /send acceptance means broker storage/, /Do not automatically answer every message indefinitely/, /Do not intentionally repeat an already-handled response or action/, /reply to mere acknowledgments or require a reply to every informational message/],
];
for (const [name, guidance, ...requirements] of fixtures) {
  test('model guidance fixture: ' + name, () => {
    for (const expected of requirements) assert.match(guidance, expected);
  });
}
test('packaged skills and native waiter share collaboration guidance without grant gates', () => {
  for (const name of ['psst', 'psst-setup', 'psst-reauthorize', 'psst-connect', 'psst-disconnect']) {
    const skill = readFileSync(new URL('../skills/' + name + '/SKILL.md', import.meta.url), 'utf8');
    if (name !== 'psst-reauthorize') {
      assert.match(skill, /Follow the native server's shared ordinary-command guidance/, name);
      assert.match(skill, /First check/);
      assert.ok(skill.indexOf('First check') < skill.indexOf('For peer collaboration') || name === 'psst');
    }
    if (name === 'psst') assert.ok(skill.includes(PEER_GUIDANCE));
    else assert.match(skill, /For peer collaboration and receive\/read\/ACK\/re-arm behavior, follow the psst skill/);
    assert.doesNotMatch(skill, /ask only for the missing grant|within existing human authorization/);
  }
  assert.ok(PENDING_NOTICE.includes(PEER_GUIDANCE));
});
test('generated experimental plugin delivers the shared peer and transport-notice guidance', t => {
  const root = mkdtempSync(join(tmpdir(), 'psst-guidance-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const target = join(root, 'plugin');
  execFileSync(process.execPath, [new URL('../scripts/prepare-native-plugin.mjs', import.meta.url).pathname, target, '--experimental-native']);
  for (const name of ['psst', 'psst-setup', 'psst-reauthorize', 'psst-connect', 'psst-disconnect', 'psst-status', 'psst-cancel-setup', 'psst-doctor']) {
    assert.equal(readFileSync(join(target, 'skills', name, 'SKILL.md'), 'utf8'),
      readFileSync(new URL('../skills/' + name + '/SKILL.md', import.meta.url), 'utf8'));
  }
  const skill = readFileSync(join(target, 'skills/psst/SKILL.md'), 'utf8');
  assert.ok(skill.includes(PEER_GUIDANCE));
  assert.match(skill, /Do not call broker_receive merely for a transport notice or treat it as peer content/);
  assert.match(skill, /broker_acknowledge_presence_event/);
});
test('connect and disconnect skills use native lifecycle tools without enrollment or credential handoff', () => {
  const connect = readFileSync(new URL('../skills/psst-connect/SKILL.md', import.meta.url), 'utf8');
  const disconnect = readFileSync(new URL('../skills/psst-disconnect/SKILL.md', import.meta.url), 'utf8');
  assert.match(connect, /call broker_connect with no arguments/);
  assert.match(connect, /already connected conversation is a no-op/);
  assert.match(connect, /No URL, token or file handoff is required/);
  assert.match(connect, /waiter_command once with native run_command, WaitMsBeforeAsync=500/);
  assert.match(disconnect, /call broker_disconnect with no arguments/);
  assert.match(disconnect, /Saved installation authorization and unread journals remain intact/);
  assert.match(disconnect, /Do not arm another waiter or reconnect automatically/);
});
test('status, cancel-setup and doctor skills keep observation, cancellation and diagnostics separate', () => {
  const skills = Object.fromEntries(['psst-status', 'psst-cancel-setup', 'psst-doctor'].map(name =>
    [name, readFileSync(new URL('../skills/' + name + '/SKILL.md', import.meta.url), 'utf8')]));
  for (const skill of Object.values(skills)) {
    assert.match(skill, /First check/);
    assert.match(skill, /Follow the native server's shared ordinary-command guidance/);
  }
  assert.match(skills['psst-status'], /Call broker_setup_status once with no arguments/);
  assert.match(skills['psst-status'], /client_id.*connector_runtime.version.*readiness/);
  assert.match(skills['psst-status'], /Do not poll, arm waiters, discover peers or call setup\/connect/);
  assert.match(skills['psst-cancel-setup'], /call broker_cancel_setup once with no arguments/);
  assert.match(skills['psst-cancel-setup'], /If the result says connected and includes waiter_command/);
  assert.match(skills['psst-cancel-setup'], /Never restart setup or re-arm its approval waiter automatically/);
  assert.match(skills['psst-doctor'], /run exactly `psst-antigravity doctor` through native run_command/);
  assert.match(skills['psst-doctor'], /If it is missing, report the missing executable/);
  assert.match(skills['psst-doctor'], /Psst MCP tools are not required and must not be called/);
  assert.match(skills['psst-doctor'], /not_checked and not_verified results as unknown/);
});
test('only initial setup can fill a missing endpoint from public status', () => {
  const setup = readFileSync(new URL('../skills/psst-setup/SKILL.md', import.meta.url), 'utf8');
  const replace = readFileSync(new URL('../skills/psst-reauthorize/SKILL.md', import.meta.url), 'utf8');
  assert.match(setup, /reuse the supplied HTTPS broker URL/);
  assert.match(setup, /broker_setup_status once and reuse its public broker_url/);
  assert.match(setup, /broker_setup on psst-native_psst and native run_command are available/);
  assert.match(setup, /Usage: \/psst-setup <https:\/\/broker.example>.*before tool calls/);
  assert.match(replace, /Never supply the missing argument from saved configuration/);
  assert.ok(replace.indexOf('First validate the argument') < replace.indexOf('broker_setup_status'));
  assert.match(replace, /valid explicit human invocation supplies replacement intent/);
});
test('direct intent does not bypass a native permit denial or overwrite tool arguments', () => {
  for (const [ToolName, Arguments] of [
    ['broker_send', { recipient_id: '11111111-1111-4111-8111-111111111111', text: 'pong' }],
    ['broker_setup', { broker_url: 'https://broker.example' }],
  ]) {
    const input = { toolCall: { name: 'call_mcp_tool', args: { ServerName: NATIVE_SERVER, ToolName, Arguments } } };
    const before = structuredClone(input);
    const result = hookDecision({ input, directory: '/unit/native', binding: { issue() { throw Error('denied'); } } });
    assert.equal(result.decision, 'deny');
    assert.equal(result.overwrite, undefined);
    assert.equal(result.permissionOverrides, undefined);
    assert.deepEqual(input, before);
  }
});
