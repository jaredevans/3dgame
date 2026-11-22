// The rides as data (rides.js): one per leg, onward, each about 90 s along a path of its own that keeps off the land
// (or on it, the coach; on the sea, the boat), boarded from its departure station's walk and landing by the next
// place's arrival station, its progress mapped onto the leg. Pure, no three.js.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { RIDE_LEGS, RIDE_DT, ESCORT, formationOffsets, placeEscort, rideFor, rideStep, rideLegS, COACH_GRADE, COACH_COL, JET,
  OCTOPUS, OCTOPUS_ARMS, OCTOPUS_BODY, OCTOPUS_GIRTH, octopusPose, armJoints, swerveAt, placeOctopus,
  BALLOON, envelopeRadius, BURNS, burnAt, CROWS, crowOffset, placeCrow } from '../rides.js';
import { makeRideTrack } from '../ride-run.js';
import { legSections, FEATURES } from '../world-data.js';
import { onWalkway } from '../walk-world.js';
import { LEGS, PLACES, SEA_LEVEL, EXTRA_REACH, legRoute, laneOf, platformWindow, worldTerrain } from '../world-data.js';
import { stationWalk } from '../station-walk.js';
import { rocketPad } from '../actors/paths.js';
import { TOWERS, footprint } from './fixtures.js';

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

// a place's town for the walk, as places.test.js stands it in (no kits in Node): its footprint, and the ground round its
// extra parts
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
    // (each ride's set pieces are its own tasks': so far the car's escort and its two shots, the boat's octopus and its,
    // the balloon's crows and its two)
    if (r.id !== 'car' && r.id !== 'boat' && r.id !== 'balloon') { assert.deepEqual(r.events, []); assert.deepEqual(r.showpieces, []); }
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
  // its take-off and landing rolls are on the ground (on level ground, as its hardstanding and apron will be): at most
  // 2 m over it, never under 1, the take-off from the start and the landing to the stop, and quick enough to fly
  assert.equal(r.rolls.length, 2);
  assert.equal(r.rolls[0][0], 0);
  assert.equal(r.rolls[1][1], r.path.length);
  for (const [a, b] of r.rolls) {
    assert.ok(b - a >= 50 && b - a <= 250, `a roll of ${(b - a).toFixed(0)} m`);
    for (let s = a, p = {}; s <= b; s += 1) {
      r.path.at(s, p);
      const up = p.y - ground(p.x, p.z);
      assert.ok(up >= 1 && up <= 2, `the jet ${up.toFixed(2)} m over the ground on its roll at ${s}`);
    }
  }
  let st = { s: 0, t: 0 };
  while (st.s < r.rolls[0][1]) st = rideStep(st, 1 / 60, r);
  assert.ok(st.v * 3.6 >= 150, `lifting off at ${(st.v * 3.6).toFixed(0)} km/h`);
  while (st.s < r.rolls[1][0]) st = rideStep(st, 1 / 60, r);
  assert.ok(st.v * 3.6 >= 150 && st.v * 3.6 <= 260, `touching down at ${(st.v * 3.6).toFixed(0)} km/h`);
  for (const other of rides) if (other !== r) assert.deepEqual(other.rolls, []);
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

// ---- the flying car's escort ----

test('the escort: five to seven slots, some ahead and some behind, 8 m from the car and each other at every moment, and no jump of 2 m in 0.1 s', () => {
  const a = formationOffsets(0);
  assert.ok(a.length >= 5 && a.length <= 7, `${a.length} slots`);
  let ahead = false, behind = false;
  const dist = (p, q) => Math.hypot(p.along - q.along, p.side - q.side, p.up - q.up);
  for (let k = 0; k < 200; k++) {
    const t = k * 0.5, o = formationOffsets(t).map((p) => ({ ...p })), n = formationOffsets(t + 0.1);
    for (let i = 0; i < o.length; i++) {
      if (o[i].along > 20) ahead = true;
      if (o[i].along < -20) behind = true;
      assert.ok(dist(o[i], { along: 0, side: 0, up: 0 }) >= 8, `slot ${i} ${dist(o[i], { along: 0, side: 0, up: 0 }).toFixed(1)} m from the car at ${t}`);
      assert.ok(dist(o[i], n[i]) <= 2, `slot ${i} jumps ${dist(o[i], n[i]).toFixed(2)} m at ${t}`);
      for (let j = i + 1; j < o.length; j++) assert.ok(dist(o[i], o[j]) >= 8, `slots ${i} and ${j} ${dist(o[i], o[j]).toFixed(1)} m apart at ${t}`);
    }
  }
  assert.ok(ahead && behind, 'the formation is not both ahead and behind');
});

test('the escort swaps places (a slot weaves from one side of the car to the other) and one passes the car, from behind to ahead', () => {
  const side = [], pass = [];
  for (let t = 0; t < 120; t += 0.5) { const o = formationOffsets(t); side.push(o[0].side); pass.push(o[o.length - 1].along); }
  assert.ok(Math.min(...side) < -5 && Math.max(...side) > 5);
  assert.ok(pass[0] < -50 && pass[pass.length - 1] > 50, 'it does not pass');
});

test('the escort reuses the offsets it is handed (no allocation in the ride loop)', () => {
  const out = formationOffsets(0);
  assert.equal(formationOffsets(7, out), out);
});

test('the escort stays on the path\'s line over its flight, clear of the towers and the land, and is gone at the ends', () => {
  const r = ride('car'), L = r.path.length, offs = formationOffsets(0), slot = {}, o = {};
  const [ev] = r.events;
  assert.equal(ev.id, 'escort');
  assert.ok(ev.s0 >= 50 && ev.s1 <= L - 50, 'the escort flies over take-off or the landing');
  const towers = ['city', 'future'].flatMap((town) => {
    const P = PLACES[town], c = Math.cos(P.rot), s = Math.sin(P.rot);
    return TOWERS[town].map((w) => ({ ...w, P, wx: P.centre.x + w.x * c + w.z * s, wz: P.centre.z - w.x * s + w.z * c }));
  });
  let seen = 0;
  const placed = offs.map(() => ({})), car = {};
  for (let s = ev.s0; s <= ev.s1; s += 4) {
    formationOffsets((s - ev.s0) / r.profile.v, offs);
    r.path.at(s, car);
    for (let i = 0; i < offs.length; i++) { Object.assign(slot, offs[i]); placeEscort(r, s, slot, placed[i]); }
    // in placed space too, 8 m between craft in sight (and from the car once all have joined)
    for (let i = 0; i < placed.length; i++) {
      if (!placed[i].visible) continue;
      if (s >= ESCORT.from + ESCORT.join) assert.ok(Math.hypot(placed[i].x - car.x, placed[i].y - car.y, placed[i].z - car.z) >= 8, `an escort within 8 m of the car at ${s}`);
      for (let j = i + 1; j < placed.length; j++) {
        if (!placed[j].visible) continue;
        const d = Math.hypot(placed[i].x - placed[j].x, placed[i].y - placed[j].y, placed[i].z - placed[j].z);
        assert.ok(d >= 8, `escorts ${i} and ${j} ${d.toFixed(1)} m apart at ${s}`);
      }
    }
    for (let i = 0; i < offs.length; i++) {
      Object.assign(slot, offs[i]);
      placeEscort(r, s, slot, o);
      if (!o.visible) continue;
      seen++;
      assert.ok(o.y - ground(o.x, o.z) >= 8, `an escort ${(o.y - ground(o.x, o.z)).toFixed(1)} m over the land at ${s}`);
      for (const w of towers) {
        const dh = Math.max(0, Math.hypot(o.x - w.wx, o.z - w.wz) - w.r), up = o.y - w.P.y, dv = Math.max(0, w.from - up, up - w.top);
        assert.ok(Math.hypot(dh, dv) >= 5, `an escort ${Math.hypot(dh, dv).toFixed(1)} m from a tower at ${s}`);
      }
    }
  }
  assert.ok(seen > 400, `${seen} escort moments in sight`);
  // it joins from behind (none in sight at first) and peels off (all gone by the window's end)
  formationOffsets(0, offs);
  for (let i = 0; i < offs.length; i++) { placeEscort(r, ev.s0, offs[i], o); assert.ok(!o.visible || o.scale < 1, 'the escort stands in at the start'); }
  placeEscort(r, ev.s1, offs[0], o);
  assert.ok(!o.visible, 'the escort is still there at the end of its window');
});

test('the car has its two showpieces over the river and among the towers, within its path', () => {
  const r = ride('car');
  const ids = r.showpieces.map((p) => p.id);
  assert.deepEqual(ids, ['formation', 'tower-chase']);
  for (const p of r.showpieces) assert.ok(p.s0 >= 0 && p.s1 <= r.path.length && p.shot.kind);
  assert.equal(ESCORT.count, 7);
});

// ---- the boat: its jetties and walkways, and the giant octopus ----

// the boat's hull at rest in its own frame (Polyfork's caique, mast none: 2.69 x 2.74 x 7.32 m, its keel 0.45 m under
// its origin, the wheelhouse's roof 2.29 m over it), grown by MOTION for its pitch, roll, bob and lift off its path
const HULL = { x: 1.34, y0: -0.45, y1: 2.29, z: 3.66 }, MOTION = 0.6;
const hullDist = (x, y, z) => Math.hypot(Math.max(0, Math.abs(x) - HULL.x), Math.max(0, HULL.y0 - y, y - HULL.y1), Math.max(0, Math.abs(z) - HULL.z)) - MOTION;

test('the City\'s walkway runs from its town to a jetty alongside where the boat lies, within reach of it, the hull clear of it', () => {
  const r = ride('boat'), [w] = PLACES.city.walkways, P = w.points, end = P[P.length - 1];
  assert.equal(w.width, 3);
  assert.ok(footprint(PLACES.city).outside(P[0].x, P[0].z) === 0, 'the walkway does not start in the town');
  // its line comes within reach (main.js RIDE_REACH, 4 m: its near half nearer still) of where the boat waits, beside
  // it, the jetty's end past its middle (not stopping short of it, nor out in front of its bow)
  let near = Infinity;
  for (let t = 0; t <= 1; t += 0.01) near = Math.min(near, Math.hypot(P[P.length - 2].x + (end.x - P[P.length - 2].x) * t - r.board.x, P[P.length - 2].z + (end.z - P[P.length - 2].z) * t - r.board.z));
  assert.ok(near <= 3.9, `the jetty comes only ${near.toFixed(1)} m from the boat`);
  const ahead = (end.x - r.board.x) * Math.sin(r.board.yaw) + (end.z - r.board.z) * Math.cos(r.board.yaw);
  assert.ok(ahead > 0 && ahead < HULL.z, `the jetty ends ${ahead.toFixed(1)} m along the boat`);
  // the boat's hull (its footprint, at rest and over its first 30 m out) never on the jetty's strip
  const q = {};
  for (let s = 0; s <= 30; s += 0.5) {
    r.path.at(s, q);
    const fx = Math.sin(q.yaw), fz = Math.cos(q.yaw), lx = Math.cos(q.yaw), lz = -Math.sin(q.yaw);
    for (let a = -HULL.z; a <= HULL.z; a += 0.5) for (const b of [-HULL.x, 0, HULL.x]) {
      const x = q.x + fx * a + lx * b, z = q.z + fz * a + lz * b;
      assert.ok(!onWalkway({ ...w, width: w.width + 0.4 }, x, z), `the boat's hull is on the jetty at s ${s}`);
    }
  }
  // no more than 9 m of the walkway nearer than 9 m to any line (it passes the arrival line's buffers 11 m off)
  for (const leg of Object.keys(LEGS)) for (const p of P) assert.ok(nearestOn(leg, p.x, p.z).d >= 9, `the walkway comes near ${leg}`);
});

test('Oceanside\'s jetty runs from where you step off to beside where the boat lands', () => {
  const r = ride('boat'), [w] = PLACES.ocean.walkways, P = w.points;
  assert.ok(Math.hypot(P[0].x - r.step.x, P[0].z - r.step.z) <= 1.5, 'the jetty does not start where you step off');
  assert.ok(walkAt('ocean', 'departure').onWalk(P[0].x, P[0].z), 'the jetty does not start on the station\'s walk');
  const end = P[P.length - 1];
  assert.ok(Math.hypot(end.x - r.land.x, end.z - r.land.z) <= 5, 'the jetty does not reach the landing');
  for (let a = -HULL.z; a <= HULL.z; a += 0.5) {
    const q = r.path.at(r.path.length), x = q.x + Math.sin(q.yaw) * a, z = q.z + Math.cos(q.yaw) * a;
    for (const b of [-HULL.x, HULL.x]) assert.ok(!onWalkway({ ...w, width: w.width + 0.4 }, x + Math.cos(q.yaw) * b, z - Math.sin(q.yaw) * b), 'the landed boat is on the jetty');
  }
});

test('the boat\'s swerve is continuous, its heading turning with it, and back to nothing by the octopus\'s window\'s end', () => {
  const r = ride('boat'), a = {}, b = {};
  let most = 0;
  for (let s = OCTOPUS.s0 - 20; s <= OCTOPUS.s1 + 20; s += 0.25) {
    swerveAt(s, a); swerveAt(s + 0.25, b);
    assert.ok(Math.abs(b.lateral - a.lateral) <= 0.25 * 0.6, `the swerve jumps at ${s}`);
    // its heading is the swerve's slope (to within its change over the step)
    assert.ok(Math.abs(Math.tan((a.yaw + b.yaw) / 2) - (b.lateral - a.lateral) / 0.25) < 0.01, `the heading doesn't follow the swerve at ${s}`);
    assert.ok(Math.abs(b.yaw - a.yaw) < 0.01, `the heading jumps at ${s}`);
    most = Math.min(most, a.lateral);
    if (s <= OCTOPUS.s0 || s >= OCTOPUS.s1) assert.equal(a.lateral, 0);
  }
  assert.ok(most <= -10, `the boat swerves only ${-most} m`);
  // away from the octopus (it rises on the sea side, the boat's left): to the right, still over the sea, 1.5 m deep
  for (let s = OCTOPUS.s0; s <= OCTOPUS.s1; s += 2) {
    const p = r.path.offsetAt(s, swerveAt(s, a).lateral);
    assert.ok(SEA_LEVEL - ground(p.x, p.z) >= 1.5, `the swerve runs into ${(SEA_LEVEL - ground(p.x, p.z)).toFixed(1)} m of water at ${s}`);
  }
});

// how near the octopus comes to the boat's hull at ride-s s: its arms as capsules round their bones and its body as
// spheres round its own (as thick as its skinned mesh), from the pose the page gives its bones; while its clip has some
// say (w < 1), anywhere its arms could reach from its hips, swayed as far as its clips move them
const ARM_REACH = Math.max(...OCTOPUS_ARMS.map(({ joints }) => {
  let L = Math.hypot(...joints[0].map((v, k) => v - OCTOPUS_BODY.hips[k]));
  for (let j = 0; j < 4; j++) L += Math.hypot(...joints[j + 1].map((v, k) => v - joints[j][k]));
  return L;
}));
function octopusClearance(r, s) {
  const u = (s - OCTOPUS.s0) / (OCTOPUS.s1 - OCTOPUS.s0), K = OCTOPUS.scale, G = OCTOPUS_GIRTH;
  const pose = octopusPose(u), sw = swerveAt(s), B = r.path.offsetAt(s, sw.lateral), O = placeOctopus(r, s, pose);
  const by = B.yaw + sw.yaw, cb = Math.cos(by), sb = Math.sin(by), co = Math.cos(O.yaw), so = Math.sin(O.yaw);
  // a point of the model (its own metres) in the boat's frame
  const inBoat = ([lx, ly, lz]) => {
    const dx = O.x + K * (lx * co + lz * so) - B.x, dz = O.z + K * (-lx * so + lz * co) - B.z;
    return [dx * cb - dz * sb, O.y + K * ly - SEA_LEVEL, dx * sb + dz * cb];
  };
  const capsule = (a, b, ra, rb) => {
    let m = Infinity;
    for (let i = 0; i <= 16; i++) {
      const t = i / 16, p = inBoat(a.map((v, k) => v + (b[k] - v) * t));
      m = Math.min(m, hullDist(...p) - K * (ra + (rb - ra) * t));
    }
    return m;
  };
  const H = OCTOPUS_BODY.hips;
  if (pose.w < 1) return hullDist(...inBoat(H)) - K * (ARM_REACH + G.sway + G.arm[0]);
  let d = Math.min(capsule(H, OCTOPUS_BODY.head, G.hips, G.hips), capsule(OCTOPUS_BODY.head, OCTOPUS_BODY.head, G.head, G.head),
    capsule(OCTOPUS_BODY.mantle, OCTOPUS_BODY.mantle, G.mantle, G.mantle));
  const radius = [...G.arm, G.tip];
  for (let a = 0; a < 8; a++) {
    const J = armJoints(pose, a).map((p) => [p.x, p.y, p.z]);
    for (let j = 0; j < 4; j++) d = Math.min(d, capsule(J[j], J[j + 1], radius[j], radius[j + 1]));
  }
  return d;
}

test('the octopus never touches the boat: its closest approach to the hull keeps 1 m, every half metre of its window', () => {
  const r = ride('boat');
  let least = Infinity, at = 0;
  for (let s = OCTOPUS.s0; s <= OCTOPUS.s1; s += 0.5) { const d = octopusClearance(r, s); if (d < least) { least = d; at = s; } }
  assert.ok(least >= 1, `the octopus comes within ${least.toFixed(2)} m of the hull at ride-s ${at}`);
  assert.ok(least <= 3, `the octopus never comes nearer than ${least.toFixed(1)} m: no near miss`);
});

test('the octopus rises out of the sea beside the boat, arches its front arms over the hull, and sinks back', () => {
  const r = ride('boat'), q = {};
  const at = (u) => octopusPose(u);
  assert.ok(at(0).rise < -12 && at(1).rise < -12, 'it is not deep at the ends of its window');
  // at the height of it, risen out of the sea to its arms' crown (0.727 m up the model), its mantle's top (1.95 m)
  // 5 m and more over the water, its back arms lying awash (not hanging down under it like legs)
  const K = OCTOPUS.scale, top = at(0.42);
  assert.ok(top.rise + 0.727 * K > 0 && top.rise + 0.727 * K < 1.5, 'its arms\' crown is not at the waterline');
  assert.ok(top.rise + 1.95 * K >= 5, 'it does not rise out of the sea');
  for (const a of [2, 3, 6, 7]) {
    const tip = armJoints(top, a)[3];
    assert.ok(top.rise + K * tip.y > -1.5, `its back arm ${a} hangs down under it`);
  }
  assert.ok(at(0.42).side > 6 && at(0).side > 15, 'it is not out on the sea side');
  // at the height of it, a front arm's curl over the hull's plan (within its half-width), above it
  let over = false;
  for (let s = OCTOPUS.s0; s <= OCTOPUS.s1; s += 1) {
    const u = (s - OCTOPUS.s0) / (OCTOPUS.s1 - OCTOPUS.s0), pose = octopusPose(u), sw = swerveAt(s), B = r.path.offsetAt(s, sw.lateral, q);
    const O = placeOctopus(r, s, pose), K = OCTOPUS.scale, by = B.yaw + sw.yaw;
    for (const a of [0, 4]) {
      const J = armJoints(pose, a)[3], co = Math.cos(O.yaw), so = Math.sin(O.yaw);
      const dx = O.x + K * (J.x * co + J.z * so) - B.x, dz = O.z + K * (-J.x * so + J.z * co) - B.z;
      const x = dx * Math.cos(by) - dz * Math.sin(by), z = dx * Math.sin(by) + dz * Math.cos(by);
      if (Math.abs(x) <= HULL.x && Math.abs(z) <= HULL.z + 1 && O.y + K * J.y > HULL.y1) over = true;
    }
  }
  assert.ok(over, 'no arm comes over the hull');
  // (all pure, and the pose it's handed filled in place)
  const pose = octopusPose(0.3);
  assert.equal(octopusPose(0.6, pose), pose);
});

test('the boat\'s set pieces: the octopus (with its shot, low over the water) about the middle, the cliffs\' showpiece', () => {
  const r = ride('boat'), L = r.path.length;
  const [ev] = r.events;
  assert.equal(r.events.length, 1);
  assert.equal(ev.id, 'octopus'); assert.equal(ev.actor, 'octopus');
  assert.ok(ev.s0 > L * 0.35 && ev.s1 < L * 0.65, 'the octopus is not about the ride\'s middle');
  assert.ok(ev.shot.kind === 'high-wide' && ev.shot.height <= 5 && ev.shot.at > ev.s0 && ev.shot.at < ev.s1);
  // the shot stands over the sea, on the shore side (the octopus is on the other)
  const p = r.path.offsetAt(ev.shot.at, ev.shot.lateral);
  assert.ok(ev.shot.lateral < 0 && ground(p.x, p.z) < SEA_LEVEL - 1);
  const [cliffs] = r.showpieces;
  assert.equal(cliffs.id, 'cliffs');
  assert.ok(cliffs.s0 >= 0 && cliffs.s1 < ev.s0 && cliffs.shot.kind);
});

// ---- the balloon and its crows ----

// the gap from (rho out from the balloon's axis, y up in its holder's frame) to its envelope's fabric (negative inside
// it): the nearest point of its profile, a surface of revolution, is in the same half-plane
function envelopeGap(rho, y) {
  const E = BALLOON.envelope;
  let best = Infinity;
  for (let h = E.throat; h <= E.crown + 1e-9; h += 0.05) best = Math.min(best, Math.hypot(rho - envelopeRadius(h), y - h));
  const inside = y > E.throat && y < E.crown && rho < envelopeRadius(y);
  return inside ? -best : best;
}

test('the balloon\'s envelope: about 20 m tall and 15-18 m across, a smooth teardrop on its throat over the burners', () => {
  const E = BALLOON.envelope;
  assert.ok(E.crown - E.throat >= 19 && E.crown - E.throat <= 22, `${(E.crown - E.throat).toFixed(1)} m tall`);
  let widest = 0, prev = envelopeRadius(E.throat);
  for (let y = E.throat; y <= E.crown; y += 0.05) {
    const r = envelopeRadius(y);
    widest = Math.max(widest, r);
    assert.ok(Math.abs(r - prev) < 0.4, `a step in the envelope at ${y.toFixed(2)}`);
    prev = r;
  }
  assert.ok(2 * widest >= 15 && 2 * widest <= 18, `${(2 * widest).toFixed(1)} m across`);
  assert.equal(envelopeRadius(E.throat - 0.5), 0);
  assert.equal(envelopeRadius(E.crown + 0.5), 0);
  assert.ok(envelopeRadius(E.throat) >= 1 && envelopeRadius(E.throat) <= 2, 'its throat is over the burners');
  // the basket hangs under it, its rim below the throat, its floor on the path's rest
  assert.ok(BALLOON.rim < E.throat - 2 && Math.abs(BALLOON.floor + BALLOON.rest) < 1e-9);
});

test('the burners: long burns lifting off, short bursts cruising, a flare before it sets down; 0..1, eased, never stuck on', () => {
  for (let i = 0; i < BURNS.length; i++) {
    const [a, b] = BURNS[i];
    assert.ok(b - a >= 1 && b - a <= 4.5, `burn ${i} is ${(b - a).toFixed(1)} s`);
    if (i) assert.ok(a - BURNS[i - 1][1] >= 0.8, `burns ${i - 1} and ${i} run together`);
  }
  let on = 0, prev = burnAt(0);
  for (let t = 0; t <= 90; t += 0.01) {
    const k = burnAt(t);
    assert.ok(k >= 0 && k <= 1);
    assert.ok(Math.abs(k - prev) <= 0.1, `the flame jumps at ${t.toFixed(2)}`);
    prev = k;
    if (t < 16 && k > 0.5) on += 0.01;
  }
  assert.ok(on >= 10, `only ${on.toFixed(1)} s of burning lifting off`);
  const cruise = BURNS.filter(([a]) => a > 18 && a < 70);
  assert.ok(cruise.length >= 4, 'it bursts now and then cruising');
  assert.ok(BURNS.some(([a, b]) => a > 80 && b <= 90), 'no flare before it sets down');
  assert.equal(burnAt(-1), 0); assert.equal(burnAt(200), 0);
  assert.equal(burnAt((BURNS[2][0] + BURNS[2][1]) / 2), 1);
});

// the crows' window walked as the ride runs it (rideStep at 1/60, the ride's own track): at each frame the balloon's
// place on its path (its holder: the runner poses it there, turned only about its upright axis) and each crow's offset
// from it and place in the world
function walkCrows(fn) {
  const r = ride('balloon'), track = makeRideTrack(r.events), o = {}, w = {}, p = {};
  let st = { s: 0, t: 0, v: 0 };
  while (!st.done) {
    st = rideStep(st, 1 / 60, r);
    const on = track.step({ s: st.s, dt: 1 / 60 }).active.get('crows');
    if (!on) continue;
    r.path.at(st.s, p);
    for (let i = 0; i < CROWS.count; i++) fn(i, crowOffset(r, on.t, i, o), placeCrow(r, st.s, on.t, i, w), p, st, on);
  }
}

test('the crows: five to seven crow-base, 3-4x, circling the canopy 3 m clear of the envelope (wingtip to fabric) and above the basket\'s rim, every frame', () => {
  assert.ok(CROWS.count >= 5 && CROWS.count <= 7);
  assert.ok(CROWS.scale >= 3 && CROWS.scale <= 4);
  assert.ok(Math.abs(CROWS.reach - CROWS.model.reach * CROWS.scale) < 1e-9);
  let nearest = Infinity, lowest = Infinity, frames = 0;
  walkCrows((i, o) => {
    if (!o.scale) return;
    frames++;
    const gap = envelopeGap(Math.hypot(o.along, o.side), o.up) - CROWS.reach;
    nearest = Math.min(nearest, gap);
    lowest = Math.min(lowest, o.up - BALLOON.rim);
    assert.ok(gap >= 3, `crow ${i} ${gap.toFixed(2)} m from the envelope`);
    assert.ok(o.up >= BALLOON.rim + 1, `crow ${i} ${(o.up - BALLOON.rim).toFixed(2)} m over the rim`);
  });
  assert.ok(frames > 1000);
  assert.ok(nearest < 6, `the crows never come nearer than ${nearest.toFixed(1)} m: they're not round the canopy`);
  assert.ok(lowest < 3.5, 'none swoops down past the basket');
});

test('the crows keep apart, fly on smoothly at a crow\'s pace (never hovering or backwards), and circle all round the balloon', () => {
  const at = Array.from({ length: CROWS.count }, () => ({}));
  const last = Array.from({ length: CROWS.count }, () => null), bearings = Array.from({ length: CROWS.count }, () => new Set());
  let prevS = null;
  walkCrows((i, o, w, p, st) => {
    Object.assign(at[i], o);
    if (i === CROWS.count - 1) {
      for (let a = 0; a < CROWS.count; a++) for (let b = a + 1; b < CROWS.count; b++) {
        const A = at[a], B = at[b];
        if (!A.scale || !B.scale) continue;
        const d = Math.hypot(A.along - B.along, A.side - B.side, A.up - B.up);
        assert.ok(d >= 2 * CROWS.reach + 1, `crows ${a} and ${b} ${d.toFixed(1)} m apart at ${st.s.toFixed(0)}`);
      }
    }
    if (w.visible && last[i]) {
      const v = Math.hypot(w.x - last[i].x, w.y - last[i].y, w.z - last[i].z) * 60;
      // at cruise (the window is within it): flying on, as a crow does, however it circles
      assert.ok(v >= 5 && v <= 32, `crow ${i} at ${v.toFixed(1)} m/s at ${st.s.toFixed(0)}`);
      // along the balloon's way at least a little (its heading is its way through the air: never flipping round)
      const fx = Math.sin(p.yaw), fz = Math.cos(p.yaw);
      assert.ok(((w.x - last[i].x) * fx + (w.z - last[i].z) * fz) * 60 >= 2, `crow ${i} goes back at ${st.s.toFixed(0)}`);
    }
    last[i] = w.visible ? { x: w.x, y: w.y, z: w.z } : null;
    if (o.scale === 1) bearings[i].add(Math.floor((Math.atan2(o.side, o.along) + Math.PI) / (Math.PI / 6)));
    prevS = st.s;
  });
  assert.ok(prevS > 0);
  for (let i = 0; i < CROWS.count; i++) assert.ok(bearings[i].size >= 12, `crow ${i} only goes ${bearings[i].size} of 12 ways round`);
});

test('the crows come in from far off and leave far off, within the balloon\'s cruise; two or more swoop past the basket ahead of the seat', () => {
  const r = ride('balloon'), [ev] = r.events, v = r.profile.v;
  assert.equal(ev.id, 'crows'); assert.equal(ev.actor, 'crows');
  assert.ok(ev.s0 >= v * r.profile.ease[0] / 2 && ev.s1 <= r.path.length - v * r.profile.ease[1] / 2, 'the crows are out of its cruise');
  let first = null, lastSeen = null;
  const swoops = new Set();
  walkCrows((i, o, w, p, st, on) => {
    const rho = Math.hypot(o.along, o.side);
    if (w.visible && first === null) first = rho;
    if (w.visible) lastSeen = rho;
    // past the basket: low, near and ahead of the seat (its right, front corner), each crow once at most
    if (o.up < 3 && rho < 12 && o.along > 0) swoops.add(i);
    if (on.t < 0.2) assert.ok(o.scale < 0.2, 'a crow pops in');
  });
  assert.ok(first > 60 && lastSeen > 60, `they come in from ${first?.toFixed(0)} m and leave at ${lastSeen?.toFixed(0)} m`);
  assert.ok(swoops.size >= 2, `only ${swoops.size} swoop past the basket`);
  // (the out-params filled in place)
  const o = {}, w = {};
  assert.equal(crowOffset(r, 20, 0, o), o);
  assert.equal(placeCrow(r, 500, 20, 0, w), w);
});

test('the balloon\'s showpieces: the crows round the canopy (heli) once they\'ve joined, and the balloon over the valley with the viaduct and the waterfall beyond (wide)', () => {
  const r = ride('balloon'), [ev] = r.events, by = Object.fromEntries(r.showpieces.map((p) => [p.id, p]));
  assert.deepEqual(Object.keys(by).sort(), ['canopy', 'falls']);
  const heli = by.canopy, wide = by.falls;
  assert.equal(heli.shot.kind, 'heli');
  // after the crows have joined (CROWS.join s at cruise), before they leave
  assert.ok(heli.s0 >= ev.s0 + CROWS.join * r.profile.v && heli.s1 <= ev.s1 - CROWS.leave * r.profile.v);
  // out past the crows' ring, so the whole canopy and the crows round it are in frame
  assert.ok(Math.abs(heli.shot.lateral) > 2 * CROWS.ring, `the heli ${heli.shot.lateral} m out, the crows ${CROWS.ring.toFixed(1)} m`);
  assert.equal(wide.shot.kind, 'wide');
  // its window over the valley: it covers the ride-s where the balloon's leg-s is at the viaduct's start
  const via = legSections('ocean-mountain').find((x) => x.kind === 'viaduct');
  let sVia = 0;
  for (let s = 0; s <= r.path.length; s += 1) if (rideLegS(r, s) <= via.s0) sVia = s;
  assert.ok(wide.s0 < sVia && wide.s1 > sVia, `the wide shot's window ${wide.s0}-${wide.s1} isn't over the viaduct (${sVia})`);
  // the camera stands behind it over the hill (cameras.js: 22 m over the path there), looking on over the balloon down
  // into the valley: the waterfall's head and the viaduct's middle both in frame (within the shot's half-width at 4:3)
  // wherever the balloon is in the window, and beyond it as the shot opens
  assert.ok(wide.shot.at < wide.s0);
  const valley = FEATURES.find((f) => f.kind === 'valley' && f.leg === 'ocean-mountain');
  const cam = r.path.offsetAt(wide.shot.at, wide.shot.lateral), vm = legRoute('ocean-mountain').at((via.s0 + via.s1) / 2);
  const half = Math.atan(Math.tan(wide.shot.fov / 2 * Math.PI / 180) * 4 / 3);
  const off = (p, b) => { const a = Math.atan2(p.x - cam.x, p.z - cam.z) - Math.atan2(b.x - cam.x, b.z - cam.z); return Math.abs(Math.atan2(Math.sin(a), Math.cos(a))); };
  const far = (p) => Math.hypot(p.x - cam.x, p.z - cam.z);
  for (let s = wide.s0; s <= wide.s1; s += 10) {
    const b = r.path.at(s), falls = { x: valley.x0, z: valley.z0 };
    assert.ok(off(falls, b) < half - 0.05 && off(vm, b) < half - 0.05, `the falls or the viaduct out of frame at ${s}`);
    if (s === wide.s0) assert.ok(far(falls) > far(b) + 100 && far(vm) > far(b) + 100, 'they are not beyond the balloon');
  }
  for (const sp of r.showpieces) assert.ok(sp.s0 >= 0 && sp.s1 <= r.path.length && !sp.actor);
});
