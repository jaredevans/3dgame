import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeRoute } from '../route.js';
import { LEGS, PLACES, RING, laneFor, TRACK_CENTRES } from '../world-data.js';
const near = (a, b, tol, msg) => assert.ok(Math.abs(a - b) <= tol, `${msg ?? ''} expected ${b} ± ${tol}, got ${a}`);

test('the leg lies inside the limits', () => {
  const r = makeRoute(LEGS['city-ocean'].points);
  assert.ok(r.minRadius() >= 400, `tightest curve ${r.minRadius().toFixed(0)} m`);
  assert.ok(r.maxGrade() <= 0.025, `steepest grade ${(r.maxGrade() * 100).toFixed(2)}%`);
});

test('running sides', () => {
  assert.equal(TRACK_CENTRES, 4);
  assert.equal(laneFor('out'), -2);
  assert.equal(laneFor('back'), 2);
});

test('stations sit on the line ends', () => {
  const r = makeRoute(LEGS['city-ocean'].points);
  const dep = PLACES.city.stations.find((s) => s.role === 'departure');
  const arr = PLACES.ocean.stations.find((s) => s.role === 'arrival');
  assert.equal(dep.leg, 'city-ocean'); assert.equal(dep.end, 'start');
  assert.equal(arr.leg, 'city-ocean'); assert.equal(arr.end, 'end');
  assert.equal(dep.platformLength, 120); assert.equal(arr.platformLength, 120);
  for (const [place, s] of [['city', 0], ['ocean', r.length]]) {
    const p = r.at(s), c = PLACES[place].centre;
    assert.ok(Math.hypot(p.x - c.x, p.z - c.z) <= 150, `${place} centre is ${Math.hypot(p.x - c.x, p.z - c.z).toFixed(0)} m from its station`);
  }
  // each station's ground is level with its line end
  near(PLACES.city.ground, r.at(0).y, 0.01);
  near(PLACES.ocean.ground, r.at(r.length).y, 0.01);
});

test('the ring is in order', () => {
  assert.deepEqual(RING.places, ['city', 'ocean', 'mountain', 'west', 'future']);
  assert.ok(PLACES.city && PLACES.ocean);
  assert.equal(LEGS['city-ocean'].from, 'city');
  assert.equal(LEGS['city-ocean'].to, 'ocean');
});
