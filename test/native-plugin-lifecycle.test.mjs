import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { PassThrough } from 'node:stream';
import { NativeBinding } from '../src/native-binding.mjs';
import { openInstallation } from '../src/installation.mjs';
import { serveNativePlugin, approvalWaiterCommand, waiterCommand } from '../src/native-plugin.mjs';

const nativeMeta = id => ({ 'antigravity.google/root_conversation_id': id, 'antigravity.google/conversation_id': id });
const barrier = () => { let resolve; const promise = new Promise(r => { resolve = r; }); return { promise, resolve }; };

async function fixture(t, { failure, selected = true, approvalApi } = {}) {
  const root = mkdtempSync(join(tmpdir(), 'native-owner-unit-'));
  let server;
  t.after(async () => { await server?.close(); rmSync(root, { recursive: true, force: true }); });
  const configs = new Map(), connectionFile = join(root, 'approved.json'), requestId = randomUUID();
  const credentialId = 'enrolled-' + randomUUID(), installationRoot = join(root, 'installation');
  configs.set(connectionFile, { brokerUrl: 'https://broker.example', stateRoot: join(root, 'state'),
    metadata: { name: 'Unit fixture', project: null, model: { provider: null, id: null, source: 'unknown' } },
    enrollment: { credentialId, expiresAt: '2100-01-01T00:00:00Z' } });
  const configReader = path => { assert(configs.has(path)); return configs.get(path); };
  const installation = openInstallation(installationRoot, configReader);
  if (selected) {
    installation.beginPending({ brokerUrl: 'https://broker.example', requestId, previousRevision: null });
    installation.commit({ requestId, connectionFile, credentialId, previousRevision: null });
  }
  const host = { pid: 12, start: '1', boot: 'unit-fixture', executable: '/unit/cli' };
  const calls = [], sessions = [], identities = new Map();
  let time = 1000;
  server = await serveNativePlugin({ base: join(root, 'bindings'), host, installationRoot,
    input: new PassThrough(), output: new PassThrough(), configReader, now: () => time,
    isHostAlive: () => true, bindingFactory: options => new NativeBinding({ ...options, verifyHost: () => true }),
    approvalApi: approvalApi ?? { readApprovalState: () => { throw Error('no setup read expected'); },
      beginApproval: () => { throw Error('startup must not POST'); }, pollApproval: () => { throw Error('startup must not enroll'); } },
    sessionFactory: async options => {
      calls.push(options); await failure?.(calls.length, options);
      const id = identities.get(options.conversationId) ?? randomUUID(); identities.set(options.conversationId, id);
      const session = { identity: { client_id: id }, inbox: { directory: join(root, 'inbox-' + options.conversationId) },
        tools: { broker_identity: async () => ({ client_id: id }) }, closes: [],
        async close(options) { this.closes.push(options); } };
      sessions.push(session); return session;
    },
  });
  const call = (id, name = 'broker_setup_status', args = {}) => server.tools[name](
    server.binding.issue({ context: { host, conversationId: id }, tool: name, args }), { nativeMeta: nativeMeta(id) });
  return { root, server, installation, connectionFile, requestId, credentialId, configs, calls, sessions, call,
    advance: milliseconds => { time += milliseconds; } };
}

test('saved installation reconnects after transient startup failure without enrollment or a new identity', async t => {
  const f = await fixture(t, { failure: count => { if (count === 1) throw Object.assign(Error('network'), { retryable: true, retryAfter: 60 }); } });
  const id = randomUUID(), before = f.installation.selected();
  const waiting = await f.call(id);
  assert.equal(waiting.state, 'reconnecting'); assert.equal(waiting.connected, false);
  assert.equal(waiting.retry_after_ms, 60000); assert.equal(waiting.waiter_command, approvalWaiterCommand(f.server.directory));
  for (let i = 0; i < 3; i++) await f.call(id);
  assert.equal(f.calls.length, 1);
  f.advance(60000); const connected = await f.call(id);
  assert.equal(connected.state, 'approved'); assert.equal(connected.connected, true);
  assert.equal(connected.waiter_command, waiterCommand(f.server.directory));
  assert.equal(connected.retry_after_ms, undefined); assert.equal(f.calls.length, 2);
  assert.equal(f.calls[0].conversationId, f.calls[1].conversationId);
  assert.deepEqual(f.calls[0].config, f.calls[1].config);
  assert.deepEqual(f.installation.selected(), before);
});

test('terminal startup failure never retries or exposes a waiter, even after time passes', async t => {
  const f = await fixture(t, { failure: () => { throw Object.assign(Error('revoked'), { code: 'unauthenticated', retryable: false }); } });
  const id = randomUUID(), status = await f.call(id);
  assert.equal(status.state, 'attention_required'); assert.equal(status.waiter_command, undefined);
  f.advance(600000); await f.call(id); assert.equal(f.calls.length, 1);
  assert.equal(f.installation.selected().requestId, f.requestId);
});

test('explicit disconnect cancels scheduled reconnection and retains installation selection', async t => {
  const f = await fixture(t, { failure: () => { throw Object.assign(Error('network'), { retryable: true }); } });
  const id = randomUUID(); await f.call(id); await f.call(id, 'broker_disconnect'); f.advance(600000);
  const status = await f.call(id); assert.equal(status.connected, false); assert.equal(status.waiter_command, undefined);
  assert.equal(f.calls.length, 1); assert.equal(f.installation.selected().requestId, f.requestId);
});

test('missing installation stays setup-needed and never calls the native session factory', async t => {
  const f = await fixture(t, { selected: false });
  const id = randomUUID(); assert.equal((await f.call(id)).state, 'setup_needed');
  f.advance(600000); await f.call(id); assert.equal(f.calls.length, 0);
  assert.equal(f.installation.pending(), null); assert.equal(f.installation.selected(), null);
});

test('replacement-pending status returns approval waiter while old connection remains available', async t => {
  const requestId = randomUUID(), poll = barrier(); let initial;
  const f = await fixture(t, { approvalApi: { readApprovalState: () => initial,
    beginApproval: () => ({ state: 'pending', requestId }), pollApproval: () => poll.promise } });
  initial = { state: 'approved', requestId: f.requestId };
  const id = randomUUID(); await f.call(id);
  await f.call(id, 'broker_setup', { broker_url: 'https://broker.example' });
  const status = await f.call(id);
  assert.equal(status.state, 'pending'); assert.equal(status.connected, true);
  assert.equal(status.waiter_command, approvalWaiterCommand(f.server.directory));
  assert.equal(f.sessions[0].closes.length, 0); assert.equal(f.installation.selected().requestId, f.requestId);
  await f.call(id, 'broker_cancel_setup'); poll.resolve({ state: 'approved', requestId });
});

test('root transition drains failed old startup before reconnecting only the new root', async t => {
  const entered = barrier(), finish = barrier();
  const f = await fixture(t, { failure: async count => { if (count === 1) { entered.resolve(); await finish.promise; throw Object.assign(Error('network'), { retryable: true }); } } });
  const a = randomUUID(), b = randomUUID(), first = f.call(a); await entered.promise;
  const next = f.call(b); finish.resolve(); await assert.rejects(first, /native_root_changed/);
  assert.equal((await next).connected, true); f.advance(600000); await f.call(b);
  assert.deepEqual(f.calls.map(call => call.conversationId), [a, b]);
  assert.throws(() => f.call(a), /native_binding_rejected/);
});


test('successful explicit replacement clears the previous connection retry schedule', async t => {
  const requestId = randomUUID(); let first, replacement;
  const f = await fixture(t, { failure: count => { if (count === 1) throw Object.assign(Error('network'), { retryable: true, retryAfter: 60 }); },
    approvalApi: { readApprovalState: () => first, beginApproval: () => replacement } });
  first = { state: 'approved', requestId: f.requestId };
  const connectionFile = join(f.root, 'replacement.json'), credentialId = 'enrolled-' + randomUUID();
  f.configs.set(connectionFile, { ...f.configs.get(f.connectionFile), enrollment: { credentialId, expiresAt: '2100-01-01T00:00:00Z' } });
  replacement = { state: 'approved', requestId, connectionFile, credentialId };
  const id = randomUUID(); assert.equal((await f.call(id)).state, 'reconnecting');
  await f.call(id, 'broker_setup', { broker_url: 'https://broker.example' });
  await new Promise(resolve => setImmediate(resolve));
  const status = await f.call(id); assert.equal(status.connected, true); assert.equal(status.retry_after_ms, undefined);
  assert.equal(status.waiter_command, waiterCommand(f.server.directory));
  assert.equal(f.installation.selected().requestId, requestId); assert.equal(f.calls.length, 2);
});


test('disconnect during startup fences late retryable failure and does not strand a status waiter', async t => {
  const entered = barrier(), finish = barrier();
  const f = await fixture(t, { failure: async () => { entered.resolve(); await finish.promise; throw Object.assign(Error('network'), { retryable: true }); } });
  const id = randomUUID(), starting = f.call(id); await entered.promise;
  await f.call(id, 'broker_disconnect'); finish.resolve();
  const initial = await starting;
  for (const status of [initial, await f.call(id)]) {
    assert.equal(status.state, 'cancelled'); assert.equal(status.connected, false);
    assert.equal(status.readiness, 'not_connected'); assert.equal(status.retry_after_ms, undefined);
    assert.equal(status.waiter_command, undefined);
  }
  f.advance(600000); await f.call(id); assert.equal(f.calls.length, 1);
});

test('late startup failure cannot overwrite an explicit replacement pending request', async t => {
  const entered = barrier(), finish = barrier(), poll = barrier(), requestId = randomUUID(); let first;
  const f = await fixture(t, { failure: async () => { entered.resolve(); await finish.promise; throw Object.assign(Error('network'), { retryable: true }); },
    approvalApi: { readApprovalState: () => first, beginApproval: () => ({ state: 'pending', requestId }), pollApproval: () => poll.promise } });
  first = { state: 'approved', requestId: f.requestId };
  const id = randomUUID(), starting = f.call(id); await entered.promise;
  await f.call(id, 'broker_setup', { broker_url: 'https://broker.example' }); finish.resolve();
  const status = await starting;
  assert.equal(status.state, 'pending'); assert.equal(status.requestId, requestId);
  assert.equal(status.waiter_command, approvalWaiterCommand(f.server.directory));
  await f.call(id, 'broker_cancel_setup'); poll.resolve({ state: 'denied', requestId });
});


test('late successful startup cannot replace or publish over a newer approved setup', async t => {
  const entered = barrier(), finish = barrier(), requestId = randomUUID(); let first, replacement;
  const f = await fixture(t, { failure: async count => { if (count === 1) { entered.resolve(); await finish.promise; } },
    approvalApi: { readApprovalState: () => first, beginApproval: () => replacement } });
  first = { state: 'approved', requestId: f.requestId };
  const connectionFile = join(f.root, 'replacement.json'), credentialId = 'enrolled-' + randomUUID();
  f.configs.set(connectionFile, { ...f.configs.get(f.connectionFile), enrollment: { credentialId, expiresAt: '2100-01-01T00:00:00Z' } });
  replacement = { state: 'approved', requestId, connectionFile, credentialId };
  const id = randomUUID(), starting = f.call(id); await entered.promise;
  await f.call(id, 'broker_setup', { broker_url: 'https://broker.example' });
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(f.installation.selected().requestId, requestId);
  finish.resolve(); const status = await starting;
  assert.equal(status.state, 'approved'); assert.equal(status.requestId, requestId); assert.equal(status.connected, true);
  assert.equal(f.sessions.length, 2); assert.equal(f.sessions[0].closes.length, 0);
  assert.deepEqual(f.sessions[1].closes, [{ closeSession: false }]);
});
