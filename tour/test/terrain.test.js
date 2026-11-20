import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeRoute } from '../route.js';
import { makeTerrain, BED_DROP } from '../terrain.js';
import { worldTerrain, LEGS } from '../world-data.js';

const near = (a, b, tol, msg) => assert.ok(Math.abs(a - b) <= tol, `${msg ?? ''} expected ${b} ± ${tol}, got ${a}`);
const route = makeRoute([{ x: 0, y: 10, z: 0 }, { x: 300, y: 16, z: 40 }, { x: 600, y: 12, z: 0 }]);
const terrain = makeTerrain({ routes: [route], pads: [{ x: 900, z: 400, r: 40, y: 7 }], base: 8, seed: 3 });

test('terrain sits under the track', () => {
  for (let i = 1; i <= 10; i++) {
    const s = (route.length * i) / 11;
    for (const d of [-2, 0, 2]) {
      const p = route.offsetAt(s, d);
      near(terrain.heightAt(p.x, p.z), route.at(s).y - BED_DROP, 0.01, `s=${s.toFixed(0)} d=${d}`);
    }
  }
});

test('terrain honours pads', () => {
  near(terrain.heightAt(900, 400), 7, 0.01);
  near(terrain.heightAt(925, 410), 7, 0.01);
});

test('terrain blends out of the track bed smoothly', () => {
  // walking straight out from the track, no 1 m step is steeper than 1 in 1
  const s = route.length / 2, a = route.at(s);
  let prev = terrain.heightAt(a.x, a.z);
  for (let d = 1; d <= 60; d++) {
    const p = route.offsetAt(s, d), h = terrain.heightAt(p.x, p.z);
    assert.ok(Math.abs(h - prev) <= 1, `step at ${d} m: ${prev} -> ${h}`);
    prev = h;
  }
});

test('the world terrain is continuous', () => {
  const t = worldTerrain();
  let seed = 7;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  for (let i = 0; i < 20000; i++) {
    const x = -300 + rnd() * 2600, z = -500 + rnd() * 900;
    const a = t.heightAt(x, z), b = t.heightAt(x + 1, z), c = t.heightAt(x, z + 1);
    const step = Math.max(Math.abs(a - b), Math.abs(a - c));
    const limit = Math.abs(t.coastDistance(x, z)) < 40 ? 6 : 2;
    assert.ok(step <= limit, `step ${step.toFixed(2)} m at (${x.toFixed(0)}, ${z.toFixed(0)})`);
  }
});

test('the sea is below sea level and the track is above it', () => {
  const t = worldTerrain();
  const r = makeRoute(LEGS['city-ocean'].points);
  for (let s = 0; s <= r.length; s += 25) { const p = r.at(s); assert.ok(t.heightAt(p.x, p.z) > 2, `track at s=${s} too low`); }
  assert.equal(t.regionAt(1100, -600), 'sea');
  assert.ok(t.heightAt(1100, -600) < 0);
});
