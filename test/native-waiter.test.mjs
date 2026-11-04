import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { approvalWaiterNotice } from '../src/approval-waiter.mjs';
import { createNativeWaiter, PENDING_NOTICE } from '../src/native-waiter.mjs';

function fixture() {
  const listeners = new Set(); let head = null, bound = true, failed = false;
  const waiter = createNativeWaiter({ conversationId: randomUUID(), clientId: randomUUID(),
    inbox: { head: () => head, assertUsable: () => { if (failed) throw new Error('secret'); } },
    subscribe: fn => { listeners.add(fn); return () => listeners.delete(fn); }, isBound: () => bound });
  return { waiter, listeners, set: value => { head = value; }, fail: () => { failed = true; },
    disconnect: () => { bound = false; }, notify: () => { for (const fn of listeners) fn(); } };
}

test('native notice waits without model polling and never consumes or exposes message text', async () => {
  const f = fixture(); const waiting = f.waiter.wait();
  assert.equal(f.listeners.size, 1);
  await assert.rejects(f.waiter.wait(), /already_armed/);
  f.set({ state: 'pending', envelope: { text: 'untrusted secret payload' } }); f.notify();
  const result = await waiting;
  assert.equal(result.notice, PENDING_NOTICE);
  assert.equal(result.model_read_recorded, false);
  assert.equal(JSON.stringify(result).includes('secret payload'), false);
  assert.equal(f.listeners.size, 0);
  // Lost notice / process-level re-arm does not remove durable pending data.
  assert.equal((await f.waiter.wait()).status, 'pending');
  assert.equal((await f.waiter.wait()).status,'attention_required');
  const abort=new AbortController(),suppressed=f.waiter.wait({signal:abort.signal});
  assert.equal(f.listeners.size,1);f.notify();abort.abort();
  assert.deepEqual(await suppressed,{status:'cancelled'});
});

test('disconnect and cancellation release the waiter without inventing a message', async () => {
  const f = fixture(); const first = f.waiter.wait(); f.disconnect(); f.notify();
  assert.deepEqual(await first, { status: 'disconnected' });
  await assert.rejects(f.waiter.wait(), /session_mismatch/);
  const g = fixture(), abort = new AbortController();
  const second = g.waiter.wait({ signal: abort.signal }); abort.abort();
  assert.deepEqual(await second, { status: 'cancelled' }); assert.equal(g.listeners.size, 0);
  assert.deepEqual(await g.waiter.wait({ signal: abort.signal }), { status: 'cancelled' });
});

test('uncertain inbox is fenced, error text does not leak, and listeners are released', async () => {
  const f = fixture(); const waiting = f.waiter.wait(); f.fail(); f.notify();
  await assert.rejects(waiting, /^Error: native_waiter_unavailable$/);
  assert.equal(f.listeners.size, 0);
  const g = fixture(); g.set({ state: 'injecting' });
  await assert.rejects(g.waiter.wait(), /native_waiter_unavailable/);
});

test('failed subscription cleanup fences the waiter instead of claiming clean re-arm', async () => {
  const waiter = createNativeWaiter({conversationId:randomUUID(),clientId:randomUUID(),
    inbox:{head:()=>({state:'pending'})},isBound:()=>true,
    subscribe:()=>()=>{throw new Error('secret implementation detail');}});
  await assert.rejects(waiter.wait(),/^Error: native_waiter_unavailable$/);
  await assert.rejects(waiter.wait(),/^Error: native_waiter_unavailable$/);
});


test('approval waiter remains quiet during saved reconnect and wakes only for the same request', () => {
  const requestId = randomUUID(), initial = { state: 'reconnecting', requestId };
  for (const state of ['pending', 'reconnecting']) assert.equal(approvalWaiterNotice(initial, { state, requestId }), null);
  assert.match(approvalWaiterNotice(initial, { state: 'approved', requestId }), /saved installation connected/);
  for (const state of ['denied', 'expired', 'revoked', 'cancelled', 'attention_required']) {
    assert.match(approvalWaiterNotice(initial, { state, requestId }), /needs attention or was cancelled/);
  }
  assert.match(approvalWaiterNotice(initial, { state: 'approved', requestId: randomUUID() }), /request changed/);
});
