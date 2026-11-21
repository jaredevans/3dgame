import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeStreamer } from '../streamer.js';

// things that log being built, shown and let go; ids 'g/name' are grouped by g
const recorder = () => {
  const log = [], on = new Set();
  let n = 0;
  const thing = (id) => { const me = `${id}#${++n}`; log.push(`+${me}`); return { me, show() { on.add(me); log.push(`show ${me}`); }, dispose() { on.delete(me); log.push(`-${me}`); } }; };
  return { log, on, thing };
};
const group = (id) => id.split('/')[0];

test('builders can be a function of the id', async () => {
  const { log, thing } = recorder();
  const s = makeStreamer((id) => (id.startsWith('c:') ? async () => thing(id) : undefined));
  await s.want(new Set(['c:0,0:4', 'nope']));
  assert.ok(s.has('c:0,0:4'));
  assert.ok(!s.has('nope'));
  assert.deepEqual(s.ids, ['c:0,0:4']);
  assert.deepEqual(log, ['+c:0,0:4#1', 'show c:0,0:4#1']);
});

test('a group shows together once all of it is in, and what it replaces goes in the same step', async () => {
  const { log, on, thing } = recorder();
  const gates = [];
  const held = (id) => async () => { await new Promise((r) => gates.push(r)); return thing(id); };
  const s = makeStreamer((id) => (id.includes('fine') ? held(id) : async () => thing(id)), { standIn: group });
  await s.want(new Set(['A/big', 'B/big']));
  assert.deepEqual([...on].sort(), ['A/big#1', 'B/big#2']);
  // A splits into two fine pieces; B goes out of range altogether
  const p = s.want(new Set(['A/fine1', 'A/fine2']));
  await null; await null;
  assert.deepEqual([...on], ['A/big#1'], 'B goes at once; A stands in');
  gates.shift()(); await null; await null; await null; await null;
  assert.ok(s.has('A/fine1'));
  assert.deepEqual([...on], ['A/big#1'], 'half the group in: nothing shown yet, the old one still up');
  gates.shift()();
  await p;
  assert.deepEqual([...on].sort(), ['A/fine1#3', 'A/fine2#4']);
  assert.ok(!s.has('A/big'));
  // shown and let go in one step: no frame sees both or neither
  const i = log.indexOf('show A/fine2#4');
  assert.deepEqual(log.slice(i - 1, i + 2).sort(), ['-A/big#1', 'show A/fine1#3', 'show A/fine2#4']);
});

test('redo rebuilds a live thing, letting the old one go once the new one shows', async () => {
  const { log, on, thing } = recorder();
  const s = makeStreamer(() => async () => thing('a'));
  await s.want(new Set(['a']));
  await s.redo(['a', 'not-live']);
  assert.deepEqual(log, ['+a#1', 'show a#1', '+a#2', 'show a#2', '-a#1']);
  assert.deepEqual([...on], ['a#2']);
  assert.ok(!s.has('not-live'));
});

test('a redo inside a group still building keeps the old one up until the whole group shows', async () => {
  const { log, on, thing } = recorder();
  const gates = [];
  const held = (id) => async () => { await new Promise((r) => gates.push(r)); return thing(id); };
  const s = makeStreamer((id) => (id === 'A/two' ? held(id) : async () => thing(id)), { standIn: group });
  await s.want(new Set(['A/one']));
  const p = s.want(new Set(['A/one', 'A/two']));
  await null; await null;
  s.redo(['A/one']);                      // A/one's ground changed while A/two builds
  gates.shift()();
  await p; await null; await null; await null;
  // the rebuilt A/one waited for A/two, the old one up all the while; then both shown and the old let go in one step
  assert.deepEqual([...on].sort(), ['A/one#3', 'A/two#2']);
  assert.deepEqual(log.slice(-3).sort(), ['-A/one#1', 'show A/one#3', 'show A/two#2']);
});
