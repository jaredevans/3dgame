import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeStreamer, own, disown } from '../streamer.js';

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
// once nothing has come in for it for `stall` seconds of frames (tick(dt)) it counts as failed (reported, so the "couldn't
// be loaded" paths take over), what's next is built, and if it lands after all it's let go
const ticks = (s, seconds, dt = 0.1) => { for (let t = 0; t < seconds - 1e-9; t += dt) s.tick(dt); };
const settle = () => new Promise((r) => setTimeout(r, 0));

test('a build with no progress for its stall time counts as failed, the rest go on, and a late arrival is let go', async () => {
  const errors = [], { log, thing } = recorder();
  let land;
  const streamer = makeStreamer({
    hung: () => new Promise((done) => { land = () => done(thing('hung')); }),
    b: async () => thing('b'),
  }, { onError: (e) => errors.push(e.message), stall: 2 });
  const p = streamer.want(new Set(['hung', 'b']));
  await settle();
  ticks(streamer, 1.9);
  await settle();
  assert.ok(!streamer.failed('hung'), 'not yet');
  ticks(streamer, 0.2);
  await p;
  assert.ok(streamer.failed('hung'), 'nothing came in for 2 s: failed');
  assert.match(errors[0], /hung/);
  assert.ok(streamer.has('b'), 'the next build went ahead');
  assert.equal(streamer.busy, false, 'not busy for ever');
  land();
  await settle();
  assert.deepEqual(log, ['+b#1', 'show b#1', '+hung#2', '-hung#2'], 'landed late, and let go');
  assert.equal(streamer.has('hung'), false);
});

// a slow download is not a hung one: a build that keeps making progress (a module in, a part loaded) is never failed,
// however long it takes in all
test('a build making steady progress is never failed, however long it takes', async () => {
  const errors = [], { thing } = recorder();
  let ctx, land;
  const streamer = makeStreamer({ slow: (c) => { ctx = c; return new Promise((done) => { land = () => done(thing('slow')); }); } },
    { onError: (e) => errors.push(e.message), stall: 45 });
  const p = streamer.want(new Set(['slow']));
  await settle();
  for (let s = 0; s < 300; s += 10) { ticks(streamer, 10); ctx.progress(); }   // 5 minutes, something in every 10 s
  streamer.progress();   // (the page's own signal: any resource coming in)
  ticks(streamer, 44);
  await settle();
  assert.deepEqual(errors, []);
  assert.ok(!streamer.failed('slow'));
  land();
  await p;
  assert.ok(streamer.has('slow'));
});

// behind the boot loading screen, which shows its progress, nothing is given up on: a streamer made without a stall
// time waits as long as it takes; the page gives it one after boot
test('with no stall time (at boot) a build is waited for however long; given one, it is failed after it', async () => {
  const errors = [];
  let land;
  const streamer = makeStreamer({
    first: () => new Promise((done) => { land = () => done({ dispose() {} }); }),
    later: () => new Promise(() => {}),
  }, { onError: (e) => errors.push(e.message) });
  assert.equal(streamer.stall, Infinity, 'no stall time unless given one');
  const boot = streamer.want(new Set(['first']));
  await settle();
  ticks(streamer, 600, 1);
  land();
  await boot;
  assert.ok(streamer.has('first') && errors.length === 0, 'ten minutes, and still waited for');
  streamer.stall = 5;
  const p = streamer.want(new Set(['first', 'later']));
  await settle();
  ticks(streamer, 5.1);
  await p;
  assert.ok(streamer.failed('later'));
});

// a hidden tab runs no frames: the stall time is frame time, so however long the tab is away nothing is given up on
test('a hidden tab (no frames) does not use up the stall time', async () => {
  const errors = [];
  let land;
  const streamer = makeStreamer({ a: () => new Promise((done) => { land = () => done({ dispose() {} }); }) },
    { onError: (e) => errors.push(e.message), stall: 0.01 });
  const p = streamer.want(new Set(['a']));
  await new Promise((r) => setTimeout(r, 60));   // 60 ms of wall clock, six times its stall time, but no frames
  land();
  await p;
  assert.deepEqual(errors, []);
  assert.ok(streamer.has('a'));
});

// a build waits at still() for a moment it may land in (the page: at a standstill, behind the cover if one is up), so
// what it does next (a kit built in one go, its upload) never lands on a moving frame; waiting there is not stalling.
// If by then it's no longer wanted it's dropped, not failed: built again if it's wanted later
test('a build waits at still() until it may land, without using up its stall time', async () => {
  const errors = [], { log, thing } = recorder();
  const streamer = makeStreamer({ a: async (ctx) => { log.push('fetched'); await ctx.still(); return thing('a'); } },
    { onError: (e) => errors.push(e.message), stall: 1 });
  streamer.landing = false;   // moving
  const p = streamer.want(new Set(['a']));
  await settle();
  ticks(streamer, 30);
  await settle();
  assert.deepEqual(log, ['fetched'], 'downloaded, and waiting');
  assert.equal(streamer.busy, true);
  streamer.landing = true;    // a standstill
  await p;
  assert.deepEqual(log, ['fetched', '+a#1', 'show a#1']);
  assert.deepEqual(errors, []);
});

test('a build no longer wanted when it may land is dropped, not failed, and built again when next wanted', async () => {
  const errors = [], { log, thing } = recorder();
  let builds = 0;
  const streamer = makeStreamer({ a: async (ctx) => { builds++; await ctx.still(); return thing('a'); } },
    { onError: (e) => errors.push(e.message), stall: 1 });
  streamer.landing = false;
  streamer.want(new Set(['a']));
  await settle();
  streamer.want(new Set());   // driven off: nothing new
  streamer.landing = true;    // the next standstill, somewhere it isn't wanted
  await settle(); await settle();
  assert.equal(streamer.busy, false);
  assert.deepEqual(log, [], 'never built');
  assert.equal(streamer.failed('a'), false, 'not a failure');
  assert.deepEqual(errors, []);
  await streamer.want(new Set(['a']));
  assert.equal(builds, 2);
  assert.ok(streamer.has('a'));
});

// a build that timed out goes on in the background. Once its retry is live it must not overwrite what the live one put
// in the page's shared maps, nor take it out when it's let go: each build is told whether it's still the current one,
// writes only while it is, and takes out only what it put in (own / disown)
test('a timed-out build landing after its retry neither overwrites nor deletes the live one', async () => {
  const shared = {}, gates = [];
  let made = 0;
  const streamer = makeStreamer({
    p: (ctx) => new Promise((done) => gates.push(() => {
      const me = { n: ++made === 1 ? 2 : 1 };   // numbered by build: the retry lands first (as #2), the stalled one after (#1)
      if (ctx.current()) own(shared, 'p', me);
      done({ me, dispose() { disown(shared, 'p', me); } });
    })),
  }, { onError: () => {}, stall: 1 });
  const first = streamer.want(new Set(['p']));
  await settle();
  ticks(streamer, 1.1);
  await first;
  assert.ok(streamer.failed('p'), 'the first build timed out');
  streamer.retry();
  const second = streamer.want(new Set(['p']));
  await settle();
  gates[1]();   // the retry lands
  await second;
  assert.equal(shared.p.n, 2);
  gates[0]();   // and then the first, late (n: 1)
  await settle();
  assert.equal(shared.p.n, 2, 'not overwritten');
  assert.equal(streamer.get('p').me.n, 2, 'the live one is still the retry');
  assert.deepEqual(Object.keys(shared), ['p'], 'and not deleted by the late one going');
  await streamer.want(new Set());
  assert.deepEqual(Object.keys(shared), [], 'the live one takes out its own');
});

test('a build told it is no longer current stops at its next check, and what it threw is not a failure', async () => {
  const errors = [];
  let go, ctx0;
  const streamer = makeStreamer({ a: async (ctx) => { ctx0 ??= ctx; await new Promise((r) => { go ??= r; }); ctx.check(); return { dispose() {} }; } },
    { onError: (e) => errors.push(e.message), stall: 1 });
  const p = streamer.want(new Set(['a']));
  await settle();
  ticks(streamer, 1.1);
  await p;
  assert.equal(ctx0.current(), false);
  assert.equal(errors.length, 1, 'the time-out reported once');
  go();
  await settle();
  assert.equal(errors.length, 1, 'its check throwing afterwards is not reported again');
});

test('failed builds are tried again when asked, a few times at most', async () => {
  let tries = 0;
  const streamer = makeStreamer({ flaky: async () => { tries++; throw new Error('503'); } }, { onError: () => {}, retries: 2 });
  await streamer.want(new Set(['flaky']));
  for (let i = 0; i < 5; i++) { streamer.retry(); await streamer.want(new Set(['flaky'])); }
  assert.equal(tries, 3, 'the first try and two more');
  assert.ok(streamer.failed('flaky'));
});

test('a build that succeeds on a retry has its tries cleared: if it fails again later it gets its retries again', async () => {
  let n = 0;
  const streamer = makeStreamer({ x: async () => { n++; if (n !== 2) throw new Error('503'); return { dispose() {} }; } }, { onError: () => {}, retries: 1 });
  await streamer.want(new Set(['x']));            // fails (1)
  streamer.retry(); await streamer.want(new Set(['x']));   // in (2)
  assert.ok(streamer.has('x'));
  await streamer.want(new Set());                 // let go
  await streamer.want(new Set(['x']));            // fails (3)
  streamer.retry(); await streamer.want(new Set(['x']));   // tried again (4): its earlier failure forgotten
  assert.equal(n, 4);
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

// the last moment before a kit's build in one go (buildKit's onProgress, as its last part comes in, after its own
// fetches): ctx.landNow() throws unless the build may land right now, so a player who pulled away while those fetches
// were in flight never gets the build on a moving frame. Dropped, not failed: built again at the next standstill
test('landNow() drops a build that may not land at that moment; it is built again once it may', async () => {
  const errors = [], { log, thing } = recorder();
  let builds = 0, fetched;
  const streamer = makeStreamer({ a: async (ctx) => {
    builds++;
    await ctx.still();
    if (builds === 1) await new Promise((r) => { fetched = r; });   // its own fetches, in flight
    ctx.landNow();
    return thing('a');
  } }, { onError: (e) => errors.push(e.message), stall: 1 });
  const p = streamer.want(new Set(['a']));
  await settle();
  streamer.landing = false;   // pulled away meanwhile
  fetched();
  await settle(); await settle();
  assert.deepEqual(log, [], 'not built while it may not land');
  assert.equal(streamer.failed('a'), false);
  assert.equal(builds, 2, 'started again, and waiting to land');
  streamer.landing = true;
  await p;
  assert.deepEqual(log, ['+a#1', 'show a#1']);
  assert.deepEqual(errors, []);
});
