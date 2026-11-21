// Walking at a terminus: where its platforms are, where the track is, and how far the station reaches. Pure maths, no
// three.js: buildTerminus (stations.js) adds the solid things it builds, and the walk tests use it as it is.
// Measured from the middle of the platform window, across the line's centre (both lines, lanes ±2): the track zone is
// |across| < 3.6, each platform 3.5..8 out on its side; the station takes in 30 m either side and 40 m past each end.
import { legRoute, platformWindow } from './world-data.js';

export const PLATFORM_TOP = 1.175;   // a platform's top above the formation

export function stationWalk(leg, end, { platformLength = 120, solid = [] } = {}) {
  const route = legRoute(leg), L = route.length, atEnd = end === 'end';
  const { sFrom: p0, sTo: p1 } = platformWindow(L, end, platformLength);
  const mid = (p0 + p1) / 2, o = route.at(mid), sn = Math.sin(o.yaw), cs = Math.cos(o.yaw);
  const local = (x, z) => { const dx = x - o.x, dz = z - o.z; return { along: dx * sn + dz * cs, across: dx * cs - dz * sn }; };
  const half = (p1 - p0) / 2, lineEnd = atEnd ? L - mid : -mid;   // where the track stops, along the station
  return {
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
    // solid: [{ key, box: { min: { x, z }, max: { x, z } } }]
    blocked(x, z, r) {
      for (const b of solid) if (x > b.box.min.x - r && x < b.box.max.x + r && z > b.box.min.z - r && z < b.box.max.z + r) return b.key;
      return null;
    },
  };
}
