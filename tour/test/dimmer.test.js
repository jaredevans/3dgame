import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeDimmer } from '../dimmer.js';

// lights that count how often they are written
function light(v) {
  let x = v, writes = 0;
  return { get intensity() { return x; }, set intensity(y) { x = y; writes++; }, get writes() { return writes; } };
}

test('entering and leaving a tunnel returns every light to its base', () => {
  const ls = [light(1), light(2.5), light(0.85)];
  const dim = makeDimmer(() => ls);
  dim.update(0.5);
  assert.deepEqual(ls.map((l) => l.intensity), [0.5, 1.25, 0.425]);
  dim.update(0.85);
  assert.ok(Math.abs(ls[1].intensity - 2.5 * 0.15) < 1e-12);
  dim.update(0);
  assert.deepEqual(ls.map((l) => l.intensity), [1, 2.5, 0.85]);
});

test('with darkness 0 nothing is written', () => {
  const ls = [light(1), light(2)];
  const dim = makeDimmer(() => ls);
  for (let i = 0; i < 100; i++) dim.update(0);
  dim.setTime(() => {});
  assert.deepEqual(ls.map((l) => l.writes), [0, 0]);
  // and an unchanged darkness is not written again
  dim.update(0.4); dim.update(0.4); dim.update(0.4);
  assert.deepEqual(ls.map((l) => l.writes), [1, 1]);
});

test('a sky-stage change inside a tunnel leaves the base right once you are out', () => {
  // the time of day sets the first light outright and leaves the second alone
  const ls = [light(1), light(2)];
  const dim = makeDimmer(() => ls);
  dim.update(0.8);
  for (let k = 0; k < 5; k++) dim.setTime(() => { ls[0].intensity = 3; });   // several stage changes while dim
  assert.ok(Math.abs(ls[0].intensity - 3 * 0.2) < 1e-12, 'still dimmed, from its new base');
  assert.ok(Math.abs(ls[1].intensity - 2 * 0.2) < 1e-12, 'untouched light keeps its old base');
  dim.update(0);
  assert.deepEqual(ls.map((l) => l.intensity), [3, 2]);
});

test('a light added while dim is taken at its own strength', () => {
  const ls = [light(1)];
  const dim = makeDimmer(() => ls);
  dim.update(0.5);
  ls.push(light(4));
  dim.update(0.6);
  assert.ok(Math.abs(ls[1].intensity - 4 * 0.4) < 1e-12);
  dim.update(0);
  assert.deepEqual(ls.map((l) => l.intensity), [1, 4]);
});
