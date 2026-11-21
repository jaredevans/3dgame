import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeRoute } from '../route.js';
import * as WORLD from '../world-data.js';
import { LEGS, PLACES, RING, laneOf, TRACK_CENTRES } from '../world-data.js';
const near = (a, b, tol, msg) => assert.ok(Math.abs(a - b) <= tol, `${msg ?? ''} expected ${b} ± ${tol}, got ${a}`);

test('the leg lies inside the limits', () => {
  const r = makeRoute(LEGS['city-ocean'].points);
  assert.ok(r.minRadius() >= 400, `tightest curve ${r.minRadius().toFixed(0)} m`);
  assert.ok(r.maxGrade() <= 0.025, `steepest grade ${(r.maxGrade() * 100).toFixed(2)}%`);
});

test('running sides', () => {
  assert.equal(TRACK_CENTRES, 4);
  // left-hand running, as on the British railway the kit models: outbound trains use the line on the left
  assert.equal(laneOf('city-ocean'), 2);
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
    assert.ok(Math.sign(across) === Math.sign(laneOf('city-ocean')) && Math.abs(across) >= 20, `${place} is ${across.toFixed(0)} m across, not beside the platform`);
  }
});

test('the ring is in order', () => {
  assert.deepEqual(RING.places, ['city', 'ocean', 'mountain', 'west', 'future']);
  for (const id of RING.places) assert.ok(PLACES[id], id);
  for (const id of RING.legs) assert.ok(LEGS[id], id);
  assert.equal(LEGS['city-ocean'].from, 'city');
  assert.equal(LEGS['city-ocean'].to, 'ocean');
});

test('the ring is closed: its places and legs are all laid out, and every station stands on one of its legs', () => {
  assert.deepEqual([...RING.places].sort(), Object.keys(PLACES).sort());
  assert.deepEqual([...RING.legs].sort(), Object.keys(LEGS).sort());
  assert.equal(WORLD.HELD, undefined, 'world-data still holds legs back');
  assert.equal(WORLD.BUILT, undefined, 'nothing is left unbuilt');
  for (const [id, p] of Object.entries(PLACES)) for (const st of p.stations) assert.ok(RING.legs.includes(st.leg), `${p.name}'s ${st.role} station`);
  for (let k = 0; k < RING.legs.length; k++) {
    const leg = LEGS[RING.legs[k]];
    assert.equal(leg.to, LEGS[RING.legs[(k + 1) % RING.legs.length]].from, `${RING.legs[k]} leads on`);
  }
});
