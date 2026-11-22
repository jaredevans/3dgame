// Teleport (T): its phases (fizz out, the beam, fizz in), the dissolve's height over time, the beam's bounded wait, what
// the list offers and when T works (teleport.js); and where it puts you (journey.teleport).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeTeleport, teleportChoices, canTeleport, dissolveAt, glowAt, FIZZ, BEAM_MIN } from '../teleport.js';
import { WAIT_MAX } from '../streaming.js';
import { makeJourney } from '../journey.js';
import { LEGS, PLACES, RING } from '../world-data.js';

const DT = 1 / 60;
// step n frames with the same inputs; -> the last frame's answer, and which events (swap, land, done) came on which frame
function run(tp, frames, inputs = {}) {
  const seen = { swap: [], land: [], done: [] };
  let r;
  for (let k = 0; k < frames; k++) {
    r = tp.step(DT, inputs.placeIn ?? true, inputs.settled ?? true, inputs.failed ?? false);
    for (const e of ['swap', 'land', 'done']) if (r[e]) seen[e].push(k);
  }
  return { r, seen };
}
const frames = (s) => Math.ceil(s / DT) + 1;

test('a teleport plays out, the beam, then in, each event on one frame; then it is idle again', () => {
  const tp = makeTeleport();
  assert.equal(tp.active, false);
  assert.equal(tp.start('ocean', 'city'), true);
  assert.equal(tp.active, true);
  assert.equal(tp.to, 'ocean');
  let { r, seen } = run(tp, frames(FIZZ) - 2);
  assert.equal(r.phase, 'out', 'still fizzing out');
  assert.deepEqual(seen.swap, []);
  ({ r, seen } = run(tp, 3));
  assert.equal(seen.swap.length, 1, 'swapped once, behind the beam');
  assert.equal(r.phase, 'beam');
  // a ready place: the beam is only the short flash between
  ({ r, seen } = run(tp, frames(BEAM_MIN)));
  assert.equal(seen.land.length, 1);
  assert.equal(r.phase, 'in');
  assert.equal(r.back, false);
  ({ r, seen } = run(tp, frames(FIZZ)));
  assert.equal(seen.done.length, 1);
  assert.equal(r.phase, 'idle');
  assert.equal(tp.active, false);
  assert.equal(r.gone, 0, 'whole again');
  assert.equal(r.glow, 0);
  assert.equal(r.beam, 0);
});

test('start does nothing while one is under way, nor to where you are', () => {
  const tp = makeTeleport();
  assert.equal(tp.start('city', 'city'), false);
  assert.equal(tp.active, false);
  tp.start('west', 'city');
  assert.equal(tp.start('future', 'city'), false);
  assert.equal(tp.to, 'west');
});

test('step answers in the same object every frame (no allocation in the loop)', () => {
  const tp = makeTeleport();
  tp.start('ocean', 'city');
  const a = tp.step(DT, true, true, false), b = tp.step(DT, true, true, false);
  assert.equal(a, b);
});

test('the beam holds until the place is in; it swaps then, and lands once the rest has settled', () => {
  const tp = makeTeleport();
  tp.start('west', 'city');
  run(tp, frames(FIZZ), { placeIn: false, settled: false });
  let { r, seen } = run(tp, frames(3), { placeIn: false, settled: false });
  assert.equal(r.phase, 'beam');
  assert.deepEqual(seen.swap, [], 'no swap before the place is in: you stay where you stood');
  assert.ok(r.waited >= 3 - 2 * DT);
  ({ r, seen } = run(tp, 2, { placeIn: true, settled: false }));
  assert.equal(seen.swap.length, 1, 'swapped as soon as the place is in');
  assert.equal(r.phase, 'beam', 'the rest not settled yet: still under the beam');
  ({ r, seen } = run(tp, 2, { placeIn: true, settled: true }));
  assert.equal(seen.land.length, 1);
  assert.equal(r.phase, 'in');
});

test('the wait is bounded: past WAIT_MAX it lands once the place itself is in, settled or not', () => {
  const tp = makeTeleport();
  tp.start('future', 'city');
  run(tp, frames(FIZZ), { placeIn: true, settled: false });
  let { r, seen } = run(tp, Math.floor((WAIT_MAX - 0.1) / DT), { placeIn: true, settled: false });
  assert.equal(r.phase, 'beam');
  assert.deepEqual(seen.land, []);
  ({ r, seen } = run(tp, frames(0.2), { placeIn: true, settled: false }));
  assert.equal(seen.land.length, 1, 'landed at WAIT_MAX');
  assert.ok(r.waited >= WAIT_MAX - DT && r.waited <= WAIT_MAX + 0.2, `waited ${r.waited}`);
});

test('a place that will not come in (failed, or still missing past WAIT_MAX) is never waited on for ever', () => {
  // failed: back where you stood, at once
  const a = makeTeleport();
  a.start('mountain', 'city');
  run(a, frames(FIZZ), { placeIn: false });
  let { r, seen } = run(a, 3, { placeIn: false, failed: true });
  assert.deepEqual(seen.swap, [], 'never swapped');
  assert.equal(seen.land.length, 1);
  assert.equal(r.phase, 'in');
  assert.equal(r.back, true, 'fizzing back in where you stood');
  ({ r, seen } = run(a, frames(FIZZ), { placeIn: false, failed: true }));
  assert.equal(seen.done.length, 1);
  assert.equal(a.active, false);
  // still building (a hung download): it waits for the place, the one thing it can't land without
  const b = makeTeleport();
  b.start('mountain', 'city');
  ({ r } = run(b, frames(FIZZ + WAIT_MAX + 5), { placeIn: false }));
  assert.equal(r.phase, 'beam');
  ({ r, seen } = run(b, 2, { placeIn: true, settled: false }));
  assert.equal(seen.swap.length, 1);
  assert.equal(seen.land.length, 1, 'past WAIT_MAX: it lands as soon as the place is in');
});

test('the dissolve: from whole to gone over the fizz out, rising steadily; the fizz in is the same in reverse', () => {
  assert.equal(dissolveAt(0), 0);
  assert.equal(dissolveAt(1), 1);
  let last = -1;
  for (let k = 0; k <= 100; k++) {
    const g = dissolveAt(k / 100);
    assert.ok(g >= last, `rises at ${k / 100}`);
    assert.ok(g >= 0 && g <= 1);
    last = g;
  }
  // the sparkles rise a moment before the feet go
  assert.equal(dissolveAt(0.1), 0);
  assert.ok(glowAt(0.1) > 0);
  // the glow: up quickly, full by the time the figure is going
  assert.equal(glowAt(0), 0);
  assert.equal(glowAt(1), 1);
  // the fizz in, frame by frame, mirrors the fizz out
  const tp = makeTeleport({ beamMin: 0 });
  tp.start('ocean', 'city');
  const out = [];
  for (let k = 0; k < 90; k++) out.push(tp.step(DT, true, true, false).gone);
  let r; do r = tp.step(DT, true, true, false); while (r.phase !== 'in');
  const back = [r.gone];
  for (let k = 0; k < 89; k++) back.push(tp.step(DT, true, true, false).gone);
  for (let k = 0; k < 89; k++) assert.ok(Math.abs(back[k] - out[89 - k]) < 0.05, `frame ${k}: ${back[k]} vs ${out[89 - k]}`);
  assert.ok(back[0] > 0.95, 'gone as it lands');
  assert.ok(back.at(-1) < 0.05, 'whole again');
});

test('the beam covers the view between: fading in at the end of the fizz out, out at the start of the fizz in', () => {
  const tp = makeTeleport();
  tp.start('ocean', 'city');
  let { r } = run(tp, 10);
  assert.equal(r.beam, 0, 'not at first');
  ({ r } = run(tp, frames(FIZZ) - 12));
  assert.ok(r.beam > 0.5, 'coming up by the end of the fizz out');
  ({ r } = run(tp, 3));
  assert.equal(r.phase, 'beam');
  assert.equal(r.beam, 1);
  while (r.phase === 'beam') r = tp.step(DT, true, true, false);
  assert.ok(r.beam > 0.8, 'still up as the fizz in starts');
  ({ r } = run(tp, frames(FIZZ / 2)));
  assert.equal(r.beam, 0, 'gone by half way');
});

test('the list: the five places, numbered 1 to 5 round the ring, the one you are at shown but not offered', () => {
  const list = teleportChoices(RING.places, 'ocean');
  assert.deepEqual(list.map((c) => c.n), [1, 2, 3, 4, 5]);
  assert.deepEqual(list.map((c) => c.id), RING.places);
  assert.deepEqual(list.filter((c) => !c.offered).map((c) => c.id), ['ocean']);
  // in a cab stopped between stations you're at none of them: all five offered
  assert.equal(teleportChoices(RING.places, null).filter((c) => c.offered).length, 5);
});

test('T works on foot, or in the cab at a standstill (not under the arrival cover); never while moving', () => {
  assert.equal(canTeleport({ mode: 'foot', v: 0 }), true);
  assert.equal(canTeleport({ mode: 'drive', v: 0 }), true);
  assert.equal(canTeleport({ mode: 'drive', v: 0.049 }), true);
  assert.equal(canTeleport({ mode: 'drive', v: -0.049 }), true);
  assert.equal(canTeleport({ mode: 'drive', v: 0.05 }), false);
  assert.equal(canTeleport({ mode: 'drive', v: -3 }), false);
  assert.equal(canTeleport({ mode: 'drive', v: 0, covered: true }), false, 'the cover is up: wait for it');
  assert.equal(canTeleport({ mode: 'foot', v: 12, busy: true }), false, 'one already under way');
});

// ---- journey.teleport ----
const j = makeJourney({ legs: LEGS, places: PLACES });
const onFootAt = (place) => {
  const st = PLACES[place].stations.find((s) => s.role === 'arrival');
  return j.getOut(j.start(st.leg, 'out'), place);
};

test('journey.teleport: on foot at the place, as if just arrived at its arrival station; its two trains to put in place', () => {
  for (const to of RING.places) {
    for (const from of [j.start('city-ocean', 'out'), j.start('mountain-west', 'back'), ...RING.places.filter((p) => p !== to).map(onFootAt)]) {
      const t = j.teleport(from, to);
      const arr = PLACES[to].stations.find((s) => s.role === 'arrival');
      assert.deepEqual(t.state, { mode: 'foot', leg: arr.leg, dir: 'out', place: to }, `${from.mode} at ${from.place} to ${to}`);
      assert.deepEqual(t.trains, j.trainsAt(t.state, to), 'the two trains that serve it');
      // board()-able from there, both ways
      for (const w of t.trains) assert.equal(j.board(t.state, w.leg, w.dir).leg, w.leg);
      assert.deepEqual(j.arrive(t.state).wait.map((w) => w.leg), t.trains.filter((w) => w.leg !== arr.leg).map((w) => w.leg));
    }
  }
});

test('journey.teleport: where you stand, the step-out point on the arrival platform (as stepping off its train)', () => {
  for (const to of RING.places) {
    const { at } = j.teleport(j.start('city-ocean', 'out'), to);
    const arr = PLACES[to].stations.find((s) => s.role === 'arrival');
    assert.equal(at.leg, arr.leg); assert.equal(at.dir, 'out');
    const run = j.runRoute(arr.leg, 'out');
    assert.equal(run.to, to);
    assert.deepEqual({ s: at.s, lateral: at.lateral }, j.stepOut(run, run.stopS));
    const p = run.destination.platform;
    assert.ok(at.s > p.sFrom && at.s < p.sTo, `${to}: on its platform`);
  }
});

test('journey.teleport: not to where you already stand, nor anywhere unknown', () => {
  assert.throws(() => j.teleport(onFootAt('ocean'), 'ocean'));
  assert.throws(() => j.teleport(onFootAt('ocean'), 'atlantis'));
  // from a cab you may teleport to the place you were leaving (you may be far down the line from it)
  assert.equal(j.teleport(j.start('city-ocean', 'out'), 'city').state.place, 'city');
});

test('cancelled before the swap (Esc or T), you fizz back in where you stood, from as far as you had gone', () => {
  // in the fizz out: the fizz in starts from how much of you had gone, and mirrors back to whole
  const a = makeTeleport();
  a.start('west', 'city');
  let { r } = run(a, 60, { placeIn: false });
  const gone = r.gone;
  assert.ok(gone > 0.3 && gone < 1);
  assert.equal(a.cancel(), true);
  ({ r } = run(a, 1, { placeIn: false }));
  assert.equal(r.phase, 'in');
  assert.equal(r.back, true);
  assert.equal(r.cancelled, true);
  assert.ok(Math.abs(r.gone - gone) < 0.05, `carries on from ${gone}, got ${r.gone}`);
  let seen;
  ({ r, seen } = run(a, 70, { placeIn: true }));
  assert.deepEqual(seen.swap, [], 'never moved, even once the place came in');
  assert.equal(seen.done.length, 1);
  assert.equal(r.gone, 0);
  // under the beam, before the place is in: back at once
  const b = makeTeleport();
  b.start('west', 'city');
  run(b, frames(FIZZ) + 30, { placeIn: false });
  assert.equal(b.cancel(), true);
  ({ r, seen } = run(b, 1, { placeIn: true }));
  assert.equal(seen.land.length, 1);
  assert.deepEqual(seen.swap, []);
  assert.equal(r.back, true);
  // after the swap it's too late: it carries on
  const c = makeTeleport();
  c.start('west', 'city');
  run(c, frames(FIZZ) + 2, { placeIn: true, settled: false });
  assert.equal(c.swapped, true);
  assert.equal(c.cancel(), false);
  // nothing to cancel
  assert.equal(makeTeleport().cancel(), false);
  // a failure says so; a cancel doesn't
  const d = makeTeleport();
  d.start('west', 'city');
  run(d, frames(FIZZ), { placeIn: false });
  ({ r } = run(d, 1, { placeIn: false, failed: true }));
  assert.equal(r.back, true);
  assert.equal(r.cancelled, false);
});
