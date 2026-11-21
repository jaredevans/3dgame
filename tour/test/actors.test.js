// Which of an animal's own clips plays at a speed (actors/clips.js), and where the rainbow stands (actors/paths.js):
// pure, no three.js.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { clipFor } from '../actors/clips.js';
import { rainbowArc, arcAboveHorizon, workTrainStep, herdPath, paceStep, PACE } from '../actors/paths.js';
import { legRoute } from '../world-data.js';

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
