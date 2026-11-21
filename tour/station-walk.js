// Walking at a terminus: where its platforms are, where the track is, and the ground between it and its town. Pure
// maths, no three.js: buildTerminus (stations.js) adds the solid things it builds, and the walk tests use it as it is.
// Measured from the middle of the platform window, across the line's centre (both lines, lanes ±2): the track zone is
// |across| < 3.6, each platform 3.5..8 out on its side. On foot you may be only on the town-side platform and its
// approach: the ground beside it, along the platform's length, out to where the town begins (no further than
// APPROACH). Nothing round the buffer ends, past the platform's ends or across the lines, so the only way from one of a
// place's stations to the other is through its town.
import { legRoute, platformWindow, laneOf } from './world-data.js';
import { STATION_STYLES } from './station-style.js';

export const PLATFORM_TOP = 1.175;   // a platform's top above the formation

// The station building's footprint in the station's frame (station-style.js): the red-brick one, unless a style's is given.
export const BUILDING = STATION_STYLES.countryside.building;
export const APPROACH = 100;   // the furthest a station's approach reaches out to its town
const STEP = 1;                // the approach is found every metre along the platform, to the half metre across
const PLATFORM_OUT = 8;        // the town-side platform's outer edge, across the line's centre
const APART = 3;               // one station's approach keeps this far from another's, so they meet only in the town

// Each of a place's stations' approaches (a reach for each metre along its platform, for townSide), for the town
// inTown(x, z) (its land, and the ground round its extra parts). Where two stations' platforms make a corner with the
// town set back from it, their approaches would cross off it; a line out from one platform stops short where it would
// come within APART of the other's, so they meet only through the town.
export function approaches(walks, inTown) {
  const raw = walks.map((w) => w.rays(inTown));
  const near = (j, p) => [[0, 0], [APART, 0], [-APART, 0], [0, APART], [0, -APART], [2.1, 2.1], [2.1, -2.1], [-2.1, 2.1], [-2.1, -2.1]]
    .some(([dx, dz]) => walks[j].townSide(p.x + dx, p.z + dz, raw[j]));
  return walks.map((w, i) => {
    const reach = Float32Array.from(raw[i]);
    for (let k = 0; k < reach.length; k++) {
      if (reach[k] <= PLATFORM_OUT) continue;
      for (const p of w.rayPoints(k, raw[i])) if (walks.some((_, j) => j !== i && near(j, p))) { reach[k] = Math.max(PLATFORM_OUT, p.a - 1); break; }
    }
    return reach;
  });
}

// solid: the station's built things, each [{ key, box: { min: { x, z }, max: { x, z } } }] (a world box) or { key,
// corners: [[x, z] x 4] } (its own footprint, for a part standing square to the line: blocked within that, not the
// world box round it turned); building: a footprint (station-style.js) to stand in for the station building where
// nothing has been built (the walk tests), true for the red-brick one
export function stationWalk(leg, end, { platformLength = 120, solid = [], building = false } = {}) {
  const route = legRoute(leg), L = route.length, atEnd = end === 'end';
  const { sFrom: p0, sTo: p1 } = platformWindow(L, end, platformLength);
  const mid = (p0 + p1) / 2, o = route.at(mid), sn = Math.sin(o.yaw), cs = Math.cos(o.yaw);
  const local = (x, z) => { const dx = x - o.x, dz = z - o.z; return { along: dx * sn + dz * cs, across: dx * cs - dz * sn }; };
  const half = (p1 - p0) / 2, lineEnd = atEnd ? L - mid : -mid;   // where the track stops, along the station
  const town = Math.sign(laneOf(leg));   // the town's side, in `across`
  const toward = atEnd ? 1 : -1;         // the buffers' way, in `along`
  const B = building === true ? BUILDING : building || BUILDING, [u0, u1] = B[end], b0 = toward * (half + u0), b1 = toward * (half + u1);
  // a built part's own footprint, in the station's frame
  const footprints = solid.filter((b) => b.corners).map((b) => {
    const ls = b.corners.map(([x, z]) => local(x, z));
    return { key: b.key, a0: Math.min(...ls.map((l) => l.along)), a1: Math.max(...ls.map((l) => l.along)),
      c0: Math.min(...ls.map((l) => l.across)), c1: Math.max(...ls.map((l) => l.across)) };
  });
  const boxes = solid.filter((b) => b.box);
  const inBuilding = (l, r) => Math.min(b0, b1) - r < l.along && l.along < Math.max(b0, b1) + r
    && B.near - r < l.across * town && l.across * town < B.far + r;
  // a point `a` metres out on the town side, `along` the platform from its middle
  const out = (along, a) => ({ x: o.x + along * sn + town * a * cs, z: o.z + along * cs - town * a * sn });
  const n = Math.floor((2 * half) / STEP) + 1, alongOf = (k) => -half + k * STEP;
  // how far out the approach reaches at each metre along the platform, for one town (inTown(x, z)): to the town where
  // a line out from the platform meets it, the platform alone where none does
  const reaches = new WeakMap();
  return {
    rays(inTown) {
      if (!reaches.has(inTown)) {
        const reach = new Float32Array(n);
        for (let k = 0; k < n; k++) {
          reach[k] = PLATFORM_OUT;
          for (let a = 3.5; a <= APPROACH; a += 0.5) { const p = out(alongOf(k), a); if (inTown(p.x, p.z)) { reach[k] = a; break; } }
        }
        reaches.set(inTown, reach);
      }
      return reaches.get(inTown);
    },
    // the points along ray k, out from the platform to its reach
    *rayPoints(k, reach) { for (let a = 3.5; a <= reach[k]; a += 0.5) yield { ...out(alongOf(k), a), a }; },
    // on the town-side platform, or out from it no further than `reach` (from rays, or approaches below)
    townSide(x, z, reach) {
      const l = local(x, z), a = l.across * town;
      if (Math.abs(l.along) > half || a < 3.5) return false;
      const k = Math.round((l.along + half) / STEP);
      return a <= reach[Math.min(n - 1, Math.max(0, k))] + 0.5;
    },
    onTrack(x, z) {
      const l = local(x, z);
      const pastEnd = atEnd ? l.along > lineEnd : l.along < lineEnd;
      return Math.abs(l.across) < 3.6 && !pastEnd && Math.abs(l.along) <= half + 40;   // (the lines run on past the platform)
    },
    platformY(x, z) {
      const l = local(x, z), a = Math.abs(l.across);
      return a >= 3.5 && a <= 8 && Math.abs(l.along) <= half ? o.y + PLATFORM_TOP : null;
    },
    blocked(x, z, r) {
      const l = local(x, z);
      if (building && inBuilding(l, r)) return 'station-building';
      for (const f of footprints) if (l.along > f.a0 - r && l.along < f.a1 + r && l.across > f.c0 - r && l.across < f.c1 + r) return f.key;
      for (const b of boxes) if (x > b.box.min.x - r && x < b.box.max.x + r && z > b.box.min.z - r && z < b.box.max.z + r) return b.key;
      return null;
    },
  };
}
