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
