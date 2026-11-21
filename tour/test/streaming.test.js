import { test } from 'node:test';
import assert from 'node:assert/strict';
import { wantedSet, neededToDrive } from '../streaming.js';

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

// a place's kit is built in one go (buildKit can't be split across frames), so nothing new is asked for while you
// drive: what lies beyond the place you're heading for is built once you've stopped there
test('past halfway, still only the leg and its two places', () => {
  same(wantedSet({ leg: 'ocean-mountain', s: 900 }, ring), ['ocean-mountain', 'ocean', 'mountain']);
  same(wantedSet({ leg: 'ocean-mountain', s: 900, back: true }, ring), ['ocean-mountain', 'ocean', 'mountain']);
});

test('stopped at a platform, what you can take from that place too', () => {
  same(wantedSet({ leg: 'ocean-mountain', s: 1490, at: 'mountain' }, ring),
    ['ocean-mountain', 'ocean', 'mountain', 'mountain-west', 'west']);
  same(wantedSet({ leg: 'ocean-mountain', s: 10, back: true, at: 'ocean' }, ring),
    ['ocean-mountain', 'ocean', 'mountain', 'city-ocean', 'city']);
});

test('you can set off along a leg once its two places are in, and none of it is new by then', () => {
  for (const leg of ring.legs) {
    same(neededToDrive(leg), [leg, ...leg.split('-')]);
    for (const end of leg.split('-')) {
      const there = wantedSet({ place: end }, ring);
      for (const id of neededToDrive(leg)) assert.ok(there.has(id), `${id} is wanted on foot at ${end}, before you board for ${leg}`);
    }
  }
});

test('round the ring both ways, nothing is asked for that was not already wanted when you last stood still', () => {
  for (const back of [false, true]) {
    const order = back ? [...ring.legs].reverse() : ring.legs;
    let still = wantedSet({ place: 'city' }, ring);
    for (const leg of order) {
      const [a, b] = leg.split('-'), to = back ? a : b;
      for (let s = 0; s <= 1500; s += 50) {
        for (const id of wantedSet({ leg, s, back }, ring)) assert.ok(still.has(id), `${id} first wanted while driving ${leg} at s ${s}`);
      }
      still = wantedSet({ leg, s: back ? 10 : 1490, back, at: to }, ring);   // stopped at the platform: may build
      still = new Set([...still, ...wantedSet({ place: to }, ring)]);
    }
  }
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

// a train may leave (boarded, or setting off from a platform) once what it needs is in, its leg's suburbs too, and
// nothing else is still being built: a build that finished as you pulled away would land on a moving frame
test('a train may leave only once what it needs is in and nothing is still being built', async () => {
  const { readyToLeave } = await import('../streaming.js');
  const all = new Set(['ocean-mountain', 'ocean', 'mountain', 'train:ocean-mountain']);
  const has = (id) => all.has(id);
  assert.equal(readyToLeave('ocean-mountain', { has, busy: false, settled: () => true }), true);
  assert.equal(readyToLeave('ocean-mountain', { has, busy: true, settled: () => true }), false, 'the next town still building');
  assert.equal(readyToLeave('ocean-mountain', { has, busy: false, settled: () => false }), false, 'its suburbs still building');
  assert.equal(readyToLeave('ocean-mountain', { has: (id) => id !== 'mountain' && has(id), busy: false, settled: () => true }), false);
});

// boarding waits on builds the train doesn't need (the next town along, still coming in, or hung) only for a few
// seconds: after that you may go, and what's still building waits for your next standstill to land. What the train
// does need is never skipped
test('a train may leave once what it needs is in, after a few seconds at most of waiting on anything else', async () => {
  const { readyToLeave, WAIT_MAX } = await import('../streaming.js');
  assert.ok(WAIT_MAX >= 5 && WAIT_MAX <= 10, `${WAIT_MAX} s`);
  const all = new Set(['ocean-mountain', 'ocean', 'mountain', 'train:ocean-mountain']);
  const has = (id) => all.has(id);
  assert.equal(readyToLeave('ocean-mountain', { has, busy: true, waited: WAIT_MAX - 0.1 }), false);
  assert.equal(readyToLeave('ocean-mountain', { has, busy: true, waited: WAIT_MAX }), true, 'waited long enough');
  assert.equal(readyToLeave('ocean-mountain', { has: (id) => id !== 'mountain' && has(id), busy: true, waited: 1e9 }), false,
    'never without what it needs');
  // its own suburbs are optional scenery: waited on like anything else, and once you've waited WAIT_MAX s you may go
  // without them (the page leaves them out as you board)
  assert.equal(readyToLeave('ocean-mountain', { has, busy: true, settled: () => false, waited: WAIT_MAX - 0.1 }), false,
    'its own suburbs still coming in: waited on a while');
  assert.equal(readyToLeave('ocean-mountain', { has, busy: true, settled: () => false, waited: WAIT_MAX }), true,
    'but no longer than anything else');
});
