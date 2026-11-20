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
const world = makeWalkWorld({ place, terminus, terrain, seaLevel: 0, radius: 75 });

test('on the kit\'s land you stand on its ground', () => {
  assert.equal(world.heightAt(0, 0), 1.2);
});

test('inside the kit\'s box but off its land you stand on the terrain, not its underside', () => {
  assert.equal(world.heightAt(15, 0), 3);
  assert.ok(world.inBounds(15, 0));
});

test('the sea is out of bounds, inside the box or out of it', () => {
  assert.equal(world.inBounds(35, 0), false);
  const seaInBox = makeWalkWorld({ place: { ...place, onLand: () => false }, terminus, terrain: { heightAt: () => -0.3 }, seaLevel: 0, radius: 75 });
  assert.equal(seaInBox.inBounds(15, 0), false);
});

test('platforms and the track still rule near the station', () => {
  const station = { walk: { onTrack: (x) => x > 50, inStation: () => true, platformY: (x) => (x > 40 && x <= 50 ? 4.2 : null), blocked: () => null } };
  const w = makeWalkWorld({ place, terminus: station, terrain, seaLevel: 0, radius: 75 });
  assert.equal(w.heightAt(45, 0), 4.2);
  assert.equal(w.inBounds(55, 0), false);
});
