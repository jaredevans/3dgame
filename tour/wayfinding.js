// Finding the way across a town on foot: where the next train leaves from, what the arrival platform's sign says, and
// which way to go from where you stand. Pure maths, no three.js.
// Yaw convention as route.js: yaw = atan2(dx, dz), 0 faces +z; turning right lowers yaw (right is -x facing +z).
import { PLACES, LEGS, legRoute, laneOf, platformWindow } from './world-data.js';
import { TRAIN_SPECS } from './trains/specs.js';

const PLATFORM_MID = 5.75;   // a platform's middle, across the line's centre (station-walk.js: it runs 3.5..8 out)

// the place's departure: its leg, the train that runs it and where to, and the middle of its platform (on the town side
// of the line, where its trains stand). Worked out once a place (the HUD asks every frame on foot): don't change it.
const departures = new Map();
export function departureFor(placeId) {
  if (!departures.has(placeId)) departures.set(placeId, findDeparture(placeId));
  return departures.get(placeId);
}
function findDeparture(placeId) {
  const st = PLACES[placeId].stations.find((s) => s.role === 'departure'), leg = LEGS[st.leg], r = legRoute(st.leg);
  const { sFrom, sTo } = platformWindow(r.length, st.end, st.platformLength);
  const p = r.offsetAt((sFrom + sTo) / 2, Math.sign(laneOf(st.leg)) * PLATFORM_MID);
  return { leg: st.leg, train: TRAIN_SPECS[leg.train].name, to: PLACES[leg.to].name, x: p.x, z: p.z };
}

// the sign on the place's arrival platform
export function departureSign(placeId) {
  const d = departureFor(placeId);
  return `Departures across town: ${d.train} to ${d.to}`;
}

const ARROWS = ['↑', '↗', '→', '↘', '↓', '↙', '←', '↖'];   // clockwise from ahead, in eighths

// which way `target` is from `from`, looking along viewYaw, and how far
export function pointer(from, viewYaw, target) {
  const dx = target.x - from.x, dz = target.z - from.z;
  const rel = Math.atan2(dx, dz) - viewYaw;   // + to the left
  const k = Math.round(-Math.atan2(Math.sin(rel), Math.cos(rel)) / (Math.PI / 4));
  return { arrow: ARROWS[((k % 8) + 8) % 8], metres: Math.hypot(dx, dz) };
}
