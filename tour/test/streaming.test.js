import { test } from 'node:test';
import assert from 'node:assert/strict';
import { wantedSet } from '../streaming.js';

const ring = {
  places: ['city', 'ocean', 'mountain', 'west', 'future'],
  legs: ['city-ocean', 'ocean-mountain', 'mountain-west', 'west-future', 'future-city'],
  length: (id) => 1500,
};
const same = (set, list) => assert.deepEqual([...set].sort(), [...list].sort());

test('at a place', () => {
  same(wantedSet({ place: 'ocean' }, ring), ['ocean', 'city-ocean', 'ocean-mountain', 'city', 'mountain']);
});

test('early on a leg', () => {
  same(wantedSet({ leg: 'ocean-mountain', s: 100 }, ring), ['ocean-mountain', 'ocean', 'mountain']);
});

test('past halfway', () => {
  same(wantedSet({ leg: 'ocean-mountain', s: 900 }, ring), ['ocean-mountain', 'ocean', 'mountain', 'mountain-west', 'west']);
});

test('past halfway going back the other way', () => {
  same(wantedSet({ leg: 'ocean-mountain', s: 900, back: true }, ring), ['ocean-mountain', 'ocean', 'mountain', 'city-ocean', 'city']);
});

test('wraps round the ring', () => {
  const w = wantedSet({ place: 'future' }, ring);
  assert.ok(w.has('future-city') && w.has('city'));
});

test('a ring with only some legs built asks only for what exists', () => {
  const small = { places: ['city', 'ocean'], legs: ['city-ocean'], length: () => 1927 };
  same(wantedSet({ place: 'city' }, small), ['city', 'city-ocean', 'ocean']);
  same(wantedSet({ leg: 'city-ocean', s: 1500 }, small), ['city-ocean', 'city', 'ocean']);
});
