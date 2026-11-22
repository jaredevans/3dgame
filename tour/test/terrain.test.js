import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeRoute } from '../route.js';
import { makeTerrain, BED_DROP, BED_HALF, cellKey } from '../terrain.js';
import { worldTerrain, LEGS, FEATURES, PLACES, SEA_LEVEL, legRoute, legSections, coachRoad, BENCH } from '../world-data.js';
import { sectionAt } from '../structures.js';

const near = (a, b, tol, msg) => assert.ok(Math.abs(a - b) <= tol, `${msg ?? ''} expected ${b} ± ${tol}, got ${a}`);
// the world's tunnel portals: where the ground steps from a cutting up over a tunnel, on purpose (structures.test.js
// checks the ground round them)
const portals = Object.keys(LEGS).flatMap((id) => legSections(id).filter((s) => s.kind === 'tunnel')
  .flatMap((s) => [legRoute(id).at(s.s0), legRoute(id).at(s.s1)]));
const byPortal = (x, z) => portals.some((p) => Math.hypot(p.x - x, p.z - z) < 45);
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
    if (byPortal(x, z)) continue;
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
      if (sectionAt(legSections(id), s)) continue;   // bridges and tunnels have no bed (structures.test.js)
      const p = r.at(s);
      for (const d of [-6, 0, 6]) { const q = r.offsetAt(s, d); near(t.heightAt(q.x, q.z), p.y - BED_DROP, 0.2, `${id} s=${s}`); }
    }
  }
  // the land is truly high round the Mountain, and desert round the Wild West
  assert.ok(t.heightAt(2900, 420) > 150, 'massif');
  assert.ok(['sand', 'redrock'].includes(t.regionAt(3200, 2200)), t.regionAt(3200, 2200));
});

test('the world terrain stays walkable: gentle near lines and places, no cliffs except the declared ones', () => {
  const t = worldTerrain();
  // what is meant to be sheer, derived from the features themselves: the canyon's walls (its leg between s0..s1, width) and mesa edges
  const cn = FEATURES.filter((f) => f.kind === 'canyon').map((f) => {
    const r = legRoute(f.leg), pts = [];
    for (let s = Math.max(0, f.s0 - 120); s <= Math.min(r.length, f.s1 + 120); s += 10) pts.push(r.at(s));
    return { pts, reach: f.width / 2 + 70 };
  });
  const mesas = FEATURES.filter((f) => f.kind === 'mesa').map((m) => ({ ...m, e: Math.min(m.h / 3, 0.25 * m.r) + 4 }));
  const lines = [];
  for (const id of Object.keys(LEGS)) { const r = legRoute(id); for (let s = 0; s <= r.length; s += 20) lines.push(r.at(s)); }
  for (const p of Object.values(PLACES)) lines.push({ x: p.centre.x, z: p.centre.z, r: 160 });
  let seed = 11;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  // (the stagecoach's road is cut into the col's steep flank: its cut and fill are declared, measured on their own below)
  const road = coachRoad().pts, reach = BENCH.half + BENCH.blend + 1;
  const box = road.reduce((b, p) => ({ x0: Math.min(b.x0, p.x - reach), x1: Math.max(b.x1, p.x + reach), z0: Math.min(b.z0, p.z - reach), z1: Math.max(b.z1, p.z + reach) }), { x0: Infinity, x1: -Infinity, z0: Infinity, z1: -Infinity });
  const onBench = (x, z) => x > box.x0 && x < box.x1 && z > box.z0 && z < box.z1 && road.some((p) => Math.hypot(p.x - x, p.z - z) < reach);
  let worstNear = 0, worstFar = 0, counted = 0;
  for (let i = 0; i < 120000; i++) {
    const x = -1400 + rnd() * 5200, z = -300 + rnd() * 2900;
    if (Math.abs(t.coastDistance(x, z)) < 100) continue;                                   // the coast profile has its own cliffs
    if (cn.some((c) => c.pts.some((p) => Math.hypot(p.x - x, p.z - z) < c.reach))) continue;
    if (mesas.some((m) => Math.abs(Math.hypot(x - m.x, z - m.z) - m.r) < m.e)) continue;
    if (byPortal(x, z)) continue;
    if (onBench(x, z)) continue;
    const a = t.heightAt(x, z), step = Math.max(Math.abs(a - t.heightAt(x + 1, z)), Math.abs(a - t.heightAt(x, z + 1)));
    counted++;
    if (lines.some((p) => Math.hypot(p.x - x, p.z - z) < (p.r ?? 150))) worstNear = Math.max(worstNear, step);
    else worstFar = Math.max(worstFar, step);
  }
  assert.ok(counted > 50000, `sampled ${counted}`);
  assert.ok(worstNear <= 2, `near a line or place: steepest ${worstNear.toFixed(2)} m per metre`);
  assert.ok(worstFar <= 3, `elsewhere: steepest ${worstFar.toFixed(2)} m per metre`);
});

test('a canyon naming a leg that is not given throws', () => {
  assert.throws(() => flat({ features: [{ kind: 'canyon', leg: 'nope', s0: 0, s1: 100, depth: 50, width: 20 }] }), /canyon.*'nope'/);
  assert.throws(() => flat({ legs: { other: route }, features: [{ kind: 'canyon', leg: 'nope', s0: 0, s1: 100, depth: 50, width: 20 }] }), /other/);
});

test('a biome always holds its own centre and does not reach far past its radius', () => {
  for (const r of [30, 80, 300, 900]) {
    const t = flat({ biomes: [{ kind: 'urban', x: 500, z: -400, r }] });
    assert.equal(t.regionAt(500, -400), 'paving', `r=${r} centre`);
    let maxD = 0;
    for (let a = 0; a < 6.283; a += 0.05) for (let d = 0; d < 1.6 * r; d += Math.max(1, r / 60)) {
      if (t.regionAt(500 + Math.cos(a) * d, -400 + Math.sin(a) * d) === 'paving') maxD = Math.max(maxD, d);
    }
    assert.ok(maxD <= 1.31 * r, `r=${r}: paving reaches ${maxD.toFixed(0)}`);
  }
});

test('inland ground never dips to the sea', () => {
  const t = worldTerrain();
  let seed = 17, low = Infinity, n = 0;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  for (let i = 0; i < 60000; i++) {
    const x = -1400 + rnd() * 5200, z = -300 + rnd() * 2900;
    if (t.coastDistance(x, z) < 330) continue;      // inland of the coast's own profile (positive = land side)
    n++; low = Math.min(low, t.heightAt(x, z));
  }
  assert.ok(n > 20000);
  assert.ok(low >= SEA_LEVEL + 1 - 1e-6, `lowest inland ground ${low.toFixed(2)} m`);
});

test('the snowy pass: ground beside the highest stretch of Mountain -> Wild West reads snow', () => {
  const t = worldTerrain(), r = legRoute('mountain-west');
  let top = 0;
  for (let s = 0; s <= r.length; s += 10) top = Math.max(top, r.at(s).y);
  let checked = 0;
  for (let s = 0; s <= r.length; s += 10) {
    if (r.at(s).y < top - 1) continue;
    for (const d of [-80, -50, -20, 20, 50, 80]) {
      const q = r.offsetAt(s, d);
      assert.equal(t.regionAt(q.x, q.z), 'snow', `s=${s} d=${d} at (${q.x.toFixed(0)}, ${q.z.toFixed(0)})`);
      checked++;
    }
  }
  assert.ok(checked >= 12, `checked ${checked}`);
  // Phase 1's land (City <-> Oceanside) holds no snow
  const co = legRoute('city-ocean');
  for (let s = 0; s <= co.length; s += 40) for (const d of [-60, 60]) { const q = co.offsetAt(s, d); assert.notEqual(t.regionAt(q.x, q.z), 'snow'); }
});

test('adding a patch dirties the chunks it touches', () => {
  const t = makeTerrain({ base: 8, seed: 3 });
  assert.equal(t.takeDirty().size, 0);
  // a flat island 20 m round at (500, 4, 300): its land within r of its origin
  const patch = { x: 500, y: 4, z: 300, rot: 0, drop: 0, r: 20, sample: (lx, lz) => ({ h: 0, d: Math.max(0, Math.hypot(lx, lz) - 20) }) };
  const before = t.heightAt(500, 300);
  t.addPatch(patch);
  assert.ok(Math.abs(t.heightAt(500, 300) - 4) < 0.01, 'the patch is in the ground');
  // every chunk within 60 m of its land: the one it's in, and the three whose edges lie 12 and 44 m from it
  assert.deepEqual([...t.takeDirty()].sort(), ['c:1,0', 'c:1,1', 'c:2,0', 'c:2,1']);
  assert.equal(t.takeDirty().size, 0, 'taken once');
  t.removePatch(patch);
  assert.ok(Math.abs(t.heightAt(500, 300) - before) < 1e-9, 'gone again');
  assert.deepEqual([...t.takeDirty()].sort(), ['c:1,0', 'c:1,1', 'c:2,0', 'c:2,1']);
  t.removePatch(patch);                               // not there: nothing changes
  assert.equal(t.takeDirty().size, 0);
});

test('colouring can be given the height and slope it would otherwise work out', () => {
  const t = makeTerrain({ base: 8, seed: 3 });
  assert.equal(t.regionAt(100, 100, -3, 0), 'sea');
  assert.equal(t.regionAt(100, 100, 12, 2), 'rock');
  assert.equal(t.regionAt(100, 100, 12, 0), 'grass');
  // and left out, it works them out as before
  assert.equal(t.regionAt(100, 100), t.regionAt(100, 100, t.heightAt(100, 100), 0));
});

test('a road\'s grid cells are keyed by number (no string made each time the ground is asked for), one key a cell', () => {
  const seen = new Set();
  for (let i = -300; i <= 300; i += 7) for (let j = -300; j <= 300; j += 7) {
    const k = cellKey(i, j);
    assert.equal(typeof k, 'number');
    assert.ok(Number.isSafeInteger(k));
    seen.add(k);
  }
  assert.equal(seen.size, 86 * 86);
  assert.notEqual(cellKey(-1, 0), cellKey(0, -1));
  assert.notEqual(cellKey(1, -32768), cellKey(0, 32767));   // (the edges of its range)
});

test('a road\'s bench: level across its middle, back to the land beyond its reach, never on a line\'s formation', () => {
  // a straight line along z, and a road beside it 20 m out that swings in to 9 m from it; on the noise's rolling land
  const line = makeRoute([{ x: 0, y: 12, z: -400 }, { x: 0, y: 12, z: 400 }]);
  const pts = [];
  for (let z = -300; z <= 300; z += 2) pts.push({ x: z < 100 ? 20 : 20 - Math.min(11, (z - 100) * 0.1), z });
  const opts = { routes: [line], base: 8, seed: 5 };
  const plain = makeTerrain(opts), cut = makeTerrain({ ...opts, roads: [{ pts, half: 3, blend: 9 }] });
  let level = 0, reached = 0;
  for (let i = 5; i < pts.length - 5; i += 3) {
    const p = pts[i], q = pts[i + 1], dx = q.x - p.x, dz = q.z - p.z, len = Math.hypot(dx, dz), lx = dz / len, lz = -dx / len;
    const mid = cut.heightAt(p.x, p.z);
    // level across its middle (bar where it comes into the line's track bed's blend, which it takes over)
    for (const d of [-3, -1.5, 1.5, 3]) {
      const h = cut.heightAt(p.x + lx * d, p.z + lz * d);
      if (p.x + lx * d > BED_HALF + 3) { level = Math.max(level, Math.abs(h - mid) / Math.abs(d)); }
    }
    // beyond its reach, the land as it was
    for (const d of [-14, 14]) {
      const x = p.x + lx * d, z = p.z + lz * d;
      assert.equal(cut.heightAt(x, z), plain.heightAt(x, z), `the land moved ${d} m from the road at ${z}`);
      reached++;
    }
  }
  assert.ok(level < 0.02, `the bench falls ${(level * 100).toFixed(1)}% across`);
  assert.ok(reached > 50);
  // the line's formation untouched, even where the road's bench reaches it
  for (let z = -300; z <= 300; z += 5) for (const x of [0.5 - BED_HALF, -3, 0, 3, BED_HALF - 0.5]) assert.equal(cut.heightAt(x, z), plain.heightAt(x, z), `the formation moved at ${x}, ${z}`);
  // and the land away from the road just as it was
  for (let z = -380; z <= 380; z += 20) for (const x of [-120, -60, 60, 120]) assert.equal(cut.heightAt(x, z), plain.heightAt(x, z));
});

test('the stagecoach\'s road: its cut and fill are steep (a road cut into a hillside) but no cliff', () => {
  const t = worldTerrain(), { line } = coachRoad();
  let worst = 0;
  for (let s = 0; s <= line.length; s += 2) for (let d = -14; d <= 14; d += 1) {
    const o = line.offsetAt(s, d), a = t.heightAt(o.x, o.z);
    worst = Math.max(worst, Math.abs(a - t.heightAt(o.x + 1, o.z)), Math.abs(a - t.heightAt(o.x, o.z + 1)));
  }
  assert.ok(worst <= 2.6, `steepest ${worst.toFixed(2)} m per metre`);
});

// the rides' works in the land (the stagecoach road's bench, the starfighter's pad and apron) leave the railway's own
// land as it was: within 6 m of every leg's centre line (its formation, BED_HALF either side, both tracks on it) the
// same to the millimetre with them and without. And they do change the land (so the test isn't empty): the bench
// beside the Mountain -> Wild West line at leg-s ~1261-1271, 6.5-12 m out
test('the rides\' works leave the land under and beside every line as it was: no change within 6 m of any leg\'s centre', () => {
  const withRides = worldTerrain(), without = worldTerrain({ rides: false });
  assert.notEqual(without, withRides, 'the land without them is its own');
  assert.equal(worldTerrain(), withRides, 'the world\'s own land is still the one with them');
  const q = {};
  for (const id of Object.keys(LEGS)) {
    const r = legRoute(id);
    let most = 0, at = null;
    for (let s = 0; s <= r.length; s += 2) for (let o = -6; o <= 6; o += 0.5) {
      r.offsetAt(s, o, q);
      const d = Math.abs(withRides.heightAt(q.x, q.z) - without.heightAt(q.x, q.z));
      if (d > most) { most = d; at = { s, o }; }
    }
    assert.ok(most < 0.001, `${id}: the land ${most.toFixed(3)} m off at leg-s ${at?.s}, ${at?.o} m out`);
  }
  const r = legRoute('mountain-west');
  let changed = 0;
  for (let s = 1255; s <= 1280; s += 1) for (const o of [-12, -10, -8, -6.5, 6.5, 8, 10, 12]) {
    r.offsetAt(s, o, q);
    changed = Math.max(changed, Math.abs(withRides.heightAt(q.x, q.z) - without.heightAt(q.x, q.z)));
  }
  assert.ok(changed > 0.01, `the bench beside the line changes nothing (${changed.toFixed(3)} m)`);
});
