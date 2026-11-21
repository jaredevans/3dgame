import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeRoute } from '../route.js';
import { LEGS, PLACES, RING, BUILT, laneFor, laneOf, TRACK_CENTRES } from '../world-data.js';
const near = (a, b, tol, msg) => assert.ok(Math.abs(a - b) <= tol, `${msg ?? ''} expected ${b} ± ${tol}, got ${a}`);

test('the leg lies inside the limits', () => {
  const r = makeRoute(LEGS['city-ocean'].points);
  assert.ok(r.minRadius() >= 400, `tightest curve ${r.minRadius().toFixed(0)} m`);
  assert.ok(r.maxGrade() <= 0.025, `steepest grade ${(r.maxGrade() * 100).toFixed(2)}%`);
});

test('running sides', () => {
  assert.equal(TRACK_CENTRES, 4);
  // left-hand running, as on the British railway the kit models: outbound trains use the line on the left
  assert.equal(laneFor('out'), 2);
  assert.equal(laneFor('back'), -2);
  assert.equal(laneFor('out'), laneOf('city-ocean'));
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

test('each town stands beside its station, on the platform side, not past the buffers', () => {
  const r = makeRoute(LEGS['city-ocean'].points);
  for (const [place, end] of [['city', 'start'], ['ocean', 'end']]) {
    const L = r.length, mid = end === 'start' ? 61.5 : L - 61.5;   // the middle of the 120 m platform
    const o = r.at(mid), c = PLACES[place].centre;
    const dx = c.x - o.x, dz = c.z - o.z;
    const along = dx * Math.sin(o.yaw) + dz * Math.cos(o.yaw);    // + towards the route's end
    const across = dx * Math.cos(o.yaw) - dz * Math.sin(o.yaw);   // + left of the line
    assert.ok(Math.abs(along) <= 60, `${place} is ${along.toFixed(0)} m along from its platform's middle`);
    assert.ok(Math.sign(across) === Math.sign(laneFor('out')) && Math.abs(across) >= 20, `${place} is ${across.toFixed(0)} m across, not beside the platform`);
  }
});

test('the ring is in order', () => {
  assert.deepEqual(RING.places, ['city', 'ocean', 'mountain', 'west', 'future']);
  for (const id of RING.places) assert.ok(PLACES[id], id);
  for (const id of RING.legs) assert.ok(LEGS[id], id);
  assert.equal(LEGS['city-ocean'].from, 'city');
  assert.equal(LEGS['city-ocean'].to, 'ocean');
});

test('the page builds only the places whose kits are wired in', () => {
  assert.ok(BUILT.includes('city') && BUILT.includes('ocean'));
  for (const id of BUILT) assert.ok(PLACES[id], id);
});
