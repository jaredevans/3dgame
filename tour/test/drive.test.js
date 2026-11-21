import { test } from 'node:test';
import assert from 'node:assert/strict';
import { stepTrain, idealLegTime, TRAIN_SPECS } from '../drive.js';
import { legRoute } from '../world-data.js';

const near = (a, b, tol, msg) => assert.ok(Math.abs(a - b) <= tol, `${msg ?? ''} expected ${b} ± ${tol}, got ${a}`);
const spec = TRAIN_SPECS.cityOcean;
const open = { sMin: 0, sMax: 1e9 };
const run = (state, input, seconds, limits = open) => {
  for (let t = 0; t < seconds; t += 1 / 60) state = stepTrain(state, input, 1 / 60, spec, limits);
  return state;
};

test('the excursion train spec', () => {
  near(spec.top, 27.8, 0.05);
  assert.equal(spec.accel, 1.0);
  assert.equal(spec.brake, 1.2);
  assert.equal(spec.cars[0][0], 'mainline-diesel');
});

test('throttle moves in 5% steps and stays within -1..1', () => {
  let s = { s: 0, v: 0, throttle: 0 };
  s = stepTrain(s, { throttleDelta: 1 }, 0, spec, open);
  near(s.throttle, 0.05, 1e-9);
  for (let i = 0; i < 40; i++) s = stepTrain(s, { throttleDelta: 1 }, 0, spec, open);
  assert.equal(s.throttle, 1);
});

test('accelerates to top speed', () => {
  const s = run({ s: 0, v: 0, throttle: 1 }, {}, 60);
  near(s.v, 27.8, 0.05);
});

test('brakes to a stop', () => {
  let s = { s: 0, v: 27.8, throttle: 1 };
  s = run(s, { brake: true }, 22);
  assert.ok(s.v > 0, 'still rolling just before 23 s');
  s = run(s, { brake: true }, 2);
  assert.equal(s.v, 0);
});

test('reverse', () => {
  const s = run({ s: 5000, v: 0, throttle: -0.5 }, {}, 60);
  near(s.v, -13.9, 0.05);
  // pulling away backwards is powered, at the train's full acceleration
  const t = run({ s: 5000, v: 0, throttle: -0.5 }, {}, 5);
  near(t.v, -5, 0.05);
});

test('stepTrain clamps dt', () => {
  const s = stepTrain({ s: 100, v: 27.8, throttle: 1 }, {}, 5, spec, open);
  assert.ok(s.s - 100 <= 2.78 + 1e-9, `moved ${s.s - 100}`);
});

test('stepTrain stops at route ends', () => {
  let s = run({ s: 900, v: 27.8, throttle: 1 }, {}, 10, { sMin: 0, sMax: 1000 });
  assert.equal(s.s, 1000); assert.equal(s.v, 0);
  s = run({ s: 50, v: -10, throttle: -1 }, {}, 10, { sMin: 0, sMax: 1000 });
  assert.equal(s.s, 0); assert.equal(s.v, 0);
});

test('idealLegTime', () => {
  near(idealLegTime(1800, spec), 89.9, 2);
});

test('the leg is about 90 seconds', () => {
  const t = idealLegTime(legRoute('city-ocean').length, spec);
  assert.ok(t >= 80 && t <= 100, `${t.toFixed(1)} s`);
});

test('getting out with the throttle open leaves the train standing', async () => {
  const { leaveCab, trainInput } = await import('../drive.js');
  // stopped at a platform by holding the brake, throttle still at 30%
  let st = leaveCab({ s: 99.6, v: 0, throttle: 0.3 });
  assert.equal(st.throttle, 0); assert.equal(st.v, 0);
  for (let t = 0; t < 200; t += 1 / 60) st = stepTrain(st, trainInput({ driving: false, brakeKey: false, throttleSteps: 3 }), 1 / 60, spec, open);
  assert.equal(st.s, 99.6);
  assert.equal(st.v, 0);
});

test('nobody driving means the brake is on and the throttle untouched', async () => {
  const { trainInput } = await import('../drive.js');
  assert.deepEqual(trainInput({ driving: false, brakeKey: false, throttleSteps: 4 }), { throttleDelta: 0, brake: true });
  assert.deepEqual(trainInput({ driving: true, brakeKey: false, throttleSteps: 4 }), { throttleDelta: 4, brake: false });
  assert.deepEqual(trainInput({ driving: true, brakeKey: true, throttleSteps: 0 }), { throttleDelta: 0, brake: true });
});

// the Silver Arrow, the bullet train: 300 km/h, and one long frame (the dt clamp) never carries it past the buffers
test('the bullet train spec', () => {
  const b = TRAIN_SPECS.westFuture;
  near(b.top, 300 / 3.6, 1e-9);
  assert.equal(b.accel, 2.5);
  assert.equal(b.brake, 2.5);
  assert.equal(b.builder, 'bullet');
  assert.equal(b.carCount, 4);
});

test('bullet stops at the buffers from full speed', () => {
  const b = TRAIN_SPECS.westFuture, limits = { sMin: 106, sMax: 4143 };
  // at full speed, throttle open, no brake, 200 m from the buffers: it stops exactly there
  let st = { s: limits.sMax - 200, v: 83.3, throttle: 1 };
  for (let t = 0; t < 10; t += 1 / 60) st = stepTrain(st, {}, 1 / 60, b, limits);
  assert.equal(st.s, limits.sMax); assert.equal(st.v, 0);
  // one 5 s frame (a hidden tab, a loading stall) moves it no more than the clamp allows
  const once = stepTrain({ s: 1000, v: 83.3, throttle: 1 }, {}, 5, b, limits);
  assert.ok(once.s - 1000 <= 8.34, `moved ${(once.s - 1000).toFixed(3)} m`);
  // and a 5 s frame 3 m from the buffers stops it on them, not past
  const last = stepTrain({ s: limits.sMax - 3, v: 83.3, throttle: 1 }, {}, 5, b, limits);
  assert.equal(last.s, limits.sMax); assert.equal(last.v, 0);
});

test('the bullet leg takes 80 to 100 seconds, stepped at 60 frames a second', () => {
  const b = TRAIN_SPECS.westFuture, L = legRoute('west-future').length;
  // its real limits: the train's length behind the start's buffers, its stopping mark 12 m short of the far ones
  const sMin = 104.45 + 1.5, stopS = L - 1.5 - 12;
  let st = { s: sMin, v: 0, throttle: 1 }, t = 0;
  while (st.v > 0 || st.s < sMin + 1) {
    const brake = st.s + st.v ** 2 / (2 * b.brake) >= stopS;
    st = stepTrain(st, { brake }, 1 / 60, b, { sMin, sMax: L - 1.5 });
    t += 1 / 60;
    if (t > 300) break;
  }
  assert.ok(Math.abs(st.s - stopS) < 2, `stopped at ${st.s.toFixed(1)}, the mark is ${stopS.toFixed(1)}`);
  assert.ok(t >= 80 && t <= 100, `${t.toFixed(1)} s`);
});

test('the Metro Glide spec', () => {
  const m = TRAIN_SPECS.futureCity;
  near(m.top, 120 / 3.6, 1e-9); assert.equal(m.accel, 1.0); assert.equal(m.brake, 1.2);
  assert.equal(m.cab, 'future'); assert.equal(m.sound, 'future');
  assert.ok(m.cars.every(([key]) => key === 'guideway-rail-shuttle'), 'a rake of guideway shuttles');
});

test('the Metro Glide leg takes 80 to 100 seconds, stepped at 60 frames a second', () => {
  const m = TRAIN_SPECS.futureCity, L = legRoute('future-city').length;
  // three 10.28 m shuttles with two 0.15 m couplings behind the start's buffers; its mark 12 m short of the far ones
  const sMin = 3 * 10.28 + 2 * 0.15 + 1.5, stopS = L - 1.5 - 12;
  let st = { s: sMin, v: 0, throttle: 1 }, t = 0;
  while (st.v > 0 || st.s < sMin + 1) {
    const brake = st.s + st.v ** 2 / (2 * m.brake) >= stopS;
    st = stepTrain(st, { brake }, 1 / 60, m, { sMin, sMax: L - 1.5 });
    t += 1 / 60;
    if (t > 300) break;
  }
  assert.ok(Math.abs(st.s - stopS) < 2, `stopped at ${st.s.toFixed(1)}, the mark is ${stopS.toFixed(1)}`);
  assert.ok(t >= 80 && t <= 100, `${t.toFixed(1)} s`);
});
