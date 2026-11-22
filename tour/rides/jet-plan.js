// The jet's ride (west-future), its choreography as pure numbers keyed to the jet's ride-s (so the same s always gives
// the same picture, whatever the frame rate; rides/jet.js and rides/ufo.js pose things from them and the tests measure
// them from the same numbers). No three.js.
//
// - The rocket: the leg's rocket lifts off as the jet passes ROCKET_CUE on its run in (the ride triggering the launch:
//   main.js shifts the leg's rocket event to there, rides.js rideLegEvents), with the pad some 27 degrees off its nose,
//   3.3 km ahead, so it's seen from the cockpit climbing away; the jet then flies round it while it climbs.
// - Its gear: down on its two rolls (rides.js `rolls`), raised once it's climbed away (the model's own retraction, its
//   doors opening, the legs swinging up and the doors closing behind them), lowered well before it comes down to land;
//   and its flaps, a little out for the take-off and fully for the landing.
// - The UFO: after the jet has passed round the far side of the rocket, a flying saucer drops in from high behind on its
//   right (between it and the rocket), paces it there a little ahead, firing laser bolts that streak past (ahead of its
//   nose, over its canopy, behind its tail: never nearer than 15 m to any of it), and shoots away up into the night sky
//   ahead as the jet starts down to land.

const smooth = (u) => { u = Math.min(1, Math.max(0, u)); return u * u * (3 - 2 * u); };
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

// where the jet is, in its holder's frame (+z forward; the model measured in the page: 16.5 m span, 16.9 m long, its
// tyres 1.5 m under the holder): a capsule about its forward axis through the holder, from its tail cone to its nose,
// wide enough to take in its wingtips and fin however it banks or pitches. The bolts and the saucer are kept clear of it
export const JET_HULL = { back: -7.7, front: 9.22, r: 9.4 };

// ride-s at which the rocket lifts off (the jet ~28 s out, 3.3 km from the pad, the pad 27 degrees right of its nose)
export const ROCKET_CUE = 4200;

// ---- the gear and flaps ----
// ride-s: the gear goes up over `up` (from some 20 m over the ground to 60), comes down over `down` (from 75 m, 1.2 km
// out, locked down by 55 m); the flaps are at `takeoff` until they're raised over `retract`, and come fully out over
// `land`. Each a smoothstep in ride-s
export const GEAR = { up: [220, 520], down: [14250, 14700] };
export const FLAPS = { takeoff: 0.25, retract: [560, 900], land: [13950, 14600] };
// 0: down and locked, 1: up and stowed (the model's `gear` knob)
export function gearAt(s) {
  return smooth((s - GEAR.up[0]) / (GEAR.up[1] - GEAR.up[0])) * (1 - smooth((s - GEAR.down[0]) / (GEAR.down[1] - GEAR.down[0])));
}
// 0: in, 1: fully out (35 degrees, the landing setting)
export function flapsAt(s) {
  const up = FLAPS.takeoff * (1 - smooth((s - FLAPS.retract[0]) / (FLAPS.retract[1] - FLAPS.retract[0])));
  return Math.max(up, smooth((s - FLAPS.land[0]) / (FLAPS.land[1] - FLAPS.land[0])));
}

// its nose held up a little over its path as it comes in to land (radians): its approach attitude from 1.2 km out, flared
// so its main wheels touch first, lowered onto its nose wheel over FLARE.lower once they're down (the path's own pitch
// gives the take-off's rotation and climb). The model is turned so about its holder, over its main wheels
export const FLARE = { angle: 4 * Math.PI / 180, raise: [14350, 14560], lower: [15590, 15625] };
export function noseUp(s) {
  return FLARE.angle * smooth((s - FLARE.raise[0]) / (FLARE.raise[1] - FLARE.raise[0])) * (1 - smooth((s - FLARE.lower[0]) / (FLARE.lower[1] - FLARE.lower[0])));
}

// The model's gear and flap pivots (business-jet-684611.mjs `rig`, and how it poses them for a `gear` knob between 0
// and 1): each node turned about its own axis by `deg` times one of three clocks of the retraction (legs: swinging up
// over its middle; doors: opening at its start and closing at its end; bay: the doors left open while the gear is down,
// closing at its end). Built at gear 0, those standing open already are at their clock's 1, so each is set outright
const NOSE_SWING = 112, MAIN_SWING = 88, NOSE_DOOR = 75, NOSE_FWD = 100, MAIN_DOOR = 71, BAY_DOOR = 95, FLAP = 35;
export const GEAR_RIG = [
  ['gear-nose', 'x', -NOSE_SWING, 'leg'], ['gear-main-l', 'z', -MAIN_SWING, 'leg'], ['gear-main-r', 'z', MAIN_SWING, 'leg'],
  ['gear-door-nose-l', 'x', NOSE_DOOR, 'bay'], ['gear-door-nose-r', 'x', -NOSE_DOOR, 'bay'],
  ['gear-door-nose-fwd-l', 'x', NOSE_FWD, 'door'], ['gear-door-nose-fwd-r', 'x', -NOSE_FWD, 'door'],
  ['gear-door-main-l', 'x', -MAIN_DOOR, 'door'], ['gear-door-main-r', 'x', MAIN_DOOR, 'door'],
  ['gear-door-bay-l', 'x', BAY_DOOR, 'door'], ['gear-door-bay-r', 'x', -BAY_DOOR, 'door'],
  ['gear-door-bay-end-l', 'x', BAY_DOOR, 'bay'], ['gear-door-bay-end-r', 'x', -BAY_DOOR, 'bay'],
].map(([node, axis, deg, clock]) => ({ node, axis, deg, clock }));
export const FLAP_RIG = [{ node: 'flap-l', axis: 'x', deg: -FLAP }, { node: 'flap-r', axis: 'x', deg: -FLAP }];
const gss = (a, b, x) => smooth((x - a) / (b - a));
// the three clocks at a gear knob g (0..1) -> out { leg, door, bay }
export function gearClocks(g, out = { leg: 0, door: 0, bay: 0 }) {
  out.leg = gss(0.15, 0.85, g);
  out.door = g < 0.5 ? gss(0, 0.15, g) : 1 - gss(0.85, 1, g);
  out.bay = 1 - gss(0.85, 1, g);
  return out;
}

// ---- the UFO ----
// Its window in ride-s (the ride's 'ufo' event); `arrive`: metres over which it drops in from `from` to its slot; it
// leaves over `leave`, gone by s1. Offsets are about the jet on its path (metres: along it ahead, out to its left, up;
// placeOnPath), the slot's weave over `period` metres of the jet's travel (~12 s): drifting from alongside its wing
// (where the director's heli, from the jet's other side, has it beyond the jet: so it comes in there, and stays over
// the heli's hold, `phase`) to some 105 m ahead (where it's in the cockpit's view ahead, on the right, some 30 degrees
// off its nose). `radius`: the saucer's
export const UFO = {
  s0: 10200, s1: 14350, arrive: 700, leave: [13550, 14350],
  from: { along: -380, side: -160, up: 330 },
  slot: { along: 56, side: -52, up: 16 }, weave: { along: 50, side: 7, up: 5 }, period: 2500, phase: 1.7,
  away: { along: 2200, side: -150, up: 1700 },
  radius: 8,
};
// -> out { along, side, up, roll, pitch (its tilt, radians), visible }, at the jet's ride-s s
export function ufoOffset(s, out = { along: 0, side: 0, up: 0, roll: 0, pitch: 0, visible: false }) {
  out.visible = s >= UFO.s0 && s <= UFO.s1;
  const w = (2 * Math.PI * (s - UFO.s0)) / UFO.period, S = UFO.slot, W = UFO.weave;
  const along = S.along + W.along * Math.sin(w + UFO.phase), side = S.side + W.side * Math.sin(1.7 * w + 1), up = S.up + W.up * Math.sin(2.3 * w + 2);
  const k = smooth((s - UFO.s0) / UFO.arrive), F = UFO.from;
  const u = clamp((s - UFO.leave[0]) / (UFO.leave[1] - UFO.leave[0]), 0, 1), A = UFO.away, go = u * u * u, rise = u * u;
  out.along = F.along + (along - F.along) * k + A.along * go;
  out.side = F.side + (side - F.side) * k + A.side * u;
  out.up = F.up + (up - F.up) * k + A.up * rise;
  // a saucer's wobble as it hovers, tipped towards where it's going as it drops in and as it goes
  out.roll = 0.06 * Math.sin(3.1 * w) + 0.25 * (1 - k);
  out.pitch = 0.05 * Math.sin(2.2 * w + 0.5) - 0.3 * u;
  return out;
}

// The bolts: fired from the saucer every BOLT.every metres of the jet's travel over its pacing, each at a point `miss`
// about the jet (as ufoOffset's) it streaks through, flying on past it, at BOLT.speed m/s against the jet, for
// BOLT.reach metres; `length`, its streak. Aimed in turn ahead of the nose, over the canopy, high ahead, behind the
// tail and far ahead on the other side
export const BOLT = { first: 10950, every: 265, count: 10, speed: 520, reach: 260, length: 24 };
const MISSES = [
  { along: 42, side: 4, up: 2 }, { along: 6, side: 0, up: 28 }, { along: 40, side: 2, up: 22 },
  { along: -60, side: -18, up: 14 }, { along: 46, side: 10, up: 9 },
];
export const BOLTS = Array.from({ length: BOLT.count }, (_, i) => {
  const s = BOLT.first + i * BOLT.every, from = ufoOffset(s), miss = MISSES[i % MISSES.length];
  // (it leaves the saucer's rim on the side towards the jet)
  const dx = miss.along - from.along, dy = miss.side - from.side, dz = miss.up - from.up, n = Math.hypot(dx, dy, dz);
  const dir = { along: dx / n, side: dy / n, up: dz / n }, r = UFO.radius * 0.8;
  return { s, from: { along: from.along + dir.along * r, side: from.side + dir.side * r, up: from.up + dir.up * r }, dir, miss };
});
// bolt b when the jet is at ride-s s, the jet going at v m/s (its cruise: the bolts fly within it): -> out { alive,
// head: { along, side, up }, tail, u (0..1 through its flight) }
export function boltAt(b, s, v, out = { alive: false, u: 0, head: { along: 0, side: 0, up: 0 }, tail: { along: 0, side: 0, up: 0 } }) {
  const d = ((s - b.s) / v) * BOLT.speed;
  out.alive = d >= 0 && d <= BOLT.reach;
  out.u = clamp(d / BOLT.reach, 0, 1);
  const h = clamp(d, 0, BOLT.reach), t = Math.max(0, h - BOLT.length);
  out.head.along = b.from.along + b.dir.along * h; out.head.side = b.from.side + b.dir.side * h; out.head.up = b.from.up + b.dir.up * h;
  out.tail.along = b.from.along + b.dir.along * t; out.tail.side = b.from.side + b.dir.side * t; out.tail.up = b.from.up + b.dir.up * t;
  return out;
}

// an offset about the jet (along, side, up) when the jet is at ride-s s, in the world: on the ride's path `along` ahead
// (past its end, straight on along its last heading), `side` out to its left, `up` over it -> out { x, y, z, yaw, pitch }
const PA = {};
export function placeOnPath(ride, s, off, out = {}) {
  const L = ride.path.length, want = s + off.along, se = clamp(want, 0, L), p = ride.path.at(se, PA), over = want - se;
  out.x = p.x + Math.sin(p.yaw) * over + Math.cos(p.yaw) * off.side;
  out.z = p.z + Math.cos(p.yaw) * over - Math.sin(p.yaw) * off.side;
  out.y = p.y + off.up;
  out.yaw = p.yaw; out.pitch = p.pitch;
  return out;
}

// how far a world point is from the jet's hull (JET_HULL) when the jet's holder is at (p.x, p.y, p.z) heading yaw and
// pitched up `pitch`: 0 inside it
export function fromHull(p, x, y, z) {
  const fx = Math.sin(p.yaw) * Math.cos(p.pitch), fy = Math.sin(p.pitch), fz = Math.cos(p.yaw) * Math.cos(p.pitch);
  const dx = x - p.x, dy = y - p.y, dz = z - p.z, a = clamp(dx * fx + dy * fy + dz * fz, JET_HULL.back, JET_HULL.front);
  return Math.max(0, Math.hypot(dx - fx * a, dy - fy * a, dz - fz * a) - JET_HULL.r);
}
