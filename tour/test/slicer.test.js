// Slicing work across frames (slicer.js), and optional scenery that never stops what it belongs to.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeSlicer, scenery } from '../slicer.js';

// a clock that moves only when a job's step says so
function clock() { let t = 0; return { now: () => t, spend: (ms) => { t += ms; } }; }

test('a job runs a budget a tick, in turn, and resolves with what it returns', async () => {
  const c = clock(), sl = makeSlicer({ now: c.now });
  sl.sync = false;
  let steps = 0;
  function* job() { for (let i = 0; i < 10; i++) { c.spend(1); steps++; yield; } return 'built'; }
  const p = sl.run(job());
  assert.equal(steps, 0, 'nothing runs before a tick');
  const used = sl.tick(4);
  assert.ok(steps >= 4 && steps <= 5 && used <= 5, `one tick ran ${steps} steps in ${used} ms`);
  while (sl.busy) sl.tick(4);
  assert.equal(await p, 'built');
  assert.equal(steps, 10);
});

test('a waiting frame is let go one a tick', async () => {
  const c = clock(), sl = makeSlicer({ now: c.now });
  sl.sync = false;
  const order = [];
  const a = sl.frame().then(() => order.push('a')), b = sl.frame().then(() => order.push('b'));
  sl.tick(4); await Promise.resolve();
  assert.deepEqual(order, ['a']);
  sl.tick(4); await a; await b;
  assert.deepEqual(order, ['a', 'b']);
});

test('in sync (at boot) a job runs straight through; a throw rejects', async () => {
  const sl = makeSlicer();
  function* job() { yield; yield; return 3; }
  assert.equal(await sl.run(job()), 3);
  function* bad() { yield; throw new Error('no'); }
  await assert.rejects(sl.run(bad()), /no/);
  sl.sync = false;
  const p = sl.run(bad());
  sl.tick(10);
  await assert.rejects(p, /no/);
});

test('optional scenery that fails is warned about and the rest carries on', async () => {
  const added = [], warned = [];
  const err = Object.assign(new Error('Failed to fetch'), { url: 'https://polyfork.dev/cdn/x.mjs' });
  const s = scenery(async () => { throw err; }, { add: (g) => added.push(g), warn: (e) => warned.push(e.url) });
  assert.equal(await s.ready, false);
  assert.deepEqual(added, []);
  assert.deepEqual(warned, ['https://polyfork.dev/cdn/x.mjs']);
  s.dispose();   // and letting it go is harmless
});

test('optional scenery is added once ready, freed with what it belongs to, and never added after that is gone', async () => {
  const added = [];
  let freed = 0;
  const ok = scenery(async () => ({ group: 'houses', dispose: () => freed++ }), { add: (g) => added.push(g) });
  assert.equal(await ok.ready, true);
  assert.deepEqual(added, ['houses']);
  ok.dispose();
  assert.equal(freed, 1);
  // let go before it's ready: freed when it comes, not added
  let release;
  const late = scenery(() => new Promise((r) => { release = r; }), { add: (g) => added.push(g) });
  late.dispose();
  release({ group: 'late', dispose: () => freed++ });
  assert.equal(await late.ready, false);
  assert.deepEqual(added, ['houses']);
  assert.equal(freed, 2);
});
