// The scenery along the routes (scenery.js): trees, bushes, rocks and cacti scattered over each chunk of the world grid,
// on the world's own terrain. The same every time for a chunk; nothing in a line's swept path or on its track bed, on a
// pad, in a place, in its suburbs, in the sea or a river, at a tunnel's portal or under a bridge, or on steep ground;
// each part stands on its ground (never floating, never sunk past its base); each biome grows its own; and no stretch of
// open line is bare. Distances are measured by brute force against every line, every 2 m.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { LEGS, PLACES, FEATURES, SEA_LEVEL, legRoute, legSections, stationPads, placePads, worldTerrain } from '../world-data.js';
import { CHUNK } from '../chunks.js';
import { scatter, VARIANTS, CLEAR_LINE, MAX_SLOPE } from '../scenery.js';

const terrain = worldTerrain();
const lines = Object.keys(LEGS).map((id) => {
  const r = legRoute(id), pts = [];
  for (let s = 0; s <= r.length; s += 2) pts.push({ ...r.at(s), s });
  return { id, r, pts };
});
const nearest = (x, z) => {
  let best = { d: Infinity };
  for (const l of lines) for (const p of l.pts) { const d = Math.hypot(x - p.x, z - p.z); if (d < best.d) best = { d, id: l.id, s: p.s, p }; }
  return best;
};

// every chunk any line runs through or beside (within 100 m), scattered once
const chunkKeys = new Set();
for (const l of lines) for (const p of l.pts) for (const dx of [-100, 0, 100]) for (const dz of [-100, 0, 100]) {
  chunkKeys.add(`${Math.floor((p.x + dx) / CHUNK)},${Math.floor((p.z + dz) / CHUNK)}`);
}
const chunks = [...chunkKeys].map((k) => { const [i, j] = k.split(',').map(Number); return { i, j, items: scatter(i, j, CHUNK, terrain, { seed: 1 }) }; });
const items = chunks.flatMap((c) => c.items);
const near = new Map(items.map((q) => [q, nearest(q.x, q.z)]));   // each piece's nearest line point, once

// a point in a footprint rectangle (in a place's own frame, as places.js turns its kit)
function outsidePlace(p, x, z) {
  const c = Math.cos(p.rot), s = Math.sin(p.rot), [ox, oz] = p.offset ?? [0, 0], dx = x - p.centre.x, dz = z - p.centre.z;
  const lx = dx * c - dz * s, lz = dx * s + dz * c;
  return Math.hypot(Math.max(0, Math.abs(lx - ox) - p.size[0] / 2), Math.max(0, Math.abs(lz - oz) - p.size[1] / 2));
}
function outsidePad(p, x, z) {
  if (p.r !== undefined) return Math.max(0, Math.hypot(x - p.x, z - p.z) - p.r);
  const c = Math.cos(p.rot ?? 0), s = Math.sin(p.rot ?? 0), dx = x - p.x, dz = z - p.z;
  const lx = dx * c - dz * s, lz = dx * s + dz * c;
  return Math.hypot(Math.max(0, Math.abs(lx) - p.w / 2), Math.max(0, Math.abs(lz) - p.d / 2));
}
// the drawn ground at the finest detail: flat triangles on a 4 m grid, split as chunks.js splits them
function meshAt(x, z, cell = 4) {
  const a = Math.floor(x / cell), b = Math.floor(z / cell), fx = x / cell - a, fz = z / cell - b;
  const h = (u, v) => terrain.heightAt((a + u) * cell, (b + v) * cell);
  if (fx + fz <= 1) { const p = h(0, 0); return p + fx * (h(1, 0) - p) + fz * (h(0, 1) - p); }
  const s = h(1, 1); return s + (1 - fx) * (h(0, 1) - s) + (1 - fz) * (h(1, 0) - s);
}

test('scatter is the same every time for a chunk', () => {
  assert.ok(items.length > 1000, `only ${items.length} pieces along the lines`);
  for (const c of chunks.slice(0, 12)) assert.deepEqual(scatter(c.i, c.j, CHUNK, terrain, { seed: 1 }), c.items);
  // a different seed scatters it differently
  const busy = chunks.find((c) => c.items.length > 20);
  assert.notDeepEqual(scatter(busy.i, busy.j, CHUNK, terrain, { seed: 2 }), busy.items);
  // every piece within its chunk, a known part, turned and sized by its part's own knob
  for (const c of chunks) for (const q of c.items) {
    assert.ok(q.x >= c.i * CHUNK && q.x < (c.i + 1) * CHUNK && q.z >= c.j * CHUNK && q.z < (c.j + 1) * CHUNK, `a ${q.key} outside its chunk`);
    const v = VARIANTS[q.v];
    assert.ok(v && v.key === q.key, `unknown part ${q.v}`);
    assert.equal(q.s, v.params.scale ?? 1);
    assert.ok(Number.isFinite(q.ry) && Number.isFinite(q.y));
  }
  // about 60 to a chunk of open land
  const open = chunks.filter((c) => c.items.length > 0);
  const mean = open.reduce((n, c) => n + c.items.length, 0) / open.length;
  assert.ok(mean >= 35 && mean <= 80, `${mean.toFixed(1)} pieces to a planted chunk`);
});

test('nothing grows on the line, the pads, the places or the sea', () => {
  const pads = [...stationPads(), ...placePads()];
  const waters = FEATURES.filter((f) => f.kind === 'valley' && f.water);
  for (const l of lines) assert.ok(items.some((q) => near.get(q).id === l.id), `nothing along ${l.id}`);
  for (const q of items) {
    const v = VARIANTS[q.v], n = near.get(q);
    // its whole reach clear of the line's swept path and track bed
    assert.ok(n.d >= CLEAR_LINE + v.r - 0.01, `a ${q.key} reaching ${(n.d - v.r).toFixed(1)} m from ${n.id}'s centre line`);
    for (const p of pads) assert.ok(outsidePad(p, q.x, q.z) >= v.r, `a ${q.key} on a ${p.kind} pad`);
    for (const [id, p] of Object.entries(PLACES)) assert.ok(outsidePlace(p, q.x, q.z) >= 25, `a ${q.key} ${outsidePlace(p, q.x, q.z).toFixed(0)} m from ${id}`);
    assert.ok(terrain.heightAt(q.x, q.z) >= SEA_LEVEL + 0.5, `a ${q.key} at the sea`);
    // not in a river: never below its water within its valley
    for (const w of waters) {
      const dx = w.x1 - w.x0, dz = w.z1 - w.z0, t = ((q.x - w.x0) * dx + (q.z - w.z0) * dz) / (dx * dx + dz * dz);
      const d = Math.hypot(q.x - w.x0 - Math.max(0, Math.min(1, t)) * dx, q.z - w.z0 - Math.max(0, Math.min(1, t)) * dz);
      if (t >= 0 && t <= 1 && d < w.half + w.fade) assert.ok(q.y > w.floor + 1.2, `a ${q.key} in the river`);
    }
    // not in a station's precinct: the platforms' ends of each line, out past its approach
    // (to within the 2 m these distances are measured to)
    assert.ok(!(n.d < 108 && (n.s < 148 || n.s > lines.find((l) => l.id === n.id).r.length - 148)), `a ${q.key} by ${n.id}'s station`);
    // nor in the suburbs' lots
    for (const [s0, s1] of LEGS['future-city'].suburbs) {
      if (n.id === 'future-city') assert.ok(!(n.s > s0 - 28 && n.s < s1 + 28 && n.d < 78), `a ${q.key} in the suburbs`);
    }
  }
});

test('nothing grows under structures, at a portal or on steep ground', () => {
  const portals = [], decks = [];
  for (const id of Object.keys(LEGS)) for (const sec of legSections(id)) {
    const r = legRoute(id);
    if (sec.kind === 'tunnel') portals.push(r.at(sec.s0), r.at(sec.s1));
    else if (!sec.grade) for (let s = sec.s0; s <= sec.s1; s += 2) decks.push(r.at(s));
  }
  assert.ok(portals.length && decks.length);
  assert.ok(items.length > 1000, `only ${items.length} pieces along the lines`);
  for (const q of items) {
    const v = VARIANTS[q.v];
    for (const p of portals) assert.ok(Math.hypot(q.x - p.x, q.z - p.z) >= 30, `a ${q.key} at a tunnel's portal`);
    for (const p of decks) assert.ok(Math.hypot(q.x - p.x, q.z - p.z) >= CLEAR_LINE + v.r - 0.01, `a ${q.key} under a bridge`);
    // the worst one-sided rise over 4 m round it
    const h = terrain.heightAt(q.x, q.z);
    const slope = Math.max(...[[4, 0], [-4, 0], [0, 4], [0, -4]].map(([dx, dz]) => Math.abs(terrain.heightAt(q.x + dx, q.z + dz) - h) / 4));
    assert.ok(slope <= MAX_SLOPE + 1e-9, `a ${q.key} on a slope of ${slope.toFixed(2)}`);
  }
});

test('every part stands on its ground', () => {
  assert.ok(items.length > 1000, `only ${items.length} pieces along the lines`);
  for (const q of items) {
    const v = VARIANTS[q.v], ground = [];
    for (let k = 0; k < 8; k++) {
      const a = (k / 8) * 2 * Math.PI, x = q.x + Math.cos(a) * v.base, z = q.z + Math.sin(a) * v.base;
      ground.push(terrain.heightAt(x, z), meshAt(x, z));
    }
    ground.push(terrain.heightAt(q.x, q.z), meshAt(q.x, q.z));
    const lo = Math.min(...ground), hi = Math.max(...ground);
    // never floating over its ground, or the finest drawn ground, anywhere round its base...
    assert.ok(q.y <= lo + 0.01, `a ${q.key} floats ${(q.y - lo).toFixed(2)} m`);
    // ...and never sunk deeper than its part allows on its high side
    assert.ok(hi - q.y <= v.step + 0.15, `a ${q.key} sunk ${(hi - q.y).toFixed(2)} m (allowed ${v.step})`);
  }
});

test('each biome grows its own', () => {
  const kits = { grass: 'nature-forest-kit-f29d6a', snow: 'alpine-and-snow-092f66', desert: 'frontier-town-a0085b' };
  const seen = { grass: new Set(), snow: new Set(), desert: new Set() };
  // the open country round every line, and a wider sweep through each biome
  const sweep = [...chunks];
  for (const [x, z] of [[2650, 650], [2400, 900], [2000, 1950], [1000, 1800], [600, 100], [-400, 600]]) {
    const i = Math.floor(x / CHUNK), j = Math.floor(z / CHUNK);
    sweep.push({ i, j, items: scatter(i, j, CHUNK, terrain, { seed: 1 }) });
  }
  for (const q of sweep.flatMap((c) => c.items)) {
    const biome = terrain.biomeAt(q.x, q.z).kind, v = VARIANTS[q.v];
    assert.notEqual(biome, 'urban', `a ${q.key} in the city`);
    assert.equal(v.kit, kits[biome], `a ${q.key} (${v.kit}) in the ${biome}`);
    seen[biome].add(q.key);
    // the Alpine parts carry snow only on snowy ground
    if (biome === 'snow') {
      const region = terrain.regionAt(q.x, q.z);
      assert.equal(v.params.snowfall > 0.3, region === 'snow', `a ${q.v} on ${region} ground`);
    }
    // nothing on a beach, or paved ground
    const region = terrain.regionAt(q.x, q.z);
    assert.ok(region !== 'paving' && !(region === 'sand' && biome !== 'desert'), `a ${q.key} on ${region}`);
  }
  for (const [biome, want] of Object.entries({
    grass: ['oak-tree', 'birch-tree', 'pine-tree-tall', 'bush-round', 'boulder-large'],
    snow: ['snow-laden-spruce', 'windblown-larch', 'rock-outcrop'],
    desert: ['saguaro-cactus', 'sagebrush', 'dead-cottonwood'],
  })) for (const k of want) assert.ok(seen[biome].has(k), `no ${k} in the ${biome}`);
});

test('no stretch of open line is bare', () => {
  // open line: not at a station, in the suburbs, over a viaduct or trestle or in a tunnel (the land falls away or is over it), in
  // the city, or down the canyon between its walls
  const skip = {
    'city-ocean': [], 'ocean-mountain': [], 'mountain-west': [[620, 1150]], 'west-future': [], 'future-city': LEGS['future-city'].suburbs.map(([a, b]) => [a - 30, b + 30]),
  };
  const bare = [], counts = [];
  for (const l of lines) {
    // (the bullet's guideway stands over the desert's dry wash: open country, its land still beside it)
    const secs = legSections(l.id).filter((s) => s.kind !== 'guideway').map((s) => [s.s0 - 20, s.s1 + 20]);
    const spans = [[0, 150], [l.r.length - 150, l.r.length], ...secs, ...skip[l.id]];
    for (let s0 = 0; s0 + 100 <= l.r.length; s0 += 100) {
      if (spans.some(([a, b]) => s0 < b && s0 + 100 > a)) continue;
      const mid = l.r.at(s0 + 50);
      if (terrain.biomeAt(mid.x, mid.z).kind === 'urban') continue;
      const n = items.filter((q) => {
        const f = near.get(q);
        return f.id === l.id && f.s >= s0 && f.s < s0 + 100 && f.d >= CLEAR_LINE && f.d <= 80;
      }).length;
      counts.push(n);
      if (n < 4) bare.push(`${l.id} ${s0}..${s0 + 100}: ${n}`);
    }
  }
  assert.ok(counts.length >= 50, `only ${counts.length} stretches of open line checked`);
  assert.deepEqual(bare, []);
});

// the level crossings' roads (actors/crossing.js) run straight out from the line, square to it: nothing grows on them
test("nothing grows on a level crossing's road", async () => {
  const { EVENTS } = await import('../events.js');
  const { ROAD } = await import('../suburbs.js');
  for (const [leg, defs] of Object.entries(EVENTS)) {
    for (const e of defs.filter((d) => d.react?.kind === 'crossing')) {
      const p = legRoute(leg).at(e.react.at.out), fx = Math.sin(p.yaw), fz = Math.cos(p.yaw);
      for (const q of items) {
        const r = VARIANTS[q.v].r, along = (q.x - p.x) * fx + (q.z - p.z) * fz, across = (q.x - p.x) * fz - (q.z - p.z) * fx;
        assert.ok(Math.abs(along) >= ROAD.width / 2 + r || Math.abs(across) > ROAD.length + r, `a ${q.key} on ${leg}'s crossing road (${along.toFixed(1)}, ${across.toFixed(1)})`);
      }
    }
  }
});

test('nothing grows on the stagecoach\'s road or its bench, or across the gang\'s lanes beside it', async () => {
  const { coachRoad, BENCH } = await import('../world-data.js');
  const { GANG } = await import('../rides/coach-plan.js');
  const { pts, near: byRoad } = coachRoad();
  // the chunks round the road too (it runs up to 240 m from the line)
  const keys = new Set();
  for (const p of pts) for (const dx of [-40, 0, 40]) for (const dz of [-40, 0, 40]) keys.add(`${Math.floor((p.x + dx) / CHUNK)},${Math.floor((p.z + dz) / CHUNK)}`);
  const near = [...keys].flatMap((k) => { const [i, j] = k.split(',').map(Number); return scatter(i, j, CHUNK, terrain, { seed: 1 }); });
  let looked = 0;
  for (const q of near) {
    const r = VARIANTS[q.v].r, best = byRoad(q.x, q.z);
    if (!best) continue;
    looked++;
    assert.ok(best.d >= BENCH.half + r, `a ${q.key} on the coach's road at ${best.s.toFixed(0)}`);
    const G = GANG.sweep;
    assert.ok(!(best.s > G.a0 && best.s < G.a1 && best.left > -r && best.left < G.out + r), `a ${q.key} in the gang's way at ${best.s.toFixed(0)}`);
  }
  assert.ok(looked > 30, `${looked} pieces near the road`);   // (a check that it looked: much of it runs by the line, kept clear)
});
