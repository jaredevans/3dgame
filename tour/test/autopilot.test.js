import { test } from 'node:test';
import assert from 'node:assert/strict';
import { autoThrottle, autoMark, makeViewCycle, makeHornCue, asksForHorn } from '../autopilot.js';
import { stepTrain, TRAIN_SPECS } from '../drive.js';
import { makeJourney } from '../journey.js';
import { LEGS, PLACES, RING } from '../world-data.js';

const journey = makeJourney({ legs: LEGS, places: PLACES });
// each train's length (fleet.js: its cars and the couplings between them): the Seaside Excursion's and the Metro Glide's
// as measured in the page, the others near enough (a length only moves the run's start, journey.limits)
const LENGTH = { 'city-ocean': 70.5, 'ocean-mountain': 45, 'mountain-west': 110, 'west-future': 100, 'future-city': 31.1 };

// drive a run with the autopilot from `from` (default its start, stopped) until it has stood still for 3 s; `stopAt`
// (optional) stops it there with the brake (a guard stop) for a few seconds first
function autoRun(leg, dir, { dt = 1 / 60, from = null, stopAt = null } = {}) {
  const run = journey.runRoute(leg, dir), spec = TRAIN_SPECS[LEGS[leg].train], limits = journey.limits(run, LENGTH[leg]);
  let st = { s: from ?? limits.sMin, v: 0, throttle: 0 }, still = 0, t = 0, guarded = stopAt === null ? 1 : 0, held = 0, top = 0;
  const out = { throttleSteps: 0, brake: false };
  while (still < 3 && t < 3600) {
    autoThrottle(st, { stopS: run.stopS, spec }, out);
    let brake = out.brake, steps = out.throttleSteps;
    // the guard: brakes and holds for 4 s, the throttle shut (as main.js does), then lets it go
    if (!guarded && st.s >= stopAt) { brake = true; steps = 0; if (st.v === 0) held += dt; if (held >= 4) guarded = 1; }
    st = stepTrain(st, { throttleDelta: steps, brake }, dt, spec, limits);
    if (!guarded && brake) st.throttle = 0;
    top = Math.max(top, st.v);
    still = st.v === 0 && guarded ? still + dt : 0;
    t += dt;
  }
  return { s: st.s, stopS: run.stopS, t, top, spec };
}

for (const leg of RING.legs) {
  test(`the autopilot stops the ${TRAIN_SPECS[LEGS[leg].train].name} within 2 m of its mark (${leg})`, () => {
    for (const dt of [1 / 60, 1 / 30, 0.1]) {
      const r = autoRun(leg, 'out', { dt });
      assert.ok(Math.abs(r.s - r.stopS) <= 2, `dt ${dt}: stopped at ${r.s.toFixed(2)}, mark ${r.stopS.toFixed(2)}`);
      assert.ok(r.top > r.spec.top * 0.95, `dt ${dt}: never reached its top speed (${r.top.toFixed(1)} of ${r.spec.top.toFixed(1)} m/s)`);
    }
    const back = autoRun(leg, 'back');
    assert.ok(Math.abs(back.s - back.stopS) <= 2, `back: stopped at ${back.s.toFixed(2)}, mark ${back.stopS.toFixed(2)}`);
  });
}

test('the autopilot sets off again after a guard stop half way, and still stops on its mark', () => {
  for (const leg of RING.legs) {
    const run = journey.runRoute(leg, 'out');
    const r = autoRun(leg, 'out', { stopAt: run.route.length / 2 });
    assert.ok(Math.abs(r.s - r.stopS) <= 2, `${leg}: stopped at ${r.s.toFixed(2)}, mark ${r.stopS.toFixed(2)}`);
  }
});

test('taken over mid-run (already moving, or stopped short of the mark), it still stops on it', () => {
  const run = journey.runRoute('west-future', 'out'), spec = TRAIN_SPECS.westFuture, limits = journey.limits(run, 100);
  const out = { throttleSteps: 0, brake: false };
  for (const start of [{ s: run.stopS - 2000, v: 80, throttle: 1 }, { s: run.stopS - 30, v: 0, throttle: 0 }, { s: run.stopS - 3, v: 0, throttle: 0 }]) {
    let st = { ...start }, still = 0;
    for (let t = 0; t < 600 && still < 3; t += 1 / 60) {
      autoThrottle(st, { stopS: run.stopS, spec }, out);
      st = stepTrain(st, { throttleDelta: out.throttleSteps, brake: out.brake }, 1 / 60, spec, limits);
      still = st.v === 0 ? still + 1 / 60 : 0;
    }
    assert.ok(Math.abs(st.s - run.stopS) <= 2, `from ${start.s.toFixed(0)} at ${start.v}: stopped at ${st.s.toFixed(2)}, mark ${run.stopS.toFixed(2)}`);
  }
});

test('the autopilot moves the throttle a step a frame, as a key press does, and brakes when rolling back or past the mark', () => {
  const spec = TRAIN_SPECS.cityOcean, out = { throttleSteps: 0, brake: false };
  autoThrottle({ s: 0, v: 0, throttle: 0 }, { stopS: 2000, spec }, out);
  assert.deepEqual(out, { throttleSteps: 1, brake: false });
  autoThrottle({ s: 0, v: 27, throttle: 1 }, { stopS: 2000, spec }, out);
  assert.deepEqual(out, { throttleSteps: 0, brake: false });
  autoThrottle({ s: 0, v: -1, throttle: -0.2 }, { stopS: 2000, spec }, out);
  assert.equal(out.brake, true);
  autoThrottle({ s: 2005, v: 3, throttle: 0.4 }, { stopS: 2000, spec }, out);
  assert.deepEqual(out, { throttleSteps: -1, brake: true });
  // it writes into the object it's given: nothing new each frame
  const again = autoThrottle({ s: 0, v: 0, throttle: 0 }, { stopS: 2000, spec }, out);
  assert.equal(again, out);
});

test('the view cycle: nose, drone, director, each for 20-30 s', () => {
  let k = 0;
  const rnd = [0, 1, 0.5, 0.25];
  const cycle = makeViewCycle({ random: () => rnd[k++ % rnd.length] });
  assert.equal(cycle.start('cab'), 'nose');          // from the cab (not in the cycle): the nose first
  const changes = [];
  let t = 0;
  for (; t < 100; t += 0.1) { const v = cycle.step(0.1); if (v) changes.push([Math.round(t * 10) / 10, v]); }
  assert.deepEqual(changes.map((c) => c[1]), ['drone', 'director', 'nose', 'drone']);
  // 20 s of the nose (random 0), then 30 s of the drone (1), 25 of the director (0.5), 22.5 of the nose (0.25)
  assert.deepEqual(changes.map((c) => c[0]), [19.9, 49.9, 74.9, 97.4]);
  for (let i = 1; i < changes.length; i++) {
    const held = changes[i][0] - changes[i - 1][0];
    assert.ok(held >= 20 - 0.11 && held <= 30 + 0.11, `held ${held} s`);
  }
  // already in one of its views, it carries on from there
  assert.equal(makeViewCycle({ random: () => 0 }).start('director'), 'director');
  assert.equal(makeViewCycle({ random: () => 0 }).start('drone'), 'drone');
});

test('the horn: sounded once a prompt asks for it, not again until a new prompt asks', () => {
  assert.equal(asksForHorn('Level crossing ahead: sound the horn (H)'), true);
  assert.equal(asksForHorn('Cattle on the line: sound the horn (H)'), true);
  assert.equal(asksForHorn('Get out at Oceanside (E)'), false);
  assert.equal(asksForHorn(null), false);
  const cue = makeHornCue({ delay: 0.5 });
  const p = 'Level crossing ahead: sound the horn (H)';
  const heard = [];
  for (let i = 0; i < 120; i++) heard.push(cue.step(i < 60 ? p : null, 1 / 60));
  assert.equal(heard.filter(Boolean).length, 1, 'sounded once');
  assert.ok(heard.indexOf(true) >= 29 && heard.indexOf(true) <= 31, `after half a second (${heard.indexOf(true)} frames)`);
  // still asking after it sounded (the cattle haven't moved yet): not again for that prompt
  const cue2 = makeHornCue({ delay: 0 });
  assert.equal(cue2.step(p, 0.1), true);
  for (let i = 0; i < 50; i++) assert.equal(cue2.step(p, 0.1), false);
  assert.equal(cue2.step(null, 0.1), false);
  assert.equal(cue2.step(p, 0.1), true, 'a new prompt is answered');
});

test("a stop the guard asks for (a red signal) is the autopilot's mark until it clears: it stops there smoothly, waits, and goes on", () => {
  const run = journey.runRoute('ocean-mountain', 'out'), spec = TRAIN_SPECS.oceanMountain, limits = journey.limits(run, 45);
  const signal = 400, gap = 12;   // as react.js: brakeTo = d - gap while red; green after 3 s stood within 200 m
  let st = { s: limits.sMin, v: 0, throttle: 0 }, red = true, stood = 0, starts = 0, wasStill = true, stoppedAt = null;
  const out = { throttleSteps: 0, brake: false };
  for (let t = 0; t < 600; t += 1 / 60) {
    const d = signal - st.s, brakeTo = red && d >= 0 ? d - gap : null;
    autoThrottle(st, { stopS: autoMark(run.stopS, st.s, brakeTo), spec }, out);
    st = stepTrain(st, { throttleDelta: out.throttleSteps, brake: out.brake }, 1 / 60, spec, limits);
    const still = st.v === 0;
    if (red && still && d <= 200) { stood += 1 / 60; stoppedAt ??= st.s; if (stood >= 3) red = false; }
    if (red && wasStill && !still && st.s > limits.sMin + 1) starts++;   // set off again while it's still red
    wasStill = still;
  }
  assert.ok(stoppedAt !== null, 'never stood at the signal');
  assert.ok(Math.abs(stoppedAt - (signal - gap)) <= 2, `stood at ${stoppedAt.toFixed(1)}, the guard's stop at ${signal - gap}`);
  assert.equal(starts, 0, 'crept on towards the red signal');
  assert.ok(Math.abs(st.s - run.stopS) <= 2, `then stopped at ${st.s.toFixed(1)}, mark ${run.stopS.toFixed(1)}`);
});
