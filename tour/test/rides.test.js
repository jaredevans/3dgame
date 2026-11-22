// The rides as data (rides.js): one per leg, onward, each about 90 s along a path of its own that keeps off the land
// (or on it, the coach; on the sea, the boat), boarded from its departure station's walk and landing by the next
// place's arrival station, its progress mapped onto the leg. Pure, no three.js.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { RIDE_LEGS, RIDE_DT, rideFor, rideStep, rideLegS, COACH_GRADE, COACH_COL, JET } from '../rides.js';
import { LEGS, PLACES, SEA_LEVEL, EXTRA_REACH, legRoute, laneOf, platformWindow, worldTerrain } from '../world-data.js';
import { stationWalk } from '../station-walk.js';
import { rocketPad } from '../actors/paths.js';

const terrain = worldTerrain(), ground = (x, z) => terrain.heightAt(x, z);
const rides = RIDE_LEGS.map(rideFor);
const ride = (id) => rides.find((r) => r.id === id);
const along = (route, step, fn) => { const p = {}; for (let s = 0; s <= route.length; s += step) fn(route.at(s, p), s); };

// the nearest point of a leg's line: { s, d }
function nearestOn(leg, x, z) {
  const r = legRoute(leg), q = {};
  let best = { s: 0, d: Infinity };
  for (let s = 0; s <= r.length; s += 2) { r.at(s, q); const d = Math.hypot(q.x - x, q.z - z); if (d < best.d) best = { s, d }; }
  return best;
}

// a place's footprint and its town for the walk, as places.test.js stands them in (no kits in Node): its `size`
// rectangle, turned by `rot`, and the ground round its extra parts
function footprint(p) {
  const c = Math.cos(p.rot), s = Math.sin(p.rot), [ox, oz] = p.offset ?? [0, 0];
  const toWorld = (lx, lz) => [p.centre.x + lx * c + lz * s, p.centre.z - lx * s + lz * c];
  const toLocal = (x, z) => { const dx = x - p.centre.x, dz = z - p.centre.z; return [dx * c - dz * s, dx * s + dz * c]; };
  const hx = p.size[0] / 2, hz = p.size[1] / 2;
  return { toWorld, outside(x, z) { const [lx, lz] = toLocal(x, z); return Math.hypot(Math.max(0, Math.abs(lx - ox) - hx), Math.max(0, Math.abs(lz - oz) - hz)); } };
}
function inTownOf(p) {
  const f = footprint(p), spots = (p.extras ?? []).map((e) => f.toWorld(e.x, e.z));
  return (x, z) => f.outside(x, z) === 0 || spots.some(([ex, ez]) => Math.hypot(x - ex, z - ez) <= EXTRA_REACH);
}
// a station's walk (station-walk.js) with its approach out to the town, and where a point is in its platform's frame:
// inn, metres in from the platform's open end; out, metres out from the line's centre on its town side
function walkAt(placeId, role) {
  const P = PLACES[placeId], st = P.stations.find((s) => s.role === role);
  const route = legRoute(st.leg), w = platformWindow(route.length, st.end, st.platformLength);
  const walk = stationWalk(st.leg, st.end, { platformLength: st.platformLength }), reach = walk.rays(inTownOf(P));
  const town = Math.sign(laneOf(st.leg)), atEnd = st.end === 'end', open = atEnd ? w.sFrom : w.sTo, inward = atEnd ? 1 : -1;
  const o = route.at(open);
  const frame = (x, z) => {
    const dx = x - o.x, dz = z - o.z;
    return { inn: inward * (dx * Math.sin(o.yaw) + dz * Math.cos(o.yaw)), out: town * (dx * Math.cos(o.yaw) - dz * Math.sin(o.yaw)) };
  };
  const point = (inn, out) => route.offsetAt(open + inward * inn, town * out);
  return { walk, reach, frame, point, onWalk: (x, z) => walk.townSide(x, z, reach) };
}

test('five rides, one per leg, onward', () => {
  assert.deepEqual(RIDE_LEGS, ['city-ocean', 'ocean-mountain', 'mountain-west', 'west-future', 'future-city']);
  assert.deepEqual(rides.map((r) => r.id), ['boat', 'balloon', 'coach', 'jet', 'car']);
  assert.deepEqual(rides.map((r) => r.name), ['speedboat', 'hot-air balloon', 'stagecoach', 'jet', 'flying car']);
  for (const r of rides) {
    assert.equal(r.from, LEGS[r.leg].from);
    assert.equal(r.to, LEGS[r.leg].to);
    assert.equal(rideFor(r.leg), r, 'memoised');
    assert.deepEqual(r.events, []);
    assert.deepEqual(r.showpieces, []);
  }
  assert.throws(() => rideFor('nowhere'));
});

test('each ride lasts 85-95 s from start to done, at dt 1/60', () => {
  for (const r of rides) {
    let st = { s: 0, t: 0 }, last = 0, frames = 0;
    while (!st.done && frames < 20000) {
      st = rideStep(st, 1 / 60, r);
      assert.ok(st.s >= last - 1e-9, `${r.id} goes back`);
      last = st.s; frames++;
    }
    assert.ok(st.done, `${r.id} never lands`);
    assert.ok(st.t >= 85 && st.t <= 95, `${r.id} takes ${st.t.toFixed(1)} s`);
    assert.ok(Math.abs(st.s - r.path.length) < 1e-6 && st.v === 0, `${r.id} stops at its landing`);
    // eases out of the start and into the landing, cruising between
    const v = (t) => rideStep({ s: 0, t }, 0, r).v;
    assert.ok(v(0.5) < 0.1 * r.profile.v && v(r.duration - 0.5) < 0.1 * r.profile.v);
    assert.ok(Math.abs(v(r.duration / 2) - r.profile.v) < 1e-9);
  }
});

test('rideStep clamps a long frame and never jumps a set piece', () => {
  for (const r of rides) {
    for (const t of [0, 40]) {
      const st = { s: rideStep({ s: 0, t }, 0, r).s, t };
      assert.deepEqual(rideStep(st, 5, r), rideStep(st, RIDE_DT, r));
    }
    // at the clamp no frame moves on more than cruising does in RIDE_DT, so any set piece longer than that is met
    let st = { s: 0, t: 0 };
    const seen = new Set();
    while (!st.done) {
      const next = rideStep(st, 1, r);
      assert.ok(next.s - st.s <= r.profile.v * RIDE_DT + 1e-9, `${r.id} jumps ${(next.s - st.s).toFixed(1)} m`);
      for (const ev of [...r.events, ...r.showpieces]) if (next.s >= ev.s0 && next.s <= ev.s1) seen.add(ev.id);
      st = next;
    }
    for (const ev of [...r.events, ...r.showpieces]) assert.ok(seen.has(ev.id), `${r.id} jumps ${ev.id}`);
  }
});

test('the leg-s table is monotonic, in [0, L], from the departure end to the arrival end', () => {
  for (const r of rides) {
    const L = legRoute(r.leg).length, T = r.legS;
    assert.equal(T.length, Math.floor(r.path.length) + 1);
    assert.ok(T[0] <= 150, `${r.id} starts at leg-s ${T[0].toFixed(0)}`);
    assert.ok(T[T.length - 1] >= L - 150, `${r.id} ends at leg-s ${T[T.length - 1].toFixed(0)} of ${L.toFixed(0)}`);
    for (let i = 0; i < T.length; i++) {
      assert.ok(T[i] >= 0 && T[i] <= L);
      if (i) assert.ok(T[i] >= T[i - 1], `${r.id} goes back at ${i}`);
    }
    // the sky follows the ride: the leg's arrival end isn't reached before three-quarters of the way
    assert.ok(T.findIndex((s) => s >= L - 150) >= 0.75 * (T.length - 1) - 1, `${r.id} reaches the leg's end early`);
    assert.equal(rideLegS(r, 0), T[0]);
    assert.equal(rideLegS(r, r.path.length), T[T.length - 1]);
    assert.ok(Math.abs(rideLegS(r, 10.5) - (T[10] + T[11]) / 2) < 1e-9);
  }
  // the jet's circle lies past the line's end: its table is laid out along its path, not stuck at the end
  const jet = ride('jet'), J = jet.legS, half = J[Math.floor(J.length / 2)];
  assert.ok(Math.abs(half - (J[0] + J[J.length - 1]) / 2) < 2, `the jet halfway at leg-s ${half.toFixed(0)}`);
});

test('paths start at board and end at land, within 1 m', () => {
  for (const r of rides) {
    const a = r.path.at(0), b = r.path.at(r.path.length);
    assert.ok(Math.hypot(a.x - r.board.x, a.y - r.board.y, a.z - r.board.z) < 1, `${r.id} board`);
    assert.ok(Math.hypot(b.x - r.land.x, b.y - r.land.y, b.z - r.land.z) < 1, `${r.id} land`);
    for (const k of ['board', 'land', 'step']) for (const f of ['x', 'y', 'z', 'yaw']) assert.ok(Number.isFinite(r[k][f]), `${r.id} ${k}.${f}`);
  }
});

test('never underground: every 2 m of path >= terrain + 1 (coach: within 0.5 m of the ground; boat: at sea level over water depth >= 1.5 m away from its two jetties)', () => {
  for (const r of rides) along(r.path, 2, (p, s) => {
    const g = ground(p.x, p.z);
    if (r.id === 'coach') assert.ok(Math.abs(p.y - g) <= 0.5, `the coach ${(p.y - g).toFixed(2)} m off the ground at ${s}`);
    else if (r.id === 'boat') {
      assert.ok(Math.abs(p.y - SEA_LEVEL) < 1e-9, `the boat off the sea at ${s}`);
      const jetty = Math.min(Math.hypot(p.x - r.board.x, p.z - r.board.z), Math.hypot(p.x - r.land.x, p.z - r.land.z));
      if (jetty > 30) assert.ok(SEA_LEVEL - g >= 1.5, `the boat in ${(SEA_LEVEL - g).toFixed(1)} m of water at ${s}`);
    } else assert.ok(p.y >= g + 1, `the ${r.id} ${(p.y - g).toFixed(2)} m over the land at ${s}`);
  });
});

test('the coach keeps out of the canyon slot and its grade stays <= 12% (17% on the col), its turns no tighter than 15 m', () => {
  const r = ride('coach'), a = {}, b = {};
  along(r.path, 2, (p, s) => {
    const n = nearestOn('mountain-west', p.x, p.z);
    if (n.s >= 620 && n.s <= 1150) assert.ok(n.d >= 60, `the coach ${n.d.toFixed(0)} m from the canyon's line at ${s}`);
    assert.ok(n.d >= 10, `the coach on the line at ${s}`);
  });
  let run = 0;
  for (let s = 0; s + 10 <= r.path.length; s += 2) {
    r.path.at(s, a); r.path.at(s + 10, b);
    const g = Math.abs(b.y - a.y) / Math.hypot(b.x - a.x, b.z - a.z), onCol = Math.hypot(a.x - COACH_COL.x, a.z - COACH_COL.z) <= COACH_COL.r;
    run = g > COACH_GRADE ? run + 2 : 0;
    if (g > COACH_GRADE) {
      assert.ok(onCol, `the coach climbs ${(g * 100).toFixed(1)}% off the col at ${s}`);
      assert.ok(g <= COACH_COL.grade, `the coach climbs ${(g * 100).toFixed(1)}% on the col at ${s}`);
      assert.ok(run + 8 <= COACH_COL.run, `a steep stretch over ${COACH_COL.run} m at ${s}`);
    }
  }
  assert.ok(r.path.minRadius(10) >= 15, `a turn of ${r.path.minRadius(10).toFixed(0)} m`);
});

test('the jet flies round the rocket pad: its path comes within 2.2 km of the pad and passes all round it (bearing spans >= 300 degrees)', () => {
  const r = ride('jet'), pad = rocketPad(legRoute('west-future'));
  assert.ok(JET.radius >= 1200 && JET.radius <= 2000);
  let closest = Infinity, bearing = null, lo = 0, hi = 0;
  along(r.path, 10, (p) => {
    closest = Math.min(closest, Math.hypot(p.x - pad.x, p.z - pad.z));
    const b = Math.atan2(p.z - pad.z, p.x - pad.x);
    if (bearing !== null) { const turn = Math.atan2(Math.sin(b - bearing.raw), Math.cos(b - bearing.raw)); bearing.sum += turn; lo = Math.min(lo, bearing.sum); hi = Math.max(hi, bearing.sum); }
    bearing = { raw: b, sum: bearing?.sum ?? 0 };
  });
  assert.ok(closest <= 2200, `${closest.toFixed(0)} m from the pad at closest`);
  assert.ok((hi - lo) * 180 / Math.PI >= 300, `its bearing spans ${((hi - lo) * 180 / Math.PI).toFixed(0)} degrees`);
  // fast: cruising at 750-800 km/h, low over the desert (60-150 m up) once it's climbed out and till it comes down
  assert.ok(r.profile.v * 3.6 >= 750 && r.profile.v * 3.6 <= 800, `${(r.profile.v * 3.6).toFixed(0)} km/h`);
  along(r.path, 10, (p, s) => {
    if (s < 2500 || s > r.path.length - 2500) return;
    const up = p.y - ground(p.x, p.z);
    assert.ok(up >= 60 && up <= 150, `the jet ${up.toFixed(0)} m up at ${s}`);
  });
});

test('the balloon rises to about 150 m over the land, and the car flies 40-80 m over the suburbs and the river', () => {
  const b = ride('balloon');
  along(b.path, 5, (p, s) => {
    if (s < 0.3 * b.path.length || s > 0.7 * b.path.length) return;
    const up = p.y - ground(p.x, p.z);
    assert.ok(up >= 140 && up <= 230, `the balloon ${up.toFixed(0)} m up at ${s}`);
  });
  const c = ride('car');
  along(c.path, 5, (p, s) => {
    const legS = rideLegS(c, s);
    if (legS < 250 || legS > 1700) return;   // (once it's climbed out of the Futuristic place)
    const up = p.y - ground(p.x, p.z);
    assert.ok(up >= 40 && up <= 80, `the car ${up.toFixed(0)} m up at ${s} (leg-s ${legS.toFixed(0)})`);
  });
});

// the towers and the kit's own parked fliers in each town, in its kit's frame, as actors.test.js has them (measured in
// the page): x, z, r (how far out from its middle it reaches), from and top (metres over the town's ground)
const TOWERS = {
  future: [
    { x: -2, z: -52, r: 11.3, from: 0, top: 41 },
    { x: -56, z: -8, r: 5.7, from: 0, top: 31 }, { x: -48, z: -8, r: 5.7, from: 0, top: 31 },
    { x: -40, z: -30, r: 8.5, from: 0, top: 25 }, { x: -40, z: -18, r: 8.5, from: 0, top: 25 },
    { x: 0, z: 46, r: 5.7, from: 0, top: 21 }, { x: -23, z: 45, r: 5.7, from: 0, top: 21 },
    { x: -12, z: 46, r: 9, from: 25, top: 29 },
    { x: 40, z: -24, r: 11.3, from: 0, top: 14 },
    { x: 26, z: -40, r: 2.7, from: 53, top: 55 }, { x: -24, z: -30, r: 3.4, from: 47, top: 49 },
    { x: -24, z: 38, r: 2.7, from: 40, top: 41 }, { x: 14, z: 44, r: 6, from: 44, top: 45 },
    { x: -24, z: 0, r: 2.7, from: 16, top: 17 }, { x: -24, z: 26, r: 2.7, from: 16, top: 18 },
    { x: 38, z: 50, r: 2.7, from: 13, top: 15 }, { x: 38, z: 32, r: 2.7, from: 15, top: 17 },
  ],
  city: [-36, -20, 12].map((z) => ({ x: -52, z, r: 5.7, from: 0, top: 32 })).concat(
    [[-12, 12], [-28, 36], [24, -36], [44, -36], [44, 36]].map(([x, z]) => ({ x, z, r: 5.7, from: 0, top: 32 }))),
};

test('the car keeps 15 m clear of the City and Futuristic towers (tower boxes as Task 8 of phase 3 measured in paths.js LANES tests)', () => {
  const r = ride('car');
  let among = false;
  for (const town of ['city', 'future']) {
    const P = PLACES[town], c = Math.cos(P.rot), s = Math.sin(P.rot);
    const towers = TOWERS[town].map((w) => ({ ...w, wx: P.centre.x + w.x * c + w.z * s, wz: P.centre.z - w.x * s + w.z * c }));
    along(r.path, 1, (p, at) => {
      for (const w of towers) {
        const dh = Math.max(0, Math.hypot(p.x - w.wx, p.z - w.wz) - w.r), up = p.y - P.y;
        const dv = Math.max(0, w.from - up, up - w.top);
        assert.ok(Math.hypot(dh, dv) >= 15, `the car ${Math.hypot(dh, dv).toFixed(1)} m from a ${town} tower at ${at}`);
        if (town === 'city' && dh < 40 && up < w.top) among = true;
      }
    });
  }
  assert.ok(among, 'the car never goes in among the City\'s towers');
});

test('boarding points are on the walk (stationWalk townSide) within 25 m of the departure platform\'s open end; the boat\'s jetty is joined to the City by its walkway (Task 5)', () => {
  for (const r of rides) {
    if (r.id === 'boat') {
      // the boat's is at its jetty on the City's seafront (its walkway is Task 5's): within 30 m of the shore, over
      // water 2 m deep, at most 300 m from the City's middle, the path setting off from it
      const c = PLACES.city.centre, b = r.board;
      assert.ok(Math.hypot(b.x - c.x, b.z - c.z) <= 300, 'the jetty is not by the City');
      assert.ok(SEA_LEVEL - ground(b.x, b.z) >= 2, 'the jetty\'s end is not over 2 m of water');
      let shore = Infinity;
      for (let a = 0; a < 360; a += 5) for (let d = 0; d <= 40; d += 0.5) {
        if (ground(b.x + d * Math.cos(a * Math.PI / 180), b.z + d * Math.sin(a * Math.PI / 180)) > SEA_LEVEL) { shore = Math.min(shore, d); break; }
      }
      assert.ok(shore <= 30, `the jetty's end is ${shore} m from the shore`);
      continue;
    }
    const W = walkAt(r.from, 'departure'), f = W.frame(r.board.x, r.board.z);
    assert.ok(W.onWalk(r.board.x, r.board.z), `the ${r.id}'s board is off the walk`);
    assert.ok(f.out >= 9, `the ${r.id}'s board is on the platform`);
    // within 25 m of the open end, or as near it as the walk comes off the platform (at Oceanside and the Wild West
    // the walk is the platform alone over the end of it nearest the open end)
    if (f.inn > 25) {
      for (let inn = 0; inn < f.inn - 2; inn += 1) {
        const q = W.point(inn, 9);
        assert.ok(!W.onWalk(q.x, q.z), `the ${r.id} boards ${f.inn.toFixed(0)} m in, but the walk comes off the platform ${inn} m in`);
      }
    }
  }
});

test('you step off on the walk by the landing, and every vehicle stands on open ground, out of the towns', () => {
  for (const r of rides) {
    // the boat lands by the station the Highland Climber leaves from; the rest by their next place's arrival station
    const W = r.id === 'boat' ? walkAt('ocean', 'departure') : walkAt(r.to, 'arrival');
    assert.ok(W.onWalk(r.step.x, r.step.z), `the ${r.id}'s step is off the walk`);
    assert.ok(W.frame(r.step.x, r.step.z).out >= 9, `the ${r.id}'s step is on the platform`);
    assert.ok(Math.hypot(r.step.x - r.land.x, r.step.z - r.land.z) <= 80, `the ${r.id}'s step is far from its landing`);
    assert.ok(Math.abs(r.step.y - ground(r.step.x, r.step.z)) < 1e-9);
    for (const p of [r.board, r.land]) for (const [id, P] of Object.entries(PLACES)) {
      assert.ok(footprint(P).outside(p.x, p.z) > 0, `the ${r.id} stands in ${id}`);
    }
    for (const p of [r.board, r.land]) for (const leg of Object.keys(LEGS)) {
      const n = nearestOn(leg, p.x, p.z);
      assert.ok(n.d >= 9, `the ${r.id} stands ${n.d.toFixed(1)} m from ${leg}'s line`);
    }
  }
});
