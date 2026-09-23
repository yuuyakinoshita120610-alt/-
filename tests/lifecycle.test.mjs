import { test } from 'node:test';
import assert from 'node:assert/strict';
import { RequestGate } from '../lib/request-gate.ts';

test('rapid clicks and overlapping analyze/recipe requests are blocked', () => {
  const gate = new RequestGate();
  const first = gate.begin();
  assert.ok(first);
  assert.equal(gate.begin(), null);
  assert.equal(gate.finish(first), true);
  assert.ok(gate.begin());
});
test('late success, late failure and finally from old photo cannot affect new request', async () => {
  const gate = new RequestGate();
  let completeOld;
  const old = gate.begin();
  const result = new Promise(resolve => { completeOld = resolve; }).then(() => ({ update: gate.isCurrent(old), unlock: gate.finish(old) }));
  gate.invalidate();
  assert.equal(old.controller.signal.aborted, true);
  const current = gate.begin();
  completeOld();
  assert.deepEqual(await result, { update: false, unlock: false });
  assert.equal(gate.isCurrent(current), true);
  assert.equal(gate.begin(), null);
  assert.equal(gate.finish(current), true);
});
test('unmount invalidates pending work and permits a later fresh request', () => {
  const gate = new RequestGate();
  const old = gate.begin();
  gate.invalidate();
  assert.equal(gate.isCurrent(old), false);
  assert.equal(gate.finish(old), false);
  assert.ok(gate.begin());
});
