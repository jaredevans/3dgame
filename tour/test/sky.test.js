import { test } from 'node:test';
import assert from 'node:assert/strict';
import { skyAt, SKY_KEYS, ringPosition } from '../sky.js';

const near = (a, b, tol, msg) => assert.ok(Math.abs(a - b) <= tol, `${msg ?? ''} expected ${b} ± ${tol}, got ${a}`);
const same = (a, b) => { for (const k of Object.keys(a)) if (Array.isArray(a[k])) a[k].forEach((v, i) => near(v, b[k][i], 1e-9, k)); else near(a[k], b[k], 1e-9, k); };

test('keys run round the ring in order', () => {
  for (let i = 1; i < SKY_KEYS.length; i++) assert.ok(SKY_KEYS[i].at > SKY_KEYS[i - 1].at);
  assert.equal(SKY_KEYS[0].at, 0);
  assert.ok(SKY_KEYS[SKY_KEYS.length - 1].at < 5);
});

test('skyAt wraps', () => {
  same(skyAt(5), skyAt(0));
  same(skyAt(-0.5), skyAt(4.5));
});

test('skyAt blends', () => {
  const a = SKY_KEYS.find((k) => k.at === 0), b = SKY_KEYS.find((k) => k.at > 0);
  const mid = skyAt(b.at / 2);
  near(mid.stage, (a.stage + b.stage) / 2, 1e-9);
  near(mid.zenith[0], (a.zenith[0] + b.zenith[0]) / 2, 1e-9);
});

test('mornings are bright and night is dark', () => {
  assert.ok(skyAt(0.5).stage < 0.2, 'City to Oceanside is morning');
  assert.ok(skyAt(1.5).stage < 0.2, 'Oceanside to Mountain is midday');
  assert.ok(skyAt(3.8).stage > 0.7, 'into the Futuristic place is night');
  assert.ok(skyAt(4.0).stars > 0.8, 'stars at night');
  assert.equal(skyAt(0.5).stars, 0);
});

test('the sun sets over the Wild West', () => {
  assert.ok(skyAt(2.9).sunElevationDeg < 10 && skyAt(2.9).sunElevationDeg > -2);
});

test('ring position from where you are', () => {
  assert.equal(ringPosition({ place: 'city' }), 0);
  assert.equal(ringPosition({ place: 'ocean' }), 1);
  near(ringPosition({ leg: 'city-ocean', fraction: 0.25 }), 0.25, 1e-9);
  near(ringPosition({ leg: 'future-city', fraction: 0.5 }), 4.5, 1e-9);
});
