// The tour's landscape as a height function. Pure maths, no three.js.
// natural ground (rolling hills, a coast with cliffs or beaches) -> the track bed cut and filled under every route
// -> flat pads under places and stations.
import { CHUNK, chunksNear } from './chunks.js';
import { sectionAt, TUBE_TOP } from './structures.js';

export const BED_DROP = 0.05;   // ground sits this far below a route's formation level (route.y), under the ballast
const BED_HALF = 6;             // metres either side of the route centre held exactly at the bed
const BED_BLEND = 30;           // then blending back to natural ground over this many metres
const PAD_BLEND = 20;
const PATCH_BLEND = 25;
const CANYON_RIM = 100;         // a canyon's rim holds this far past its walls...
const CANYON_FADE = 160;        // ...then falls back to the land over this far
const DIRTY_REACH = 60;         // a patch added or removed changes the ground of every chunk this near its land
// a route's sections (route.sections, see structures.js) change its bed. Under a bridge the land is left alone, held
// CLEAR metres below the formation so it never reaches the deck: the embankment steps down to that over its first TAPER
// metres (inside the abutment) and gives way to the land over BRIDGE_EASE more. Over a tunnel the land is left alone too,
// but never lower than COVER metres above the formation over the bore (out to COVER_HALF either side, then falling off
// 1 in 1), and its approach cuttings run on FUNNEL metres into the hill beside the bore, closing as they go.
const CLEAR = { viaduct: 2.5, trestle: 2, guideway: 3.8 };
const TAPER = 6, BRIDGE_EASE = 20;
const COVER = 9, COVER_HALF = 11, FUNNEL = 30;
const MOUTH = 6;                // a ground cell across a portal within this of the bore's centre is left out (the portal fills it)
const TUBE_HALF = 6.5;          // a chunk's skirt never hangs below the tube's roof within this of the line

const smooth = (e0, e1, x) => { const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0))); return t * t * (3 - 2 * t); };
const lerp = (a, b, t) => a + (b - a) * t;

// ---- value noise ----
function hash(ix, iz, seed) {
  let h = (ix * 374761393 + iz * 668265263 + seed * 2147483647) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
function noise(x, z, seed) {
  const ix = Math.floor(x), iz = Math.floor(z), fx = x - ix, fz = z - iz;
  const u = fx * fx * fx * (fx * (fx * 6 - 15) + 10), v = fz * fz * fz * (fz * (fz * 6 - 15) + 10);
  const a = hash(ix, iz, seed), b = hash(ix + 1, iz, seed), c = hash(ix, iz + 1, seed), d = hash(ix + 1, iz + 1, seed);
  return lerp(lerp(a, b, u), lerp(c, d, u), v) * 2 - 1;
}
function fbm(x, z, seed) {
  let sum = 0, amp = 0.5, f = 1;
  for (let o = 0; o < 4; o++) { sum += noise(x * f, z * f, seed + o) * amp; amp *= 0.5; f *= 2.03; }
  return sum;
}

// ---- nearest point on a route, via a coarse grid of its samples ----
function indexRoute(route, step = 4, cell = 64, reachM = BED_HALF + BED_BLEND + step) {
  const n = Math.ceil(route.length / step) + 1, xs = [], zs = [], ss = [];
  const grid = new Map(), key = (i, j) => `${i},${j}`;
  for (let k = 0; k < n; k++) {
    const s = Math.min(route.length, k * step), p = route.at(s);
    xs.push(p.x); zs.push(p.z); ss.push(s);
    const kk = key(Math.floor(p.x / cell), Math.floor(p.z / cell));
    if (!grid.has(kk)) grid.set(kk, []);
    grid.get(kk).push(k);
  }
  const reach = Math.ceil(reachM / cell);
  const tmp = {};
  return function nearest(x, z) {
    const ci = Math.floor(x / cell), cj = Math.floor(z / cell);
    let best = -1, bd = Infinity;
    for (let i = ci - reach; i <= ci + reach; i++) for (let j = cj - reach; j <= cj + reach; j++) {
      const list = grid.get(key(i, j));
      if (!list) continue;
      for (const k of list) { const d = (xs[k] - x) ** 2 + (zs[k] - z) ** 2; if (d < bd) { bd = d; best = k; } }
    }
    if (best < 0) return null;
    // refine: project onto the route between the neighbouring samples
    let lo = ss[Math.max(0, best - 1)], hi = ss[Math.min(n - 1, best + 1)];
    for (let it = 0; it < 18; it++) {
      const m1 = lo + (hi - lo) / 3, m2 = hi - (hi - lo) / 3;
      const a = route.at(m1, tmp), d1 = (a.x - x) ** 2 + (a.z - z) ** 2;
      const b = route.at(m2, tmp), d2 = (b.x - x) ** 2 + (b.z - z) ** 2;
      if (d1 < d2) hi = m2; else lo = m1;
    }
    const s = (lo + hi) / 2, p = route.at(s, {});
    return { s, y: p.y, dist: Math.hypot(p.x - x, p.z - z) };
  };
}

// ---- signed distance to a coast polyline: positive inland (right of its direction), negative out to sea (left) ----
function indexCoast(coast) {
  const pts = coast.points;
  return function at(x, z) {
    let bd = Infinity, sign = 1, top = 0, kind = 0;
    for (let i = 0; i < pts.length - 1; i++) {
      const a = pts[i], b = pts[i + 1], dx = b.x - a.x, dz = b.z - a.z, L2 = dx * dx + dz * dz;
      let t = ((x - a.x) * dx + (z - a.z) * dz) / L2;
      t = Math.min(1, Math.max(0, t));
      const px = a.x + dx * t, pz = a.z + dz * t, d = Math.hypot(x - px, z - pz);
      if (d < bd) {
        bd = d;
        // left of travel (heading +x, left is -z) is the sea: cross product picks the side
        const cross = dx * (z - a.z) - dz * (x - a.x);
        sign = cross < 0 ? -1 : 1;
        top = lerp(a.top, b.top, t); kind = lerp(a.kind, b.kind, t);
      }
    }
    return { d: bd * sign, top, kind };
  };
}

// world point -> a placed thing's own frame (three.js rotation.y = rot about its origin x, z)
function toLocal(px, pz, o) {
  const dx = px - o.x, dz = pz - o.z, c = Math.cos(o.rot ?? 0), sn = Math.sin(o.rot ?? 0);
  return [dx * c - dz * sn, dx * sn + dz * c];
}
// how far a local point lies outside a centred rectangle of half sizes hx, hz (0 inside)
const outside = (lx, lz, hx, hz) => Math.hypot(Math.max(0, Math.abs(lx) - hx), Math.max(0, Math.abs(lz) - hz));

// pads: circles { x, z, r, y } or rectangles { x, z, w, d, rot, y }, held flat at y, blending out over `blend` metres.
// patches: a placed kit's own ground { x, y, z, rot, drop, sample(lx, lz) -> { h, d } | null }: h is the kit's ground at
// the nearest point of its land, d how far outside its land the point is (0 on it). On its land ours follows the kit's,
// sunk by `drop` so the kit's ground covers ours; off it, ours blends out from the land's edge height. A patch's land lies
// within `r` metres of its origin. Patches come and go as places load (addPatch, removePatch); takeDirty() hands over the
// chunks (keys 'c:i,j', `chunk` metres square) whose ground they changed since it was last called.
//
// features (all in the natural layer, so the track bed and pads still win under and beside the line):
//   { kind: 'massif', x, z, r, h }  a range of ridged peaks rising h metres, falling off over r
//   { kind: 'mesa', x, z, r, h }    a flat-topped, steep-sided block h metres above the land
//   { kind: 'canyon', leg, s0, s1, depth, width }  walls rising depth metres above the route either side of width/2, between
//                                   those route distances (`legs` maps a leg id to its route)
//   { kind: 'ridge', leg, s0, s1, rise, half = 30, fade = 150, ease = 100 }  the land along a stretch of a route brought to
//                                   `rise` metres above its formation (below, if negative) within `half` of it, back to
//                                   the land over `fade` more, easing in and out over `ease` at s0 and s1: a hill for a
//                                   tunnel, or foothills or a wash under the line. only: 'up' (or 'down') leaves land
//                                   that is already higher (lower) alone
//   { kind: 'valley', x0, z0, x1, z1, floor, half = 20, fade = 60, ease = 80, easeHead }  a trough between two points with
//                                   a flat floor at height `floor` within `half` of its axis, sides over `fade`, shallowing
//                                   to nothing over `ease` at its ends (`easeHead` at x0, z0 instead, if given: a steep head)
// Massifs and mesas keep clear of every route, big circular pad and `clearings` { x, z, r }, so a line never sits in a pit.
// biomes { kind: 'grass'|'snow'|'desert'|'urban', x, z, r }: the nearest wins, ragged over ~200 m; they only recolour.
export const SNOWLINE = 60;
export function makeTerrain({ routes = [], pads = [], patches: given = [], coast = null, base = 8, seaLevel = 0, seed = 1,
  features = [], biomes = [], legs = {}, clearings = [], chunk = CHUNK } = {}) {
  const patches = [...given];
  let dirty = new Set();
  const touch = (p) => { for (const k of chunksNear(p.x, p.z, (p.r ?? 100) + DIRTY_REACH, chunk)) dirty.add(k); };
  function addPatch(p) { if (!patches.includes(p)) { patches.push(p); touch(p); } }
  function removePatch(p) { const i = patches.indexOf(p); if (i >= 0) { patches.splice(i, 1); touch(p); } }
  function takeDirty() { const d = dirty; dirty = new Set(); return d; }
  const nearests = routes.map((r) => indexRoute(r));
  const legIndex = (leg, what) => {
    const route = legs[leg];
    if (!route) throw new Error(`${what} feature names leg '${leg}', which is not in \`legs\` (have: ${Object.keys(legs).join(', ') || 'none'})`);
    return route;
  };
  const coastAt = coast ? indexCoast(coast) : null;
  const SEA_FLOOR = seaLevel - 7;

  const massifs = features.filter((f) => f.kind === 'massif');
  const mesas = features.filter((f) => f.kind === 'mesa');
  // a stretch of a leg, indexed for nearest-point queries within `reach` of it
  const stretch = (f, reach) => {
    const route = legIndex(f.leg, f.kind);
    const bb = { x0: Infinity, x1: -Infinity, z0: Infinity, z1: -Infinity };
    for (let s = f.s0; s <= f.s1 + 40; s += 40) {
      const p = route.at(Math.min(s, f.s1));
      bb.x0 = Math.min(bb.x0, p.x); bb.x1 = Math.max(bb.x1, p.x); bb.z0 = Math.min(bb.z0, p.z); bb.z1 = Math.max(bb.z1, p.z);
    }
    return { ...f, nearest: indexRoute(route, 12, 128, reach), reach, bb };
  };
  const outsideBox = (f, x, z) => x < f.bb.x0 - f.reach || x > f.bb.x1 + f.reach || z < f.bb.z0 - f.reach || z > f.bb.z1 + f.reach;
  const canyons = features.filter((f) => f.kind === 'canyon').map((f) => stretch(f, f.width / 2 + CANYON_RIM + CANYON_FADE + 20));
  const ridges = features.filter((f) => f.kind === 'ridge')
    .map((f) => ({ half: 30, fade: 150, ease: 100, ...f }))
    .map((f) => stretch(f, f.half + f.fade + 20));
  const valleys = features.filter((f) => f.kind === 'valley').map((f) => {
    const v = { half: 20, fade: 60, ease: 80, ...f };
    return { ...v, dx: v.x1 - v.x0, dz: v.z1 - v.z0, len: Math.hypot(v.x1 - v.x0, v.z1 - v.z0), reach: v.half + v.fade };
  });

  // how far a point is from any line or clearing: 0 right beside them, 1 well away (massifs and mesas fade by it)
  const CELL = 128, ckey = (i, j) => `${i},${j}`, cgrid = new Map();
  let maxR1 = 0;
  const addSource = (x, z, r0, r1) => {
    const k = ckey(Math.floor(x / CELL), Math.floor(z / CELL));
    if (!cgrid.has(k)) cgrid.set(k, []);
    cgrid.get(k).push([x, z, r0, r1]);
    maxR1 = Math.max(maxR1, r1);
  };
  if (massifs.length || mesas.length) {
    for (const r of routes) for (let s = 0; s <= r.length + 15; s += 30) { const p = r.at(Math.min(s, r.length)); addSource(p.x, p.z, 25, 240); }
    for (const c of clearings) addSource(c.x, c.z, c.r, c.r + 220);
    for (const p of pads) if (p.r !== undefined) addSource(p.x, p.z, p.r + 20, p.r + 260);
  }
  function clearance(x, z) {
    const ci = Math.floor(x / CELL), cj = Math.floor(z / CELL), reach = Math.ceil(maxR1 / CELL);
    let c = 1;
    for (let i = ci - reach; i <= ci + reach; i++) for (let j = cj - reach; j <= cj + reach; j++) {
      const list = cgrid.get(ckey(i, j));
      if (!list) continue;
      for (const [sx, sz, r0, r1] of list) {
        const d = Math.hypot(x - sx, z - sz);
        if (d < r1) { c = Math.min(c, smooth(r0, r1, d)); if (c === 0) return 0; }
      }
    }
    return c;
  }
  const ridged = (x, z, sd) => Math.max(0, 1 - Math.abs(fbm(x / 650, z / 650, sd)) * 2) ** 1.3;

  // the land plus its features
  function natural(x, z) {
    const hb = landAt(x, z);
    let h = hb;
    const cd = coastAt ? coastAt(x, z).d : Infinity;
    const onLand = smooth(0, 60, cd);
    if (onLand > 0 && (massifs.length || mesas.length)) {
      let lift = 0, near = false;
      for (const m of massifs) {
        const d = Math.hypot(x - m.x, z - m.z);
        if (d >= m.r) continue;
        near = true;
        const f = 1 - smooth(0, 1, d / m.r), core = 1 - smooth(0, 0.3 * m.r, d);
        lift += m.h * f ** 1.2 * lerp(0.55 + 0.45 * ridged(x, z, seed + 50), 1, core);
      }
      let pull = 0, top = 0;
      for (const m of mesas) {
        const d = Math.hypot(x - m.x, z - m.z), e = Math.min(m.h / 3, 0.25 * m.r);
        if (d >= m.r + e) continue;
        near = true;
        const mask = 1 - smooth(m.r - e, m.r + e, d);
        if (mask > pull) { pull = mask; top = landAt(m.x, m.z) + m.h + noise(x / 45, z / 45, seed + 60) * 0.5; }
      }
      if (near) {
        const k = clearance(x, z) * onLand, raised = hb + lift * k;
        h = pull > 0 ? raised + (top - raised) * pull * k : raised;
      }
    }
    for (const rg of ridges) {
      if (outsideBox(rg, x, z)) continue;
      const n = rg.nearest(x, z);
      if (!n || n.s < rg.s0 || n.s > rg.s1) continue;
      const k = smooth(rg.s0, rg.s0 + rg.ease, n.s) * (1 - smooth(rg.s1 - rg.ease, rg.s1, n.s)) * (1 - smooth(rg.half, rg.half + rg.fade, n.dist));
      const to = n.y + rg.rise;
      if (k > 0 && !(rg.only === 'up' && to < h) && !(rg.only === 'down' && to > h)) h += (to - h) * k;
    }
    for (const v of valleys) {
      const t = Math.min(1, Math.max(0, ((x - v.x0) * v.dx + (z - v.z0) * v.dz) / (v.len * v.len)));
      const d = Math.hypot(x - v.x0 - v.dx * t, z - v.z0 - v.dz * t);
      if (d >= v.reach) continue;
      const a = t * v.len, k = smooth(0, v.easeHead ?? v.ease, a) * (1 - smooth(v.len - v.ease, v.len, a)) * (1 - smooth(v.half, v.reach, d));
      if (k > 0 && v.floor < h) h += (v.floor - h) * k;
    }
    for (const cn of canyons) {
      if (outsideBox(cn, x, z)) continue;
      const n = cn.nearest(x, z);
      if (!n || n.s < cn.s0 || n.s > cn.s1) continue;
      const half = cn.width / 2, along = smooth(cn.s0, cn.s0 + 120, n.s) * (1 - smooth(cn.s1 - 120, cn.s1, n.s));
      const across = smooth(half, half + 20, n.dist) * (1 - smooth(half + CANYON_RIM, half + CANYON_RIM + CANYON_FADE, n.dist));
      const rim = n.y + cn.depth * (0.88 + 0.12 * ridged(x, z, seed + 70));
      if (across * along > 0 && rim > h) h += (rim - h) * across * along;
    }
    return h;
  }

  function landAt(x, z) {
    const c = coastAt ? coastAt(x, z) : { d: Infinity, top: base, kind: 0 };
    const amp = 3 + Math.min(28, Math.max(0, c.d - 120) * 0.035);
    let land = base + fbm(x / 380, z / 380, seed) * amp + Math.max(0, fbm(x / 900, z / 900, seed + 9)) * amp * 0.8;
    // inland ground never dips to the sea: soft-floored at 1 m above it, fading out toward the coast's own profile
    const F = seaLevel + 1;
    if (land < F + 3) land = lerp(land, F + 3 * smooth(0, 1, (land - (F - 5)) / 8), smooth(100, 320, c.d));
    if (!coastAt) return land;
    // near the coast the land rises (or falls) to the coast's own top height
    const nearLand = lerp(c.top + fbm(x / 120, z / 120, seed + 3) * 1.2, land, smooth(40, 320, c.d));
    const inW = lerp(70, 2, c.kind);       // a beach slopes gently from 70 m inland; a cliff edge is sharp
    const outW = lerp(60, 12, c.kind);     // and drops to the sea floor over this far out
    const shore = lerp(seaLevel + 0.8, c.top * 0.9, c.kind);
    if (c.d >= inW) return nearLand;
    if (c.d >= 0) return lerp(shore, nearLand, smooth(0, inW, c.d));
    return lerp(shore, SEA_FLOOR + fbm(x / 60, z / 60, seed + 5), smooth(0, outW, -c.d));
  }

  function heightAt(x, z) {
    let h = natural(x, z);
    // a placed kit's own ground first, so the track bed and the pads beside the line still win next to it
    for (const p of patches) {
      const [lx, lz] = toLocal(x, z, p), r = p.sample(lx, lz);
      if (!r || r.d >= PATCH_BLEND) continue;
      h = lerp(p.y + r.h - (p.drop ?? 0), h, smooth(0, PATCH_BLEND, r.d));
    }
    // the track bed: hold the formation under every route, cuttings and embankments blending out (but not on bridges or
    // through tunnels: see bedded)
    let bestW = 1, bestN = null, bestR = null;
    for (let i = 0; i < nearests.length; i++) {
      const n = nearests[i](x, z);
      if (!n) continue;
      const w = smooth(BED_HALF, BED_HALF + BED_BLEND, n.dist);
      if (w < bestW) { bestW = w; bestN = n; bestR = routes[i]; }
    }
    if (bestW < 1) h = bedded(h, bestN, bestW, sectionAt(bestR.sections, bestN.s));
    for (const p of pads) {
      let d;
      if (p.r !== undefined) d = Math.max(0, Math.hypot(x - p.x, z - p.z) - p.r);
      else { const [lx, lz] = toLocal(x, z, p); d = outside(lx, lz, p.w / 2, p.d / 2); }
      const blend = p.blend ?? PAD_BLEND;
      if (d < blend) h = lerp(p.y, h, smooth(0, blend, d));
    }
    return h;
  }

  // the ground at a point whose nearest line is n (its formation n.y at distance n.dist), the land there being h
  function bedded(h, n, w, sec) {
    const bed = lerp(n.y - BED_DROP, h, w);
    if (!sec || sec.grade) return bed;   // a guideway at grade lies on the bed, as track does
    const u = Math.min(n.s - sec.s0, sec.s1 - n.s);   // how far inside the section
    if (sec.kind === 'tunnel') {
      const funnel = lerp(bed, h, smooth(0, FUNNEL, u));
      return Math.max(funnel, n.y + COVER - Math.max(0, n.dist - COVER_HALF));
    }
    const floor = n.y - (CLEAR[sec.kind] ?? CLEAR.viaduct);
    const under = u < TAPER ? lerp(n.y - BED_DROP, floor, smooth(0, TAPER, u))
      : Math.min(floor, lerp(floor, h, smooth(TAPER, TAPER + BRIDGE_EASE, u)));
    return lerp(under, h, w);
  }

  // a route's tunnel portals: where each is, which way is into the hill, and which way is left
  function portalsOf(r) {
    const out = [];
    for (const sec of r.sections ?? []) {
      if (sec.kind !== 'tunnel') continue;
      for (const [s, inward] of [[sec.s0, 1], [sec.s1, -1]]) {
        const p = r.at(s);
        out.push({ x: p.x, z: p.z, ix: Math.sin(p.yaw) * inward, iz: Math.cos(p.yaw) * inward, lx: Math.cos(p.yaw), lz: -Math.sin(p.yaw) });
      }
    }
    return out;
  }
  // the routes whose structures stand in the scene (their portals fill the ground left out across them); adding or
  // removing one dirties the chunks round its portals, as a patch does
  const standing = new Map();   // route -> its portals
  function setStructures(r, on) {
    if (on === standing.has(r)) return;
    const ps = portalsOf(r);
    if (on) standing.set(r, ps); else standing.delete(r);
    for (const p of ps) for (const k of chunksNear(p.x, p.z, 30, chunk)) dirty.add(k);
  }
  const addStructures = (r) => setStructures(r, true);
  const removeStructures = (r) => setStructures(r, false);
  // whether the ground cell [x, x + size] x [z, z + size] should be left out of the mesh: it lies across the portal of a
  // tunnel that stands in the scene, over the bore, where the ground steps from the cutting up over the tunnel (the
  // portal and its headwall fill the gap). An unbuilt tunnel's hillside keeps its cell. Given a route, whether the cell
  // lies so across one of its portals, standing or not (to build what fills it).
  function holeCell(x, z, size, route = null) {
    for (const ps of route ? [portalsOf(route)] : standing.values()) for (const p of ps) {
      let uMin = Infinity, uMax = -Infinity, dMin = Infinity, dMax = -Infinity;
      for (const [cx, cz] of [[x, z], [x + size, z], [x, z + size], [x + size, z + size]]) {
        const u = (cx - p.x) * p.ix + (cz - p.z) * p.iz, d = (cx - p.x) * p.lx + (cz - p.z) * p.lz;
        uMin = Math.min(uMin, u); uMax = Math.max(uMax, u); dMin = Math.min(dMin, d); dMax = Math.max(dMax, d);
      }
      if (uMin <= 0 && uMax > 0 && dMin < MOUTH && dMax > -MOUTH) return true;
    }
    return false;
  }
  // the lowest a chunk's skirt may hang at a point: just over a tunnel's roof above its bore, else anywhere
  function skirtFloor(x, z) {
    let floor = -Infinity;
    for (let i = 0; i < routes.length; i++) {
      if (!routes[i].sections?.some((s) => s.kind === 'tunnel')) continue;
      const n = nearests[i](x, z);
      if (!n || n.dist > TUBE_HALF) continue;
      for (const sec of routes[i].sections) {
        if (sec.kind === 'tunnel' && n.s >= sec.s0 - 1 && n.s <= sec.s1 + 1) floor = Math.max(floor, n.y + TUBE_TOP + 0.3);
      }
    }
    return floor;
  }

  function coastDistance(x, z) { return coastAt ? coastAt(x, z).d : Infinity; }

  // which biome a point is in: the one it is deepest inside, with ragged edges (the ragging scales with the biome's size,
  // so a small biome always holds its own centre and never reaches past 1.3 r); none -> grass. A snow biome with its own `line` (snowline, m) takes precedence over the others where it holds.
  function biomeAt(x, z) {
    if (!biomes.length) return { kind: 'grass' };
    const n = noise(x / 260, z / 260, seed + 21);
    let best = null, bk = 0;
    for (const b of biomes) { const k = Math.hypot(x - b.x, z - b.z) - b.r + n * Math.min(140, 0.3 * b.r); if (b.line !== undefined && k < 0) return b; if (k < bk) { bk = k; best = b; } }
    return best ?? { kind: 'grass' };
  }

  // what a point's ground is, for colouring; h and slope (rise per metre) are worked out here unless given
  function regionAt(x, z, h = heightAt(x, z), slope) {
    if (h < seaLevel) return 'sea';
    for (const p of pads) {
      if (p.kind !== 'paving') continue;
      if (p.r !== undefined ? Math.hypot(x - p.x, z - p.z) < p.r : (([lx, lz]) => outside(lx, lz, p.w / 2, p.d / 2) === 0)(toLocal(x, z, p))) return 'paving';
    }
    slope ??= Math.hypot(heightAt(x + 2, z) - heightAt(x - 2, z), heightAt(x, z + 2) - heightAt(x, z - 2)) / 4;
    const bm = biomeAt(x, z), biome = bm.kind;
    if (biome === 'snow') {
      const line = (bm.line ?? SNOWLINE) + noise(x / 90, z / 90, seed + 31) * Math.min(10, Math.abs(bm.line ?? SNOWLINE) / 2);
      if (h > line) return slope > 1.3 ? 'rock' : 'snow';
      if (h > line - 30 && slope > 0.55) return 'scree';
    } else if (biome === 'desert') {
      if (slope > 0.45 || h > 32) return 'redrock';
      if (!(coastAt && coastDistance(x, z) < 30 && h < seaLevel + 5)) return noise(x / 70, z / 70, seed + 41) > 0.3 ? 'redrock' : 'sand';
    } else if (biome === 'urban' && slope <= 0.75) return 'paving';
    if (slope > 0.75) return 'rock';
    if (coastAt && coastDistance(x, z) < 30 && h < seaLevel + 5) return 'sand';
    return 'grass';
  }

  return { heightAt, natural, regionAt, biomeAt, coastDistance, seaLevel, addPatch, removePatch, takeDirty, holeCell, skirtFloor, addStructures, removeStructures };
}
