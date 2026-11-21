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

test('rectangular pads, turned', () => {
  const t = makeTerrain({ pads: [{ x: 500, z: 500, w: 100, d: 40, rot: Math.PI / 2, y: 5 }], base: 8, seed: 3 });
  near(t.heightAt(500, 545), 5, 0.01);     // turned 90°: the 100 m side runs along z
  assert.ok(Math.abs(t.heightAt(545, 500) - 5) > 0.01, 'outside the turned pad');
});

test('a patch takes its own ground inside and blends out from its edge', () => {
  // a kit's ground: a slope in its own frame over a 40 m square of land, placed at (1000, 2, 1000) turned half round.
  // sample(lx, lz) gives the height at the nearest point of its land and how far outside the land the point is.
  const clamp = (v) => Math.max(-20, Math.min(20, v));
  const patch = {
    x: 1000, y: 2, z: 1000, rot: Math.PI, drop: 0.2,
    sample: (lx, lz) => ({ h: clamp(lz) * 0.1, d: Math.hypot(lx - clamp(lx), lz - clamp(lz)) }),
  };
  const t = makeTerrain({ patches: [patch], base: 8, seed: 3 });
  // inside: kit local (0, 10) is world (1000, 990) after the half turn; kit ground there is 1, world 3, sunk 0.2
  near(t.heightAt(1000, 990), 2 + 1 - 0.2, 0.01);
  // just outside the edge it matches the kit's edge height
  near(t.heightAt(1000, 1000 - 20.5), 2 + 2 - 0.2, 0.15);
  // and far away it's natural ground again
  near(t.heightAt(1000, 1100), makeTerrain({ base: 8, seed: 3 }).heightAt(1000, 1100), 0.01);
});

test('a pad can blend out over a shorter distance', () => {
  const t = makeTerrain({ pads: [{ x: 500, z: 500, w: 20, d: 20, y: 5, blend: 6 }], base: 8, seed: 3 });
  const natural = makeTerrain({ base: 8, seed: 3 });
  near(t.heightAt(517, 500), natural.heightAt(517, 500), 0.01);   // 7 m out: back to natural ground
  near(t.heightAt(510, 500), 5, 0.01);
});

test('the track bed stays level beside a kit\'s own ground', () => {
  // a kit's land 15 m from the line, much lower than the track: the bed must not be dragged down to it
  const patch = { x: 300, y: 0, z: 70, rot: 0, drop: 0.15, sample: (lx, lz) => ({ h: 0, d: Math.max(0, Math.abs(lz) - 10) }) };
  const t = makeTerrain({ routes: [route], patches: [patch], base: 8, seed: 3 });
  const s = route.length / 2;
  for (const d of [-2, 0, 2]) { const p = route.offsetAt(s, d); near(t.heightAt(p.x, p.z), route.at(s).y - BED_DROP, 0.01, `d=${d}`); }
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

// ---- features: massifs, mesas, canyons; biomes ----
const flat = (o = {}) => makeTerrain({ base: 8, seed: 3, ...o });
const plain = flat();

test('a massif rises toward its centre', () => {
  const t = flat({ features: [{ kind: 'massif', x: 500, z: 500, r: 700, h: 300 }] });
  assert.ok(t.heightAt(500, 500) >= 0.8 * 300, `centre ${t.heightAt(500, 500).toFixed(1)}`);
  assert.ok(t.heightAt(500, 500) > t.heightAt(500 + 350, 500) && t.heightAt(500 + 350, 500) > plain.heightAt(500 + 350, 500) + 20);
  near(t.heightAt(500 + 900, 500), plain.heightAt(500 + 900, 500), 0.01, 'beyond r + 200');
});

test('a mesa is flat on top and steep at its edge', () => {
  const t = flat({ features: [{ kind: 'mesa', x: 0, z: 0, r: 120, h: 60 }] });
  const top = [];
  for (let a = 0; a < 6.28; a += 0.4) for (const d of [0, 40, 84]) top.push(t.heightAt(Math.cos(a) * d, Math.sin(a) * d));
  assert.ok(Math.max(...top) - Math.min(...top) < 2, `top varies ${(Math.max(...top) - Math.min(...top)).toFixed(2)} m`);
  assert.ok(top[0] > plain.heightAt(300, 0) + 40);
  const slope = Math.abs(t.heightAt(121, 0) - t.heightAt(119, 0)) / 2;
  assert.ok(slope > 1, `edge slope ${slope.toFixed(2)}`);
});

test('a canyon walls the route', () => {
  const r = makeRoute([{ x: 0, y: 10, z: 0 }, { x: 600, y: 10, z: 0 }, { x: 1200, y: 10, z: 0 }]);
  const t = flat({ routes: [r], legs: { c: r }, features: [{ kind: 'canyon', leg: 'c', s0: 300, s1: 900, depth: 50, width: 20 }] });
  for (const s of [450, 600, 750]) for (const side of [-40, 40]) {
    assert.ok(t.heightAt(s, side) >= 10 + 0.8 * 50, `s=${s} side=${side}: ${t.heightAt(s, side).toFixed(1)}`);
  }
  for (const s of [450, 600, 750]) for (const d of [-5, 0, 5]) near(t.heightAt(s, d), 10 - BED_DROP, 0.01, 'bed');
  assert.ok(t.heightAt(50, 40) < 10 + 20, 'no wall before s0');
});

test('snow lies high in the snow biome only', () => {
  const peak = { kind: 'massif', x: 0, z: 0, r: 700, h: 300 };
  const snowy = flat({ features: [peak], biomes: [{ kind: 'snow', x: 0, z: 0, r: 1500 }] });
  const grassy = flat({ features: [peak], biomes: [{ kind: 'grass', x: 0, z: 0, r: 1500 }] });
  assert.ok(snowy.heightAt(0, 0) > 120);
  assert.equal(snowy.regionAt(0, 0), 'snow');
  assert.notEqual(grassy.regionAt(0, 0), 'snow');
  assert.notEqual(snowy.regionAt(1400, 1400), 'snow', 'low ground is not snow');
});

test('desert biome gives red earth and sand; urban gives paving', () => {
  const t = flat({ biomes: [{ kind: 'desert', x: 0, z: 0, r: 800 }, { kind: 'urban', x: 3000, z: 0, r: 400 }] });
  const seen = new Set();
  for (let x = -600; x <= 600; x += 25) for (let z = -600; z <= 600; z += 25) seen.add(t.regionAt(x, z));
  assert.ok(seen.has('sand') && seen.has('redrock'), [...seen].join());
  assert.equal(t.regionAt(3000, 0), 'paving');
  assert.equal(t.regionAt(-5000, 0), 'grass');
});

test('natural ignores the track bed', () => {
  const p = route.at(route.length / 2);
  near(terrain.heightAt(p.x, p.z), p.y - BED_DROP, 0.01);
  assert.ok(Math.abs(terrain.natural(p.x, p.z) - (p.y - BED_DROP)) > 0.5, 'natural is the land, not the bed');
  near(plain.natural(120, 80), plain.heightAt(120, 80), 1e-9, 'with nothing laid, natural is the height');
});

test('the world: features never lift ground above a bed, and stay clear of stations', () => {
  const t = worldTerrain();
  for (const id of Object.keys(LEGS)) {
    const r = makeRoute(LEGS[id].points);
    for (let s = 0; s <= r.length; s += 20) {
      const p = r.at(s);
      for (const d of [-6, 0, 6]) { const q = r.offsetAt(s, d); near(t.heightAt(q.x, q.z), p.y - BED_DROP, 0.2, `${id} s=${s}`); }
    }
  }
  // the land is truly high round the Mountain, and desert round the Wild West
  assert.ok(t.heightAt(2900, 420) > 150, 'massif');
  assert.ok(['sand', 'redrock'].includes(t.regionAt(3200, 2200)), t.regionAt(3200, 2200));
});

test('the world terrain stays walkable with its features', () => {
  const t = worldTerrain();
  let seed = 11;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  let worst = 0;
  for (let i = 0; i < 30000; i++) {
    const x = 1500 + rnd() * 2200, z = 0 + rnd() * 2400;
    if (x > 2700 && x < 3100 && z > 1200 && z < 1750) continue;   // the canyon's walls are meant to be sheer
    const a = t.heightAt(x, z), step = Math.max(Math.abs(a - t.heightAt(x + 1, z)), Math.abs(a - t.heightAt(x, z + 1)));
    worst = Math.max(worst, step);
  }
  assert.ok(worst <= 3, `steepest step ${worst.toFixed(2)} m per metre`);
});
