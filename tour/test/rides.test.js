// The rides as data (rides.js): one per leg, onward, each about 90 s along a path of its own that keeps off the land
// (or on it, the coach; on the sea, the boat), boarded from its departure station's walk and landing by the next
// place's arrival station, its progress mapped onto the leg. Pure, no three.js.
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import { RIDE_LEGS, RIDE_DT, ESCORT, formationOffsets, placeEscort, rideFor, rideStep, rideLegS, COACH_GRADE, COACH_COL, JET,
  OCTOPUS, OCTOPUS_ARMS, OCTOPUS_BODY, OCTOPUS_GIRTH, octopusPose, armJoints, swerveAt, placeOctopus,
  BALLOON, envelopeRadius, BURNS, burnAt, CROWS, crowOffset, placeCrow, rideLegEvents, JET_SHOTS, RIDE_LAND, rideLand, LOW_FLIGHT, lowFlight,
  FAR_TRAINS_FROM, placeFarTrains } from '../rides.js';
import { makeRideTrack } from '../ride-run.js';
import { legSections, FEATURES } from '../world-data.js';
import { onWalkway } from '../walk-world.js';
import { LEGS, PLACES, SEA_LEVEL, EXTRA_REACH, legRoute, laneOf, platformWindow, worldTerrain } from '../world-data.js';
import { stationWalk } from '../station-walk.js';
import { rocketPad, rocketStep, rocketAt } from '../actors/paths.js';
import { eventsFor, makeEventTrack } from '../events.js';
import { JET_PADS, ridePads, stationSpot } from '../world-data.js';
import { ROCKET_CUE, BUZZ, FOIL_RIG, foilsAt, noseUp, aimAt, STRIKE, UFO, ufoOffset, BOLT, bolts, boltAt, missileAt, BLAST, DEBRIS, blastOrigin, blastTime, debrisAt, fireballAt, ringAt, placeOnPath, fromHull, fromCraft, craftDistance } from '../rides/jet-plan.js';
import { scatter, VARIANTS } from '../scenery.js';
import { TOWERS, footprint, RIDE_VEHICLES } from './fixtures.js';
import { makeWalkWorld } from '../walk-world.js';
import { nearRide, RIDE_REACH } from '../ride-run.js';
import { BODY } from '../walk.js';
import { BENCH, ROAD, coachRoad, roadSurface } from '../world-data.js';
import { BED_HALF } from '../terrain.js';
import { CLEAR_LINE } from '../scenery.js';
import { GANG, GANG_SHOTS, COACH_FOOT, COACH_TEAM, RIDER_REACH, PUFF, placeRider, gangPlan, fromCoach, ARROWS, arrowPlan, arrowAt, rearAt, turnedAt } from '../rides/coach-plan.js';

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
  assert.deepEqual(rides.map((r) => r.name), ['speedboat', 'hot-air balloon', 'stagecoach', 'starfighter', 'flying car']);
  for (const r of rides) {
    assert.equal(r.from, LEGS[r.leg].from);
    assert.equal(r.to, LEGS[r.leg].to);
    assert.equal(rideFor(r.leg), r, 'memoised');
    // each its set piece: the boat's octopus, the balloon's crows, the coach's gang, the starfighter's UFO, the car's
    // escort (the starfighter's other events are the director's shots of its buzz and its strike, with no actor)
    const acted = r.events.filter((e) => e.actor);
    assert.equal(acted.length, 1);
    assert.equal(acted[0].actor, { boat: 'octopus', balloon: 'crows', coach: 'gang', jet: 'ufo', car: 'escort' }[r.id]);
    for (const e of r.events) if (!e.actor) assert.ok(e.shot, `${e.id}: neither an actor nor a shot`);
    assert.ok(r.showpieces.length >= 1);
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

test('rideStep fills the out it\'s given (the state itself, as the runner steps it: no new object a frame)', () => {
  const r = ride('jet'), st = { s: 0, t: 0, v: 0, done: false }, out = {};
  assert.equal(rideStep(st, 0.05, r, out), out);
  assert.deepEqual(out, rideStep(st, 0.05, r));
  const want = rideStep({ s: 0, t: 30 }, 1 / 30, r);
  const self = { s: 0, t: 30, v: 0, done: false };
  assert.equal(rideStep(self, 1 / 30, r, self), self);
  assert.deepEqual(self, want);
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

test('the starfighter flies round the rocket pad: its path comes within 2.2 km of the pad and passes all round it (bearing spans >= 300 degrees); fast and low, up to the rocket for its buzz', () => {
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
  // no ride rolls on wheels (the starfighter hovers up and down: its own test)
  for (const any of rides) assert.deepEqual(any.rolls, []);
  // fast: cruising at 750-800 km/h, low over the land (60-150 m up) once it's climbed out and till it comes down, but
  // for its climb to the rocket and back (up to 260 m)
  assert.ok(r.profile.v * 3.6 >= 750 && r.profile.v * 3.6 <= 800, `${(r.profile.v * 3.6).toFixed(0)} km/h`);
  along(r.path, 10, (p, s) => {
    if (s < 2500 || s > r.path.length - 2500) return;
    const up = p.y - ground(p.x, p.z), buzz = s > BUZZ.s - 2500 && s < BUZZ.s + 2000;
    assert.ok(up >= 60 && up <= (buzz ? 260 : 150), `the starfighter ${up.toFixed(0)} m up at ${s}`);
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

// ---- the vehicles are solid (walk-world.js vehicleBlocks), and each can still be walked up to and taken ----

// a vehicle standing at a ride's end (its holder there, facing along the path, as parkVehicle and the runner leave it)
const standingAt = (r, end, foot) => ({ foot, holder: { position: { x: r[end].x, z: r[end].z }, rotation: { y: r[end].yaw } } });
// a walk world where all the ground is walkable but the vehicle, to see what the vehicle alone shuts off
const openWorld = (vehicles) => makeWalkWorld({
  place: { blocked: () => null, onLand: () => true, groundAt: () => 1 }, termini: [], terrain: { heightAt: () => 1 }, seaLevel: 0, vehicles,
});

test('each waiting vehicle is solid over its footprint (the board, its own origin, is inside it), its pad round it open, and its nearest walkable point (measured in the page) within reach of the board and clear of it', () => {
  for (const r of rides) {
    const V = RIDE_VEHICLES[r.id], v = standingAt(r, 'board', V.foot), w = openWorld([v]);
    assert.equal(w.blocked(r.board.x, r.board.z, BODY), 'ride-vehicle', `the ${r.id}'s board is walkable`);
    // just inside each side of it, and 0.4 m past each (a body's 0.35 m clear)
    const f = V.foot, c = Math.cos(r.board.yaw), s = Math.sin(r.board.yaw);
    const world = (lx, lz) => ({ x: r.board.x + lx * c + lz * s, z: r.board.z - lx * s + lz * c });
    for (const [lx, lz] of [[f.min.x + 0.1, 0], [f.max.x - 0.1, 0], [0, f.min.z + 0.1], [0, f.max.z - 0.1]]) {
      const p = world(lx, lz);
      assert.equal(w.blocked(p.x, p.z, 0), 'ride-vehicle', `the ${r.id} is open at (${lx}, ${lz}) in its frame`);
    }
    for (const [lx, lz] of [[f.min.x - 0.4, 0], [f.max.x + 0.4, 0], [0, f.min.z - 0.4], [0, f.max.z + 0.4]]) {
      const p = world(lx, lz);
      assert.equal(w.blocked(p.x, p.z, BODY), null, `the ${r.id} is solid at (${lx}, ${lz}) in its frame, past its body`);
    }
    // the footprint leaves room to take it: it doesn't cover the whole reach
    assert.ok(Math.max(-f.min.x, f.max.x, -f.min.z, f.max.z) + BODY < RIDE_REACH, `the ${r.id}'s body reaches past the reach`);
    // where the page's walk comes nearest it (the coach's: the Alpine kit's land ends 5.5 m short of where it waits,
    // so this, not the test's footprint rectangle, is how near you get): within reach, and clear of its body
    const d = Math.hypot(V.walk.x - r.board.x, V.walk.z - r.board.z);
    assert.ok(d <= RIDE_REACH - 0.25, `the ${r.id} is ${d.toFixed(2)} m from the nearest walkable point, against a ${RIDE_REACH} m reach`);
    assert.ok(nearRide(V.walk, r), `the ${r.id} can't be taken from the nearest walkable point`);
    assert.equal(w.blocked(V.walk.x, V.walk.z, BODY), null, `the ${r.id}'s nearest walkable point is in its body`);
  }
});

test('you step off clear of the landed vehicle (the balloon, which turns slowly to its way, at any heading)', () => {
  for (const r of rides) {
    const f = RIDE_VEHICLES[r.id].foot;
    if (r.id === 'balloon') {
      const corner = Math.hypot(Math.max(-f.min.x, f.max.x), Math.max(-f.min.z, f.max.z));
      assert.ok(Math.hypot(r.step.x - r.land.x, r.step.z - r.land.z) > corner + BODY, 'the balloon may land on you');
      continue;
    }
    assert.equal(openWorld([standingAt(r, 'land', f)]).blocked(r.step.x, r.step.z, BODY), null, `the ${r.id} lands on where you step off`);
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
  // its line comes within reach (main.js RIDE_REACH, 6 m; held to 3.9 m here, well inside it) of where the boat waits, beside
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
    // far out as they come and go, still well over the land (the mountain's shoulder, as it leaves)
    if (w.visible) assert.ok(w.y - CROWS.reach - Math.max(SEA_LEVEL, ground(w.x, w.z)) >= 20, `crow ${i} near the land at ${st.s.toFixed(0)}`);
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

// ---- the stagecoach: its road on its bench, and its gang ----

// the coach's footprint (and its team's) where the coach is at ride-s s, for fromCoach
const coachFrame = (r, s) => { const p = r.path.at(s); return { x: p.x, z: p.z, sx: Math.sin(p.yaw), sz: Math.cos(p.yaw) }; };
// every frame of the ride at dt 1/60, as the runner takes it: fn(s, t, v)
function walkRide(r, fn) {
  let st = { s: 0, t: 0 };
  while (!st.done) { st = rideStep(st, 1 / 60, r); fn(st.s, st.t, st.v); }
}

test('the coach\'s road lies on a level bench cut into the land: under 5% across within 3 m of its centre, every metre of it', () => {
  const { line } = coachRoad();
  assert.ok(BENCH.half >= 3 && BENCH.half <= 4 && BENCH.blend >= 8 && BENCH.blend <= 10);
  let worst = 0, at = 0;
  for (let s = 0; s <= line.length; s += 1) {
    const c = line.offsetAt(s, 0), mid = ground(c.x, c.z);
    for (const d of [-3, -2, -1, 1, 2, 3]) {
      const o = line.offsetAt(s, d), f = Math.abs(ground(o.x, o.z) - mid) / Math.abs(d);
      if (f > worst) { worst = f; at = s; }
    }
  }
  assert.ok(worst < 0.05, `the road falls ${(worst * 100).toFixed(1)}% across at ${at}`);
  // and the coach's path is the road's, on the ground along its centre
  const r = ride('coach');
  assert.ok(Math.abs(r.path.length - line.length) < 2);
});

test('the coach\'s road keeps clear of the railway\'s formation and the trains\' swept path (its edges past the track bed)', () => {
  // (all of it as it's drawn: the coach's way and the road on past either end of it)
  const { pts } = coachRoad();
  assert.ok(pts.length > coachRoad().path.length);
  pts.forEach((c, k) => {
    for (const leg of Object.keys(LEGS)) {
      const n = nearestOn(leg, c.x, c.z);
      assert.ok(n.d - ROAD.half >= BED_HALF + 1, `the road's edge ${(n.d - ROAD.half).toFixed(1)} m from ${leg}'s line at its ${k}th sample`);
    }
  });
});

test('the coach\'s wheels and its team\'s hooves sit on the road: each within 0.15 m of the ground (no wheel or hoof sunk or floating), the wheels of the road as it\'s drawn too', () => {
  const r = ride('coach'), p = {}, T = COACH_TEAM;
  // its wheels' feet in its holder's frame (left, up, ahead), the path riding ride.rest over the ground; and its team's
  // hooves, carried rigid with it ahead of its front wheels (a sharp change in its climb would lift them off the ground
  // or sink them into it)
  const WHEELS = [[0.82, 1.31], [-0.82, 1.31], [0.82, -1.59], [-0.82, -1.59]];
  const HOOVES = [];
  for (const sx of [-1, 1]) for (const w of [-T.wide, T.wide]) for (const z of T.hooves) HOOVES.push([sx * T.x + w, z]);
  let worst = 0, worstDrawn = 0, at = 0, hoof = 0, hoofAt = 0;
  for (let s = 0; s <= r.path.length; s += 2) {
    r.path.at(s, p);
    const cy = Math.cos(p.yaw), sy = Math.sin(p.yaw), cp = Math.cos(p.pitch), sp = Math.sin(p.pitch);
    for (const [x, z] of WHEELS) {
      // as the runner poses it (YXZ, pitched up its climb): the foot's place in the world
      const y = -r.rest, yy = y * cp + z * sp, zz = -y * sp + z * cp;
      const wx = p.x + x * cy + zz * sy, wz = p.z - x * sy + zz * cy, wy = p.y + yy;
      const off = Math.abs(wy - ground(wx, wz)), drawn = Math.abs(wy - roadSurface(terrain, wx, wz));
      if (off > worst) { worst = off; at = s; }
      worstDrawn = Math.max(worstDrawn, drawn);
    }
    for (const [x, z] of HOOVES) {
      const y = -r.rest, yy = y * cp + z * sp, zz = -y * sp + z * cp;
      const wx = p.x + x * cy + zz * sy, wz = p.z - x * sy + zz * cy, off = Math.abs(p.y + yy - ground(wx, wz));
      if (off > hoof) { hoof = off; hoofAt = s; }
    }
  }
  assert.ok(hoof <= 0.15, `a hoof ${hoof.toFixed(2)} m off the ground at ${hoofAt}`);
  assert.ok(worst <= 0.15, `a wheel ${worst.toFixed(2)} m off the ground at ${at}`);
  // (the road is drawn ROAD.lift over the land, and over the drawn land's corners where they round a crease off: a wheel
  // may sit that little more into its surface)
  assert.ok(worstDrawn <= 0.15 + ROAD.lift, `a wheel ${worstDrawn.toFixed(2)} m off the road as it's drawn`);
});

test('the gang: five riders break from beside the road after the coach, up behind and alongside it, then in file over the col; never within 4 m of it, never on one another, at a horse\'s pace, clear of the railway', () => {
  const r = ride('coach'), o = {}, prev = [];
  assert.equal(GANG.count, 5);
  const [ev] = r.events;
  assert.deepEqual({ id: ev.id, actor: ev.actor, s0: ev.s0, s1: ev.s1 }, { id: 'gang', actor: 'gang', s0: GANG.s0, s1: GANG.s1 });
  const track = makeRideTrack(r.events);
  let nearest = Infinity, fastest = 0, jump = 0, alongside = 0, inFile = 0, firstMove = Infinity, lastStop = 0, rails = Infinity, overlap = null, astray = null;
  const byRoad = coachRoad().near;   // (where a point is by the road: { s along it, left, d } or null)
  let t0 = 0;
  walkRide(r, (s, t, v) => {
    const on = track.step({ s, dt: t - t0 }); t0 = t;
    if (!on.active.has('gang')) return;
    const c = coachFrame(r, s), pos = [];
    for (let i = 0; i < GANG.count; i++) {
      placeRider(r, s, i, o);
      pos.push({ ...o });
      if (!o.visible) { prev[i] = null; continue; }
      nearest = Math.min(nearest, fromCoach(c, o.x, o.z) - RIDER_REACH);
      const speed = o.pace * v;
      fastest = Math.max(fastest, speed);
      if (speed > 1 && s < firstMove) firstMove = s;
      if (o.stopped > 0 && o.stopped < 1) lastStop = Math.max(lastStop, s);
      if (prev[i]) jump = Math.max(jump, Math.hypot(o.x - prev[i].x, o.z - prev[i].z));
      prev[i] = { x: o.x, z: o.z };
      // beside the coach (level with its body, out in its lane), or behind it on the road
      const along = (o.x - c.x) * c.sx + (o.z - c.z) * c.sz;
      if (Math.abs(along) <= 4 && o.lane > 5) alongside++;
      if (Math.abs(o.lane) <= 1.5 && along < -6 && o.stopped === 0) inFile++;
      // on the road's bench, or in the gang's sweep beside it, where the scenery keeps clear for them (sampled)
      if (Math.round(s) % 10 === 0) {
        const n = byRoad(o.x, o.z), G = GANG.sweep;
        if (!n || !(n.d <= BENCH.half + 1 || (n.s >= G.a0 && n.s <= G.a1 && n.left >= 0 && n.left <= G.out))) astray ??= `rider ${i} at ${s.toFixed(0)}: ${n ? `${n.left.toFixed(1)} m out at ${n.s.toFixed(0)}` : 'far from the road'}`;
      }
      if (s > 150 && s < 700) for (const leg of Object.keys(LEGS)) {
        // (sampled: the riders' lanes run 30 m and more from the line)
        if (Math.round(s) % 25 === 0) rails = Math.min(rails, nearestOn(leg, o.x, o.z).d);
      }
    }
    // no two horses on one another: apart along each one's way (2.4 m long) or across it (0.9 m with its rider's legs)
    for (let i = 0; i < GANG.count; i++) for (let j = 0; j < GANG.count; j++) {
      if (i === j || !pos[i].visible || !pos[j].visible) continue;
      const dx = pos[j].x - pos[i].x, dz = pos[j].z - pos[i].z, sn = Math.sin(pos[i].yaw), cs = Math.cos(pos[i].yaw);
      const al = Math.abs(dx * sn + dz * cs), ac = Math.abs(dx * cs - dz * sn);
      if (al < 2.8 && ac < 1.3) overlap ??= `${i} and ${j} at ${s.toFixed(0)}: ${al.toFixed(1)} along, ${ac.toFixed(1)} across`;
    }
  });
  assert.ok(nearest >= GANG.clear, `a rider ${nearest.toFixed(2)} m from the coach`);
  assert.equal(overlap, null, overlap);
  assert.equal(astray, null, astray);
  assert.ok(fastest <= 21, `a rider at ${fastest.toFixed(1)} m/s`);
  assert.ok(jump <= 0.5, `a rider jumped ${jump.toFixed(2)} m in a frame`);
  assert.ok(alongside > 60 * 3, `riders alongside the coach for ${(alongside / 60).toFixed(1)} rider-seconds`);
  assert.ok(inFile > 60 * 5, `riders in file behind it for ${(inFile / 60).toFixed(1)} rider-seconds`);
  // the chase over ride-s ~200-650 (ruling R12): from their ambush to the last pulling up
  assert.ok(firstMove >= 200 && lastStop <= 680, `the chase runs ${firstMove.toFixed(0)}-${lastStop.toFixed(0)}`);
  assert.ok(rails >= CLEAR_LINE + 10, `a rider ${rails.toFixed(1)} m from a line`);
});

test('the gang fires and always misses: each puff of dust lands 6 m and more from the coach for all its life, clear of every rider, its line of fire clear of the coach', () => {
  const r = ride('coach'), { shots } = gangPlan(r), o = {}, q = {};
  assert.ok(shots.length >= 20, `${shots.length} shots`);
  assert.ok(new Set(shots.map((sh) => sh.rider)).size >= 3, 'three riders or more fire');
  assert.ok(shots.some((sh) => sh.ping) && shots.some((sh) => !sh.ping));
  assert.ok(gangPlan(r) === gangPlan(r), 'worked out once');
  // the coach's ride-s at each moment (the ride's own clock), to follow a puff's life
  const sAtT = [];
  walkRide(r, (s) => sAtT.push(s));
  const tOf = (s) => sAtT.findIndex((x) => x >= s);
  for (const sh of shots) {
    placeRider(r, sh.s, sh.rider, o);
    assert.ok(o.visible && o.pace > 0.5 && o.stopped === 0, `a shot at ${sh.s.toFixed(0)} by rider ${sh.rider} not riding`);
    // its life: the coach's ride-s each frame of it
    for (let k = tOf(sh.s); k < sAtT.length && k <= tOf(sh.s) + PUFF.life * 60; k++) {
      const s = sAtT[k], c = coachFrame(r, s);
      // (all its dust, PUFF.spread round where it lands, 6 m from the coach)
      assert.ok(PUFF.spread >= 1.5 && PUFF.life >= 2.5);
      assert.ok(fromCoach(c, sh.x, sh.z) - PUFF.spread >= 6, `a puff ${fromCoach(c, sh.x, sh.z).toFixed(1)} m from the coach at ${s.toFixed(0)}`);
      for (let i = 0; i < GANG.count; i++) {
        placeRider(r, s, i, q);
        if (q.visible) assert.ok(Math.hypot(q.x - sh.x, q.z - sh.z) - RIDER_REACH - PUFF.spread >= PUFF.riders, `a puff on rider ${i}`);
      }
    }
    // the line from the gun to where it lands passes the coach (its team too) 1.5 m wide at least
    const c = coachFrame(r, sh.s);
    for (let u = 0; u <= 1; u += 0.02) {
      assert.ok(fromCoach(c, o.x + (sh.x - o.x) * u, o.z + (sh.z - o.z) * u) >= 1.5, `a shot at ${sh.s.toFixed(0)} through the coach`);
    }
    // on the land, off the railway
    for (const leg of Object.keys(LEGS)) assert.ok(nearestOn(leg, sh.x, sh.z).d >= PUFF.rail);
  }
});

test('the gang falls back one by one and is gone (out of sight, over 400 m back) before the last 300 m of the ride', () => {
  const r = ride('coach'), o = {}, hidden = new Array(GANG.count).fill(null), stopped = [];
  assert.ok(GANG.s1 <= r.path.length - 300);
  walkRide(r, (s) => {
    const c = coachFrame(r, s);
    for (let i = 0; i < GANG.count; i++) {
      placeRider(r, s, i, o);
      if (o.stopped >= 1 && stopped[i] === undefined) stopped[i] = s;
      if (!o.visible) {
        if (hidden[i] === null) {
          hidden[i] = s;
          assert.ok(o.stopped >= 1 && Math.hypot(o.x - c.x, o.z - c.z) > GANG.gone, `rider ${i} vanished ${Math.hypot(o.x - c.x, o.z - c.z).toFixed(0)} m from the coach`);
        }
      } else assert.equal(hidden[i], null, `rider ${i} came back at ${s.toFixed(0)}`);
      if (s >= GANG.s1) assert.ok(!o.visible, `rider ${i} still there at ${s.toFixed(0)}`);
    }
  });
  // one by one: each pulls up at its own moment, some seconds apart
  const order = stopped.slice().sort((a, b) => a - b);
  for (let k = 1; k < order.length; k++) assert.ok(order[k] - order[k - 1] >= 20, 'two riders pulled up together');
  assert.ok(hidden.every((h) => h !== null && h <= GANG.s1));
});

test('the coach\'s showpieces: the chase from low ahead beside the road, and a heli out past the gang\'s lanes, over the chase', () => {
  const r = ride('coach'), by = Object.fromEntries(r.showpieces.map((p) => [p.id, p]));
  assert.deepEqual(Object.keys(by).sort(), ['arrows', 'gang-heli', 'gang-low']);
  assert.deepEqual(r.showpieces, GANG_SHOTS);
  const low = by['gang-low'], heli = by['gang-heli'];
  assert.equal(low.shot.kind, 'trackside');
  assert.ok(low.shot.height <= 2 && low.shot.at > low.s1 - 10 && low.shot.at <= low.s1 + 60, 'it stands ahead of the coach as it comes');
  // on the road's right, off the gang's lanes (its left), the land there within reach of the road's level
  assert.ok(low.shot.lateral < -(ROAD.half + 2) && low.shot.lateral > -10);
  const cam = r.path.offsetAt(low.shot.at, low.shot.lateral);
  assert.ok(Math.abs(ground(cam.x, cam.z) - cam.y) < 3);
  assert.equal(heli.shot.kind, 'heli');
  assert.ok(heli.shot.lateral >= 25, 'out past the gang\'s lanes (to 15 m)');
  for (const p of r.showpieces) assert.ok(p.s0 >= 200 && p.s1 <= 650 && !p.actor);
});

// ---- the starfighter: its pads and hover, its foils, the rocket buzz, the UFO and its end ----

test('the starfighter stands on its pads (within 0.15 m), the land under all of it no higher, and hovers up off its pad and down onto its apron (a few metres straight up and down, its nose a little up as it does)', () => {
  const r = ride('jet'), pads = ridePads(), L = r.path.length;
  assert.deepEqual(pads.map((p) => p.kind), ['jet stand', 'jet apron']);
  assert.equal(pads[0].y, PLACES.west.ground - 0.05);
  assert.ok(pads[1].y >= 1 && pads[1].y <= 1.2);
  // standing: its holder JET.rest over the pad (its model's foot on it), level, the land under its 7 m x 6.4 m no higher
  for (const s of [0, L]) {
    const p = r.path.at(s), c = Math.cos(p.yaw), sn = Math.sin(p.yaw), fx = Math.sin(p.yaw), fz = Math.cos(p.yaw), foot = p.y - JET.rest;
    assert.ok(Math.abs(foot - ground(p.x, p.z)) <= 0.15, `standing ${(foot - ground(p.x, p.z)).toFixed(2)} m off its pad at ${s}`);
    assert.equal(noseUp(s, L), 0);
    for (let x = -3.3; x <= 3.31; x += 0.55) for (let z = -3.5; z <= 3.51; z += 0.5) {
      const g = ground(p.x + c * x + fx * z, p.z - sn * x + fz * z);
      assert.ok(Math.abs(g - foot) <= 0.15, `the land ${(g - foot).toFixed(2)} m off its foot under it at ${s} (${x.toFixed(1)}, ${z.toFixed(1)})`);
    }
  }
  // its hover: 3 m up within 8 m of its pad's spot, going up, and coming down to its apron the same way
  const B = r.path.at(0), E = r.path.at(L);
  for (const [from, sgn] of [[B, 1], [E, -1]]) {
    let risen = false;
    for (let d = 0; d <= 60; d += 0.5) {
      const p = r.path.at(sgn > 0 ? d : L - d), h = Math.hypot(p.x - from.x, p.z - from.z);
      if (p.y - from.y >= 3) { risen = true; assert.ok(h <= 8, `${h.toFixed(1)} m across by 3 m up`); break; }
    }
    assert.ok(risen, 'no hover');
  }
  for (const s of [8, 20, L - 20, L - 8]) assert.ok(noseUp(s, L) >= 2 * Math.PI / 180 && noseUp(s, L) <= 5 * Math.PI / 180);
  assert.equal(noseUp(400, L), 0);
  // the pads in their platforms' frames: by the Wild West's departure platform 17 m out; the apron 45 m out on the far
  // side of the Futuristic place's arrival platform, where it sets down 40 m in
  const P = JET_PADS;
  assert.ok(P.stand.out[0] <= 17 - 6 && P.stand.out[1] >= 17 + 6 && P.stand.inn[0] >= 35 + 8 && P.stand.inn[1] <= 35 - 8);
  assert.ok(Math.max(...P.apron.out) >= -45 + 8 && Math.min(...P.apron.out) <= -45 - 8 && P.apron.inn[0] <= 40 - 8 && P.apron.inn[1] >= 40 + 8);
  const to = stationSpot('future', 'arrival')(40, -45);
  assert.ok(Math.hypot(r.land.x - to.x, r.land.z - to.z) < 1, 'it sets down 40 m in, 45 m out');
});

test('nothing of the scenery stands under the starfighter where it flies low: no part reaching within its half-span and a metre of its path wherever it is under 30 m up (the oak on short final)', () => {
  const r = ride('jet'), low = lowFlight(r);
  assert.ok(low.length > 20);
  const chunks = new Set(low.map((q) => `${Math.floor(q.x / 256)},${Math.floor(q.z / 256)}`));
  let seen = 0;
  for (const key of chunks) {
    const [i, j] = key.split(',').map(Number);
    for (const q of scatter(i, j, 256, terrain)) {
      seen++;
      const reach = VARIANTS[q.v].r;
      for (const p of low) assert.ok(Math.hypot(q.x - p.x, q.z - p.z) >= LOW_FLIGHT.reach + 1 + reach, `a ${q.key} under its low flight at (${q.x.toFixed(0)}, ${q.z.toFixed(0)})`);
    }
  }
  assert.ok(seen > 0, 'no scenery about its low flight at all');
});

test('its X-foils open for the fight and close again, closed on its pads; its swing onto the saucer comes and goes within the strike', () => {
  const r = ride('jet'), L = r.path.length, a = {};
  assert.equal(foilsAt(0), 0); assert.equal(foilsAt(L), 0);
  for (const b of bolts()) assert.equal(foilsAt(b.s), 1, `foils not open when the UFO fires at ${b.s}`);
  assert.equal(foilsAt(STRIKE.launch), 1);
  assert.equal(FOIL_RIG.length, 4);
  aimAt(STRIKE.turn[0] - 1, a); assert.ok(a.yaw === 0);
  aimAt(STRIKE.back[1] + 1, a); assert.ok(a.yaw === 0);
});

test('the rocket lifts off as the starfighter runs in, straight ahead of it; it buzzes the rocket 12-15 s into its flight (120-300 m up), passing 60-120 m from its body and never near its plume, then wheels round it as it climbs (its bearing from the pad sweeping >= 270 degrees over the rocket\'s 5-45 s), within 2.2 km of it', () => {
  const r = ride('jet'), pad = rocketPad(legRoute('west-future')), g = ground(pad.x, pad.z), R = {};
  const legDefs = eventsFor('west-future', 'out').filter((e) => e.always);
  const defs = rideLegEvents(r, legDefs), rocket = defs.find((e) => e.id === 'rocket');
  // (a train's rocket is untouched: it lifts off as the train enters its window)
  assert.equal(legDefs.find((e) => e.id === 'rocket').s0, 1900);
  assert.equal(r.cues.rocket, ROCKET_CUE);
  assert.ok(Math.abs(rocket.s0 - rideLegS(r, ROCKET_CUE)) < 1e-9);
  const track = makeEventTrack(defs), dt = 1 / 60;
  let st = { s: 0, t: 0 }, rk = null, sum = 0, last = null, near = 0, launched = null, pass = { d: Infinity }, plume = Infinity;
  while (!st.done) {
    st = rideStep(st, dt, r);
    const on = track.step({ legS: rideLegS(r, st.s), dt }).active.get('rocket') ?? null;
    rk = rocketStep(rk, { here: true, on: !!on, dt });
    const p = r.path.at(st.s);
    if (rk.launch) {
      launched = st;
      const off = Math.atan2(Math.sin(Math.atan2(pad.x - p.x, pad.z - p.z) - p.yaw), Math.cos(Math.atan2(pad.x - p.x, pad.z - p.z) - p.yaw));
      assert.ok(Math.abs(off) <= 10 * Math.PI / 180, `the pad ${(off * 180 / Math.PI).toFixed(0)} degrees off the nose at lift-off`);
      assert.ok(Math.abs(st.s - ROCKET_CUE) < 10, `lifting off at ride-s ${st.s.toFixed(0)}`);
    }
    if (rk.t !== null && rk.t <= 60) {
      // the rocket: its body from its engine (1.5 m over its pad's top, the pad on the ground) 40 m up its axis, pitched
      // over east; its plume 30 m down from its engine, and its glow round that
      rocketAt(rk.t, R);
      const ex = pad.x + R.east, ey = g + 1.5 + R.up, ax = Math.sin(R.pitch), ay = Math.cos(R.pitch);
      const toSeg = (x0, y0, x1, y1) => { const dx = x1 - x0, dy = y1 - y0, u = Math.max(0, Math.min(1, ((p.x - x0) * dx + (p.y - y0) * dy) / (dx * dx + dy * dy))); return Math.hypot(p.x - x0 - u * dx, p.y - y0 - u * dy, p.z - pad.z); };
      const body = toSeg(ex, ey, ex + ax * 40, ey + ay * 40) - 1.85, fire = toSeg(ex, ey, ex - ax * 30, ey - ay * 30) - 3;
      if (body < pass.d) pass = { d: body, t: rk.t, up: R.up, s: st.s };
      plume = Math.min(plume, fire);
    }
    if (rk.t !== null && rk.t >= 5 && rk.t <= 45) {
      const b = Math.atan2(p.z - pad.z, p.x - pad.x);
      if (last !== null) sum += Math.atan2(Math.sin(b - last), Math.cos(b - last));
      last = b;
      if (Math.hypot(p.x - pad.x, p.z - pad.z) <= 2200) near += dt;
    }
  }
  assert.ok(launched, 'the rocket never lifted off');
  assert.ok(pass.t >= 12 && pass.t <= 15, `buzzing it ${pass.t.toFixed(1)} s into its flight`);
  assert.ok(pass.up >= 120 && pass.up <= 300, `the rocket ${pass.up.toFixed(0)} m up as it's buzzed`);
  assert.ok(pass.d >= 60 && pass.d <= 120, `passing ${pass.d.toFixed(0)} m from its body`);
  assert.ok(Math.abs(pass.s - BUZZ.s) < 60, `the buzz at ride-s ${pass.s.toFixed(0)}, not BUZZ.s`);
  assert.ok(plume >= 60, `${plume.toFixed(0)} m from its plume`);
  assert.ok(Math.abs(sum) * 180 / Math.PI >= 270, `its bearing swept ${(Math.abs(sum) * 180 / Math.PI).toFixed(0)} degrees`);
  assert.ok(near >= 25, `only ${near.toFixed(0)} s within 2.2 km of the pad as it climbed`);
});

test('the UFO paces the starfighter after it has wheeled round the rocket, never within 20 m of it (rim to hull), well over the land', () => {
  const r = ride('jet'), pad = rocketPad(legRoute('west-future')), o = {}, w = {};
  const ev = r.events.find((e) => e.id === 'ufo');
  assert.ok(ev && ev.actor === 'ufo' && ev.s0 === UFO.s0 && ev.s1 === UFO.s1);
  assert.equal(ev.shot.kind, 'heli');
  assert.ok(ev.shot.lateral > 0, 'the heli on the starfighter\'s left, the saucer beyond it on its right');
  const at0 = r.path.at(UFO.s0), b0 = (Math.atan2(at0.z - pad.z, at0.x - pad.x) * 180 / Math.PI + 360) % 360;
  assert.ok(UFO.s0 > BUZZ.s + 1500 && b0 > 180, `the UFO comes at bearing ${b0.toFixed(0)}`);
  let st = { s: 0, t: 0 };
  while (st.s < STRIKE.hit) { st = rideStep(st, 1 / 60, r); if (st.s >= UFO.s0) assert.ok(Math.abs(st.v - r.profile.v) < 1e-6, 'the UFO comes while it cruises'); }
  for (let s = UFO.s0 - 50; s <= STRIKE.hit + 50; s += 1) {
    ufoOffset(s, o);
    assert.equal(o.visible, s >= UFO.s0 && s < STRIKE.hit);
    if (!o.visible) continue;
    placeOnPath(r, s, o, w);
    const jet = r.path.at(s);
    assert.ok(fromHull(jet, w.x, w.y, w.z) - UFO.radius >= 20, `the UFO ${(fromHull(jet, w.x, w.y, w.z) - UFO.radius).toFixed(1)} m from it at ${s}`);
    assert.ok(w.y - ground(w.x, w.z) >= 40, `the UFO ${(w.y - ground(w.x, w.z)).toFixed(0)} m over the land at ${s}`);
    if (s >= UFO.s0 + UFO.arrive && s <= STRIKE.pull[0]) assert.ok(o.along >= 0 && o.along <= 115 && o.side <= -40 && o.side >= -65 && o.up >= 8 && o.up <= 25);
  }
});

test('the UFO\'s laser bolts always miss, close: each one, all along its streak and all its flight, 3-6 m from the starfighter itself (its body and foils), never touching it, and well over the land', () => {
  const r = ride('jet'), B = bolts(), b = boltAt(B[0], 0, 1), w = {}, q = {}, v = r.profile.v;
  assert.ok(B.length >= 8);
  for (const bolt of B) {
    assert.ok(bolt.s >= UFO.s0 + UFO.arrive && bolt.s + (BOLT.reach / BOLT.speed) * v <= STRIKE.pull[0], 'a bolt fired before the UFO is alongside, or after it pulls out');
    let nearest = Infinity;
    for (let s = bolt.s; s <= bolt.s + (BOLT.reach / BOLT.speed) * v + 1; s += 0.25) {
      boltAt(bolt, s, v, b);
      if (!b.alive) continue;
      const jet = r.path.at(s);
      const n = Math.ceil(Math.hypot(b.head.along - b.tail.along, b.head.side - b.tail.side, b.head.up - b.tail.up) / 0.5);
      for (let k = 0; k <= n; k++) {
        const f = n ? k / n : 0;
        q.along = b.tail.along + (b.head.along - b.tail.along) * f; q.side = b.tail.side + (b.head.side - b.tail.side) * f; q.up = b.tail.up + (b.head.up - b.tail.up) * f;
        placeOnPath(r, s, q, w);
        nearest = Math.min(nearest, fromCraft(jet, w.x, w.y, w.z));
        assert.ok(w.y - ground(w.x, w.z) >= 15, `a bolt ${(w.y - ground(w.x, w.z)).toFixed(0)} m over the land`);
      }
    }
    assert.ok(nearest >= 3 && nearest <= 6, `a bolt (fired at ${bolt.s}) came ${nearest.toFixed(2)} m from the starfighter`);
  }
  // its shape: about the size of the model (7 m long, 6.4 m across its foils, its body 1.9 m across)
  assert.equal(craftDistance(0, 0, 0), 0);
  assert.ok(craftDistance(3.5, 0, -1) < 0.5 && craftDistance(0, 0, 3.6) < 0.5 && craftDistance(0, 0, -3.6) < 0.5);
  assert.ok(craftDistance(0, 2, 2.5) > 0.5 && craftDistance(5, 0, -1) > 1);
});

test('the strike: the starfighter swings onto the saucer, its heading at the launch on it within 3 degrees; its missile drops clear of it and flies into the saucer (within its radius at the hit); the blast\'s fireball, ring and every piece keep 25 m from it, and are all over before it comes down to land', () => {
  const r = ride('jet'), a = {}, m = { visible: false }, w = {}, u = {}, v = r.profile.v, o = blastOrigin(r), D = {}, F = {}, RG = {};
  // its heading at the launch: its path's, turned by aimAt
  aimAt(STRIKE.launch, a);
  const p = r.path.at(STRIKE.launch), yaw = p.yaw + a.yaw, pitch = p.pitch + a.pitch;
  ufoOffset(STRIKE.launch, u); placeOnPath(r, STRIKE.launch, u, w);
  const dx = w.x - p.x, dy = w.y - p.y, dz = w.z - p.z, n = Math.hypot(dx, dy, dz);
  const cos = (Math.sin(yaw) * Math.cos(pitch) * dx + Math.sin(pitch) * dy + Math.cos(yaw) * Math.cos(pitch) * dz) / n;
  assert.ok(Math.acos(Math.min(1, cos)) * 180 / Math.PI <= 3, `pointing ${(Math.acos(cos) * 180 / Math.PI).toFixed(1)} degrees off the saucer`);
  assert.ok(Math.abs(a.yaw) >= 10 * Math.PI / 180, 'hardly a swing');
  // the missile: under it at the launch, falling clear, lit, and at the saucer at the hit
  missileAt(STRIKE.launch - 1, v, m); assert.ok(!m.visible);
  missileAt(STRIKE.launch, v, m); assert.ok(m.visible && !m.lit && m.up < -1);
  for (let s = STRIKE.launch; s < STRIKE.hit; s += 1) {
    missileAt(s, v, m);
    const c = r.path.at(s); placeOnPath(r, s, m, w);
    if (s > STRIKE.launch + STRIKE.drop) assert.ok(m.lit);
    // (never into the craft: clear of its body as it falls away)
    assert.ok(fromCraft(c, w.x, w.y, w.z) >= 0.3, `the missile ${fromCraft(c, w.x, w.y, w.z).toFixed(2)} m from it at ${s}`);
  }
  missileAt(STRIKE.hit - 0.5, v, m); placeOnPath(r, STRIKE.hit - 0.5, m, w);
  ufoOffset(STRIKE.hit - 0.5, u); const uw = placeOnPath(r, STRIKE.hit - 0.5, u, {});
  assert.ok(Math.hypot(w.x - uw.x, w.y - uw.y, w.z - uw.z) <= UFO.radius, 'the missile misses');
  missileAt(STRIKE.hit, v, m); assert.ok(!m.visible);
  // the blast: from the hit to its end, nothing of it within 25 m of the craft, nothing under the land, and over before
  // it comes down (from 2.5 km out) to land
  const end = STRIKE.hit + BLAST.life * v;
  assert.ok(end <= r.path.length - 1400, 'the blast not over before its landing');
  for (let s = STRIKE.hit; s <= end; s += 2) {
    const t = blastTime(r, s), c = r.path.at(s);
    for (let i = 0; i < DEBRIS.count; i++) {
      debrisAt(o, v, i, t, D);
      if (D.scale <= 0) continue;
      // (a piece reaches 8 m from its middle at most, its rest place in the saucer 8 m from the saucer's middle)
      assert.ok(fromHull(c, D.x, D.y, D.z) - 16 >= 25, `piece ${i} ${(fromHull(c, D.x, D.y, D.z) - 16).toFixed(0)} m from it at ${s}`);
      assert.ok(D.y - ground(D.x, D.z) >= 0, `piece ${i} under the land at ${s}`);
    }
    fireballAt(o, v, t, F);
    if (F.a > 0) assert.ok(fromHull(c, F.x, F.y, F.z) - F.r * 1.3 >= 25, `the fireball ${(fromHull(c, F.x, F.y, F.z) - F.r * 1.3).toFixed(0)} m from it at ${s}`);
    ringAt(t, RG);
    if (RG.a > 0) assert.ok(fromHull(c, o.x, o.y, o.z) - RG.r >= 25, 'the shock ring sweeps it');
  }
  debrisAt(o, v, 0, BLAST.life, D); assert.equal(D.scale, 0);
  // its chase shot over the strike
  const ev = r.events.find((e) => e.id === 'strike');
  assert.ok(ev && ev.shot.kind === 'chase' && !ev.actor && ev.s0 <= STRIKE.turn[0] && ev.s1 >= STRIKE.hit);
});

test('the starfighter\'s showpieces: the lift-off from behind as it runs in; its buzz from outside (an event\'s wide shot at the pass, from its other side); swinging out to wheel round the rocket, wide from its side away from the pad', () => {
  const r = ride('jet'), pad = rocketPad(legRoute('west-future'));
  assert.deepEqual(r.showpieces, JET_SHOTS);
  const launch = r.showpieces.find((p) => p.id === 'rocket-launch');
  assert.equal(launch.shot.kind, 'chase');
  assert.ok(launch.s0 <= ROCKET_CUE && launch.s1 > ROCKET_CUE + 5 * r.profile.v, 'the chase not over the lift-off');
  for (let s = ROCKET_CUE; s <= launch.s1; s += 50) {
    const p = r.path.at(s), off = Math.atan2(Math.sin(Math.atan2(pad.x - p.x, pad.z - p.z) - p.yaw), Math.cos(Math.atan2(pad.x - p.x, pad.z - p.z) - p.yaw));
    assert.ok(Math.abs(off) <= 30 * Math.PI / 180, `the pad ${(off * 180 / Math.PI).toFixed(0)} degrees off its nose at ${s}: out of the chase`);
  }
  const buzz = r.events.find((e) => e.id === 'rocket-pass');
  assert.ok(buzz && !buzz.actor && buzz.shot.kind === 'wide' && buzz.shot.at === BUZZ.s && buzz.shot.lateral > 0, 'the buzz from the side away from the rocket');
  assert.ok(buzz.s0 < BUZZ.s && buzz.s1 > BUZZ.s);
  const wide = r.showpieces.find((p) => p.id === 'rocket-circle');
  assert.equal(wide.shot.kind, 'wide');
  assert.ok(wide.shot.lateral >= 200, 'out past it, the pad beyond it');
  for (let s = wide.s0; s <= wide.s1; s += 50) {
    const p = r.path.at(s), d = Math.hypot(p.x - pad.x, p.z - pad.z), cam = r.path.offsetAt(s, wide.shot.lateral);
    assert.ok(d <= 2200, `${d.toFixed(0)} m from the pad in its window at ${s}`);
    assert.ok(Math.hypot(cam.x - pad.x, cam.z - pad.z) > d + 40, 'the camera is not on its side away from the pad');
  }
  assert.ok(wide.s1 - wide.s0 >= 5 * r.profile.v && wide.s1 <= UFO.s0 && wide.s0 > BUZZ.s + 500);
});

test('the land while riding: a slow ride\'s as a train\'s; the jet\'s asked for ahead of it, coarse all round first, mid below it, its landing within the mid some seconds before it gets there', () => {
  for (const r of rides) if (r.id !== 'jet') assert.ok(r.profile.v <= RIDE_LAND.slow, `the ${r.name} is fast`);
  const r = ride('jet'), o = {};
  assert.ok(r.profile.v > RIDE_LAND.slow);
  // rolling to take off: round it, as for a train
  rideLand(r, 30, 20, o);
  const at = r.path.at(30);
  assert.ok(Math.hypot(o.x - at.x, o.z - at.z) < 1e-6);
  assert.deepEqual({ fine: o.fine, mid: o.mid, corridor: o.corridor, coarseFirst: o.coarseFirst, every: o.every }, { fine: 700, mid: 1500, corridor: true, coarseFirst: 0, every: 16 });
  // under way: ahead of it, mid out to cover the land under it, coarse first
  rideLand(r, 5000, r.profile.v, o);
  const ahead = r.path.at(5000 + r.profile.v * RIDE_LAND.lead);
  assert.ok(Math.hypot(o.x - ahead.x, o.z - ahead.z) < 1e-6 && o.fine === 0 && o.mid === RIDE_LAND.mid && !o.corridor && o.coarseFirst === RIDE_LAND.first);
  assert.ok(RIDE_LAND.mid >= r.profile.v * RIDE_LAND.lead + 256, 'the land under it not within the mid detail');
  // its landing (the apron, 150 m round where it stops) within the mid detail asked for some seconds before it stops
  let st = { s: 0, t: 0 }, from = null;
  const end = r.path.at(r.path.length);
  while (!st.done) {
    st = rideStep(st, 1 / 30, r);
    rideLand(r, st.s, st.v, o);
    if (from === null && st.s > r.path.length / 2 && Math.hypot(o.x - end.x, o.z - end.z) + 150 <= o.mid) from = st.t;
  }
  assert.ok(from !== null && r.duration - from >= 10, `its landing within the land asked for only ${(r.duration - from).toFixed(1)} s before it stops`);
});

// ---- the starfighter's kit, read from its source (three.js isn't in Node: as main-wiring.test.js reads main.js) ----

test('a kept starfighter kit is ridden again whole: the UFO\'s pieces put back and shown when it\'s let go; its blast pools made at a standstill and burst with no new arrays; the craft parked with its plumes out and its nozzles at rest', () => {
  const ufo = readFileSync(new URL('../rides/ufo.js', import.meta.url), 'utf8'), jet = readFileSync(new URL('../rides/jet.js', import.meta.url), 'utf8');
  // the saucer whole again: reset() puts every piece back, shown (the blast's end hides them), and hide() calls it
  const reset = ufo.match(/const reset = \(\) => \{[\s\S]*?\n {2}\};/);
  assert.ok(reset, 'no reset()');
  assert.match(reset[0], /for \(const pc of sc\.pieces\) \{[^}]*pc\.position\.copy\(pc\.userData\.rest\)[^}]*pc\.visible = true;/);
  assert.match(reset[0], /sc\.lights\.visible = true; sc\.glow\.visible = true;/);
  assert.match(ufo.match(/const hide = \(\) => \{[\s\S]*?\n {2}\};/)[0], /if \(struck\) reset\(\);/);
  // a standstill after the missile's load, before the blast's sprites and pools
  const afterMissile = ufo.slice(ufo.indexOf('await cdnPart(MISSILE'), ufo.indexOf('makeSpray('));
  assert.match(afterMissile, /await still\(\);/);
  // no array made as it bursts
  for (const call of ufo.match(/\.burst\([^)]*\)/g)) assert.ok(!/\[/.test(call), `${call} makes arrays`);
  // parked (not ridden: the page's idle frames), no hover, no thrust: nozzles at rest, plumes out
  assert.match(jet, /const hover = riding \? [^;]+ : 0;/);
  assert.match(jet, /thrust = riding \? [^;]+ : 0;/);
  assert.match(jet, /plumeMat\.opacity = thrust \* /);
  assert.match(jet, /nozzles\[i\]\.rotation\.x = NOZZLE\.down \* DEG \* hover;/);
});

test('the far place\'s trains are put at their platforms past a third of the way along the leg, only while neither is in view', () => {
  let asked = 0;
  const seen = (v) => () => { asked++; return v; };
  assert.equal(placeFarTrains(100, 2000, seen(false)), false, 'too soon');
  assert.equal(asked, 0, 'not looked for till a third of the way along');
  assert.equal(placeFarTrains(700, 2000, seen(true)), false, 'in view');
  assert.equal(placeFarTrains(700, 2000, seen(false)), true);
  assert.equal(placeFarTrains(1990, 2000, seen(true)), false, 'in view to the end: left for the landing');
  assert.equal(FAR_TRAINS_FROM, 1 / 3);
});

// owner, 2026-11-22: why the gang give up the chase: a volley of arrows lands in the road in front of each rider as it
// pulls up, its horse rearing, and it turns away
test('the arrows: a volley lands just ahead of each rider as it begins to pull up, clear of it, the others and the coach', () => {
  const r = ride('coach'), { arrows } = arrowPlan(r), o = {}, q = {}, c = {}, a = {};
  assert.ok(arrows.length >= GANG.count * ARROWS.per - 2, `${arrows.length} arrows`);
  for (let i = 0; i < GANG.count; i++) {
    const mine = arrows.filter((x) => x.rider === i);
    assert.ok(mine.length >= ARROWS.per - 1, `rider ${i}: ${mine.length} arrows`);
    for (const x of mine) {
      assert.ok(x.sLoose < x.sLand);
      placeRider(r, x.sLand, i, o);
      // in front of it (along its way), a few metres
      const dx = x.to.x - o.x, dz = x.to.z - o.z, along = dx * Math.sin(o.yaw) + dz * Math.cos(o.yaw);
      assert.ok(along >= ARROWS.near - 0.5 && along <= ARROWS.lead[1] + 0.5, `rider ${i}: ${along.toFixed(1)} m ahead`);
      // clear of every rider and of the coach where it lands
      for (let j = 0; j < GANG.count; j++) { placeRider(r, x.sLand, j, q); assert.ok(Math.hypot(q.x - x.to.x, q.z - x.to.z) > ARROWS.clear, `rider ${j} under rider ${i}'s arrow`); }
      const p = r.path.at(x.sLand);
      assert.ok(fromCoach({ x: p.x, z: p.z, sx: Math.sin(p.yaw), sz: Math.cos(p.yaw) }, x.to.x, x.to.z) > ARROWS.coach, `rider ${i}'s arrow by the coach`);
      // from well off the road, arcing up and coming down where it lands
      assert.ok(Math.hypot(x.to.x - x.from.x, x.to.z - x.from.z) > 40);
      arrowAt(x, (x.sLoose + x.sLand) / 2, 10, 5, a);
      assert.ok(a.flying && a.y > 10 + ARROWS.apex * 0.9 - 3);
      arrowAt(x, x.sLand + 1, 10, 5, a);
      assert.ok(a.landed && a.y === 5 && a.dy < 0, 'stuck where it came down, pointing down');
    }
    // its horse rears as they land, and after it has pulled up it turns away
    const land = mine[0].sLand;
    assert.equal(rearAt(i, land - 1), 0);
    assert.ok(rearAt(i, land + 6) > 0.4);
    assert.equal(rearAt(i, land + 40), 0);
    assert.ok(turnedAt(i, land + 300) > 0.99 && turnedAt(i, land) === 0);
  }
  assert.ok(GANG_SHOTS.some((x) => x.id === 'arrows' && x.shot.look !== undefined));
});
