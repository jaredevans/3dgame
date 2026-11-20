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
