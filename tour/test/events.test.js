import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EVENTS, eventsFor, makeEventTrack, aheadOf } from '../events.js';
import { legRoute, RING } from '../world-data.js';

test('every leg has its events, inside the line, ids unique', () => {
  for (const leg of RING.legs) {
    const L = legRoute(leg).length, ids = new Set();
    assert.ok(EVENTS[leg].length >= 5, leg);
    for (const e of EVENTS[leg]) {
      assert.ok(e.s0 >= 0 && e.s1 <= L && e.s0 < e.s1, `${leg} ${e.id}`);
      assert.ok(!ids.has(e.id)); ids.add(e.id);
    }
    assert.equal(EVENTS[leg].filter((e) => e.react).length, 1, `${leg}: one "you react" event`);
  }
});
test('the react kinds per leg are the spec\'s', () => {
  const kind = (leg) => EVENTS[leg].find((e) => e.react).react.kind;
  assert.deepEqual(RING.legs.map(kind), ['crossing', 'signal', 'cattle', 'speed', 'crossing']);
});
test('eventsFor back keeps only events that run both ways', () => {
  const signal = EVENTS['ocean-mountain'].find((e) => e.id === 'signal');
  assert.deepEqual(signal.dirs, ['out']);
  assert.ok(eventsFor('ocean-mountain', 'out').includes(signal));
  assert.ok(!eventsFor('ocean-mountain', 'back').includes(signal));
  const portalBack = EVENTS['ocean-mountain'].find((e) => e.id === 'portal-back');
  assert.ok(eventsFor('ocean-mountain', 'back').includes(portalBack));
  assert.ok(!eventsFor('ocean-mountain', 'out').includes(portalBack));
  const deer = EVENTS['ocean-mountain'].find((e) => e.id === 'deer');
  assert.ok(eventsFor('ocean-mountain', 'out').includes(deer) && eventsFor('ocean-mountain', 'back').includes(deer));
});
test('every react point is at least 300 m from the start of each run it is on', () => {
  let checked = 0;
  for (const leg of RING.legs) {
    const L = legRoute(leg).length;
    for (const e of EVENTS[leg].filter((x) => x.react?.at)) {
      for (const dir of e.dirs ?? ['out', 'back']) {
        assert.equal(typeof e.react.at[dir], 'number', `${leg} ${e.id} ${dir}`);
        const start = dir === 'out' ? 0 : L;
        assert.ok(aheadOf(start, e.react.at[dir], dir) >= 300, `${leg} ${e.id} ${dir}`);
        checked++;
      }
    }
  }
  assert.ok(checked >= 7);
});
test('every event that is not always carries a shot, and so does the signal', () => {
  for (const leg of RING.legs) {
    for (const e of EVENTS[leg]) {
      if (e.always && e.id !== 'signal') continue;
      assert.equal(typeof e.shot?.kind, 'string', `${leg} ${e.id}`);
    }
  }
  const signal = EVENTS['ocean-mountain'].find((e) => e.id === 'signal');
  assert.deepEqual(signal.shot, { kind: 'below', at: 771 });
});
test('aheadOf mirrors on a back run', () => {
  assert.equal(aheadOf(300, 400, 'out'), 100);
  assert.equal(aheadOf(500, 400, 'back'), 100);
  assert.ok(aheadOf(450, 400, 'out') < 0);
});
test('a track starts, runs and ends an event, and fires again on re-entry', () => {
  const tr = makeEventTrack([{ id: 'a', s0: 100, s1: 200 }]);
  assert.deepEqual(tr.step({ legS: 50, dt: 0.1 }).started, []);
  const r = tr.step({ legS: 150, dt: 0.1 });
  assert.deepEqual(r.started, ['a']); assert.equal(r.active.get('a').u, 0.5);
  assert.deepEqual(tr.step({ legS: 250, dt: 0.1 }).ended, ['a']);
  assert.deepEqual(tr.step({ legS: 150, dt: 0.1 }).started, ['a']);
});
test('t counts at most 0.1 s a step', () => {
  const tr = makeEventTrack([{ id: 'a', s0: 0, s1: 100 }]);
  assert.equal(tr.step({ legS: 10, dt: 5 }).active.get('a').t, 0.1);
  near(tr.step({ legS: 20, dt: 5 }).active.get('a').t, 0.2);
  assert.equal(tr.step({ legS: 500, dt: 5 }).active.size, 0);
  assert.equal(tr.step({ legS: 10, dt: 0.05 }).active.get('a').t, 0.05);
});
function near(a, b) { assert.ok(Math.abs(a - b) < 1e-9, `${a} vs ${b}`); }
