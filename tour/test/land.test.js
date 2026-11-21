import { test } from 'node:test';
import assert from 'node:assert/strict';
import { landSampler } from '../land.js';

// an island 20 m square with its ground at 2 m, its underside a flat skirt at -23 m round it (the Alpine kit's case),
// its terrain 40 m wide
const island = (top = 2) => ({
  bounds: { min: { x: -10, z: -10 }, max: { x: 10, z: 10 } },
  terrain: { userData: { terrain: { width: 40 } } },
  groundAt: (x, z) => (Math.abs(x) <= 10 && Math.abs(z) <= 10 ? top : -23.3),
});

test('on the land a point reads the kit\'s ground; off it, the nearest land\'s height and how far away it is', () => {
  const land = landSampler(island(), -21);
  assert.deepEqual(land.sample(0, 0), { h: 2, d: 0 });
  const off = land.sample(15, 0);
  assert.equal(off.h, 2);
  assert.equal(off.d, 5);
});

test('a point just past the rim, in a cell that is land, never reads the underside', () => {
  const land = landSampler(island(), -21);
  // (10.3, 0) rounds to the land cell at x = 10, but the kit's ground there is its skirt
  assert.deepEqual(land.sample(10.3, 0), { h: 2, d: 0 });
});

test('land below the default floor counts only when the place sets its own', () => {
  // with the default floor (-2), ground at -13 is underside: there is no land at all
  assert.notEqual(landSampler(island(-13)).sample(0, 0).d, 0);
  assert.deepEqual(landSampler(island(-13), -21).sample(0, 0), { h: -13, d: 0 });
});

test('the grid reaches past the kit\'s terrain by the patch blend', () => {
  const land = landSampler(island(), -21);
  assert.ok(land.sample(45, 0), 'covered 25 m past the 20 m half-width');
  assert.equal(land.sample(48, 0), null);
});
