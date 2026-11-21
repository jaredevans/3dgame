// Which of an animal's own clips plays at a speed (actors/clips.js): pure, no three.js.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { clipFor } from '../actors/clips.js';

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
