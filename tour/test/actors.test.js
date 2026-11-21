// Which of an animal's own clips plays at a speed (actors/clips.js), and where the rainbow stands (actors/paths.js):
// pure, no three.js.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { clipFor } from '../actors/clips.js';
import { rainbowArc, arcAboveHorizon, workTrainStep } from '../actors/paths.js';

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
