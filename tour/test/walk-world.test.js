import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeWalkWorld } from '../walk-world.js';

// A place whose kit box (|x| < 20) is bigger than its land (|x| < 10): past its land, inside its box, the kit's
// ground is its island's underside at -10.5 — the Oceanside case.
const place = {
  def: { centre: { x: 0, z: 0 } },
  blocked: () => null,
  contains: (x, z, m = 0) => Math.abs(x) < 20 + m && Math.abs(z) < 20 + m,
  onLand: (x, z) => Math.abs(x) < 10 && Math.abs(z) < 10,
  groundAt: (x, z) => (Math.abs(x) < 10 && Math.abs(z) < 10 ? 1.2 : -10.5),
};
const terminus = { walk: { onTrack: () => false, inStation: () => false, platformY: () => null, blocked: () => null } };
// land everywhere at +3, except the sea beyond x = 30
const terrain = { heightAt: (x) => (x > 30 ? -2 : 3) };
const world = makeWalkWorld({ place, termini: [terminus], terrain, seaLevel: 0, radius: 75 });

test('on the kit\'s land you stand on its ground', () => {
  assert.equal(world.heightAt(0, 0), 1.2);
});

test('inside the kit\'s box but off its land you stand on the terrain, not its underside', () => {
  assert.equal(world.heightAt(15, 0), 3);
  assert.ok(world.inBounds(15, 0));
});

test('the sea is out of bounds, inside the box or out of it', () => {
  assert.equal(world.inBounds(35, 0), false);
  const seaInBox = makeWalkWorld({ place: { ...place, onLand: () => false }, termini: [terminus], terrain: { heightAt: () => -0.3 }, seaLevel: 0, radius: 75 });
  assert.equal(seaInBox.inBounds(15, 0), false);
});

test('platforms and the track still rule near the station', () => {
  const station = { walk: { onTrack: (x) => x > 50, inStation: () => true, platformY: (x) => (x > 40 && x <= 50 ? 4.2 : null), blocked: () => null } };
  const w = makeWalkWorld({ place, termini: [station], terrain, seaLevel: 0, radius: 75 });
  assert.equal(w.heightAt(45, 0), 4.2);
  assert.equal(w.inBounds(55, 0), false);
});

const land = { heightAt: () => 3 };
// a station along x = 100 (its track |z| < 3.6, platform 3.5 <= |z| <= 8 at 4.2 m) and another along z = 100
const stationAt = (axis, y) => {
  const along = (x, z) => (axis === 'x' ? x : z), across = (x, z) => Math.abs(axis === 'x' ? z : x);
  const near = (x, z) => Math.abs(along(x, z) - 100) <= 60;
  return { walk: {
    onTrack: (x, z) => near(x, z) && across(x, z) < 3.6,
    inStation: (x, z) => near(x, z) && across(x, z) <= 30,
    platformY: (x, z) => (near(x, z) && across(x, z) >= 3.5 && across(x, z) <= 8 ? y : null),
    blocked: (x, z) => (Math.hypot(x - (axis === 'x' ? 100 : 12), z - (axis === 'x' ? 12 : 100)) < 2 ? `building ${axis}` : null),
  } };
};

test('a place\'s world merges both its stations', () => {
  const w = makeWalkWorld({ place, termini: [stationAt('x', 4.2), stationAt('z', 5.1)], terrain: land, seaLevel: 0, radius: 20 });
  assert.equal(w.heightAt(100, 5), 4.2, 'first station\'s platform');
  assert.equal(w.heightAt(5, 100), 5.1, 'second station\'s platform');
  assert.equal(w.inBounds(100, 0), false, 'first station\'s track');
  assert.equal(w.inBounds(0, 100), false, 'second station\'s track');
  assert.ok(w.inBounds(100, 20) && w.inBounds(20, 100), 'both stations are in bounds beyond the walking radius');
  assert.equal(w.blocked(100, 12, 0.35), 'building x');
  assert.equal(w.blocked(12, 100, 0.35), 'building z');
  assert.equal(w.inBounds(60, 60), false, 'between them, outside the radius');
});

test('a place with only one station built yet', () => {
  const w = makeWalkWorld({ place, termini: [stationAt('x', 4.2), undefined], terrain: land, seaLevel: 0, radius: 20 });
  assert.equal(w.heightAt(100, 5), 4.2);
  assert.equal(w.heightAt(5, 100), 3, 'no platform where the other station will be');
  assert.ok(w.inBounds(0, 100) === false && w.inBounds(100, 20));
  assert.equal(w.blocked(12, 100, 0.35), null);
});
