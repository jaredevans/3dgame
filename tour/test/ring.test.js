import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeRoute } from '../route.js';
import { idealLegTime } from '../drive.js';
import { TRAIN_SPECS } from '../trains/specs.js';
import { LEGS, PLACES, RING, laneOf, legRoute, stationFrame } from '../world-data.js';

const legIds = Object.keys(LEGS);
const placeIds = Object.keys(PLACES);
const dist = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);

test('the whole ring is laid out', () => {
  assert.deepEqual([...legIds].sort(), [...RING.legs].sort());
  assert.deepEqual([...placeIds].sort(), [...RING.places].sort());
  for (const id of RING.legs) assert.equal(id, `${LEGS[id].from}-${LEGS[id].to}`);
});

test('every leg is about 90 seconds', () => {
  for (const id of legIds) {
    const leg = LEGS[id], spec = TRAIN_SPECS[leg.train];
    assert.ok(spec, `${id} has no train spec ${leg.train}`);
    const t = idealLegTime(makeRoute(leg.points).length, spec);
    assert.ok(t >= 80 && t <= 100, `${id}: ${t.toFixed(1)} s`);
  }
});

test('curves and grades', () => {
  for (const id of legIds.filter((l) => l !== 'west-future')) {
    const r = legRoute(id);
    assert.ok(r.minRadius() >= 400, `${id}: tightest curve ${r.minRadius().toFixed(0)} m`);
    assert.ok(r.maxGrade() <= 0.025, `${id}: steepest grade ${(r.maxGrade() * 100).toFixed(2)}%`);
  }
});

test('bullet leg curves and grades', () => {
  const r = legRoute('west-future');
  assert.ok(r.minRadius() >= 2000, `tightest curve ${r.minRadius().toFixed(0)} m`);
  assert.ok(r.maxGrade() <= 0.015, `steepest grade ${(r.maxGrade() * 100).toFixed(2)}%`);
});

test('each place has one arrival and one departure', () => {
  for (const id of placeIds) {
    const st = PLACES[id].stations;
    assert.deepEqual(st.map((s) => s.role).sort(), ['arrival', 'departure'], id);
    const dep = st.find((s) => s.role === 'departure'), arr = st.find((s) => s.role === 'arrival');
    assert.equal(LEGS[dep.leg].from, id); assert.equal(dep.end, 'start');
    assert.equal(LEGS[arr.leg].to, id); assert.equal(arr.end, 'end');
    for (const s of st) assert.equal(s.platformLength, 120);
  }
  // and every leg is served at both ends
  for (const id of legIds) {
    assert.ok(PLACES[LEGS[id].from].stations.some((s) => s.leg === id && s.role === 'departure'), `${id} departs nowhere`);
    assert.ok(PLACES[LEGS[id].to].stations.some((s) => s.leg === id && s.role === 'arrival'), `${id} arrives nowhere`);
  }
});

test("each station is level with its place's ground", () => {
  for (const id of placeIds) for (const s of PLACES[id].stations) {
    const r = legRoute(s.leg), y = r.at(s.end === 'start' ? 0 : r.length).y;
    assert.ok(Math.abs(y - PLACES[id].ground) <= 0.01, `${id} ${s.role}: line end at ${y.toFixed(2)}, ground ${PLACES[id].ground}`);
    // the whole platform is level
    const f = stationFrame(id, s.role);
    assert.ok(Math.abs(f.y - PLACES[id].ground) <= 0.01, `${id} ${s.role}: platform middle at ${f.y.toFixed(2)}`);
  }
});

test('towns stand beside both their stations', () => {
  for (const id of placeIds) for (const role of ['arrival', 'departure']) {
    const f = stationFrame(id, role), c = PLACES[id].centre;
    const dx = c.x - f.x, dz = c.z - f.z;
    const along = dx * Math.sin(f.yaw) + dz * Math.cos(f.yaw);    // + towards the route's end
    const across = dx * Math.cos(f.yaw) - dz * Math.sin(f.yaw);   // + left of the line
    assert.equal(f.side, LEGS[f.leg].side);
    assert.ok(Math.abs(along) <= 60, `${id} is ${along.toFixed(0)} m along from its ${role} platform's middle`);
    assert.ok(Math.sign(across) === f.side && Math.abs(across) >= 20, `${id} is ${across.toFixed(0)} m across its ${role} line, not beside it on side ${f.side}`);
  }
});

test('the two stations are on different sides of the town', () => {
  for (const id of placeIds) {
    const c = PLACES[id].centre, a = stationFrame(id, 'arrival'), d = stationFrame(id, 'departure');
    const u = [a.x - c.x, a.z - c.z], v = [d.x - c.x, d.z - c.z];
    const angle = Math.acos((u[0] * v[0] + u[1] * v[1]) / Math.hypot(...u) / Math.hypot(...v)) * 180 / Math.PI;
    // the one exception: the sea fills Oceanside's north side, so its two stations can only be south and east of it
    const least = id === 'ocean' ? 60 : 90;
    assert.ok(angle >= least, `${id}: its stations are only ${angle.toFixed(0)}° apart round the town`);
    assert.ok(dist(a, d) >= 60, `${id}: platforms ${dist(a, d).toFixed(0)} m apart`);
  }
});

test('legs keep apart', () => {
  const samples = Object.fromEntries(legIds.map((id) => {
    const r = legRoute(id), pts = [];
    for (let s = 0; s <= r.length; s += 20) pts.push(r.at(s));
    pts.push(r.at(r.length));
    return [id, pts];
  }));
  for (let i = 0; i < legIds.length; i++) for (let j = i + 1; j < legIds.length; j++) {
    const A = LEGS[legIds[i]], B = LEGS[legIds[j]];
    const shared = [A.from, A.to].filter((p) => p === B.from || p === B.to).map((p) => PLACES[p].centre);
    const nearShared = (p) => shared.some((c) => dist(p, c) <= 250);
    let worst = Infinity, where = null;
    for (const a of samples[legIds[i]]) for (const b of samples[legIds[j]]) {
      if (nearShared(a) && nearShared(b)) continue;
      const d = dist(a, b);
      if (d < worst) { worst = d; where = a; }
    }
    assert.ok(worst >= 60, `${legIds[i]} and ${legIds[j]} come ${worst.toFixed(0)} m apart near (${where?.x.toFixed(0)}, ${where?.z.toFixed(0)})`);
  }
  for (const id of legIds) for (const p of placeIds) {
    if (p === LEGS[id].from || p === LEGS[id].to) continue;
    const closest = Math.min(...samples[id].map((s) => dist(s, PLACES[p].centre)));
    assert.ok(closest >= 40, `${id} passes ${closest.toFixed(0)} m from ${p}`);
  }
});

test('left-hand line by default', () => {
  assert.equal(laneOf('city-ocean'), 2);
  assert.equal(laneOf('ocean-mountain'), -2);
  for (const id of legIds) assert.equal(laneOf(id), LEGS[id].side * 2);
});
