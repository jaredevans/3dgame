// Which of an animal's own clips plays at a speed (actors/clips.js), and where the rainbow stands (actors/paths.js):
// pure, no three.js.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { clipFor } from '../actors/clips.js';
import { rainbowArc, arcAboveHorizon, workTrainStep, herdPath, paceStep, PACE } from '../actors/paths.js';
import { legRoute, laneOf } from '../world-data.js';

const COW = ['Walk', 'Idle', 'Run'];
const DOLPHIN = ['Swim', 'Idle', 'Swim fast'];
const GULL = ['Idle', 'Walk', 'Run', 'Fly'];

test('standing still it idles', () => {
  assert.equal(clipFor(0, COW).name, 'Idle');
  assert.equal(clipFor(0.1, COW).name, 'Idle');
});
test('it walks at a walk and runs at a run, timed to its speed', () => {
  assert.deepEqual(clipFor(1.4, COW), { name: 'Walk', timeScale: 1 });
  assert.deepEqual(clipFor(9, COW), { name: 'Run', timeScale: 1.5 });
  assert.equal(clipFor(3.6, COW).name, 'Walk');   // up to halfway between walk and run
  assert.equal(clipFor(3.8, COW).name, 'Run');
  assert.deepEqual(clipFor(2, COW, { walk: 1, run: 4 }), { name: 'Walk', timeScale: 2 });
});
test('a swimmer swims for its walk and swims fast for its run', () => {
  assert.equal(clipFor(1.4, DOLPHIN).name, 'Swim');
  assert.equal(clipFor(8, DOLPHIN).name, 'Swim fast');
  assert.equal(clipFor(0, DOLPHIN).name, 'Idle');
});
test('a bird flies once airborne', () => {
  assert.equal(clipFor(12, GULL).name, 'Fly');
  assert.equal(clipFor(1.4, GULL).name, 'Walk');
});
test('the time scale stays within [0.5, 2]', () => {
  for (const clips of [COW, DOLPHIN, GULL]) for (let v = 0; v <= 40; v += 0.25) {
    const { timeScale } = clipFor(v, clips);
    assert.ok(timeScale >= 0.5 && timeScale <= 2, `${v}: ${timeScale}`);
  }
  assert.equal(clipFor(0.3, COW).timeScale, 0.5);
  assert.equal(clipFor(30, COW).timeScale, 2);
});

// Where the rainbow stands (actors/paths.js): pure, no three.js

const close = (a, b, eps = 1e-9) => assert.ok(Math.abs(a - b) <= eps, `${a} vs ${b}`);
test('the rainbow is centred opposite the sun, below the horizon while the sun is up', () => {
  for (const sun of [{ x: 0.3, y: 0.5, z: -0.8 }, { x: -2, y: 1, z: 1 }, { x: 0, y: 0.05, z: 1 }]) {
    const { centre, radius } = rainbowArc(sun);
    const n = Math.hypot(sun.x, sun.y, sun.z);
    close(centre.x, -sun.x / n); close(centre.y, -sun.y / n); close(centre.z, -sun.z / n);
    close(Math.hypot(centre.x, centre.y, centre.z), 1);
    assert.ok(centre.y < 0, `centre.y ${centre.y} not below the horizon`);
    close(radius, 42 * Math.PI / 180);
  }
});
test('rainbowArc hands back plain numbers, leaving the sun as it was', () => {
  const sun = { x: 0, y: 2, z: 0 };
  const { centre } = rainbowArc(sun);
  assert.deepEqual(sun, { x: 0, y: 2, z: 0 });
  assert.deepEqual(Object.keys(centre).sort(), ['x', 'y', 'z']);
  close(centre.y, -1);
});
test('the arc reaches down to the horizon: a half circle with the sun on it, none once the sun is 42 degrees up', () => {
  const R = 42 * Math.PI / 180, deg = Math.PI / 180;
  close(arcAboveHorizon(0, R), Math.PI / 2);
  close(arcAboveHorizon(R, R), 0);
  assert.equal(arcAboveHorizon(50 * deg, R), 0);
  // its ends lie on the horizon: an arc point's height is -sin(e) cos(R) + cos(e) sin(R) cos(phi)
  const e = 20 * deg, phi = arcAboveHorizon(e, R);
  close(-Math.sin(e) * Math.cos(R) + Math.cos(e) * Math.sin(R) * Math.cos(phi), 0, 1e-12);
});

// the climb's work train (actors/paths.js workTrainStep): stands at 700 while red, then runs on at 6 m/s
const step = (s, legS, aspect, dt = 0.1, end = 983) => workTrainStep({ s, legS, aspect, dt, end });
test('the work train stands on the viaduct while the signal is red, and runs on at 6 m/s once green', () => {
  assert.deepEqual(step(812, 388, 'red'), { s: 700, shown: true });
  close(step(700, 388, 'green', 0.1).s, 700.6);
});
test('it stays shown until it has left the viaduct, then hides once more than 320 m ahead of you', () => {
  assert.equal(step(900, 388, 'green', 0).shown, true);    // 512 m ahead, still on the viaduct
  assert.equal(step(949, 388, 'green', 0).shown, true);
  assert.equal(step(951, 388, 'green', 0).shown, false);   // off it, 563 m ahead
  assert.equal(step(951, 640, 'green', 0).shown, true);    // 311 m ahead
});
test('it never runs into the Mountain\'s platform, and hides rather than let you run through it', () => {
  assert.equal(step(982.9, 900, 'green', 1, 983).s, 983);
  assert.equal(step(983, 900, 'green', 1, 983).s, 983);
  assert.equal(step(983, 930, 'green', 0, 983).shown, false);   // 53 m ahead
  assert.equal(step(800, 900, 'green', 0).shown, false);        // behind you (a jump past it)
  assert.equal(step(800, 735, 'green', 0).shown, true);
});

// beside the line (actors/paths.js herdPath): a point `lateral` metres out on a side (+1 left of the leg's out direction)

const canyon = legRoute('mountain-west');
const dense = [];
for (let s = 0; s <= canyon.length; s += 0.5) dense.push(canyon.at(s));
const lineDistance = (p) => Math.min(...dense.map((q) => Math.hypot(p.x - q.x, p.z - q.z)));

test('herdPath stays at least lateral - 0.5 m from the line, either side, round its curves', () => {
  for (const lateral of [4, 25, 35, 40, 70]) for (const side of [1, -1]) for (let s = 130; s <= 1300; s += 65) {
    const p = herdPath(canyon, s, side, lateral);
    const d = lineDistance(p);
    assert.ok(d >= lateral - 0.5, `s ${s} side ${side} lateral ${lateral}: ${d.toFixed(2)} m out`);
    assert.ok(d <= lateral + 0.5, `s ${s} side ${side} lateral ${lateral}: ${d.toFixed(2)} m out`);
  }
});
test('herdPath faces the way the route runs, + is its left, and y is the line\'s', () => {
  for (let s = 0; s <= canyon.length; s += 97) {
    const P = canyon.at(s);
    for (const side of [1, -1]) {
      const p = herdPath(canyon, s, side, 30);
      close(p.yaw, P.yaw);
      close(p.y, P.y);
      const left = (p.x - P.x) * Math.cos(P.yaw) - (p.z - P.z) * Math.sin(P.yaw);
      close(left, side * 30, 1e-6);
    }
  }
});
test('herdPath fills the point it is given, and hands back plain numbers', () => {
  const out = {};
  assert.equal(herdPath(canyon, 500, 1, 30, out), out);
  assert.deepEqual(Object.keys(herdPath(canyon, 500, -1, 30)).sort(), ['x', 'y', 'yaw', 'z']);
});

// keeping pace with the train (actors/paths.js paceStep): joins inside its stretch, follows at the train's speed less its
// lag, and once the train is slow (or its stretch runs out) goes its own way, away from the line, never backwards
const run = (st, steps, input) => { for (let i = 0; i < steps; i++) st = paceStep(st, input(i)); return st; };
const IN = { lo: 1140, hi: 1300, dt: 0.1, lag: 1, ahead: 8 };
test('a pacer waits while the train is outside its stretch, then joins just ahead of the front', () => {
  let st = paceStep(null, { ...IN, legS: 1000, dir: 'out', v: 20 });
  assert.equal(st.mode, 'wait');
  st = paceStep(st, { ...IN, legS: 1150, dir: 'out', v: 20 });
  assert.equal(st.mode, 'pace');
  close(st.s, 1158);
  st = paceStep(null, { ...IN, legS: 1414, dir: 'back', v: 4 });
  assert.equal(st.mode, 'wait');   // the back run sets off from the platform: it waits at its stretch's end
  st = paceStep(st, { ...IN, legS: 1296, dir: 'back', v: 10 });
  assert.equal(st.mode, 'pace');
  close(st.s, 1288);
  // a train already crawling when it gets there is never joined
  assert.equal(paceStep(null, { ...IN, legS: 1200, dir: 'out', v: 2 }).mode, 'wait');
});
test('it keeps the train\'s speed less its lag, so it slowly falls behind', () => {
  let legS = 1150;
  const st = run(null, 51, (i) => { if (i) legS += 2; return { ...IN, legS, dir: 'out', v: 20 }; });
  assert.equal(st.mode, 'pace');
  close(st.s, 1158 + 50 * 1.9, 1e-6);   // 5 s at 19 m/s, the front 5 s at 20: 5 m dropped
  close(legS + IN.ahead - st.s, 5, 1e-6);
});
test(`below ${PACE.follow} m/s it goes its own way, away from the line, and never backwards`, () => {
  for (const dir of ['out', 'back']) {
    const sgn = dir === 'out' ? 1 : -1;
    let st = paceStep(null, { ...IN, legS: 1220, dir, v: 15 });
    assert.equal(st.mode, 'pace');
    st = paceStep(st, { ...IN, legS: 1220, dir, v: 2 });
    assert.equal(st.mode, 'off');
    for (let i = 0; i < 100; i++) {
      const { s, away } = st;
      st = paceStep(st, { ...IN, legS: 1220, dir, v: i < 50 ? 0 : 20 });   // (and stays its own way when the train picks up)
      assert.equal(st.mode, 'off');
      assert.ok((st.s - s) * sgn >= -1e-9, `${dir}: back from ${s} to ${st.s}`);
      assert.ok(st.away >= away);
    }
    assert.ok(st.away > 20, `${dir}: only ${st.away} m away`);
    assert.ok(st.speed >= PACE.gallop);
  }
});
test('it never leaves its stretch (kept out of the platform windows): at its end it turns off instead', () => {
  for (const dir of ['out', 'back']) {
    let legS = dir === 'out' ? 1150 : 1290;
    const sgn = dir === 'out' ? 1 : -1;
    let st = null, wentOff = false;
    for (let i = 0; i < 400; i++) {
      st = paceStep(st, { ...IN, legS, dir, v: 25 });
      legS += sgn * 2.5;
      if (st.mode === 'wait') continue;
      assert.ok(st.s >= IN.lo && st.s <= IN.hi, `${dir}: at ${st.s}`);
      if (st.mode === 'off') wentOff = true;
    }
    assert.ok(wentOff, dir);
  }
});

// ---- the Silver Arrow's leg (actors/desert.js) ----
import {
  BULLET, bulletStart, bulletStep, clearOfMesas, turbineSpots, solarGrid, nearestFit,
  FORMATION, formationSpot, formationAt, formationReach, ROCKET, rocketAt, rocketPad, rocketStep,
} from '../actors/paths.js';
import { FEATURES } from '../world-data.js';
import { EVENTS } from '../events.js';

const WF = legRoute('west-future');
const KMH = 3.6;

// run both fronts at constant speeds: -> { meetS: your leg-s as they pass, whooshes, lastShownBehind, minS, maxS }
function race({ dir, legS, v, lo, hi, meet = 1900, secs = 60 }) {
  const sgn = dir === 'back' ? -1 : 1, dt = 1 / 60;
  let st = null, meetS = null, whooshes = 0, before = null, lastShownBehind = -Infinity, minS = Infinity, maxS = -Infinity, waited = 0;
  for (let k = 0; k < secs * 60; k++) {
    st = bulletStep(st, { legS, v, dir, dt, meet, lo, hi });
    if (st.whoosh) whooshes++;
    if (st.mode === 'wait') waited += dt;
    if (st.shown) {
      minS = Math.min(minS, st.s); maxS = Math.max(maxS, st.s);
      const ahead = (st.s - legS) * sgn;
      if (before !== null && before > 0 && ahead <= 0) meetS = legS;
      before = ahead;
      lastShownBehind = Math.max(lastShownBehind, -ahead);
    }
    legS += sgn * v * dt;
  }
  return { meetS, whooshes, lastShownBehind, minS, maxS, waited, st };
}

test('the passing bullet starts where its front meets yours at the window\'s middle, at your speed now', () => {
  const v = 300 / KMH, { s, wait } = bulletStart({ legS: 1500, v, dir: 'out', meet: 1900, lo: 122, hi: 3900 });
  assert.equal(wait, 0);
  assert.ok(Math.abs(s - (1900 + BULLET.speed * 400 / v)) < 1e-9, `starts at ${s}`);
  assert.ok(Math.abs(BULLET.speed * KMH - 280) < 1e-9, 'it runs at 280 km/h');
  const back = bulletStart({ legS: 2300, v, dir: 'back', meet: 1900, lo: 240, hi: 4022 });
  assert.ok(Math.abs(back.s - (1900 - BULLET.speed * 400 / v)) < 1e-9);
});

test('at full speed the fronts pass at the middle with one whoosh, both ways, and it hides 600 m behind you', () => {
  for (const [dir, legS, lo, hi] of [['out', 1500, 122, 3900], ['back', 2300, 240, 4022]]) {
    const r = race({ dir, legS, v: 300 / KMH, lo, hi });
    assert.ok(r.meetS !== null && Math.abs(r.meetS - 1900) < 3, `${dir}: met at ${r.meetS}`);
    assert.equal(r.whooshes, 1, `${dir}: ${r.whooshes} whooshes`);
    assert.ok(r.lastShownBehind <= BULLET.behind + 3, `${dir}: still shown ${r.lastShownBehind} m behind`);
    assert.equal(r.st.mode, 'gone');
    assert.ok(r.minS >= lo && r.maxS <= hi, `${dir}: ran ${r.minS}..${r.maxS}, outside ${lo}..${hi}`);
  }
});

test('too slow for the line\'s length, it waits hidden at the line\'s end until the timing fits, and still meets you there', () => {
  for (const [dir, legS, lo, hi] of [['out', 1500, 122, 3900], ['back', 2300, 240, 4022]]) {
    const r = race({ dir, legS, v: 10, lo, hi, secs: 120 });
    assert.ok(r.waited > 5, `${dir}: waited ${r.waited} s`);
    assert.ok(r.meetS !== null && Math.abs(r.meetS - 1900) < 3, `${dir}: met at ${r.meetS}`);
    assert.ok(r.minS >= lo && r.maxS <= hi);
    assert.equal(r.whooshes, 1);
  }
});

test('standing, or already past the middle (a jump), it comes from the line\'s far end at once: no NaN, no waiting', () => {
  for (const [legS, v] of [[1600, 0], [2100, 300 / KMH], [2100, 0]]) {
    const out = bulletStart({ legS, v, dir: 'out', meet: 1900, lo: 122, hi: 3900 });
    assert.deepEqual(out, { s: 3900, wait: 0 });
    const back = bulletStart({ legS: 3800 - legS, v, dir: 'back', meet: 1900, lo: 240, hi: 4022 });
    assert.deepEqual(back, { s: 240, wait: 0 });
  }
  const r = race({ dir: 'out', legS: 1600, v: 0, lo: 122, hi: 3900 });
  assert.equal(r.whooshes, 1);
  assert.ok(Number.isFinite(r.minS) && r.minS >= 122);
});

test('clearOfMesas keeps a blade\'s margin from every mesa, and ignores features without a centre', () => {
  const f = [{ kind: 'mesa', x: 0, z: 0, r: 100 }, { kind: 'ridge', s0: 0, s1: 10 }];
  assert.equal(clearOfMesas(150, 0, f, 60), false);
  assert.equal(clearOfMesas(161, 0, f, 60), true);
});

test('twelve turbines in two rows north of the line between s 1000 and 2500, off the mesas and spaced apart', () => {
  const mesas = FEATURES.filter((f) => f.kind === 'mesa');
  const spots = turbineSpots(WF, { s0: 1000, s1: 2500, rows: [550, 850], perRow: 6, side: -1, minGap: 150,
    ok: (x, z) => clearOfMesas(x, z, mesas, 60) && Math.hypot(x - 2250, z - 1000) > 600 });   // (and one stand-in hill)
  assert.equal(spots.length, 12);
  const P = {};
  for (const sp of spots) {
    assert.ok(sp.s >= 1000 && sp.s <= 2500, `at s ${sp.s}`);
    assert.ok([550, 850].includes(sp.out));
    herdPath(WF, sp.s, -1, sp.out, P);
    assert.ok(Math.hypot(P.x - sp.x, P.z - sp.z) < 1e-6);
    assert.ok(clearOfMesas(sp.x, sp.z, mesas, 60));
    assert.ok(Math.hypot(sp.x - 2250, sp.z - 1000) > 600);
    // north of the line: -z of it, here (the line runs west-north-west)
    WF.at(sp.s, P);
    assert.ok(sp.z < P.z - 400, `${sp.z} not north of ${P.z}`);
  }
  for (const a of spots) for (const b of spots) if (a !== b) assert.ok(Math.hypot(a.x - b.x, a.z - b.z) >= 150);
});

test('turbineSpots leaves out what it cannot fit rather than crowding them', () => {
  const spots = turbineSpots(WF, { s0: 1000, s1: 1300, rows: [550], perRow: 6, side: -1, minGap: 150, ok: () => true });
  assert.ok(spots.length >= 2 && spots.length <= 3, `${spots.length} in 300 m of row`);
  for (const a of spots) for (const b of spots) if (a !== b) assert.ok(Math.hypot(a.x - b.x, a.z - b.z) >= 150);
  assert.deepEqual(turbineSpots(WF, { s0: 1000, s1: 1300, rows: [550], perRow: 6, side: -1, minGap: 150, ok: () => false }), []);
});

test('the solar grid: rows evenly across its band, racks along the line centred on its s', () => {
  const g = solarGrid({ s: 1500, rows: 13, perRow: 23, pitch: 4.2, out: [250, 400] });
  assert.equal(g.length, 299);
  const outs = [...new Set(g.map((p) => p.out))].sort((a, b) => a - b);
  assert.equal(outs.length, 13);
  assert.equal(outs[0], 250);
  assert.equal(outs[12], 400);
  const ss = g.map((p) => p.s);
  assert.ok(Math.abs((Math.min(...ss) + Math.max(...ss)) / 2 - 1500) < 1e-9);
  assert.ok(Math.abs(Math.max(...ss) - Math.min(...ss) - 22 * 4.2) < 1e-9);
});

test('nearestFit finds the nearest s either way that fits, or null', () => {
  assert.equal(nearestFit(1500, (s) => s >= 1540, 10, 400), 1540);
  assert.equal(nearestFit(1500, (s) => s <= 1470, 10, 400), 1470);
  assert.equal(nearestFit(1500, () => true, 10, 400), 1500);
  assert.equal(nearestFit(1500, () => false, 10, 400), null);
});

test('the drones hold a ring, then a line, then an arrow, 6 s each, morphing between', () => {
  const n = 24, at = (t) => Array.from({ length: n }, (_, i) => formationAt(t, i, n));
  const same = (a, b) => a.every((p, i) => Math.abs(p.along - b[i].along) < 1e-9 && Math.abs(p.up - b[i].up) < 1e-9);
  const shape = (name) => Array.from({ length: n }, (_, i) => formationSpot(name, i, n));
  assert.deepEqual(FORMATION.shapes, ['ring', 'line', 'arrow']);
  assert.equal(FORMATION.hold, 6);
  assert.ok(same(at(0), shape('ring')) && same(at(4), shape('ring')));
  assert.ok(same(at(9), shape('line')) && same(at(15), shape('arrow')) && same(at(21), shape('ring')));
  assert.ok(!same(at(7), shape('ring')) && !same(at(7), shape('line')), 'morphing at 7 s');
  for (const t of [0, 3, 6.5, 7, 7.5, 9, 13, 15, 19]) for (const p of at(t)) assert.ok(Math.abs(p.up) <= 20 + 1e-9, `up ${p.up} at ${t} s`);
});

test('each formation keeps its drones apart', () => {
  for (const name of FORMATION.shapes) {
    const pts = Array.from({ length: 24 }, (_, i) => formationSpot(name, i, 24));
    for (const [i, a] of pts.entries()) for (const b of pts.slice(i + 1)) assert.ok(Math.hypot(a.along - b.along, a.up - b.up) >= 3, `${name}: two drones within 3 m`);
  }
});

test('formationSpot fills the point it is given', () => {
  const o = {};
  assert.equal(formationAt(3, 0, 24, o), o);
  assert.equal(formationSpot('line', 0, 24, o), o);
});

test('the rocket climbs straight up, then pitches east as it goes, for 60 s', () => {
  const a = rocketAt(0), o = {};
  assert.equal(a.east, 0); assert.equal(a.up, 0); assert.equal(a.pitch, 0);
  let prev = rocketAt(0);
  for (let t = 0.5; t <= ROCKET.secs; t += 0.5) {
    const p = { ...rocketAt(t, o) };
    assert.ok(p.up > prev.up, `rising at ${t} s`);
    assert.ok(p.east >= prev.east, `never back west at ${t} s`);
    assert.ok(p.pitch >= prev.pitch && p.pitch <= ROCKET.tilt + 1e-9);
    prev = p;
  }
  assert.equal(rocketAt(4).pitch, 0, 'upright off the pad');
  assert.ok(rocketAt(60).pitch > 0.6, 'well over by the end');
  assert.ok(rocketAt(10).up >= 100, `only ${rocketAt(10).up} m up after 10 s`);
  assert.deepEqual(rocketAt(90), rocketAt(60), 'held at its last point past 60 s');
});

test('the pad is about 5 km out, within 25 degrees left of the nose as an out run enters the window (s 1900)', () => {
  const pad = rocketPad(WF), P = WF.offsetAt(ROCKET.at, laneOf('west-future'));
  assert.equal(ROCKET.at, EVENTS['west-future'].find((e) => e.id === 'rocket').s0);
  const dx = pad.x - P.x, dz = pad.z - P.z, d = Math.hypot(dx, dz);
  assert.ok(d >= 4500 && d <= 6000, `${d.toFixed(0)} m out`);
  const ahead = dx * Math.sin(P.yaw) + dz * Math.cos(P.yaw), left = dx * Math.cos(P.yaw) - dz * Math.sin(P.yaw);
  const bearing = Math.atan2(left, ahead) * 180 / Math.PI;
  assert.ok(bearing > 0 && bearing <= 25, `${bearing.toFixed(1)} degrees off the nose (+ left)`);
});

test('the whole flight stays inside the camera\'s 8 km from anywhere on the line past the window\'s start', () => {
  const pad = rocketPad(WF), P = {};
  for (let s = ROCKET.at; s <= WF.length; s += 50) for (const lat of [-2, 2]) {
    WF.offsetAt(s, lat, P);
    for (let t = 0; t <= ROCKET.secs; t += 1) {
      const r = rocketAt(t);
      const d = Math.hypot(pad.x + r.east - P.x, 20 + r.up - P.y, pad.z - P.z);
      assert.ok(d < 7500, `${d.toFixed(0)} m from s ${s} at ${t} s`);
    }
  }
});

test('the rocket launches as you enter its window, either way, and flies its whole minute after the window ends', () => {
  let st = null, launches = 0;
  const go = (frames, f) => { for (let k = 0; k < frames; k++) { st = rocketStep(st, { dt: 0.1, ...f }); if (st.launch) launches++; } };
  go(50, { here: true, on: false });
  assert.equal(st.t, null, 'not before its window');
  go(1, { here: true, on: true });
  assert.equal(launches, 1);
  assert.equal(st.t, 0);
  go(120, { here: true, on: true });   // 12 s in its window at full speed
  go(600, { here: true, on: false });  // and on past it
  assert.ok(Math.abs(st.t - 72) < 1e-6, `t ${st.t}`);
  go(10, { here: true, on: true });    // back in the window (a jump): no second launch on the same run
  assert.equal(launches, 1);
});

test('it resets only once you have left the leg, so the next run launches again', () => {
  let st = rocketStep(null, { here: true, on: true, dt: 0.1 });
  st = rocketStep(st, { here: true, on: false, dt: 0.1 });
  assert.equal(st.t, 0.1);
  st = rocketStep(st, { here: false, on: false, dt: 0.1 });
  assert.equal(st.t, null);
  assert.equal(st.reset, true, 'says so the frame it resets');
  st = rocketStep(st, { here: false, on: false, dt: 0.1 });
  assert.equal(st.reset, false, 'once');
  st = rocketStep(st, { here: true, on: true, dt: 0.1 });
  assert.equal(st.launch, true);
});

test('the rocket\'s event is updated wherever you are on the leg, so its flight outlives its window', () => {
  assert.equal(EVENTS['west-future'].find((e) => e.id === 'rocket').always, true);
});

test('formationReach covers every drone of every shape and morph along the line', () => {
  const reach = formationReach(24);
  assert.ok(reach >= 46, `reach ${reach}`);
  for (let t = 0; t < 40; t += 0.25) for (let i = 0; i < 24; i++) assert.ok(Math.abs(formationAt(t, i, 24).along) <= reach + 1e-9);
});

// ---- the Seaside Excursion's leg (actors/coast.js) ----
import {
  clearsLevel, landSpot, LIGHTHOUSE, lighthouseSpot, shoreTable, paceBounds, LEAP, leapAt, loopAt, FREIGHT, zoneOfTriangles,
} from '../actors/paths.js';
import { worldTerrain, SEA_LEVEL } from '../world-data.js';

const CO = legRoute('city-ocean');
const LAND = worldTerrain();

test('clearsLevel holds only if the whole footprint stands over the level', () => {
  const h = (x) => (x < 0 ? 10 : -5);
  assert.equal(clearsLevel(h, -20, 0, 6, 3), true);
  assert.equal(clearsLevel(h, -4, 0, 6, 3), false, 'its edge over the sea');
  assert.equal(clearsLevel(h, 20, 0, 6, 3), false);
});

test('landSpot finds the nearest spot that fits, or null', () => {
  const at = landSpot({ x: 0, z: 0 }, (x, z) => z >= 30, { step: 2, reach: 100 });
  assert.ok(Math.abs(at.x) < 3 && at.z >= 30 && at.z < 33, `at ${at.x}, ${at.z}`);
  assert.deepEqual(landSpot({ x: 5, z: 5 }, () => true, { step: 2, reach: 100 }), { x: 5, z: 5 });
  assert.equal(landSpot({ x: 0, z: 0 }, () => false, { step: 2, reach: 20 }), null);
});

test('the lighthouse\'s spot: the brief\'s is in the sea, so it stands on the cliff top nearest it, on land 3 m up', () => {
  assert.ok(LAND.heightAt(LIGHTHOUSE.x, LIGHTHOUSE.z) < SEA_LEVEL, 'the brief\'s spot is over the sea');
  const at = lighthouseSpot(LAND.heightAt, SEA_LEVEL);
  assert.ok(at, 'somewhere');
  assert.equal(LIGHTHOUSE.above, 3);
  assert.ok(clearsLevel(LAND.heightAt, at.x, at.z, LIGHTHOUSE.r, SEA_LEVEL + 3), 'its footprint all 3 m over the sea');
  assert.ok(clearsLevel(LAND.heightAt, at.x, at.z, LIGHTHOUSE.r, LAND.heightAt(at.x, at.z) - 2), 'on the top, not over the edge');
  assert.ok(Math.hypot(at.x - LIGHTHOUSE.x, at.z - LIGHTHOUSE.z) < 60, `${at.x}, ${at.z} is far from the brief's spot`);
  // seaward of the line, and clear of it
  const P = {};
  let near = Infinity;
  for (let s = 900; s <= 1300; s += 2) { CO.at(s, P); near = Math.min(near, Math.hypot(at.x - P.x, at.z - P.z)); }
  assert.ok(near > 20, `only ${near} m from the line`);
  assert.ok(at.z < -230, 'on the sea side');
});

test('shoreTable says how far out the waterline is on the sea side all along the cliffs', () => {
  const shore = shoreTable(CO, LAND.heightAt, 1, 400, 1850, { step: 5 });
  const P = {};
  for (let s = 400; s <= 1850; s += 37) {
    const l = shore(s);
    assert.ok(l > 5 && l < 300, `at ${s}: ${l}`);
    herdPath(CO, s, 1, l + 2, P);
    assert.ok(LAND.heightAt(P.x, P.z) < SEA_LEVEL, `at ${s}: not sea 2 m past it`);
    herdPath(CO, s, 1, l - 6, P);
    assert.ok(LAND.heightAt(P.x, P.z) >= SEA_LEVEL - 1, `at ${s}: sea well short of it`);
  }
  assert.equal(shore(0), shore(400), 'held at its ends');
  const one = shoreTable(CO, LAND.heightAt, 1, 1100, 1100);
  assert.ok(Math.abs(one(1100) - shore(1100)) < 1 && one(0) === one(1100), 'a table of one place');
  // and it's sea 80-900 m past it, where the dolphins and the boats go
  for (const d of [80, 150, 300, 900]) { herdPath(CO, 1100, 1, shore(1100) + d, P); assert.ok(LAND.heightAt(P.x, P.z) < SEA_LEVEL - 1, `${d} m out`); }
});

test('the gulls keep clear of both platform windows, inside their own window', () => {
  const def = EVENTS['city-ocean'].find((e) => e.id === 'gulls');
  const { lo, hi } = paceBounds(def, CO.length, 20);
  assert.ok(lo >= 122 + 20 && lo >= def.s0);
  assert.ok(hi <= CO.length - 122 - 20 && hi <= def.s1, `hi ${hi}`);
  assert.ok(hi < def.s1, 'its window runs into Oceanside\'s platform: cut short');
  // paced at full speed, then the train slowing below 3 m/s: never out of lo..hi, and off once slow
  let st = null, legS = 450;
  for (let k = 0; k < 6000; k++) {
    const v = k < 3000 ? 100 / 3.6 : 2;
    st = paceStep(st, { legS, dir: 'out', v, dt: 1 / 60, lo, hi });
    assert.ok(st.s >= lo && st.s <= hi);
    legS += v / 60;
  }
  assert.equal(st.mode, 'off');
});

test('each dolphin\'s leap takes 1.2 s, from the surface and back, the pod leaping in turn', () => {
  assert.equal(LEAP.secs, 1.2);
  const n = 4, dt = 0.01, starts = [], o = {};
  const was = Array(n).fill(false);
  for (let t = 0; t < 20; t += dt) {
    for (let i = 0; i < n; i++) {
      leapAt(t, i, n, 10, o);
      if (o.air && !was[i]) starts.push({ i, t });
      was[i] = o.air;
    }
  }
  // in turn: 0, 1, 2, 3, 0, ...
  starts.slice(0, 8).forEach((s, k) => assert.equal(s.i, k % n));
  // each one in the air for 1.2 s
  for (let i = 0; i < n; i++) {
    const t0 = starts.find((s) => s.i === i).t;
    let air = 0;
    for (let t = t0; t < t0 + 3; t += dt) if (leapAt(t, i, n, 10, o).air) air += dt;
    assert.ok(Math.abs(air - 1.2) < 0.03, `dolphin ${i}: ${air} s up`);
  }
});

test('a leap arcs out of the water and back, pitched along its arc', () => {
  const t0 = 0, o = {};   // dolphin 0 leaps first, at t 0
  const at = (u) => leapAt(t0 + u * LEAP.secs, 0, 4, 10, { ...o });
  assert.ok(at(0.01).y < 0.2 && at(0.99).y < 0.2, 'from and to the surface');
  assert.ok(at(0.5).y > 1.5, `up ${at(0.5).y} m at the top`);
  assert.ok(at(0.1).pitch > 0.3, 'nose up rising');
  assert.ok(at(0.9).pitch < -0.3, 'nose down falling');
  assert.ok(Math.abs(at(0.5).pitch) < 0.05, 'level at the top');
  // the pitch follows the arc's own slope for its forward speed
  const u = 0.2, h = 1e-4, y1 = at(u).y, y2 = leapAt((u + h) * LEAP.secs, 0, 4, 10, {}).y;
  assert.ok(Math.abs(Math.atan2((y2 - y1) / (h * LEAP.secs), 10) - at(u).pitch) < 1e-3);
  // and between leaps it swims just under the surface, level
  const under = leapAt(LEAP.secs + 0.2, 0, 4, 10, {});
  assert.equal(under.air, false);
  assert.ok(under.y < 0 && under.y > -1.5 && under.pitch === 0);
});

test('a slow pod still leaps (its pitch from a dolphin\'s own swimming pace, not standing straight up)', () => {
  const p = leapAt(0.1, 0, 4, 0, {}).pitch;
  assert.ok(p > 0.3 && p < 1.4, `pitch ${p}`);
});

test('the sailboats\' loops: on the ellipse, heading along it, at their speed', () => {
  const loop = { a: 200, b: 80, speed: 1.5, phase: 0.7 }, o = {}, q = {};
  for (let t = 0; t < 400; t += 13) {
    loopAt(t, loop, o);
    assert.ok(Math.abs((o.along / loop.a) ** 2 + (o.across / loop.b) ** 2 - 1) < 1e-9);
    loopAt(t + 0.01, loop, q);
    const v = Math.hypot(q.along - o.along, q.across - o.across) / 0.01;
    assert.ok(v > 0.5 && v < 4, `speed ${v}`);
    const head = Math.atan2(q.along - o.along, q.across - o.across);
    const d = Math.atan2(Math.sin(head - o.heading), Math.cos(head - o.heading));
    assert.ok(Math.abs(d) < 0.01, `heading off by ${d}`);
  }
});

// the freight runs on bulletStep with its own speed and reach
function freightRace({ dir, legS, v, lo, hi, meet, secs = 120 }) {
  const sgn = dir === 'back' ? -1 : 1, dt = 1 / 60;
  let st = null, meetS = null, before = null, lastShownBehind = -Infinity, minS = Infinity, maxS = -Infinity, rumbles = 0;
  for (let k = 0; k < secs * 60; k++) {
    st = bulletStep(st, { legS, v, dir, dt, meet, lo, hi, speed: FREIGHT.speed, behind: FREIGHT.behind, near: FREIGHT.near });
    if (st.whoosh) rumbles++;
    if (st.shown) {
      minS = Math.min(minS, st.s); maxS = Math.max(maxS, st.s);
      const ahead = (st.s - legS) * sgn;
      if (before !== null && before > 0 && ahead <= 0) meetS = legS;
      before = ahead;
      lastShownBehind = Math.max(lastShownBehind, -ahead);
    }
    legS += sgn * v * dt;
  }
  return { meetS, rumbles, lastShownBehind, minS, maxS, st };
}

test('the freight: 60 km/h the other way, the fronts passing at its window\'s middle both ways, gone 400 m behind', () => {
  assert.ok(Math.abs(FREIGHT.speed * 3.6 - 60) < 1e-9);
  assert.equal(FREIGHT.behind, 400);
  const def = EVENTS['city-ocean'].find((e) => e.id === 'freight'), meet = (def.s0 + def.s1) / 2, L = CO.length, length = 110;
  assert.equal(meet, 875);
  const bounds = { out: { lo: 122, hi: L - 122 - length }, back: { lo: 122 + length, hi: L - 122 } };
  for (const v of [100 / 3.6, 60 / 3.6, 8]) {
    for (const [dir, legS] of [['out', def.s0], ['back', def.s1]]) {
      const { lo, hi } = bounds[dir];
      const r = freightRace({ dir, legS, v, lo, hi, meet, secs: 200 });
      assert.ok(r.meetS !== null && Math.abs(r.meetS - meet) < 3, `${dir} at ${v}: met at ${r.meetS}`);
      assert.ok(r.lastShownBehind <= FREIGHT.behind + 3, `${dir}: shown ${r.lastShownBehind} m behind`);
      assert.ok(r.minS >= lo && r.maxS <= hi, `${dir}: ran ${r.minS}..${r.maxS}`);
      assert.equal(r.rumbles, 1);
    }
  }
});

test('zoneOfTriangles finds a zone\'s triangles by all three of their vertex colours, as Polyfork matches albedo', () => {
  const glass = { r: 0.64, g: 0.62, b: 0.5 }, win = { r: 0.05, g: 0.07, b: 0.1 };
  const tri = (c, d = c, e = c) => [c.r, c.g, c.b, d.r, d.g, d.b, e.r, e.g, e.b];
  const other = { r: 0.3, g: 0.3, b: 0.3 }, near = { r: 0.642, g: 0.619, b: 0.501 };
  const colors = new Float32Array([...tri(glass), ...tri(other), ...tri(win), ...tri(glass, glass, other), ...tri(near)]);
  assert.deepEqual([...zoneOfTriangles(colors, 3, [glass, win])], [0, -1, 1, -1, 0]);
  // four-wide colours (RGBA) too
  const rgba = new Float32Array([glass.r, glass.g, glass.b, 1, glass.r, glass.g, glass.b, 1, glass.r, glass.g, glass.b, 1]);
  assert.deepEqual([...zoneOfTriangles(rgba, 4, [win, glass])], [1]);
});

// ---- the Metro Glide's leg (actors/metro.js) ----
import {
  PLATFORM, LANES, GLIDE, laneAt, TRAFFIC, laneLateral, streetRuns, streetPath, laneCars, carAlong, PLANE, planeAt, planeStep, soonest,
} from '../actors/paths.js';
import { PLACES, LEGS } from '../world-data.js';
import { LAYOUT, clearGround } from '../suburbs.js';

const FC = legRoute('future-city');

test('one platform window\'s length, shared: paceBounds keeps that far off both ends unless told otherwise', () => {
  assert.equal(PLATFORM, 122);
  const { lo, hi } = paceBounds({ s0: 0, s1: 5000 }, 2000, 10);
  assert.equal(lo, PLATFORM + 10);
  assert.equal(hi, 2000 - PLATFORM - 10);
});

// the towers and the kit's own parked fliers in each town, in its kit's frame (measured in the page): x, z, r (how far
// out from its middle it reaches), from and top (metres over the town's ground)
const TOWERS = {
  future: [
    { x: -2, z: -52, r: 11.3, from: 0, top: 41 },                                            // the monolith tower
    { x: -56, z: -8, r: 5.7, from: 0, top: 31 }, { x: -48, z: -8, r: 5.7, from: 0, top: 31 },   // the capsule towers
    { x: -40, z: -30, r: 8.5, from: 0, top: 25 }, { x: -40, z: -18, r: 8.5, from: 0, top: 25 }, // the slab blocks
    { x: 0, z: 46, r: 5.7, from: 0, top: 21 }, { x: -23, z: 45, r: 5.7, from: 0, top: 21 },    // the vertical farms
    { x: -12, z: 46, r: 9, from: 25, top: 29 },                                               // the sky bridges
    { x: 40, z: -24, r: 11.3, from: 0, top: 14 },                                             // the depot
    { x: 26, z: -40, r: 2.7, from: 53, top: 55 }, { x: -24, z: -30, r: 3.4, from: 47, top: 49 }, // parked up high
    { x: -24, z: 38, r: 2.7, from: 40, top: 41 }, { x: 14, z: 44, r: 6, from: 44, top: 45 },
    { x: -24, z: 0, r: 2.7, from: 16, top: 17 }, { x: -24, z: 26, r: 2.7, from: 16, top: 18 },
    { x: 38, z: 50, r: 2.7, from: 13, top: 15 }, { x: 38, z: 32, r: 2.7, from: 15, top: 17 },
  ],
  city: [-36, -20, 12].map((z) => ({ x: -52, z, r: 5.7, from: 0, top: 32 })).concat(
    [[-12, 12], [-28, 36], [24, -36], [44, -36], [44, 36]].map(([x, z]) => ({ x, z, r: 5.7, from: 0, top: 32 }))),
};
const toKit = (place, x, z) => {
  const c = Math.cos(place.rot), s = Math.sin(place.rot), dx = x - place.centre.x, dz = z - place.centre.z;
  return [dx * c - dz * s, dx * s + dz * c];
};
const lines = Object.keys(LEGS).map((id) => { const r = legRoute(id), pts = []; for (let s = 0; s <= r.length; s += 2) pts.push(r.at(s)); return pts; });
const toLines = (x, z) => Math.min(...lines.map((pts) => Math.min(...pts.map((q) => Math.hypot(x - q.x, z - q.z)))));

test('six fliers over each town: 30-60 m over the Futuristic place, 40-90 m over Downtown City', () => {
  assert.equal(LANES.future.length, 6);
  assert.equal(LANES.city.length, 6);
  const o = {};
  for (const [town, [lo, hi]] of [['future', [30, 60]], ['city', [40, 90]]]) {
    const P = PLACES[town];
    for (const lane of LANES[town]) for (let t = 0; t < 120; t += 0.5) {
      laneAt(t, lane, P, o);
      const up = o.y - P.y;
      assert.ok(up >= lo && up <= hi, `${town} lane at ${up.toFixed(1)} m`);
    }
  }
});

test('each glides round its lane at about 15 m/s, facing the way it goes, banked into the turn', () => {
  assert.equal(GLIDE.speed, 15);
  const a = {}, b = {};
  for (const town of ['future', 'city']) for (const lane of LANES[town]) for (let t = 0; t < 60; t += 1.3) {
    laneAt(t, lane, PLACES[town], a);
    laneAt(t + 0.05, lane, PLACES[town], b);
    const v = Math.hypot(b.x - a.x, b.z - a.z) / 0.05;
    assert.ok(v > 13 && v < 17, `${town}: ${v.toFixed(1)} m/s`);
    const way = Math.atan2(b.x - a.x, b.z - a.z), off = Math.atan2(Math.sin(way - a.yaw), Math.cos(way - a.yaw));
    assert.ok(Math.abs(off) < 0.05, `${town}: facing ${off.toFixed(3)} off its way`);
    // turning left (its yaw growing) it rolls left wing (+x) down, as tan(bank) = v x turn rate / g
    const turn = Math.atan2(Math.sin(b.yaw - a.yaw), Math.cos(b.yaw - a.yaw)) / 0.05;
    assert.ok(Math.abs(Math.tan(-a.roll) - v * turn / GLIDE.g) < 0.06, `${town}: roll ${a.roll.toFixed(3)} for a turn of ${turn.toFixed(3)}`);
    assert.ok(Math.abs(a.roll) > 0.15, 'a visible bank');
  }
  assert.ok(LANES.future.some((l) => l.dir > 0) && LANES.future.some((l) => l.dir < 0), 'both ways round');
});

test('their lanes stay over their towns, clear of every line (so out of the platform windows), and of the towers', () => {
  const o = {};
  for (const town of ['future', 'city']) {
    const P = PLACES[town], [ox, oz] = P.offset ?? [0, 0];
    for (const [i, lane] of LANES[town].entries()) for (let t = 0; t < 2 * Math.PI * 60 / GLIDE.speed; t += 0.25) {
      laneAt(t, lane, P, o);
      const [lx, lz] = toKit(P, o.x, o.z);
      assert.ok(Math.abs(lx - ox) <= P.size[0] / 2 - 5 && Math.abs(lz - oz) <= P.size[1] / 2 - 5, `${town} lane ${i} leaves the town at ${lx.toFixed(0)}, ${lz.toFixed(0)}`);
      const up = o.y - P.y;
      for (const w of TOWERS[town]) {
        if (Math.hypot(lx - w.x, lz - w.z) > w.r + 6) continue;
        assert.ok(up >= w.top + 3 || up + 2.5 <= w.from - 3, `${town} lane ${i} through the ${w.x}, ${w.z} at ${up.toFixed(1)} m`);
      }
    }
    for (const [i, lane] of LANES[town].entries()) for (let t = 0; t < 30; t += 1) {
      laneAt(t, lane, P, o);
      assert.ok(toLines(o.x, o.z) >= 15, `${town} lane ${i} over a line`);
    }
  }
});

test('the street\'s lanes keep right: each way 1 m to its own right of the street\'s middle', () => {
  const S = LAYOUT.street;
  assert.equal(laneLateral(1, 1, S), S - 1);    // going out on the left street: its right is towards the line
  assert.equal(laneLateral(1, -1, S), S + 1);
  assert.equal(laneLateral(-1, 1, S), -S - 1);
  assert.equal(laneLateral(-1, -1, S), -S + 1);
  assert.deepEqual(TRAFFIC.speeds, [10, 14]);
  assert.deepEqual(TRAFFIC.gap, [40, 80]);
});

test('streetRuns: the stretches where the street stands, clear of the river and the towns, out of the platform windows', () => {
  const ok = (x, z) => clearGround(x, z, LAND);
  const [s0, s1] = LEGS['future-city'].suburbs[1];
  for (const side of [1, -1]) {
    const runs = streetRuns(FC, ok, side * LAYOUT.street, s0, s1);
    assert.ok(runs.length >= 1, 'some street');
    const P = {};
    for (const [a, b] of runs) {
      assert.ok(b - a >= 60 && a >= s0 && b <= s1, `${a}..${b}`);
      assert.ok(a >= PLATFORM && b <= FC.length - PLATFORM);
      for (let s = a; s <= b; s += 3) for (const d of [-2, 0, 2]) {
        FC.offsetAt(s, side * LAYOUT.street + d, P);
        assert.ok(ok(P.x, P.z), `side ${side} at ${s} isn't clear`);
      }
    }
    assert.ok(runs.reduce((n, [a, b]) => n + b - a, 0) > 600, 'most of the stretch');
  }
  // where it isn't clear it stops
  const none = streetRuns(FC, () => false, 54, s0, s1);
  assert.deepEqual(none, []);
  const gap = streetRuns(FC, (x, z) => { FC.offsetAt(1000, 54, P0); return Math.hypot(x - P0.x, z - P0.z) > 30; }, 54, 800, 1200);
  assert.equal(gap.length, 2, 'split round what is in its way');
  assert.ok(gap[0][1] < 975 && gap[1][0] > 1025);
});
const P0 = {};

test('streetPath follows the street over the land, in metres along the street itself', () => {
  const path = streetPath(FC, LAND.heightAt, 54, 1300, 1700);
  const P = {}, a = {}, b = {};
  assert.ok(path.length > 400, `round the outside of the curve: ${path.length}`);   // the line bends right: the left street is longer
  path.at(0, a);
  FC.offsetAt(1300, 54, P);
  assert.ok(Math.hypot(a.x - P.x, a.z - P.z) < 0.01);
  assert.ok(Math.abs(a.y - LAND.heightAt(a.x, a.z)) < 0.3);
  path.at(path.length, b);
  FC.offsetAt(1700, 54, P);
  assert.ok(Math.hypot(b.x - P.x, b.z - P.z) < 0.5);
  for (let u = 10; u < path.length; u += 37) {
    path.at(u, a); path.at(u + 1, b);
    assert.ok(Math.abs(Math.hypot(b.x - a.x, b.z - a.z) - 1) < 0.05, `1 m along at ${u}`);
    const way = Math.atan2(b.x - a.x, b.z - a.z);
    assert.ok(Math.abs(Math.atan2(Math.sin(way - a.yaw), Math.cos(way - a.yaw))) < 0.05, 'facing along it');
    assert.ok(Math.abs(Math.tan(a.pitch) - (b.y - a.y)) < 0.05, 'pitched up its slope');
  }
  assert.equal(path.at(5, a), a);
});

test('laneCars: 40-80 m apart round a loop at least the street\'s length, and each moves along at its speed', () => {
  let seed = 3;
  const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
  const { at, period } = laneCars(1000, rnd);
  assert.ok(period >= 1000 && period < 1080);
  for (let i = 1; i < at.length; i++) { const g = at[i] - at[i - 1]; assert.ok(g >= 40 && g <= 80, `gap ${g}`); }
  const wrap = period - at[at.length - 1] + at[0];
  assert.ok(wrap >= 40 && wrap <= 80, `round the back ${wrap}`);
  assert.equal(carAlong(100, period, 12, 0, 1000), 100);
  assert.ok(Math.abs(carAlong(100, period, 12, 5, 1000) - 160) < 1e-9);
  assert.equal(carAlong(990, 1050, 12, 1, 1000), -1, 'off the end of the street, round the back');
  assert.ok(Math.abs(carAlong(990, 1050, 12, 6, 1000) - 12) < 1e-9, 'and back at its start');
});

const OVER = FC.at(1300);
test('the plane: 120 m over the line at the window\'s middle, coming down at 3 degrees towards the north-east', () => {
  const o = {};
  assert.deepEqual(planeAt(OVER, 0, o), o);
  close(o.x, OVER.x); close(o.z, OVER.z); close(o.y, OVER.y + 120);
  close(PLANE.yaw, 3 * Math.PI / 4);   // north-east: +x east, -z north
  planeAt(OVER, 1000, o);
  close(o.y, OVER.y + 120 + 1000 * Math.tan(3 * Math.PI / 180), 1e-6);
  assert.ok(o.x < OVER.x && o.z > OVER.z, 'south-west of the line before it gets there');
  close(Math.hypot(o.x - OVER.x, o.z - OVER.z), 1000, 1e-6);
  planeAt(OVER, -500, o);
  assert.ok(o.x > OVER.x && o.z < OVER.z && o.y < OVER.y + 120, 'and on down to the north-east past it');
  assert.ok(PLANE.speed >= 60 && PLANE.speed <= 80, 'an airliner\'s approach speed');
  planeAt(OVER, -PLANE.past, o);
  assert.ok(o.y - OVER.y >= 20, `still only ${(o.y - OVER.y).toFixed(0)} m up when it's gone`);
  planeAt(OVER, -PLANE.past, o);
  assert.ok(o.y - OVER.y >= 20, `still ${(o.y - OVER.y).toFixed(0)} m up when it's gone`);
});

// a run at a steady speed through the window: when the plane is over the line, and where the front is then
// (from a standstill, gathering speed at the Metro Glide's 1 m/s/s, as it leaves a platform)
function planeRun({ dir, v, legS, secs = 200, dt = 1 / 30, meet = 1300, s0 = 1100, s1 = 1500, here = () => true, vAt = (t) => Math.min(v, t) }) {
  let st = null, overAt = null, roars = 0, first = null, t = 0;
  const sgn = dir === 'back' ? -1 : 1;
  for (; t < secs; t += dt) {
    const sp = vAt(t);
    const was = st ? st.d : null;
    st = planeStep(st, { here: here(t), legS, v: sp, top: 120 / 3.6, accel: 1, dir, dt, meet, s0, s1 });
    if (st.roar) roars++;
    if (st.shown && first === null) first = { t, d: st.d, legS };
    if (was !== null && was > 0 && st.d <= 0 && overAt === null) overAt = legS;
    legS += sgn * sp * dt;
  }
  return { st, overAt, roars, first };
}

test('it comes in from far off and is over the line as your front is, either way, at a good speed', () => {
  for (const v of [120 / 3.6, 100 / 3.6, 80 / 3.6]) for (const [dir, legS] of [['out', 0], ['back', FC.length]]) {
    const r = planeRun({ dir, v, legS });
    assert.ok(r.overAt !== null && Math.abs(r.overAt - 1300) < 20, `${dir} at ${v.toFixed(1)}: over the line as the front is at ${r.overAt}`);
    assert.ok(r.first.d >= 2500, `${dir} at ${v.toFixed(1)}: first seen only ${r.first.d.toFixed(0)} m off`);
    assert.equal(r.roars, 1);
    assert.equal(r.st.mode, 'gone', 'and away');
  }
});

test('crawling along it can\'t wait for you (an airliner can\'t slow enough), but it still comes over the line ahead of you', () => {
  for (const v of [16, 12, 8]) for (const [dir, legS] of [['out', 0], ['back', FC.length]]) {
    const r = planeRun({ dir, v, legS, secs: 400 });
    assert.ok(r.overAt !== null && Math.abs(r.overAt - 1300) < 400, `${dir} at ${v}: over the line as the front is at ${r.overAt}`);
    assert.ok((1300 - r.overAt) * (dir === 'back' ? -1 : 1) >= -20, `${dir} at ${v}: not behind you`);
  }
});

test('soonest: how long the train takes to go so far at full throttle from its speed now', () => {
  close(soonest(100, 10, 10, 1), 10);
  close(soonest(50, 0, 30, 1), 10);                       // 1/2 a t^2
  close(soonest(1000, 0, 20, 1), 20 + (1000 - 200) / 20);  // 20 s gathering speed over 200 m, then at 20 m/s
  assert.equal(soonest(-5, 10, 20, 1), 0);
  close(soonest(100, 0, 20, 0), 5, 1e-9);                  // (no accel given: at its top speed)
});

test('re-timed as you slow or speed up, so it still comes over you', () => {
  for (const [a, b] of [[30, 24], [24, 30]]) {
    const r = planeRun({ dir: 'out', legS: 0, v: 0, vAt: (t) => Math.min(t, t < 30 ? a : b) });
    assert.ok(Math.abs(r.overAt - 1300) < 15, `${a} then ${b}: over at ${r.overAt}`);
  }
});

test('standing still it comes only once you are inside its window, and once a run', () => {
  let r = planeRun({ dir: 'out', v: 0, legS: 900, secs: 20, vAt: () => 0 });
  assert.equal(r.first, null, 'not while you wait short of the window');
  r = planeRun({ dir: 'out', v: 0, legS: 1050, secs: 20, vAt: () => 2.5 });
  assert.equal(r.first, null, 'nor creeping up to it below 3 m/s: not timed to you');
  r = planeRun({ dir: 'out', v: 0, legS: 1150, secs: 5, vAt: () => 2.5 });
  assert.ok(r.first && r.first.d >= PLANE.far - 1, 'inside it, creeping, it comes from far off as if you stood');
  r = planeRun({ dir: 'out', v: 0, legS: 1200, secs: 120, vAt: () => 0 });
  assert.ok(r.first && r.first.d >= PLANE.far - 1, 'from far off');
  assert.equal(r.st.mode, 'gone');
  assert.equal(planeStep(r.st, { here: true, legS: 1200, v: 0, dir: 'out', dt: 0.1, meet: 1300, s0: 1100, s1: 1500 }).shown, false, 'not again');
  const again = planeStep(r.st, { here: false, legS: null, v: 0, dir: null, dt: 0.1, meet: 1300, s0: 1100, s1: 1500 });
  assert.equal(again.mode, 'wait', 'until the next run');
  assert.equal(again.shown, false);
});
