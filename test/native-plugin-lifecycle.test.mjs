import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { PassThrough } from 'node:stream';
import { NativeBinding } from '../src/native-binding.mjs';
import { openInstallation } from '../src/installation.mjs';
import { serveNativePlugin, approvalWaiterCommand, waiterCommand, DIRECT_COMMAND_GUIDANCE, hookDecision, NATIVE_SERVER } from '../src/native-plugin.mjs';
import { LocalError } from '../vendor/psst/reference/errors.mjs';
import { PEER_GUIDANCE } from '../src/native-waiter.mjs';

const nativeMeta = id => ({ 'antigravity.google/root_conversation_id': id, 'antigravity.google/conversation_id': id });
const barrier = () => { let resolve; const promise = new Promise(r => { resolve = r; }); return { promise, resolve }; };

async function fixture(t, { failure, selected = true, approvalApi, tools = {}, transportStatus } = {}) {
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
  const input = new PassThrough(), output = new PassThrough();
  server = await serveNativePlugin({ base: join(root, 'bindings'), host, installationRoot,
    input, output, configReader, now: () => time,
    isHostAlive: () => true, bindingFactory: options => new NativeBinding({ ...options, verifyHost: () => true }),
    approvalApi: approvalApi ?? { readApprovalState: () => { throw Error('no setup read expected'); },
      beginApproval: () => { throw Error('startup must not POST'); }, pollApproval: () => { throw Error('startup must not enroll'); } },
    sessionFactory: async options => {
      calls.push(options); await failure?.(calls.length, options);
      const id = identities.get(options.conversationId) ?? randomUUID(); identities.set(options.conversationId, id);
      const session = { identity: { client_id: id }, inbox: { directory: join(root, 'inbox-' + options.conversationId) },
        ...(transportStatus?{transportStatus}:{}),
        tools: { broker_identity: async () => ({ client_id: id }), ...tools }, closes: [],
        async close(options) { this.closes.push(options); } };
      sessions.push(session); return session;
    },
  });
  const call = (id, name = 'broker_setup_status', args = {}) => server.tools[name](
    server.binding.issue({ context: { host, conversationId: id }, tool: name, args }), { nativeMeta: nativeMeta(id) });
  return { root, server, host, input, output, installation, connectionFile, requestId, credentialId, configs, calls, sessions, call,
    advance: milliseconds => { time += milliseconds; } };
}

test('native MCP initialization delivers collaboration guidance without enrolling or binding', async t => {
  const f = await fixture(t, { selected: false });
  const response = new Promise(resolve => f.output.once('data', bytes => resolve(JSON.parse(bytes.toString()))));
  f.input.write(JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'initialize', params: {
    protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'fixture', version: '1' },
  } }) + '\n');
  const { result } = await response;
  assert.ok(result.instructions.includes(PEER_GUIDANCE));
  assert.ok(result.instructions.includes(DIRECT_COMMAND_GUIDANCE));
  assert.match(result.instructions, /For a transport notice, read broker_presence_events/);
  assert.equal(f.server.binding.assertHost().conversation, null);
  assert.equal(f.installation.pending(), null);
  assert.equal(f.calls.length, 0);
});

test('ordinary native MCP commands validate then dispatch once, retaining failure and saved-state guarantees', async t => {
  const sent = [];
  const f = await fixture(t, { tools: { broker_send: async args => {
    sent.push(args);
    if (args.text === 'network failure') throw new LocalError('request_failed', { effect: 'unknown' });
    return { status: 'accepted', message_id: randomUUID() };
  } } });
  const conversationId = randomUUID();
  await f.call(conversationId);
  const selected = f.installation.selected(), pending = f.installation.pending();
  let rpcId = 0;
  const rpc = (method, params) => {
    const response = new Promise(resolve => f.output.once('data', bytes => resolve(JSON.parse(bytes.toString()))));
    f.input.write(JSON.stringify({ jsonrpc: '2.0', id: ++rpcId, method, params }) + '\n');
    return response;
  };
  await rpc('initialize', { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'fixture', version: '1' } });
  f.input.write(JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' }) + '\n');
  const call = (name, args) => rpc('tools/call', { name, arguments: f.server.binding.issue({
    context: { host: f.host, conversationId }, tool: name, args,
  }), _meta: nativeMeta(conversationId) });
  const recipient_id = randomUUID();
  for (const args of [{ text: 'missing recipient' }, { recipient_id }, { recipient_id: 'not-a-uuid', text: 'invalid' }]) {
    assert.equal((await call('broker_send', args)).error.code, -32602);
  }
  const unavailable = await rpc('tools/call', { name: 'broker_nonexistent', arguments: {} });
  assert.equal(unavailable.error.code, -32602);
  assert.equal(sent.length, 0);
  const args = { recipient_id, text: 'hello' };
  const result = await call('broker_send', args);
  assert.equal(result.result.isError, false);
  assert.deepEqual(sent, [args]);
  const failed = await call('broker_send', { recipient_id, text: 'network failure' });
  assert.equal(failed.result.isError, true);
  const error = JSON.parse(failed.result.content[0].text).error;
  assert.equal(error.code, 'request_failed');
  assert.equal(error.effect, 'unknown');
  assert.match(error.action, /Retry only the original idempotent operation/);
  assert.equal(sent.length, 2);
  assert.equal(f.calls.length, 1);
  assert.deepEqual(f.installation.selected(), selected);
  assert.deepEqual(f.installation.pending(), pending);
});

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

test('bare connect reuses saved authorization, is idempotent and resumes an explicit disconnect', async t => {
  const f = await fixture(t), id = randomUUID();
  const selected = f.installation.selected(), pending = f.installation.pending();
  const first = await f.call(id, 'broker_connect');
  assert.equal(first.connected, true);
  assert.equal(first.waiter_command, waiterCommand(f.server.directory));
  assert.equal((await f.call(id, 'broker_connect')).client_id, first.client_id);
  assert.equal(f.calls.length, 1);
  assert.deepEqual(await f.call(id, 'broker_disconnect'), { connected: false });
  assert.equal(f.sessions[0].closes.length, 1);
  const reopened = openInstallation(f.installation.directory, path => f.configs.get(path));
  assert.equal(reopened.sessionDisabled(id), true);
  f.advance(600000);
  assert.equal((await f.call(id)).connected, false);
  assert.equal(f.calls.length, 1);
  const resumed = await f.call(id, 'broker_connect');
  assert.equal(resumed.client_id, first.client_id);
  assert.equal(resumed.waiter_command, waiterCommand(f.server.directory));
  assert.equal(reopened.sessionDisabled(id), false);
  const status = await f.call(id);
  assert.equal(status.state, 'approved');
  assert.equal(status.request_connection_state, 'connected');
  assert.equal(f.calls.length, 2);
  assert.deepEqual(f.installation.selected(), selected);
  assert.deepEqual(f.installation.pending(), pending);
});

test('bare connect without saved authorization requests setup without enrolling', async t => {
  const f = await fixture(t, { selected: false });
  await assert.rejects(f.call(randomUUID(), 'broker_connect'), error => {
    assert.equal(error.code, 'setup_needed');
    assert.match(error.message, /\/psst-setup/);
    return true;
  });
  assert.equal(f.calls.length, 0);
  assert.equal(f.installation.selected(), null);
  assert.equal(f.installation.pending(), null);
});

test('failed saved connect preserves explicit disconnect and installation selection', async t => {
  const f = await fixture(t, { failure: count => { if (count > 1) throw Error('attachment_failed'); } });
  const id = randomUUID();
  await f.call(id, 'broker_connect');
  await f.call(id, 'broker_disconnect');
  const selected = f.installation.selected(), pending = f.installation.pending();
  await assert.rejects(f.call(id, 'broker_connect'), /attachment_failed/);
  assert.equal(f.installation.sessionDisabled(id), true);
  assert.deepEqual(f.installation.selected(), selected);
  assert.deepEqual(f.installation.pending(), pending);
  f.advance(600000);
  assert.equal((await f.call(id)).connected, false);
  assert.equal(f.calls.length, 2);
});

test('invalid saved selection leaves a disconnected conversation disabled without enrollment', async t => {
  const f = await fixture(t), id = randomUUID();
  await f.call(id, 'broker_connect');
  await f.call(id, 'broker_disconnect');
  const config = f.configs.get(f.connectionFile);
  f.configs.set(f.connectionFile, { ...config, enrollment: { ...config.enrollment, credentialId: 'different' } });
  await assert.rejects(f.call(id, 'broker_connect'), /installation_identity_changed/);
  assert.equal(f.installation.sessionDisabled(id), true);
  assert.equal(f.calls.length, 1);
});

test('disconnect during bare connect fences a late session without changing saved authorization', async t => {
  const entered = barrier(), finish = barrier();
  const f = await fixture(t, { failure: async () => { entered.resolve(); await finish.promise; } });
  const id = randomUUID(), selected = f.installation.selected();
  const connecting = assert.rejects(f.call(id, 'broker_connect'), /native_host_unavailable/);
  await entered.promise;
  await f.call(id, 'broker_disconnect');
  finish.resolve();
  await connecting;
  assert.equal(f.sessions[0].closes.length, 1);
  assert.equal(f.installation.sessionDisabled(id), true);
  assert.deepEqual(f.installation.selected(), selected);
  f.advance(600000);
  assert.equal((await f.call(id)).connected, false);
  assert.equal(f.calls.length, 1);
});

test('explicit connect retains private-file validation and cannot replace a working connection', async t => {
  const f = await fixture(t), id = randomUUID();
  for (const args of [{ pairing_file: '/private/pair.json', connection_file: f.connectionFile }, { connection_file: '' }]) {
    await assert.rejects(f.call(id, 'broker_connect', args), /one_private_file_path_required/);
  }
  assert.equal(f.calls.length, 0);
  const connected = await f.call(id, 'broker_connect', { connection_file: f.connectionFile });
  assert.equal((await f.call(id, 'broker_connect')).client_id, connected.client_id);
  await assert.rejects(f.call(id, 'broker_connect', { connection_file: '/other/connection.json' }), /disconnect_before_repair/);
  assert.equal(f.calls.length, 1);
  assert.equal(f.sessions[0].closes.length, 0);
});

test('status reports exact client identity and distinguishes explicit disconnect from missing setup', async t => {
  const f = await fixture(t), id = randomUUID();
  const selected = f.installation.selected(), pending = f.installation.pending();
  const status = await f.call(id);
  assert.equal(status.connected, true);
  assert.equal(status.disconnected, false);
  assert.equal(status.client_id, f.sessions[0].identity.client_id);
  assert.equal(typeof status.connector_runtime.version, 'string');
  assert.equal(status.automatic_delivery_certified, false);
  await f.call(id, 'broker_disconnect');
  const disconnected = await f.call(id);
  assert.equal(disconnected.disconnected, true);
  assert.equal(disconnected.client_id, null);
  assert.equal(disconnected.connected, false);
  assert.equal(disconnected.waiter_command, undefined);
  assert.deepEqual(f.installation.selected(), selected);
  assert.deepEqual(f.installation.pending(), pending);
  const missing = await fixture(t, { selected: false });
  const unconfigured = await missing.call(randomUUID());
  assert.equal(unconfigured.disconnected, false);
  assert.equal(unconfigured.client_id, null);
  assert.equal(unconfigured.state, 'setup_needed');
  assert.equal(missing.installation.pending(), null);
});

test('cancel setup retains working transport and fences late approved attachment', async t => {
  const entered = barrier(), finish = barrier(), requestId = randomUUID();
  let result;
  const f = await fixture(t, { failure: async count => { if (count === 2) { entered.resolve(); await finish.promise; } },
    approvalApi: { readApprovalState: () => null, beginApproval: () => result, pollApproval: () => result } });
  const id = randomUUID();
  await f.call(id);
  const selected = f.installation.selected(), identity = f.sessions[0].identity.client_id;
  const connectionFile = join(f.root, 'replacement.json'), credentialId = 'enrolled-' + randomUUID();
  f.configs.set(connectionFile, { ...f.configs.get(f.connectionFile), enrollment: { credentialId } });
  result = { state: 'approved', requestId, connectionFile, credentialId };
  await f.call(id, 'broker_setup', { broker_url: 'https://broker.example' });
  await entered.promise;
  const pending = f.installation.pending();
  const cancelled = await f.call(id, 'broker_cancel_setup');
  finish.resolve();
  assert.equal(cancelled.state, 'cancelled');
  assert.equal(cancelled.connected, true);
  assert.equal(cancelled.waiter_command, waiterCommand(f.server.directory));
  await new Promise(resolve => setImmediate(resolve));
  const status = await f.call(id);
  assert.equal(status.connected, true);
  assert.equal(status.disconnected, false);
  assert.equal(status.client_id, identity);
  assert.equal(status.waiter_command, waiterCommand(f.server.directory));
  assert.deepEqual(f.installation.selected(), selected);
  assert.deepEqual(f.installation.pending(), pending);
  assert.equal(f.installation.setupSuppressed(id), true);
  assert.equal(f.installation.sessionDisabled(id), false);
  assert.equal(f.sessions[0].closes.length, 0);
  assert.equal(f.sessions[1].closes.length, 1);
});

test('cancel setup without a connection does not return or arm an inbox waiter', async t => {
  const f = await fixture(t, { selected: false }), id = randomUUID();
  const cancelled = await f.call(id, 'broker_cancel_setup');
  assert.equal(cancelled.state, 'cancelled');
  assert.equal(cancelled.connected, false);
  assert.equal(cancelled.waiter_command, undefined);
  assert.equal(f.calls.length, 0);
  assert.equal(f.installation.pending(), null);
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

test('native MCP dispatch fences invalid targets before setup changes and reaches the matching target', async t => {
 let reads=0,posts=0;const requestId=randomUUID();
 const f=await fixture(t,{approvalApi:{readApprovalState:()=>{reads++;return null;},beginApproval:()=>{posts++;return {state:'denied',requestId};}}});
 const id=randomUUID();await f.call(id);
 const selected=f.installation.selected(),pending=f.installation.pending();
 let rpcId=0;
 const rpc=(method,params)=>{
  const response=new Promise(resolve=>f.output.once('data',bytes=>resolve(JSON.parse(bytes.toString()))));
  f.input.write(JSON.stringify({jsonrpc:'2.0',id:++rpcId,method,params})+'\n');return response;
 };
 await rpc('initialize',{protocolVersion:'2025-06-18',capabilities:{},clientInfo:{name:'fixture',version:'1'}});
 f.input.write(JSON.stringify({jsonrpc:'2.0',method:'notifications/initialized'})+'\n');
 for(const args of [
  {broker_url:'https://broker.example'},
  {broker_url:'https://broker.example',__psst_permit:randomUUID()},
  ...['replace','confirmed','human_invoked'].map(field=>f.server.binding.issue({
   context:{host:f.host,conversationId:id},tool:'broker_setup',args:{broker_url:'https://broker.example',[field]:true},
  })),
 ]){
  const response=await rpc('tools/call',{name:'broker_setup',arguments:args,_meta:nativeMeta(id)});
  assert.ok(response.error);assert.equal(reads,0);assert.equal(posts,0);
  assert.deepEqual(f.installation.selected(),selected);assert.deepEqual(f.installation.pending(),pending);
 }
 for(const broker_url of [undefined,'https:broker.example','http://broker.example','https://broker.example/path','https://other.example']){
  const args=broker_url===undefined?{}:{broker_url};
  const response=await rpc('tools/call',{name:'broker_setup',arguments:f.server.binding.issue({context:{host:f.host,conversationId:id},tool:'broker_setup',args}),_meta:nativeMeta(id)});
  if(broker_url===undefined)assert.equal(response.error.code,-32602);
  else{
   assert.equal(response.result.isError,true);
   const error=JSON.parse(response.result.content[0].text).error;
   assert.equal(error.code,broker_url==='https://other.example'?'broker_endpoint_mismatch':'https_broker_url_required');
   assert.equal(error.effect,'not_applied');
   assert.match(error.message,broker_url==='https://other.example'?/differs from the configured broker/:/Usage: \/psst-reauthorize/);
  }
  assert.equal(reads,0);assert.equal(posts,0);
  assert.deepEqual(f.installation.selected(),selected);assert.deepEqual(f.installation.pending(),pending);
 }
 const args={broker_url:'https://BROKER.EXAMPLE:443/'};
 const decision=hookDecision({input:{toolCall:{name:'call_mcp_tool',args:{ServerName:NATIVE_SERVER,ToolName:'broker_setup',Arguments:args}}},
  context:{host:f.host,conversationId:id},binding:f.server.binding,directory:f.server.directory});
 assert.equal(decision.decision,'allow');assert.equal(decision.permissionOverrides,undefined);
 const response=await rpc('tools/call',{name:'broker_setup',arguments:decision.overwrite.Arguments,_meta:nativeMeta(id)});
 assert.equal(response.result.isError,false);assert.equal(reads,1);assert.equal(posts,1);
 assert.equal(f.installation.pending().requestId,requestId);assert.deepEqual(f.installation.selected(),selected);
});

test('invalid setup or failed initial read cannot cancel a valid saved startup', async t => {
 for(const initialReadFails of [false,true]){
  const entered=barrier(),finish=barrier();
  const f=await fixture(t,{failure:async()=>{entered.resolve();await finish.promise;},
   approvalApi:{readApprovalState:()=>{throw Error('initial_read_failed');}}});
  const id=randomUUID(),starting=f.call(id);await entered.promise;
  await assert.rejects(f.call(id,'broker_setup',{broker_url:initialReadFails?'https://broker.example':'not a URL'}),initialReadFails?/initial_read_failed/:/https_broker_url_required/);
  finish.resolve();const status=await starting;
  assert.equal(status.connected,true);assert.equal(status.state,'approved');assert.equal(status.requestId,f.requestId);
  assert.equal(f.sessions[0].closes.length,0);assert.equal(f.calls.length,1);
 }
});

test('invalid or mismatched setup leaves an explicitly disconnected conversation and its selection unchanged', async t => {
 const f=await fixture(t),id=randomUUID();await f.call(id);await f.call(id,'broker_disconnect');
 const selected=f.installation.selected(),pending=f.installation.pending();
 for(const broker_url of [undefined,'not a URL','https://other.example']){
  await assert.rejects(f.call(id,'broker_setup',broker_url===undefined?{}:{broker_url}),broker_url==='https://other.example'?/broker_endpoint_mismatch/:/https_broker_url_required/);
  assert.deepEqual(f.installation.selected(),selected);assert.deepEqual(f.installation.pending(),pending);
  assert.equal(f.installation.sessionDisabled(id),true);assert.equal(f.installation.setupSuppressed(id),true);
 }
 f.advance(600000);const status=await f.call(id);
 assert.equal(status.connected,false);assert.equal(status.waiter_command,undefined);assert.equal(f.calls.length,1);
});

test('native replacement joins the pending candidate and resumes after cancellation through the existing waiter path', async t => {
 let saved,posts=0,creates=0;const requestId=randomUUID();
 const f=await fixture(t,{approvalApi:{readApprovalState:()=>saved,beginApproval:options=>{
  posts++;assert.equal(options.brokerUrl,'https://broker.example');
  if(options.replaceRequestId){creates++;assert.equal(options.replaceRequestId,f.requestId);saved={state:'pending',requestId};}
  return saved;
 },pollApproval:()=>saved}});
 saved={state:'approved',requestId:f.requestId};
 const id=randomUUID();const initial=await f.call(id);
 assert.equal(initial.broker_url,'https://broker.example');assert.equal(initial.request_connection_state,'connected');
 await f.call(id,'broker_setup',{broker_url:initial.broker_url});
 const pending=await f.call(id);
 assert.equal(pending.connected,true);assert.equal(pending.request_connection_state,'pending');assert.equal(pending.requestId,requestId);
 assert.equal(pending.waiter_command,approvalWaiterCommand(f.server.directory));
 await f.call(id,'broker_setup',{broker_url:pending.broker_url});
 assert.equal((await f.call(id)).requestId,requestId);assert.equal(posts,2); // Helper deduplicates the same candidate.
 assert.equal(f.installation.selected().requestId,f.requestId);
 await f.call(id,'broker_cancel_setup');
 assert.equal(f.installation.pending().requestId,requestId);
 assert.equal((await f.call(id)).state,'cancelled');
 const connectionFile=join(f.root,'replacement.json'),credentialId='enrolled-'+randomUUID();
 f.configs.set(connectionFile,{...f.configs.get(f.connectionFile),enrollment:{credentialId}});
 saved={state:'approved',requestId,connectionFile,credentialId};
 await f.call(id,'broker_setup',{broker_url:'https://broker.example'});
 await new Promise(resolve=>setImmediate(resolve));const connected=await f.call(id);
 assert.equal(creates,1);assert.equal(posts,3);
 assert.equal(connected.requestId,requestId);assert.equal(connected.request_connection_state,'connected');
 assert.equal(connected.waiter_command,waiterCommand(f.server.directory));
 assert.equal(f.installation.selected().requestId,requestId);assert.equal(f.sessions[0].closes.length,1);
});

test('failed replacement attachment retains the old transport and an explicit retry selects the same candidate', async t => {
 let saved,result,failAttachment=true;const begins=[];
 const f=await fixture(t,{failure:count=>{if(count>1&&failAttachment)throw Error('attachment_failed');},
  approvalApi:{readApprovalState:()=>saved,beginApproval:options=>{begins.push(options);return saved=result;},pollApproval:()=>saved}});
 const id=randomUUID();await f.call(id);const old=f.installation.selected();
 const connectionFile=join(f.root,'replacement.json'),credentialId='enrolled-'+randomUUID();
 f.configs.set(connectionFile,{...f.configs.get(f.connectionFile),enrollment:{credentialId}});
 result={state:'approved',requestId:randomUUID(),connectionFile,credentialId};
 await f.call(id,'broker_setup',{broker_url:'https://broker.example'});
 await new Promise(resolve=>setImmediate(resolve));const status=await f.call(id);
 assert.equal(status.state,'attention_required');assert.equal(status.connected,true);
 assert.equal(status.request_connection_state,'approved_not_connected');assert.equal(status.requestId,result.requestId);
 assert.deepEqual(f.installation.selected(),old);
 assert.equal(f.sessions[0].closes.length,0);
 failAttachment=false;
 await f.call(id,'broker_setup',{broker_url:'https://broker.example'});
 await new Promise(resolve=>setImmediate(resolve));const recovered=await f.call(id);
 assert.equal(recovered.request_connection_state,'connected');assert.equal(recovered.requestId,result.requestId);
 assert.equal(recovered.waiter_command,waiterCommand(f.server.directory));
 assert.equal(begins.length,2);assert.equal(begins[1].replaceRequestId,undefined);
 assert.equal(f.installation.selected().requestId,result.requestId);
 assert.equal(f.sessions[0].closes.length,1);
});

test('native status distinguishes attached transport, active retry, and restored reception', async t => {
  let transport={heartbeat:'healthy',reception:'polling',recovery:'idle',error_code:null};
  const f=await fixture(t,{transportStatus:()=>({...transport})}),id=randomUUID();
  const starting=await f.call(id);
  assert.equal(starting.transport_attached,true);assert.equal(starting.connected,false);
  assert.equal(starting.disconnected,false);assert.equal(starting.client_id,f.sessions[0].identity.client_id);
  assert.equal(starting.automatic_delivery_certified,false);
  transport={heartbeat:'healthy',reception:'retry_waiting',recovery:'retry_waiting',error_code:'request_failed'};
  const waiting=await f.call(id);
  assert.equal(waiting.connected,false);assert.equal(waiting.request_connection_state,'reconnecting');
  assert.equal(waiting.client_id,starting.client_id);assert.equal(waiting.disconnected,false);
  assert.equal(waiting.readiness,'reconnecting');assert.equal(waiting.waiter_command,waiterCommand(f.server.directory));
  transport={heartbeat:'healthy',reception:'healthy',recovery:'idle',error_code:null};
  const restored=await f.call(id);
  assert.equal(restored.connected,true);assert.equal(restored.request_connection_state,'connected');
  assert.equal(restored.transport.error_code,null);assert.equal(f.calls.length,1);
  await f.call(id,'broker_disconnect');
  const disconnected=await f.call(id);
  assert.equal(disconnected.transport,undefined);assert.equal(disconnected.disconnected,true);
  assert.equal(disconnected.client_id,null);assert.equal(disconnected.transport_attached,false);
});

test('permanent transport blockers retain diagnostics without replacement or automatic enrollment', async t => {
  for(const code of ['session_expired','session_mismatch','forbidden','storage_unavailable']){
    const f=await fixture(t),id=randomUUID();await f.call(id);
    const selected=f.installation.selected(),clientId=f.sessions[0].identity.client_id;
    const transport={heartbeat:'blocked',reception:'blocked',recovery:'blocked',error_code:code};
    f.calls[0].onUnavailable({code,conversationId:id,transport});
    await new Promise(resolve=>setImmediate(resolve));f.advance(600000);
    const status=await f.call(id);
    assert.equal(status.connected,false);assert.equal(status.readiness,'blocked');
    assert.deepEqual(status.transport,transport);assert.equal(status.waiter_command,undefined);
    assert.equal(f.calls.length,1);assert.equal(f.sessions[0].identity.client_id,clientId);
    assert.deepEqual(f.installation.selected(),selected);
  }
});

test('an old lifetime callback cannot disconnect a later attachment of the same client', async t => {
  const f=await fixture(t),id=randomUUID();await f.call(id);
  const old=f.calls[0],clientId=f.sessions[0].identity.client_id;
  await f.call(id,'broker_disconnect');
  await f.call(id,'broker_connect');
  assert.equal(f.sessions[1].identity.client_id,clientId);
  old.onUnavailable({code:'session_expired',conversationId:id,transport:{recovery:'blocked'}});
  await new Promise(resolve=>setImmediate(resolve));
  assert.equal((await f.call(id)).connected,true);assert.equal(f.sessions[1].closes.length,0);
});
