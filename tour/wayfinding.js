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

// ---- the way to a ride that boards away from its station (the City's speedboat, from its jetty on the seafront) ----
// A board of its own on the departure station's town-side approach, RIDE_SIGN.inn m in from the platform's open end and
// RIDE_SIGN.out m out from the line (just past the platform's edge, at the foot of its ramp side, where you walk past it
// leaving the platform), its face to the platform. It names the ride as its walkway's sign does, with an arrow, as you
// read it from the platform, the way to where the walkway leaves the town. Solid, as the departure signs are: corners
// is its footprint (posts and board). -> { text, x, y (its foot), z, yaw (its face's heading), corners: [[x, z] x 4] } or null
// (its posts sunk `sink` m into the ground there: the land beside the formation lies a little under it)
export const RIDE_SIGN = { inn: 14, out: 10.5, w: 2.4, back: 0.16, front: 0.03, sink: 0.15 };
export function rideSign(placeId) {
  const way = (PLACES[placeId].walkways ?? []).find((w) => w.sign);
  if (!way) return null;
  const st = PLACES[placeId].stations.find((s) => s.role === 'departure'), r = legRoute(st.leg);
  const { sFrom, sTo } = platformWindow(r.length, st.end, st.platformLength), town = Math.sign(laneOf(st.leg));
  const s = st.end === 'start' ? sTo - RIDE_SIGN.inn : sFrom + RIDE_SIGN.inn;
  const p = r.offsetAt(s, town * RIDE_SIGN.out);
  // facing back across to the line (its left, scaled by the town's side, turned round)
  const lx = Math.cos(p.yaw) * town, lz = -Math.sin(p.yaw) * town, yaw = Math.atan2(-lx, -lz);
  const to = way.points[0], { arrow } = pointer(p, Math.atan2(lx, lz), to);   // (read from the platform, looking at it)
  const text = `${way.sign.replace(/\s*[↑↗→↘↓↙←↖]\s*$/, '')} ${arrow}`;
  const fx = Math.sin(yaw), fz = Math.cos(yaw), rx = Math.cos(yaw), rz = -Math.sin(yaw), hw = RIDE_SIGN.w / 2;
  const corners = [[-hw, -RIDE_SIGN.back], [hw, -RIDE_SIGN.back], [hw, RIDE_SIGN.front], [-hw, RIDE_SIGN.front]]
    .map(([a, b]) => [p.x + rx * a + fx * b, p.z + rz * a + fz * b]);
  return { text, x: p.x, z: p.z, y: p.y - RIDE_SIGN.sink, yaw, corners };
}
