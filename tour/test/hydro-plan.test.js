// The hydroplanes' course and race along the Seaside Excursion's coast (actors/hydro-plan.js; owner, 2026-11-23).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { legRoute, worldTerrain, SEA_LEVEL } from '../world-data.js';
import { rideFor, rideLegS } from '../rides.js';
import { EVENTS } from '../events.js';
import { shoreTable, herdPath } from '../actors/paths.js';
import { HYDRO, hydroCourse, raceStep, duelGap } from '../actors/hydro-plan.js';

const route = legRoute('city-ocean'), ground = (x, z) => worldTerrain().heightAt(x, z);
const shore = shoreTable(route, ground, 1, 0, route.length, { step: 10 });
const course = hydroCourse(route, shore, 1);
// each boat's place round the lap, every quarter second, either side of the course's middle
const places = [];
{
  const o = {};
  for (let t = 0; t < course.lap; t += 0.25) for (const off of [-HYDRO.sub, HYDRO.sub]) { course.at(t, off, o); places.push({ x: o.x, z: o.z, v: o.v }); }
}

test('the course runs the length of the coast, over water at least 4 m deep all round', () => {
  assert.ok(HYDRO.s1 - HYDRO.s0 >= 1300, 'from near the City to near Oceanside');
  assert.ok(course.length > 2 * (HYDRO.s1 - HYDRO.s0));
  for (const p of places) assert.ok(SEA_LEVEL - ground(p.x, p.z) >= 4, `${p.x.toFixed(0)}, ${p.z.toFixed(0)}: ${(SEA_LEVEL - ground(p.x, p.z)).toFixed(1)} m deep`);
});

test('flat out on the straights, slowed for the turns, a lap in about a minute', () => {
  const vs = places.map((p) => p.v);
  assert.ok(Math.max(...vs) >= HYDRO.top - 0.01);
  assert.ok(Math.min(...vs) >= 15 && Math.min(...vs) < 30, `${Math.min(...vs)} m/s round the turns`);
  assert.ok(course.lap > 50 && course.lap < 100, `${course.lap} s`);
});

test("the course keeps clear of the speedboat's way, the fishing boat's loop and the cliffs' shot", () => {
  const boat = rideFor('city-ocean'), P = {};
  for (let s = 0; s <= boat.path.length; s += 4) {
    boat.path.at(s, P);
    for (const p of places) assert.ok(Math.hypot(p.x - P.x, p.z - P.z) > 30, `the speedboat at ride-s ${s}`);
  }
  // the fishing boat's loop: 150 m off the waterline at 1500, 22 m either side of that (actors/coast.js)
  herdPath(route, 1500, 1, shore(1500) + 150 - 22, P);
  for (const p of places) assert.ok(Math.hypot(p.x - P.x, p.z - P.z) > 25, 'the fishing boat');
  const cliffs = EVENTS['city-ocean'].find((e) => e.id === 'cliffs').shot;
  herdPath(route, cliffs.at, 1, cliffs.lateral, P);
  for (const p of places) assert.ok(Math.hypot(p.x - P.x, p.z - P.z) > 15, "the cliffs' shot's camera");
});

test('timed to you going out: the leader comes past at the pass, on the train or the speedboat', () => {
  const o = {};
  const go = (tau0, { ride, from, vmax, acc }) => {
    const st = { tau: tau0, t: 0 }, pass = ride ? HYDRO.pass.ride : HYDRO.pass.train;
    let s = from, v = 0, k = [Infinity, -Infinity];
    for (let i = 0; i < 120 * 30; i++) {
      const dt = 1 / 30;
      v = Math.min(vmax, v + acc * dt); s += v * dt;
      raceStep(st, course, { dt, legS: s, dir: 'out', v, ride, canJump: () => true });
      k = [Math.min(k[0], st.k), Math.max(k[1], st.k)];
      if (s >= pass) {
        course.at(st.tau, 0, o);
        return { off: course.wrapTime(st.tau - course.timeAt(pass)), k };
      }
    }
    throw new Error('never got there');
  };
  for (const tau0 of [0, 17, 33, 50, 66]) {
    const train = go(tau0, { ride: false, from: 122, vmax: 28, acc: 1 });
    assert.ok(Math.abs(train.off) < 2.5, `the train, from ${tau0}: ${train.off} s out`);
    assert.ok(train.k[0] >= HYDRO.trim[0] && train.k[1] <= HYDRO.trim[1]);
    const boat = go(tau0, { ride: true, from: rideLegS(rideFor('city-ocean'), 0), vmax: 24.6, acc: 3 });
    assert.ok(Math.abs(boat.off) < 1.5, `the speedboat, from ${tau0}: ${boat.off} s out`);
  }
});

test("it's never put right in sight: trimmed instead, its clock running no faster or slower than allowed", () => {
  const st = { tau: 40, t: 0 };
  for (let s = 150; s < 450; s += 1) {
    const before = st.tau;
    raceStep(st, course, { dt: 0.04, legS: s, dir: 'out', v: 25, canJump: () => false });
    const ran = course.wrapTime(st.tau - before) / 0.04;
    assert.ok(ran >= HYDRO.trim[0] - 1e-9 && ran <= HYDRO.trim[1] + 1e-9, `${ran}`);
  }
});

test('on its own clock otherwise: on foot, coming back, and once past the pass', () => {
  for (const f of [{ legS: null, dir: null }, { legS: 900, dir: 'back' }, { legS: HYDRO.pass.train + 10, dir: 'out' }]) {
    const st = { tau: 10, t: 0 };
    raceStep(st, course, { dt: 0.5, v: 25, canJump: () => true, ...f });
    assert.equal(st.k, 1);
    assert.ok(Math.abs(st.tau - 10.5) < 1e-9);
    assert.equal(st.timed, false);
  }
});

test('the two boats duel: the second always just behind the first, the gap opening and closing', () => {
  const gaps = [];
  for (let t = 0; t < 30; t += 0.5) gaps.push(duelGap(t));
  assert.ok(Math.min(...gaps) > 0 && Math.max(...gaps) < 1);
  assert.ok(Math.max(...gaps) - Math.min(...gaps) > 0.3);
});

test("the train's director shot of them comes as their window opens, short of the pass", () => {
  const e = EVENTS['city-ocean'].find((d) => d.id === 'hydroplanes');
  assert.ok(e.always && e.dirs.includes('out'));
  assert.ok(e.s0 < HYDRO.pass.train && e.shot.at > HYDRO.pass.train);
  assert.ok(e.shot.lateral > shore(HYDRO.pass.train) + HYDRO.outer + HYDRO.sub + 20, 'out at sea beyond the course');
});

test("the speedboat's shot of them is up as they come past it", () => {
  // (the director counts a showpiece from 4 s short of its window: director.js LEAD_TIME; it holds `hold` s from then)
  const boat = rideFor('city-ocean'), p = boat.showpieces.find((e) => e.id === 'hydroplanes'), v = boat.profile.v;
  const from = rideLegS(boat, p.s0 - 4 * v), to = rideLegS(boat, p.s0 - 4 * v + p.shot.hold * v);
  assert.ok(from < HYDRO.pass.ride - 60 && to > HYDRO.pass.ride + 60, `${from}-${to}`);
});
