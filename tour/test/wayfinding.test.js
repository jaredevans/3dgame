import { test } from 'node:test';
import assert from 'node:assert/strict';
import { departureFor, departureSign, pointer } from '../wayfinding.js';
import { RING, stationFrame, legRoute, laneOf } from '../world-data.js';

const near = (a, b, tol, what) => assert.ok(Math.abs(a - b) <= tol, `${what}: ${a} vs ${b}`);

test("departureFor('ocean') is the Highland Climber to the Mountain", () => {
  const d = departureFor('ocean');
  assert.equal(d.leg, 'ocean-mountain');
  assert.equal(d.train, 'Highland Climber');
  assert.equal(d.to, 'Mountain');
});

test('departureFor is the middle of the departure platform, on its town side of the line', () => {
  for (const id of RING.places) {
    const d = departureFor(id), f = stationFrame(id, 'departure');
    assert.equal(d.leg, f.leg);
    // the platform's middle: 5.75 m out from the line's centre (its platform runs 3.5..8 out), on the town's side
    near(Math.hypot(d.x - f.x, d.z - f.z), 5.75, 0.05, `${id} from the line's centre`);
    const r = legRoute(f.leg), p = r.offsetAt(f.end === 'start' ? 61.5 : r.length - 61.5, Math.sign(laneOf(f.leg)) * 5.75);
    near(d.x, p.x, 0.01, `${id} x`); near(d.z, p.z, 0.01, `${id} z`);
  }
});

test('the sign at each arrival station names the train and place across town', () => {
  assert.equal(departureSign('ocean'), 'Departures across town: Highland Climber to Mountain');
  assert.equal(departureSign('city'), 'Departures across town: Seaside Excursion to Oceanside');
  for (const id of RING.places) assert.match(departureSign(id), new RegExp(`: ${departureFor(id).train} to ${departureFor(id).to}$`));
});

test("pointer: '↑' straight ahead, '→' 90° right, '↓' behind, '←' 90° left, and the metres", () => {
  // looking along +z (yaw 0): right is -x (walk.js: right is (-cos yaw, sin yaw))
  const at = { x: 10, z: 20 };
  assert.deepEqual(pointer(at, 0, { x: 10, z: 50 }), { arrow: '↑', metres: 30 });
  assert.deepEqual(pointer(at, 0, { x: -30, z: 20 }), { arrow: '→', metres: 40 });
  assert.deepEqual(pointer(at, 0, { x: 10, z: 15 }), { arrow: '↓', metres: 5 });
  assert.deepEqual(pointer(at, 0, { x: 13, z: 20 }), { arrow: '←', metres: 3 });
  assert.equal(pointer(at, 0, { x: 0, z: 30 }).arrow, '↗');   // ahead and to the right
  assert.equal(pointer(at, 0, { x: 20, z: 10 }).arrow, '↙');   // behind and to the left
  near(pointer(at, 0, { x: 13, z: 24 }).metres, 5, 1e-9, 'metres');
});

test('pointer is relative to the way you look', () => {
  const at = { x: 0, z: 0 }, east = { x: 100, z: 0 };   // +x: yaw pi/2
  assert.equal(pointer(at, Math.PI / 2, east).arrow, '↑');
  assert.equal(pointer(at, 0, east).arrow, '←');
  assert.equal(pointer(at, Math.PI, east).arrow, '→');
  assert.equal(pointer(at, -Math.PI / 2, east).arrow, '↓');
  // across the ±pi wrap: looking just either side of -z, a target at -z is ahead
  assert.equal(pointer(at, Math.PI - 0.1, { x: 0, z: -50 }).arrow, '↑');
  assert.equal(pointer(at, -Math.PI + 0.1, { x: 0, z: -50 }).arrow, '↑');
  assert.equal(pointer(at, 3 * Math.PI, { x: 0, z: -50 }).arrow, '↑');
  // turning right (yaw falls) swings the arrow left
  assert.equal(pointer(at, -Math.PI / 4, { x: 0, z: 50 }).arrow, '↖');
});

// the page's wiring (main.js is a page module, not importable in Node): arrival platforms get the sign, the HUD on foot
// points to the departures from the camera's heading, and the map's flag is the same place
test('main.js signs the arrival platforms and points to the departures on foot', async () => {
  const { readFileSync } = await import('node:fs');
  const src = readFileSync(new URL('../main.js', import.meta.url), 'utf8');
  assert.match(src, /const sign = st\.role === 'arrival' \? departureSign\(id\) : null;/);
  assert.match(src, /buildTerminus\([^)]*\bsign \}\)/);
  assert.match(src, /camera\.getWorldDirection\(lookDir\)/);
  assert.match(src, /pointer\(player\.state, Math\.atan2\(lookDir\.x, lookDir\.z\), d\)/);
  assert.match(src, /const way = w\?\.leg === d\.leg \? 'here' : `\$\{to\.arrow\} \$\{distance\(to\.metres\)\}`;/);
  assert.match(src, /`On foot in \$\{PLACES\[state\.place\]\.name\} · Departures \$\{way\}/);
  assert.match(src, /const d = departureFor\(state\.place\);\n\s*mapView\.draw\(/);
});
