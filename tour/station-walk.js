// Walking at a terminus: where its platforms are, where the track is, and how far the station reaches. Pure maths, no
// three.js: buildTerminus (stations.js) adds the solid things it builds, and the walk tests use it as it is.
// Measured from the middle of the platform window, across the line's centre (both lines, lanes ±2): the track zone is
// |across| < 3.6, each platform 3.5..8 out on its side; the station takes in 30 m either side and 40 m past each end.
import { legRoute, platformWindow, laneOf } from './world-data.js';

export const PLATFORM_TOP = 1.175;   // a platform's top above the formation

// The station building, in the station's frame, as buildTerminus places it (measured from the built termini): 24 m
// long, measured from the platform's buffer end towards the buffers (-18..+6 m at a leg's end, -26..-2 m at its start),
// and 7.6..16 m out on the town side.
export const BUILDING = { end: [-18, 6], start: [-26, -2], near: 7.6, far: 16 };

// solid: the station's built things [{ key, box: { min: { x, z }, max: { x, z } } }]; building: true stands in for the
// station building from BUILDING where nothing has been built (the walk tests)
export function stationWalk(leg, end, { platformLength = 120, solid = [], building = false } = {}) {
  const route = legRoute(leg), L = route.length, atEnd = end === 'end';
  const { sFrom: p0, sTo: p1 } = platformWindow(L, end, platformLength);
  const mid = (p0 + p1) / 2, o = route.at(mid), sn = Math.sin(o.yaw), cs = Math.cos(o.yaw);
  const local = (x, z) => { const dx = x - o.x, dz = z - o.z; return { along: dx * sn + dz * cs, across: dx * cs - dz * sn }; };
  const half = (p1 - p0) / 2, lineEnd = atEnd ? L - mid : -mid;   // where the track stops, along the station
  const town = Math.sign(laneOf(leg));   // the town's side, in `across`
  const toward = atEnd ? 1 : -1;         // the buffers' way, in `along`
  const B = BUILDING, [u0, u1] = B[end], b0 = toward * (half + u0), b1 = toward * (half + u1);
  const inBuilding = (l, r) => Math.min(b0, b1) - r < l.along && l.along < Math.max(b0, b1) + r
    && B.near - r < l.across * town && l.across * town < B.far + r;
  return {
    // beside the platform on the town's side, out to the edge of the station (where its town should meet it)
    forecourt(x, z) { const l = local(x, z), a = l.across * town; return Math.abs(l.along) <= half && a >= 3.5 && a <= 30; },
    inStation(x, z) { const l = local(x, z); return Math.abs(l.along) <= half + 40 && Math.abs(l.across) <= 30; },
    onTrack(x, z) {
      const l = local(x, z);
      const pastEnd = atEnd ? l.along > lineEnd : l.along < lineEnd;
      return Math.abs(l.across) < 3.6 && !pastEnd && Math.abs(l.along) <= half + 40;
    },
    platformY(x, z) {
      const l = local(x, z), a = Math.abs(l.across);
      return a >= 3.5 && a <= 8 && Math.abs(l.along) <= half ? o.y + PLATFORM_TOP : null;
    },
    blocked(x, z, r) {
      if (building && inBuilding(local(x, z), r)) return 'station-building';
      for (const b of solid) if (x > b.box.min.x - r && x < b.box.max.x + r && z > b.box.min.z - r && z < b.box.max.z + r) return b.key;
      return null;
    },
  };
}
