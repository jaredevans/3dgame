// The suburbs beside a line (a leg's `suburbs`: stretches [s0, s1] of it): a street of detached houses parallel to the
// line on each side, their back gardens fenced against the railway, front yards with a tree, a mailbox and often a car,
// a second row of houses across the street, and shade trees on the slopes beside the line. Pure maths, no three.js: it
// lays every piece out, deterministically, on a terrain (terrain.js); suburbs-mesh.js builds them from the Neighborhood
// Pathways parts. Each piece: { kind, key, params, x, z, y, yaw, along, across } (along x across: its footprint in
// metres, along its own x and z), turned by yaw (its +z towards (sin yaw, cos yaw)), standing on its ground at y; a
// street tile or a car also lies on the ground's slope (pitch, roll); a house stands level on a plinth down to `plinth`.
import { LEGS, PLACES, FEATURES, SEA_LEVEL, legRoute } from './world-data.js';
import { EVENTS } from './events.js';

// distances out from the line's centre, on either side (metres)
export const LAYOUT = {
  shade: [16, 31],   // shade trees on the slopes beside the line, out of its swept path and off the track bed (6 m)
  fence: 37,         // the back fences of the first row, past the track bed's blend (6 + 30 m)
  rowA: 44,          // the first row's houses (8 m deep), backing onto the line, facing the street
  street: 54,        // the street (4 m wide)
  rowB: 64,          // the row across the street, facing it
  lot: 24,           // each lot's width along the line
};
export const CLEAR_LINE = 12;    // nothing nearer a line's centre than this
export const CLEAR_RIVER = 120;  // nor this near a river's course (its valley's half-width and fade, and more)
export const CLEAR_PLACE = 25;   // nor this near a place's footprint
// a level crossing's road (actors/crossing.js): `width` wide, straight out `length` m either side of the line, square to
// it at the crossing; nothing but the street stands within `half` of its middle
export const ROAD = { width: 6, half: 5, length: 70 };
// a house stands level on a plinth of dressed stone filling down to its ground's lowest point (the land rolls): its floor at
// its footprint's highest ground, and only where that plinth is no taller than this
export const PLINTH = 1.2;

// the houses, their footprints (along the line x across it, measured) and their colourways
export const HOUSES = [
  { key: 'single-storey-ranch-house', along: 12, colorways: ['sand-ranch', 'mint-ranch', 'cream-ranch', 'olive-ranch'] },
  { key: 'split-level-house', along: 12, colorways: ['taupe-stone', 'sage-ledge', 'desert-adobe', 'slate-modern'] },
  { key: 'two-storey-family-house', along: 8, colorways: ['sand-taupe', 'colonial-white', 'harbor-blue', 'barn-red'] },
  { key: 'porch-front-cottage', along: 8, colorways: ['sand-cottage', 'sage-cottage', 'slate-white', 'brick-red'] },
];
const DEPTH = 8;
const CARS = ['suburban-slate', 'sand-beige', 'forest-green', 'brick-red', 'harbour-blue'];
const TREES = ['garden-green', 'deep-shade', 'nursery-lime', 'copper-leaf'];
const SHADE = ['street-green', 'deep-shade', 'spring-lime', 'plane-tree'];

// a deterministic 0..1 from integers
function rand(...k) {
  let h = 2166136261;
  for (const v of k) { h ^= v | 0; h = Math.imul(h, 16777619); h ^= h >>> 13; }
  return ((h >>> 0) % 100000) / 100000;
}
const pick = (list, r) => list[Math.floor(r * list.length) % list.length];

// how far a point lies outside a place's footprint rectangle (0 inside it), as places.js turns its kit
function outsidePlace(p, x, z) {
  const c = Math.cos(p.rot), s = Math.sin(p.rot), [ox, oz] = p.offset ?? [0, 0], dx = x - p.centre.x, dz = z - p.centre.z;
  const lx = dx * c - dz * s, lz = dx * s + dz * c;
  return Math.hypot(Math.max(0, Math.abs(lx - ox) - p.size[0] / 2), Math.max(0, Math.abs(lz - oz) - p.size[1] / 2));
}
// distance from a point to a valley's course
function toCourse(v, x, z) {
  const dx = v.x1 - v.x0, dz = v.z1 - v.z0, u = Math.max(0, Math.min(1, ((x - v.x0) * dx + (z - v.z0) * dz) / (dx * dx + dz * dz)));
  return Math.hypot(x - v.x0 - u * dx, z - v.z0 - u * dz);
}

// whether a point may hold a piece: on land, clear of rivers and places
export function clearGround(x, z, terrain) {
  if (terrain.heightAt(x, z) < SEA_LEVEL + 1) return false;
  for (const v of FEATURES) if (v.kind === 'valley' && v.water && toCourse(v, x, z) < CLEAR_RIVER) return false;
  for (const p of Object.values(PLACES)) if (p.size && outsidePlace(p, x, z) < CLEAR_PLACE) return false;
  return true;
}

// the corners of a piece's footprint
export function corners(q) {
  const s = Math.sin(q.yaw), c = Math.cos(q.yaw), a = q.along / 2, b = q.across / 2;
  // its x is (cos yaw, -sin yaw), its z (sin yaw, cos yaw)
  return [[-a, -b], [a, -b], [a, b], [-a, b]].map(([u, v]) => [q.x + u * c + v * s, q.z - u * s + v * c]);
}
// the ground under a footprint: its lowest and highest
export function groundUnder(q, terrain) {
  const hs = [...corners(q), [q.x, q.z]].map(([x, z]) => terrain.heightAt(x, z));
  return { lo: Math.min(...hs), hi: Math.max(...hs) };
}

// every piece of a leg's suburbs, laid on `terrain`
export function suburbLayout(legId, terrain) {
  const job = suburbLayoutJob(legId, terrain);
  for (;;) { const r = job.next(); if (r.done) return r.value; }
}

// the same, as a job that yields after each lot and every few street tiles (slicer.js), so the page lays it out a slice
// a frame
export function* suburbLayoutJob(legId, terrain) {
  const stretches = LEGS[legId].suburbs ?? [];
  const route = legRoute(legId), out = [], p = {};
  // a piece at s, `d` out on side `side` (+1 left), turned to face away from the line (out: true) or towards it
  const at = (s, d, side) => { route.offsetAt(s, side * d, p); return { x: p.x, z: p.z, lineYaw: route.at(s).yaw }; };
  const facing = (lineYaw, side, out) => lineYaw + (out ? side : -side) * Math.PI / 2;
  // the level crossings' roads: { x, z, fx, fz } (where, and the line's heading there)
  const roads = (EVENTS[legId] ?? []).filter((e) => e.react?.kind === 'crossing').map((e) => {
    const c = route.at(e.react.at.out);
    return { x: c.x, z: c.z, fx: Math.sin(c.yaw), fz: Math.cos(c.yaw) };
  });
  const offRoad = (x, z) => roads.every((r) => {
    const along = (x - r.x) * r.fx + (z - r.z) * r.fz, across = (x - r.x) * r.fz - (z - r.z) * r.fx;
    return Math.abs(along) >= ROAD.half || Math.abs(across) > ROAD.length;
  });
  const clear = (q) => [...corners(q), [q.x, q.z]].every(([x, z]) => clearGround(x, z, terrain) && (q.kind === 'street' || offRoad(x, z)));
  // stand a small piece on its ground: at its footprint's lowest point, so it never floats
  const put = (q) => {
    if (!clear(q)) return false;
    out.push({ ...q, y: groundUnder(q, terrain).lo - 0.03 });
    return true;
  };
  // a house: level, on its plinth (y its floor, plinth the plinth's foot)
  const house = (q) => {
    if (!clear(q)) return false;
    const g = groundUnder(q, terrain);
    if (g.hi - g.lo > PLINTH) return false;
    out.push({ ...q, y: g.hi + 0.02, plinth: g.lo - 0.15 });
    return true;
  };
  // a street tile, or a car on its drive, lies on the ground's slope: tilted to the plane through the ground at its
  // edges, its middle on the ground (pitch about its x, roll about its z, after its yaw: its local (u, v) rises
  // v sin pitch + u sin roll)
  const tilt = (q) => {
    if (!clear(q)) return false;
    const sn = Math.sin(q.yaw), cs = Math.cos(q.yaw), h = (u, v) => terrain.heightAt(q.x + u * cs + v * sn, q.z - u * sn + v * cs);
    const a = q.along / 2, b = q.across / 2;
    const pitch = Math.atan2(h(0, b) - h(0, -b), 2 * b), roll = Math.atan2(h(a, 0) - h(-a, 0), 2 * a);
    out.push({ ...q, y: terrain.heightAt(q.x, q.z) - 0.02, pitch, roll });
    return true;
  };
  for (const [si, [s0, s1]] of stretches.entries()) {
    for (const side of [1, -1]) {
      // lots along the first row's line: each lot `LAYOUT.lot` wide there (shorter or longer at the line on a curve)
      const lots = Math.floor((s1 - s0) / LAYOUT.lot);
      for (let k = 0; k < lots; k++) {
        const sMid = s0 + (k + 0.5) * LAYOUT.lot, r = (n) => rand(si, side, k, n);
        for (const [row, outward] of [[LAYOUT.rowA, true], [LAYOUT.rowB, false]]) {
          const h = pick(HOUSES, r(row)), c = at(sMid, row, side), yaw = facing(c.lineYaw, side, outward);
          const shift = (r(row + 1) - 0.5) * (LAYOUT.lot - h.along - 6);   // not all in a line
          const hc = at(sMid + shift, row, side);
          const built = house({ kind: 'house', key: h.key, params: { colorway: pick(h.colorways, r(row + 2)) }, x: hc.x, z: hc.z, yaw, along: h.along, across: DEPTH });
          // its front yard, towards the street: a tree, a mailbox at the kerb, a car on the drive beside the house
          const front = outward ? row + 5.5 : row - 5.5, kerb = outward ? LAYOUT.street - 2.6 : LAYOUT.street + 2.6;
          const side2 = r(row + 3) < 0.5 ? -1 : 1, yard = sMid + shift - side2 * (h.along / 2 - 1.5);
          const t = at(yard, front, side);
          put({ kind: 'tree', key: 'ornamental-front-yard-tree', params: { colorway: pick(TREES, r(row + 4)) }, x: t.x, z: t.z, yaw: r(row + 5) * 6.28, along: 2.4, across: 2.4 });
          if (!built) continue;
          const mb = at(sMid + shift + side2 * (h.along / 2 + 1), kerb, side);
          put({ kind: 'mailbox', key: 'curbside-mailbox', params: {}, x: mb.x, z: mb.z, yaw: facing(c.lineYaw, side, !outward), along: 0.4, across: 0.7 });
          if (r(row + 6) < 0.6) {
            const cr = at(sMid + shift + side2 * (h.along / 2 + 2.2), (row + (outward ? 1 : -1) * 4.5), side);
            tilt({ kind: 'car', key: 'family-crossover-suv', params: { colorway: pick(CARS, r(row + 7)) }, x: cr.x, z: cr.z, yaw: facing(c.lineYaw, side, outward), along: 2.4, across: 4.6 });
          }
        }
        // the first row's back fence, along the lot against the railway
        for (let f = 0; f < LAYOUT.lot / 2; f++) {
          const fs = s0 + k * LAYOUT.lot + 1 + f * 2, q = at(fs, LAYOUT.fence, side);
          put({ kind: 'fence', key: 'wooden-fence-section', params: { colorway: 'weathered-oak' }, x: q.x, z: q.z, yaw: q.lineYaw + Math.PI / 2, along: 2, across: 0.25 });
        }
        // a shade tree on the slope beside the line, every other lot, at some distance out
        if (r(9) < 0.55) {
          const q = at(s0 + (k + r(10)) * LAYOUT.lot, LAYOUT.shade[0] + r(11) * (LAYOUT.shade[1] - LAYOUT.shade[0]), side);
          put({ kind: 'tree', key: 'broad-canopy-shade-tree', params: { colorway: pick(SHADE, r(12)) }, x: q.x, z: q.z, yaw: r(13) * 6.28, along: 1, across: 1 });
        }
        yield;
      }
      // the street: 4 m tiles end to end along the street's own curve, from the first lot to the last
      const ss = [];
      for (let s = s0; s <= s0 + lots * LAYOUT.lot; s += 0.5) ss.push(at(s, LAYOUT.street, side));
      let acc = 0;
      for (let i = 1; i < ss.length; i++) {
        acc += Math.hypot(ss[i].x - ss[i - 1].x, ss[i].z - ss[i - 1].z);
        if (acc < 4) continue;
        // the tile's middle is 2 m back along the street: between the point 4 m back and this one
        let j = i, back = 0;
        while (j > 0 && back < 4) { back += Math.hypot(ss[j].x - ss[j - 1].x, ss[j].z - ss[j - 1].z); j--; }
        const a = ss[j], b = ss[i];
        tilt({ kind: 'street', key: 'residential-street-tile', params: { piece: 'straight', markings: 'dashed', colorway: 'sun-bleached' },
          x: (a.x + b.x) / 2, z: (a.z + b.z) / 2, yaw: Math.atan2(b.x - a.x, b.z - a.z), along: 4, across: 4 });
        acc = 0;
        if (i % 40 === 0) yield;
      }
    }
  }
  return out;
}
