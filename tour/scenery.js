// The scenery along the routes: trees, bushes, rocks and cacti scattered over each chunk of the world grid (chunks.js),
// each biome its own kit's (grass: the Nature & Forest kit's; snow: the Alpine kit's; desert: the Frontier kit's; the
// cities: none). Pure maths, no three.js: scatter() lays a chunk's pieces out, the same every time, on a terrain
// (terrain.js); scenery-mesh.js draws them, one InstancedMesh per part per chunk, with the land's chunks.
// Each piece: { v, key, x, y, z, ry, s }: its variant (VARIANTS) and part key, where its origin stands (y: on its
// ground), its turn about y, and s its part's own scale knob (1 for a part without one). Never rescaled otherwise.
import { LEGS, PLACES, FEATURES, SEA_LEVEL, legRoute, legSections, stationPads, placePads } from './world-data.js';
import { KITS } from './config.js';

export const CLEAR_LINE = 12;     // nothing reaches nearer a line's centre than this: its swept path and its track bed
export const MAX_SLOPE = 0.8;     // nor stands where the ground rises more than this (per metre) over 4 m on any side
const CLEAR_PLACE = 28;           // nor this near a place's footprint (its own ground blends out 25 m past its land)
const CLEAR_PORTAL = 30;          // nor this near a tunnel's portal (its headwall reaches 12.5 m either side)
const CLEAR_EXTRA = 12;           // nor this near one of a place's extra parts (Oceanside's seafront)
const STATION = { ends: 150, out: 110 };   // nor at a line's ends (its platforms), out past a station's approach (100 m)
const SUBURB = { pad: 30, out: 80 };       // nor in a leg's suburbs: their lots reach about 70 m out from the line
const RIVER_ABOVE = 1.2;          // nor in a river: below its water (floor + 0.7) and a little more, in its valley
const CELL = 16;                  // one candidate spot in each 16 m square of a chunk (256 to a 256 m chunk)
const NEAR_LINE = 80;             // out to here beside a line, a spot is never left too sparse (no bare stretches)

// The parts, measured in the page with these knobs (metres): r how far the part reaches from its origin (clear of the
// line by CLEAR_LINE + r), base how far out its foot touches the ground (it stands at the lowest ground round that),
// step how deep its high side may sink on a slope. far: drawn on the mid-detail chunks too (the big trees); the rest
// only on fine ones. Sizes are each part's own, set by its own knobs (scale where it has one).
const N = KITS.nature, A = KITS.mountain, F = KITS.west;
export const VARIANTS = {
  // grass: 16.8 m oaks, 13 m birches, 19.8 m pines, 3 m young pines, bushes and boulders
  oak: { kit: N, key: 'oak-tree', params: { scale: 2.4 }, r: 5.71, base: 1.18, step: 0.8, far: true },
  birch: { kit: N, key: 'birch-tree', params: { scale: 2 }, r: 3.08, base: 0.64, step: 0.8, far: true },
  pine: { kit: N, key: 'pine-tree-tall', params: { scale: 2.2 }, r: 4.16, base: 1.49, step: 0.8, far: true },
  'young-pine': { kit: N, key: 'pine-tree-young', params: {}, r: 0.94, base: 0.22, step: 0.4 },
  bush: { kit: N, key: 'bush-round', params: { spread: 2 }, r: 0.65, base: 0.65, step: 0.25 },
  boulder: { kit: N, key: 'boulder-large', params: {}, r: 1.12, base: 1.09, step: 0.4 },
  // snow, below the snowline (green ground): 13.2 m spruces and 7.5 m windblown larches without snow, bare outcrops
  spruce: { kit: A, key: 'snow-laden-spruce', params: { scale: 2.2, snowfall: 0 }, r: 3.3, base: 1.06, step: 0.8, far: true },
  larch: { kit: A, key: 'windblown-larch', params: { height: 7.5, snowfall: 0 }, r: 4.32, base: 4.03, step: 1.2, far: true },
  outcrop: { kit: A, key: 'rock-outcrop', params: { scale: 1.6, snowfall: 0 }, r: 2.35, base: 2.35, step: 1.2 },
  // and on snow: the same, snow-laden (the spruce's drift spreads 3.3 m round its foot)
  'snowy-spruce': { kit: A, key: 'snow-laden-spruce', params: { scale: 2.2, snowfall: 0.7 }, r: 3.3, base: 3.3, step: 1.5, far: true },
  'snowy-larch': { kit: A, key: 'windblown-larch', params: { height: 7.5, snowfall: 0.7 }, r: 4.29, base: 4.21, step: 1.2, far: true },
  'snowy-outcrop': { kit: A, key: 'rock-outcrop', params: { scale: 1.6, snowfall: 0.7 }, r: 2.35, base: 2.34, step: 1.2 },
  // desert: 4.3 m saguaros, sagebrush, 10.5 m dead cottonwoods
  saguaro: { kit: F, key: 'saguaro-cactus', params: { arms: 2, age: 0.6 }, r: 0.87, base: 0.3, step: 0.4, far: true },
  sagebrush: { kit: F, key: 'sagebrush', params: { size: 0.6 }, r: 0.73, base: 0.4, step: 0.25 },
  cottonwood: { kit: F, key: 'dead-cottonwood', params: { scale: 1.5 }, r: 5.79, base: 1.55, step: 0.8, far: true },
};
for (const [id, v] of Object.entries(VARIANTS)) v.id = id;

// what grows where: [variant, weight] by biome and the ground's region (regionAt); steep-ish rock and scree grow rock
const MIX = {
  grass: [['oak', 0.2], ['birch', 0.14], ['pine', 0.2], ['young-pine', 0.12], ['bush', 0.2], ['boulder', 0.14]],
  'grass:rock': [['boulder', 1]],
  snow: [['spruce', 0.55], ['larch', 0.2], ['outcrop', 0.25]],
  'snow:snow': [['snowy-spruce', 0.55], ['snowy-larch', 0.2], ['snowy-outcrop', 0.25]],
  'snow:scree': [['outcrop', 1]],
  'snow:rock': [['outcrop', 1]],
  desert: [['saguaro', 0.35], ['sagebrush', 0.45], ['cottonwood', 0.2]],
};
const MAX_R = Math.max(...Object.values(VARIANTS).map((v) => v.r));

// ---- deterministic randomness and a soft noise for groves and clearings ----
function rand(...k) {
  let h = 2166136261;
  for (const v of k) { h ^= v | 0; h = Math.imul(h, 16777619); h ^= h >>> 13; }
  return ((h >>> 0) % 1000003) / 1000003;
}
function noise(x, z, seed) {
  const ix = Math.floor(x), iz = Math.floor(z), fx = x - ix, fz = z - iz;
  const u = fx * fx * (3 - 2 * fx), w = fz * fz * (3 - 2 * fz);
  const a = rand(ix, iz, seed), b = rand(ix + 1, iz, seed), c = rand(ix, iz + 1, seed), d = rand(ix + 1, iz + 1, seed);
  return (a + (b - a) * u) * (1 - w) + (c + (d - c) * u) * w;   // 0..1
}
// how thick the planting is round a point, 0..1: groves and open glades, a few hundred metres across
const thickness = (x, z, seed) => 0.6 * noise(x / 140, z / 140, seed + 101) + 0.4 * noise(x / 47, z / 47, seed + 211);
const pickFrom = (mix, r) => {
  const total = mix.reduce((n, [, w]) => n + w, 0);
  let t = r * total;
  for (const [id, w] of mix) { if ((t -= w) <= 0) return id; }
  return mix[mix.length - 1][0];
};

// ---- the world's no-go places, worked out once ----
let world = null;
function theWorld() {
  if (world) return world;
  // every line as segments on a 64 m grid, for the nearest point on each
  const G = 64, grid = new Map(), key = (i, j) => `${i},${j}`;
  const legs = Object.keys(LEGS).map((id) => {
    const r = legRoute(id), pts = [];
    for (let s = 0; s <= r.length + 2; s += 4) { const p = r.at(Math.min(s, r.length)); pts.push({ x: p.x, z: p.z, s: Math.min(s, r.length) }); }
    return { id, length: r.length, pts };
  });
  legs.forEach((l, li) => {
    for (let k = 0; k < l.pts.length - 1; k++) {
      const a = l.pts[k], b = l.pts[k + 1];
      const cells = new Set([key(Math.floor(a.x / G), Math.floor(a.z / G)), key(Math.floor(b.x / G), Math.floor(b.z / G))]);
      for (const c of cells) { if (!grid.has(c)) grid.set(c, []); grid.get(c).push([li, k]); }
    }
  });
  const toPlace = Object.values(PLACES).filter((p) => p.size).map((p) => ({ ...p, c: Math.cos(p.rot), s: Math.sin(p.rot) }));
  const extras = Object.values(PLACES).flatMap((p) => (p.extras ?? []).map((e) => {
    const c = Math.cos(p.rot), s = Math.sin(p.rot);
    return [p.centre.x + e.x * c + e.z * s, p.centre.z - e.x * s + e.z * c];
  }));
  const portals = Object.keys(LEGS).flatMap((id) => legSections(id).filter((s) => s.kind === 'tunnel')
    .flatMap((s) => [legRoute(id).at(s.s0), legRoute(id).at(s.s1)]));
  const pads = [...stationPads(), ...placePads()].map((p) => ({ ...p, c: Math.cos(p.rot ?? 0), s: Math.sin(p.rot ?? 0) }));
  const waters = FEATURES.filter((f) => f.kind === 'valley' && f.water).map((v) => ({ half: 20, fade: 60, ...v }));
  // each line's nearest point to (x, z) within `reach`: [{ leg, s, d }]
  function near(x, z, reach) {
    const best = new Map();
    const r = Math.ceil(reach / G), ci = Math.floor(x / G), cj = Math.floor(z / G);
    for (let i = ci - r; i <= ci + r; i++) for (let j = cj - r; j <= cj + r; j++) {
      for (const [li, k] of grid.get(key(i, j)) ?? []) {
        const pts = legs[li].pts, a = pts[k], b = pts[k + 1], dx = b.x - a.x, dz = b.z - a.z;
        const t = Math.max(0, Math.min(1, ((x - a.x) * dx + (z - a.z) * dz) / (dx * dx + dz * dz || 1)));
        const d = Math.hypot(x - a.x - t * dx, z - a.z - t * dz);
        if (d <= reach && d < (best.get(li)?.d ?? Infinity)) best.set(li, { leg: legs[li], s: a.s + t * (b.s - a.s), d });
      }
    }
    return [...best.values()];
  }
  world = { near, toPlace, extras, portals, pads, waters };
  return world;
}

const outsideRect = (p, x, z, w, d, ox = 0, oz = 0) => {
  const dx = x - (p.centre?.x ?? p.x), dz = z - (p.centre?.z ?? p.z), lx = dx * p.c - dz * p.s, lz = dx * p.s + dz * p.c;
  return Math.hypot(Math.max(0, Math.abs(lx - ox) - w / 2), Math.max(0, Math.abs(lz - oz) - d / 2));
};

// whether a spot may hold a part reaching r: clear of every line and its stations and suburbs, the pads, the places
// and their extras, and the portals (cheap checks: no heights)
function clearOf(w, x, z, r) {
  for (const n of w.near(x, z, Math.max(STATION.out, SUBURB.out) + MAX_R)) {
    if (n.d < CLEAR_LINE + r) return false;
    if (n.d < STATION.out && (n.s < STATION.ends || n.s > n.leg.length - STATION.ends)) return false;
    for (const [s0, s1] of LEGS[n.leg.id].suburbs ?? []) if (n.d < SUBURB.out && n.s > s0 - SUBURB.pad && n.s < s1 + SUBURB.pad) return false;
  }
  for (const p of w.portals) if (Math.hypot(x - p.x, z - p.z) < CLEAR_PORTAL) return false;
  for (const p of w.pads) {
    const out = p.r !== undefined ? Math.hypot(x - p.x, z - p.z) - p.r : outsideRect(p, x, z, p.w, p.d);
    if (out < r + 2) return false;
  }
  for (const p of w.toPlace) if (outsideRect(p, x, z, p.size[0], p.size[1], ...(p.offset ?? [0, 0])) < CLEAR_PLACE) return false;
  for (const [ex, ez] of w.extras) if (Math.hypot(x - ex, z - ez) < CLEAR_EXTRA + r) return false;
  return true;
}
// whether ground at height h lies under a river's water
function inRiver(w, x, z, h) {
  for (const v of w.waters) {
    const dx = v.x1 - v.x0, dz = v.z1 - v.z0, t = ((x - v.x0) * dx + (z - v.z0) * dz) / (dx * dx + dz * dz);
    if (t < 0 || t > 1) continue;
    if (Math.hypot(x - v.x0 - t * dx, z - v.z0 - t * dz) < v.half + v.fade && h <= v.floor + RIVER_ABOVE) return true;
  }
  return false;
}

// a chunk's pieces as a job (a generator: it yields after each spot it looks at, slicer-style; it returns the pieces)
export function* scatterJob(i, j, size, terrain, { seed = 1 } = {}) {
  const w = theWorld(), out = [], x0 = i * size, z0 = j * size, n = Math.round(size / CELL);
  // the finest drawn ground (4 m grid, split as chunks.js splits it), its corners' heights kept for the chunk
  const G = 4, hs = new Map();
  const hAt = (a, b) => { const k = a * 100003 + b; let h = hs.get(k); if (h === undefined) { h = terrain.heightAt(a * G, b * G); hs.set(k, h); } return h; };
  const meshAt = (x, z) => {
    const a = Math.floor(x / G), b = Math.floor(z / G), fx = x / G - a, fz = z / G - b;
    if (fx + fz <= 1) { const p = hAt(a, b); return p + fx * (hAt(a + 1, b) - p) + fz * (hAt(a, b + 1) - p); }
    const s = hAt(a + 1, b + 1); return s + (1 - fx) * (hAt(a, b + 1) - s) + (1 - fz) * (hAt(a + 1, b) - s);
  };
  // one spot: whether it was worth a look at its ground (worked out its heights)
  function spot(a, b) {
    const r = (k) => rand(i, j, a, b, k, seed);
    const x = x0 + (a + 0.1 + 0.8 * r(1)) * CELL, z = z0 + (b + 0.1 + 0.8 * r(2)) * CELL;
    // thick in the groves, thin in the glades; never too thin beside a line
    const lineNear = w.near(x, z, NEAR_LINE).length > 0;
    const keep = Math.max(lineNear ? 0.3 : 0, 0.9 * thickness(x, z, seed) ** 1.6);
    if (r(3) >= keep) return false;
    const biome = terrain.biomeAt(x, z).kind;
    if (!MIX[biome]) return false;   // the cities grow nothing
    if (!clearOf(w, x, z, 0)) return false;
    const h = terrain.heightAt(x, z);
    if (h < SEA_LEVEL + 0.5 || inRiver(w, x, z, h)) return true;
    const e = terrain.heightAt(x + 4, z), wst = terrain.heightAt(x - 4, z), so = terrain.heightAt(x, z + 4), no = terrain.heightAt(x, z - 4);
    if (Math.max(Math.abs(e - h), Math.abs(wst - h), Math.abs(so - h), Math.abs(no - h)) / 4 > MAX_SLOPE) return true;
    const region = terrain.regionAt(x, z, h, Math.hypot(e - wst, so - no) / 8);
    if (region === 'sea' || region === 'paving' || (region === 'sand' && biome !== 'desert')) return true;
    const v = VARIANTS[pickFrom(MIX[`${biome}:${region}`] ?? MIX[biome], r(4))];
    if (!clearOf(w, x, z, v.r)) return true;
    // stand it at the lowest ground round its foot (the land, and the finest drawn ground), if that leaves its high
    // side sunk no deeper than its part allows
    let lo = Math.min(h, meshAt(x, z)), hi = Math.max(h, meshAt(x, z));
    for (let k = 0; k < 8; k++) {
      const t = (k / 8) * 2 * Math.PI, px = x + Math.cos(t) * v.base, pz = z + Math.sin(t) * v.base;
      const g1 = terrain.heightAt(px, pz), g2 = meshAt(px, pz);
      lo = Math.min(lo, g1, g2); hi = Math.max(hi, g1, g2);
    }
    const y = lo - 0.03;
    if (hi - y > v.step || inRiver(w, x, z, y)) return true;   // its foot too must be clear of a river's water
    // windblown larches all lean the same way (the prevailing wind); the rest any way
    const ry = v.key === 'windblown-larch' ? 0.9 + (r(5) - 0.5) * 0.5 : r(5) * 2 * Math.PI;
    out.push({ v: v.id, key: v.key, x, y, z, ry, s: v.params.scale ?? 1 });
    return true;
  }
  // a spot at a time where it looked at the ground (heights on the massifs cost tens of microseconds each)
  for (let b = 0; b < n; b++) for (let a = 0; a < n; a++) if (spot(a, b)) yield;
  return out;
}

// a chunk's pieces, all at once
export function scatter(i, j, size, terrain, opts) {
  const job = scatterJob(i, j, size, terrain, opts);
  for (;;) { const r = job.next(); if (r.done) return r.value; }
}
