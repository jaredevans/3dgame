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

// a build can't be stopped once begun: one still in flight when it stops being wanted finishes, and is let go only then.
// The page waits for that (busy) before a train may leave, so its last work and its letting go never land on a moving frame
test('an in-flight build that stops being wanted finishes, is let go, and the streamer is busy until then', async () => {
  const { log, thing } = recorder();
  let finish;
  const streamer = makeStreamer({ a: () => new Promise((done) => { finish = () => done(thing('a')); }) });
  const first = streamer.want(new Set(['a']));
  await Promise.resolve();
  assert.equal(streamer.busy, true, 'building');
  streamer.want(new Set());   // driven away from it
  assert.equal(streamer.busy, true, 'still building: it cannot be stopped');
  finish();
  await first;
  await new Promise((r) => setTimeout(r, 0));
  assert.deepEqual(log, ['+a#1', '-a#1'], 'built, then let go once in');
  assert.equal(streamer.has('a'), false);
  assert.equal(streamer.busy, false);
});

test('busy while anything wanted is still to be built, not for what failed', async () => {
  const streamer = makeStreamer({ a: async () => ({ dispose() {} }), b: async () => { throw new Error('404'); } }, { onError: () => {} });
  assert.equal(streamer.busy, false);
  await streamer.want(new Set(['a', 'b']));
  assert.equal(streamer.busy, false, 'a is in; b failed and is not retried');
});

// a build that never settles (an import or fetch that hangs) must not hold up the rest, nor leave the page busy for ever:
// past its deadline it counts as failed (reported, so the "couldn't be loaded" paths take over), what's next is built,
// and if it lands after all it's let go
test('a build past its deadline counts as failed, the rest go on, and a late arrival is let go', async () => {
  const errors = [], { log, thing } = recorder();
  let land;
  const streamer = makeStreamer({
    hung: () => new Promise((done) => { land = () => done(thing('hung')); }),
    b: async () => thing('b'),
  }, { onError: (e) => errors.push(e.message), deadline: 20 });
  await streamer.want(new Set(['hung', 'b']));
  assert.ok(streamer.failed('hung'), 'past its deadline: failed');
  assert.match(errors[0], /hung took more than/);
  assert.ok(streamer.has('b'), 'the next build went ahead');
  assert.equal(streamer.busy, false, 'not busy for ever');
  land();
  await new Promise((r) => setTimeout(r, 0));
  assert.deepEqual(log, ['+b#1', 'show b#1', '+hung#2', '-hung#2'], 'landed late, and let go');
  assert.equal(streamer.has('hung'), false);
});

test('failed builds are tried again when asked, a few times at most', async () => {
  let tries = 0;
  const streamer = makeStreamer({ flaky: async () => { tries++; throw new Error('503'); } }, { onError: () => {}, retries: 2 });
  await streamer.want(new Set(['flaky']));
  for (let i = 0; i < 5; i++) { streamer.retry(); await streamer.want(new Set(['flaky'])); }
  assert.equal(tries, 3, 'the first try and two more');
  assert.ok(streamer.failed('flaky'));
});

test('whether an id is still to be built: never one without a builder, nor one that failed', async () => {
  const streamer = makeStreamer({ a: async () => ({ dispose() {} }), bad: async () => { throw new Error('x'); } }, { onError: () => {} });
  assert.equal(streamer.toBuild('a'), true);
  assert.equal(streamer.toBuild('nothing'), false, 'no builder: never to be built');
  await streamer.want(new Set(['a', 'bad', 'nothing']));
  assert.equal(streamer.toBuild('a'), false);
  assert.equal(streamer.toBuild('bad'), false);
  assert.equal(streamer.busy, false);
});
