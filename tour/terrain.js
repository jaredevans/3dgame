// The tour's landscape as a height function. Pure maths, no three.js.
// natural ground (rolling hills, a coast with cliffs or beaches) -> the track bed cut and filled under every route
// -> flat pads under places and stations.

export const BED_DROP = 0.05;   // ground sits this far below a route's formation level (route.y), under the ballast
const BED_HALF = 6;             // metres either side of the route centre held exactly at the bed
const BED_BLEND = 30;           // then blending back to natural ground over this many metres
const PAD_BLEND = 20;
const PATCH_BLEND = 25;

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
function indexRoute(route, step = 4, cell = 64) {
  const n = Math.ceil(route.length / step) + 1, xs = [], zs = [], ss = [];
  const grid = new Map(), key = (i, j) => `${i},${j}`;
  for (let k = 0; k < n; k++) {
    const s = Math.min(route.length, k * step), p = route.at(s);
    xs.push(p.x); zs.push(p.z); ss.push(s);
    const kk = key(Math.floor(p.x / cell), Math.floor(p.z / cell));
    if (!grid.has(kk)) grid.set(kk, []);
    grid.get(kk).push(k);
  }
  const reach = Math.ceil((BED_HALF + BED_BLEND + step) / cell);
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

// pads: circles { x, z, r, y } or rectangles { x, z, w, d, rot, y }, held flat at y.
// patches: a placed kit's own ground { x, y, z, rot, drop, sample(lx, lz) -> { h, d } | null }: h is the kit's ground at
// the nearest point of its land, d how far outside its land the point is (0 on it). On its land ours follows the kit's,
// sunk by `drop` so the kit's ground covers ours; off it, ours blends out from the land's edge height.
export function makeTerrain({ routes = [], pads = [], patches = [], coast = null, base = 8, seaLevel = 0, seed = 1 } = {}) {
  const nearests = routes.map((r) => indexRoute(r));
  const coastAt = coast ? indexCoast(coast) : null;
  const SEA_FLOOR = seaLevel - 7;

  function natural(x, z) {
    const c = coastAt ? coastAt(x, z) : { d: Infinity, top: base, kind: 0 };
    const amp = 3 + Math.min(28, Math.max(0, c.d - 120) * 0.035);
    const land = base + fbm(x / 380, z / 380, seed) * amp + Math.max(0, fbm(x / 900, z / 900, seed + 9)) * amp * 0.8;
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
    // the track bed: hold the formation under every route, cuttings and embankments blending out
    let bestW = 1, bedY = 0;
    for (const nearest of nearests) {
      const n = nearest(x, z);
      if (!n) continue;
      const w = smooth(BED_HALF, BED_HALF + BED_BLEND, n.dist);
      if (w < bestW) { bestW = w; bedY = n.y - BED_DROP; }
    }
    if (bestW < 1) h = lerp(bedY, h, bestW);
    for (const p of pads) {
      let d;
      if (p.r !== undefined) d = Math.max(0, Math.hypot(x - p.x, z - p.z) - p.r);
      else { const [lx, lz] = toLocal(x, z, p); d = outside(lx, lz, p.w / 2, p.d / 2); }
      if (d < PAD_BLEND) h = lerp(p.y, h, smooth(0, PAD_BLEND, d));
    }
    for (const p of patches) {
      const [lx, lz] = toLocal(x, z, p), r = p.sample(lx, lz);
      if (!r || r.d >= PATCH_BLEND) continue;
      h = lerp(p.y + r.h - (p.drop ?? 0), h, smooth(0, PATCH_BLEND, r.d));
    }
    return h;
  }

  function coastDistance(x, z) { return coastAt ? coastAt(x, z).d : Infinity; }

  function regionAt(x, z) {
    const h = heightAt(x, z);
    if (h < seaLevel) return 'sea';
    for (const p of pads) {
      if (p.kind !== 'paving') continue;
      if (p.r !== undefined ? Math.hypot(x - p.x, z - p.z) < p.r : (([lx, lz]) => outside(lx, lz, p.w / 2, p.d / 2) === 0)(toLocal(x, z, p))) return 'paving';
    }
    const sx = heightAt(x + 2, z) - heightAt(x - 2, z), sz = heightAt(x, z + 2) - heightAt(x, z - 2);
    if (Math.hypot(sx, sz) / 4 > 0.75) return 'rock';
    if (coastAt && coastDistance(x, z) < 30 && h < seaLevel + 5) return 'sand';
    return 'grass';
  }

  return { heightAt, regionAt, coastDistance, seaLevel };
}
