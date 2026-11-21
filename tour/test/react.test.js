import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeReactions, mustBrake } from '../react.js';
import { eventsFor, aheadOf } from '../events.js';
import { makeJourney } from '../journey.js';
import { stepTrain, TRAIN_SPECS } from '../drive.js';
import { LEGS, PLACES } from '../world-data.js';

const spec = { brake: 0.8 };
const sig = { id: 'signal', react: { kind: 'signal', at: { out: 400 } } };
const sigBoth = { id: 'signal', react: { kind: 'signal', at: { out: 400, back: 930 } } };   // made up, to check the mirroring
const cattle = { id: 'cattle', react: { kind: 'cattle', at: { out: 980, back: 980 } } };
const crossing = { id: 'crossing', react: { kind: 'crossing', at: { out: 1500, back: 1500 } } };
const speedDef = { id: 'speed', react: { kind: 'speed', s0: 800, s1: 3300 } };
const have = () => true;
const frame = (legS, v, extra = {}) => ({ legS, v, dt: 0.1, horn: false, have, ...extra });

test('signal: armed by moving, red brakes short of it, out', () => {
  const r = makeReactions([sig], 'out', { length: 50 });
  const o = r.step(frame(0, 16));
  assert.equal(o.brakeTo, 388);
});
test('signal back: approached from the high side', () => {
  const r = makeReactions([sigBoth], 'back', { length: 50 });
  assert.equal(r.step(frame(1000, 16)).brakeTo, 58);
});
test('standing at the platform never arms it, nor turns it green', () => {
  const r = makeReactions([sig], 'out', { length: 50 });
  for (let i = 0; i < 100; i++) {
    const o = r.step(frame(45, 0));
    assert.equal(o.states.get('signal').aspect, 'red');
    assert.equal(o.brakeTo, null);
    assert.equal(o.toast, null);
  }
});
test('signal: green after 3 s stopped near it once armed, then no brake', () => {
  const r = makeReactions([sig], 'out', { length: 50 });
  r.step(frame(250, 5));
  const toasts = []; let o;
  for (let i = 0; i < 31; i++) { o = r.step(frame(300, 0)); if (o.toast) toasts.push(o.toast); }
  assert.equal(o.states.get('signal').aspect, 'green');
  assert.equal(o.brakeTo, null);
  assert.deepEqual(toasts, ['The signal is green']);
});

// the real trains from the real starts, at full throttle and never braking themselves: only the guard brakes
const journey = makeJourney({ legs: LEGS, places: PLACES });
function drive(leg, dir, length, { hornAtD = null, seconds = 900 } = {}) {
  const run = journey.runRoute(leg, dir), L = run.route.length;
  const trainSpec = TRAIN_SPECS[LEGS[leg].train];
  const lim = journey.limits(run, length);
  const defs = eventsFor(leg, dir).filter((e) => e.react);
  const react = makeReactions(defs, dir, { length, spec: trainSpec });
  const ev = defs[0], at = ev.react.at[dir];
  let state = { s: lim.sMin, v: 0, throttle: 0 }, input = { throttleDelta: 20, brake: false };
  const dt = 0.05, log = { minD: Infinity, minDRed: Infinity, stoppedAt: null, stoppedD: null, greenAfter: null, passed: false, everStopped: false, hornedAt: null };
  let stopTime = 0, o = { brakeTo: null };
  for (let t = 0; t < seconds; t += dt) {
    const legS = dir === 'out' ? state.s : L - state.s;
    const d = aheadOf(legS, at, dir);
    const horn = hornAtD !== null && log.hornedAt === null && d <= hornAtD;
    if (horn) log.hornedAt = d;
    o = react.step({ legS, v: state.v, dt, horn, have });
    const sigState = o.states.get(ev.id);
    log.minD = Math.min(log.minD, d);
    if (sigState.aspect === 'red' && ev.react.kind === 'signal') log.minDRed = Math.min(log.minDRed, d);
    if (d < 0) { log.passed = true; break; }
    if (state.v < 0.05 && state.s > lim.sMin + 1) {
      if (!log.everStopped) { log.everStopped = true; log.stoppedD = d; }
      stopTime += dt;
      if (sigState.aspect === 'green' && log.greenAfter === null) log.greenAfter = stopTime;
    }
    // the guard's brake, and held once the train is at its stopping point (or full throttle would creep it on)
    const brake = o.brakeTo !== null && (o.brakeTo <= 0 || mustBrake(o.brakeTo, state.v, trainSpec));
    state = stepTrain(state, { throttleDelta: t === 0 ? 20 : 0, brake }, dt, trainSpec, lim);
  }
  return log;
}

for (const length of [40, 120]) {
  test(`the Highland Climber (${length} m), out from Oceanside, stops short of the red signal and goes on at green`, () => {
    const log = drive('ocean-mountain', 'out', length);
    assert.ok(log.minDRed >= 0, `ran the red: ${log.minDRed}`);
    assert.ok(log.everStopped, 'never stopped');
    assert.ok(log.stoppedD >= 0 && log.stoppedD <= 200, `stopped ${log.stoppedD} m short`);
    assert.ok(log.greenAfter !== null && log.greenAfter <= 4, `green after ${log.greenAfter} s`);
    assert.ok(log.passed, 'never passed the signal');
  });
  for (const dir of ['out', 'back']) {
    test(`the Canyon Express (${length} m), ${dir}, stops short of the cattle unless the horn sounds`, () => {
      const log = drive('mountain-west', dir, length);
      assert.ok(log.minD >= 0 || log.passed, 'ran down the cattle');
      assert.ok(log.everStopped, 'never stopped');
      assert.ok(log.stoppedD >= 0 && log.stoppedD <= 120, `stopped ${log.stoppedD} m short`);
      assert.ok(log.passed, 'never went on');
      const horned = drive('mountain-west', dir, length, { hornAtD: 280 });
      assert.equal(horned.hornedAt !== null, true);
      assert.equal(horned.everStopped, false);
      assert.ok(horned.passed);
    });
  }
}

test('passed while red: green, no brake', () => {
  const r = makeReactions([sig], 'out', { length: 50 });
  const o = r.step(frame(450, 10));
  assert.equal(o.brakeTo, null);
  assert.equal(o.states.get('signal').aspect, 'green');
});
test('have false: no prompt, no brake', () => {
  const r = makeReactions([sig, cattle, crossing], 'out', { length: 50 });
  const o = r.step(frame(300, 10, { have: () => false }));
  assert.equal(o.brakeTo, null);
  assert.equal(o.prompt, null);
  assert.equal(o.states.size, 0);
});
test('resets on leaving: red again on the next approach', () => {
  const r = makeReactions([sig], 'out', { length: 50 });
  r.step(frame(250, 5));
  let o;
  for (let i = 0; i < 31; i++) o = r.step(frame(300, 0));
  assert.equal(o.states.get('signal').aspect, 'green');
  r.step(frame(1300, 10));
  o = r.step(frame(0, 10));
  assert.equal(o.states.get('signal').aspect, 'red');
});
test('never brakes once cleared', () => {
  const r = makeReactions([cattle], 'out', { length: 50 });
  r.step(frame(500, 10));
  assert.notEqual(r.step(frame(600, 10)).brakeTo, null);
  r.step(frame(730, 10, { horn: true }));   // d 250
  let o;
  for (let i = 0; i < 50; i++) o = r.step(frame(730, 10));
  assert.equal(o.states.get('cattle').leaving, 1);
  assert.equal(o.states.get('cattle').on, false);
  assert.equal(o.brakeTo, null);
});
test('cattle: the horn counts to 500 m, the prompt shows while they are on the line', () => {
  const r = makeReactions([cattle], 'out', { length: 50 });
  assert.equal(r.step(frame(300, 10)).prompt, null);              // d 680
  assert.equal(r.step(frame(500, 10)).prompt, 'Cattle on the line: sound the horn (H)');   // d 480
  const o = r.step(frame(500, 10, { horn: true }));
  assert.equal(o.states.get('cattle').on, false);
  assert.equal(o.prompt, null);
});
test('cattle: stopped near them for 4 s clears them, and the message shows while braking', () => {
  const r = makeReactions([cattle], 'out', { length: 50 });
  let o = r.step(frame(700, 20));                                   // d 280, arms, must brake
  assert.equal(o.brakeTo, 260);
  assert.equal(o.message, 'Cattle on the line: the train stops for them');
  for (let i = 0; i < 41; i++) o = r.step(frame(900, 0));           // d 80
  assert.equal(o.states.get('cattle').on, false);
});
test('crossing: the horn in its window is heard, outside it is not', () => {
  const r = makeReactions([crossing], 'out', { length: 50 });
  let o = r.step(frame(900, 10, { horn: true }));                   // d 600
  assert.equal(o.states.get('crossing').heard, false);
  assert.equal(o.toast, null);
  assert.equal(o.prompt, null);
  o = r.step(frame(1000, 10));                                      // d 500
  assert.equal(o.prompt, null);
  o = r.step(frame(1200, 10));                                      // d 300
  assert.equal(o.prompt, 'Level crossing ahead: sound the horn (H)');
  o = r.step(frame(1200, 10, { horn: true }));
  assert.equal(o.states.get('crossing').heard, true);
  assert.equal(o.toast, 'Heard at the crossing');
  assert.equal(o.prompt, null);
  assert.equal(o.brakeTo, null);
});
test('crossing: the gates close from 350 m out and open again behind the train', () => {
  const r = makeReactions([crossing], 'out', { length: 50 });
  let o = r.step(frame(1100, 10));                                  // d 400
  assert.equal(o.states.get('crossing').gates, 0);
  for (let i = 0; i < 25; i++) o = r.step(frame(1200, 10));         // d 300, 2.5 s
  assert.equal(o.states.get('crossing').gates, 1);
  for (let i = 0; i < 25; i++) o = r.step(frame(1600, 10));         // d -100, past the train's length
  assert.equal(o.states.get('crossing').gates, 0);
});
test('speed: tops recorded inside, toast on leaving', () => {
  const r = makeReactions([speedDef], 'out', { length: 50 });
  r.step(frame(900, 60));
  let o = r.step(frame(1500, 80));
  assert.equal(o.states.get('speed').inside, true);
  assert.equal(o.states.get('speed').topKmh, 288);
  o = r.step(frame(3400, 20));
  assert.equal(o.toast, 'Top speed on the high-speed stretch: 288 km/h');
  assert.equal(o.states.get('speed').inside, false);
});
test('dt clamp: a 5 s frame counts 0.1 s', () => {
  const r = makeReactions([sig], 'out', { length: 50 });
  r.step(frame(250, 5));
  const o = r.step(frame(300, 0, { dt: 5 }));
  assert.equal(o.states.get('signal').aspect, 'red');
});
test('the smallest brakeTo wins', () => {
  const r = makeReactions([sig, cattle], 'out', { length: 50 });
  assert.equal(r.step(frame(300, 10)).brakeTo, 88);                 // signal d 100 -> 88; cattle d 680 -> 660
});
test('mustBrake: true inside stopping distance, false well outside and at rest', () => {
  assert.equal(mustBrake(100, 16, spec), true);
  assert.equal(mustBrake(400, 16, spec), false);
  assert.equal(mustBrake(5, 0, spec), false);
});
