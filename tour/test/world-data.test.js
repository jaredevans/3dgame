import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeRoute } from '../route.js';
import { LEGS, PLACES, RING, laneFor, TRACK_CENTRES } from '../world-data.js';

test('the leg lies inside the limits', () => {
  const r = makeRoute(LEGS['city-ocean'].points);
  assert.ok(r.minRadius() >= 400, `tightest curve ${r.minRadius().toFixed(0)} m`);
  assert.ok(r.maxGrade() <= 0.025, `steepest grade ${(r.maxGrade() * 100).toFixed(2)}%`);
});

test('running sides', () => {
  assert.equal(TRACK_CENTRES, 4);
  assert.equal(laneFor('out'), -2);
  assert.equal(laneFor('back'), 2);
});

test('the ring is in order', () => {
  assert.deepEqual(RING.places, ['city', 'ocean', 'mountain', 'west', 'future']);
  assert.ok(PLACES.city && PLACES.ocean);
  assert.equal(LEGS['city-ocean'].from, 'city');
  assert.equal(LEGS['city-ocean'].to, 'ocean');
});
