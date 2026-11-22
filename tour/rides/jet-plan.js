// The starfighter's ride (west-future, ride id 'jet'), its choreography as pure numbers keyed to its ride-s (so the
// same s always gives the same picture, whatever the frame rate; rides/jet.js and rides/ufo.js pose things from them
// and the tests measure them from the same numbers). No three.js.
//
// - The rocket: the leg's rocket lifts off as the craft passes ROCKET_CUE on its run in (the ride triggering the
//   launch: main.js shifts the leg's rocket event to there, rides.js rideLegEvents), straight ahead of it, so it's seen
//   from the cockpit climbing off its pad; the craft climbs to it and buzzes it (BUZZ) 13.5 s into its flight, 90 m to
//   its side, then wheels round the pad while it climbs away.
// - Its X-foils: closed (as built) on its pads and cruising, spread into attack position for the fight with the UFO.
//   Its nose: held up a little as it hovers off its pad and down onto its apron (it has no wheels).
// - The UFO: once the craft has wheeled round the rocket, a flying saucer drops in from high behind on its right
//   (between it and the rocket), paces it there, firing laser bolts that streak past close (ahead of its nose, over its
//   canopy, behind its nozzles: 3-6 m from it); then pulls out ahead, and the craft swings to point at it, fires its
//   missile and blows it up (owner's ruling R20), flying on past the blast to land.

const smooth = (u) => { u = Math.min(1, Math.max(0, u)); return u * u * (3 - 2 * u); };
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

// where the craft is, in its holder's frame (+z forward; Polyfork's agile-starfighter-89805f measured in the page: 7 m
// long, its lower X-foils' tips 6.38 m across, 2.65 m tall, its body's axis at the holder, 1 m over its pad): a capsule
// about its forward axis from its nozzles to its nose, wide enough to take in its foils however it banks or pitches.
// The saucer is kept clear of it
export const JET_HULL = { back: -3.5, front: 3.5, r: 3.5 };
// a closer shape of it, for the bolts' near misses: its body as two capsules about its axis (the nacelles' and the
// canopy's; the nose's 0.3 m tip inside the front one's end), and its foils (spread or not, banked or not) as the solid
// cylinder they sweep about the axis over their chord
export const CRAFT = { rear: { z: [-3.5, -1], r: 1.5 }, front: { z: [-1, 3.2], r: 1.05 }, foils: { z: [-2.6, 0.3], r: 3.4 } };
const capsule = (rho, z, c) => Math.hypot(rho, z - clamp(z, c.z[0], c.z[1])) - c.r;
// how far a point (x left, y up, z ahead: the holder's frame, unrolled) is from the craft: 0 inside it
export function craftDistance(x, y, z) {
  const rho = Math.hypot(x, y), f = CRAFT.foils;
  const foils = Math.hypot(Math.max(0, rho - f.r), z - clamp(z, f.z[0], f.z[1]));
  return Math.max(0, Math.min(capsule(rho, z, CRAFT.rear), capsule(rho, z, CRAFT.front), foils));
}

// ride-s at which the rocket lifts off: 13.5 s of cruise (at 210 m/s) before the buzz
export const ROCKET_CUE = 4484;
// the buzz: ride-s where it passes the rocket, and how high over the pad's ground it passes then (the rocket's middle,
// actors/paths.js rocketAt: its engine some 200 m up 13.5 s into its flight, 40 m tall)
export const BUZZ = { s: 7319, at: 222 };

// its X-foils spread (0 closed, as built, to 1: the rig's 26 and 20 degrees) over `open` and closed again over `close`,
// ride-s; the fight with the UFO between
export const FOILS = { open: [9300, 9600], close: [13100, 13400] };
export function foilsAt(s) {
  return smooth((s - FOILS.open[0]) / (FOILS.open[1] - FOILS.open[0])) * (1 - smooth((s - FOILS.close[0]) / (FOILS.close[1] - FOILS.close[0])));
}
export const FOIL_RIG = [
  { node: 'wing-fold-ur', axis: 'z', deg: 26 }, { node: 'wing-fold-ul', axis: 'z', deg: -26 },
  { node: 'wing-fold-lr', axis: 'z', deg: 20 }, { node: 'wing-fold-ll', axis: 'z', deg: -20 },
];
// its nose held up a little (radians) as it hovers up off its pad and down onto its apron, level where it stands (so it
// sits on its pad), at ride-s s of a path L long. The model is turned so about its holder
export const HOVER = { angle: 4 * Math.PI / 180, up: [1, 6], level: [25, 70] };
export function noseUp(s, L) {
  const H = HOVER, off = (x) => smooth((x - H.up[0]) / (H.up[1] - H.up[0])) * (1 - smooth((x - H.level[0]) / (H.level[1] - H.level[0])));
  return H.angle * Math.max(off(s), off(L - s));
}

// ---- the UFO ----
// Its window in ride-s (the ride's 'ufo' event: the saucer, then its blast); `arrive`: metres over which it drops in
// from `from` to its slot. Offsets are about the craft on its path (metres: along it ahead, out to its left, up;
// placeOnPath), the slot's weave over `period` metres of the craft's travel (~12 s): drifting from alongside its foils
// (where the director's heli, from the craft's other side, has it beyond the craft: so it comes in there, and stays over
// the heli's hold, `phase`) to some 105 m ahead (where it's in the cockpit's view ahead, on the right, some 30 degrees
// off its nose). Its bolts spent, it pulls out ahead to STRIKE.slot, where the craft's missile finds it (STRIKE.hit,
// where it's gone and its blast begins). `radius`: the saucer's
export const UFO = {
  s0: 9000, s1: 14000, arrive: 700,
  from: { along: -380, side: -160, up: 330 },
  slot: { along: 56, side: -52, up: 16 }, weave: { along: 50, side: 7, up: 5 }, period: 2500, phase: 1.7,
  radius: 8,
};
// The strike (owner's ruling R20): the UFO pulls out to `slot` over `pull`; the craft swings to point at it over `turn`
// (aimAt) and fires its missile at `launch`: it drops `drop` metres of ride-s clear of the belly, its fins opening,
// lights, and flies to the saucer over `flight` metres of ride-s (accelerating), striking it at `hit`; the craft swings
// back to its way over `back`. The blast (blastAt) lasts BLAST.life seconds from the hit, in the world where it happened
export const STRIKE = {
  pull: [12250, 12650], slot: { along: 160, side: -60, up: 25 }, turn: [12350, 12700], back: [13100, 13450],
  launch: 12750, drop: 90, flight: 200, carry: { along: 1.2, side: 0, up: -1.4 },
};
STRIKE.hit = STRIKE.launch + STRIKE.drop + STRIKE.flight;
// -> out { along, side, up, roll, pitch (its tilt, radians), visible }, at the craft's ride-s s
export function ufoOffset(s, out = { along: 0, side: 0, up: 0, roll: 0, pitch: 0, visible: false }) {
  out.visible = s >= UFO.s0 && s < STRIKE.hit;
  const w = (2 * Math.PI * (s - UFO.s0)) / UFO.period, S = UFO.slot, W = UFO.weave;
  const along = S.along + W.along * Math.sin(w + UFO.phase), side = S.side + W.side * Math.sin(1.7 * w + 1), up = S.up + W.up * Math.sin(2.3 * w + 2);
  const k = smooth((s - UFO.s0) / UFO.arrive), F = UFO.from;
  const q = smooth((s - STRIKE.pull[0]) / (STRIKE.pull[1] - STRIKE.pull[0])), T = STRIKE.slot;
  out.along = (F.along + (along - F.along) * k) * (1 - q) + T.along * q;
  out.side = (F.side + (side - F.side) * k) * (1 - q) + T.side * q;
  out.up = (F.up + (up - F.up) * k) * (1 - q) + T.up * q;
  // a saucer's wobble as it hovers, tipped towards where it's going as it drops in
  out.roll = 0.06 * Math.sin(3.1 * w) + 0.25 * (1 - k);
  out.pitch = 0.05 * Math.sin(2.2 * w + 0.5);
  return out;
}
// how far the craft is turned from its way to point at the saucer (radians: yaw + to its left, pitch + nose up), at
// ride-s s -> out { yaw, pitch }
const AIM_YAW = Math.atan2(STRIKE.slot.side, STRIKE.slot.along);
const AIM_PITCH = Math.atan2(STRIKE.slot.up - STRIKE.carry.up, Math.hypot(STRIKE.slot.along, STRIKE.slot.side));
export function aimAt(s, out = { yaw: 0, pitch: 0 }) {
  const w = smooth((s - STRIKE.turn[0]) / (STRIKE.turn[1] - STRIKE.turn[0])) * (1 - smooth((s - STRIKE.back[0]) / (STRIKE.back[1] - STRIKE.back[0])));
  out.yaw = AIM_YAW * w; out.pitch = AIM_PITCH * w;
  return out;
}
// the missile, as an offset about the craft (as ufoOffset's), at ride-s s, the craft going at v m/s -> out { visible
// (flying free: before its launch it rides under the craft, rides/jet.js; after the hit it's gone), lit, fins (0 folded,
// 1 open), along, side, up }
const G = 9.81;
export function missileAt(s, v, out = { visible: false, lit: false, fins: 0, along: 0, side: 0, up: 0 }) {
  const S = STRIKE, C = S.carry, a = s - S.launch, ca = Math.cos(AIM_PITCH);
  out.visible = a >= 0 && s < S.hit;
  out.lit = a >= S.drop;
  out.fins = smooth(a / S.drop);
  const t = Math.min(a, S.drop) / v;   // (falling clear, its way the craft's)
  const x = C.along, y = C.side, z = C.up - 0.5 * G * t * t;
  if (a <= S.drop) { out.along = x; out.side = y; out.up = z; return out; }
  // on, along a curve from there out along the way the craft points to the saucer, quickening
  const u = Math.min(1, (a - S.drop) / S.flight), f = u ** 1.6, T = S.slot, k = 60;
  const cx = x + Math.cos(AIM_YAW) * ca * k, cy = y + Math.sin(AIM_YAW) * ca * k, cz = z + Math.sin(AIM_PITCH) * k;
  const b0 = (1 - f) ** 2, b1 = 2 * f * (1 - f), b2 = f * f;
  out.along = b0 * x + b1 * cx + b2 * T.along;
  out.side = b0 * y + b1 * cy + b2 * T.side;
  out.up = b0 * z + b1 * cz + b2 * T.up;
  return out;
}

// The blast, in the world where the saucer was struck (H: placeOnPath of STRIKE.slot at STRIKE.hit): a flash, a fireball
// growing and fading, a shock ring, and the saucer's pieces (DEBRIS.count: its disc in six, its band in six, its dome
// and its glowing panel) flung out away from the craft and up, carrying on some of the saucer's way, slowing in the air
// and falling, tumbling, shrinking away into their smoke over their last second. Seconds from the hit, t, from ride-s
// at the craft's cruise (the same s always the same picture). Each piece's way: `away` from the craft, spread a little
export const BLAST = { life: 4, carry: 0.55, drag: 0.7, fire: { r: 26, grow: 2.5, fade: 2.2 }, ring: { r: 36, grow: 0.7 }, flash: 0.25 };
export const DEBRIS = { count: 14, speed: [22, 46], up: 0.35, spread: 0.55 };
const hash = (i, k) => { const x = Math.sin(i * 127.1 + k * 311.7) * 43758.5453; return x - Math.floor(x); };
// the hit point and the craft's way then, in the world -> { x, y, z, fx, fz (its heading), ax, ay, az (away from it) }
const BH = {}, BC = {};
export function blastOrigin(ride, out = {}) {
  placeOnPath(ride, STRIKE.hit, STRIKE.slot, BH);
  const c = ride.path.at(STRIKE.hit, BC), n = Math.hypot(BH.x - c.x, BH.z - c.z);
  out.x = BH.x; out.y = BH.y; out.z = BH.z; out.fx = Math.sin(c.yaw); out.fz = Math.cos(c.yaw);
  out.ax = (BH.x - c.x) / n; out.az = (BH.z - c.z) / n;
  return out;
}
// seconds since the hit at ride-s s (negative before it)
export const blastTime = (ride, s) => (s - STRIKE.hit) / ride.profile.v;
// piece i at t s after the hit, from the blast's origin o -> out { x, y, z, rx, ry, rz (its tumble), scale (0: gone) }
export function debrisAt(o, v, i, t, out = {}) {
  const D = DEBRIS, B = BLAST;
  const sp = D.speed[0] + (D.speed[1] - D.speed[0]) * hash(i, 1), turn = (hash(i, 2) - 0.5) * 2 * D.spread;
  const c = Math.cos(turn), sn = Math.sin(turn), dx = o.ax * c - o.az * sn, dz = o.ax * sn + o.az * c;
  const up = D.up + hash(i, 3) * 0.9, n = Math.hypot(1, up), k = (1 - Math.exp(-B.drag * t)) / B.drag;
  out.x = o.x + (o.fx * v * B.carry + (dx / n) * sp) * k;
  out.z = o.z + (o.fz * v * B.carry + (dz / n) * sp) * k;
  out.y = o.y + (up / n) * sp * k - 0.5 * G * t * t;
  out.rx = (hash(i, 4) - 0.5) * 9 * t; out.ry = (hash(i, 5) - 0.5) * 9 * t; out.rz = (hash(i, 6) - 0.5) * 9 * t;
  out.scale = t < 0 ? 0 : 1 - smooth(t - (B.life - 1));
  return out;
}
// the fireball at t s after the hit -> out { x, y, z, r, a (its opacity, 0..1) }; and the shock ring { r, a }
export function fireballAt(o, v, t, out = {}) {
  const B = BLAST, k = (1 - Math.exp(-B.drag * t)) / B.drag;
  out.x = o.x + o.fx * v * B.carry * 0.5 * k; out.z = o.z + o.fz * v * B.carry * 0.5 * k; out.y = o.y + 4 * t;
  out.r = B.fire.r * (1 - Math.exp(-B.fire.grow * t));
  out.a = t < 0 ? 0 : 1 - smooth(t / B.fire.fade);
  return out;
}
export function ringAt(t, out = {}) {
  const u = t / BLAST.ring.grow;
  out.r = BLAST.ring.r * smooth(u);
  out.a = t < 0 || u >= 1 ? 0 : 1 - u;
  return out;
}

// The bolts: fired from the saucer every BOLT.every metres of the craft's travel over its pacing, each at a point about
// the craft (as ufoOffset's) it streaks through, flying on past it, at BOLT.speed m/s against it, for BOLT.reach
// metres; `length`, its streak. Aimed in turn ahead of the nose, over the canopy, behind the nozzles and high ahead:
// each through the point of its patch (`AIM`, offsets about the craft, out to `side` either way) whose line passes
// nearest NEAR metres from the craft (craftDistance), or of anywhere about it if none in its patch comes within
// `TOLERANCE` of that. Worked out once, on a straight course, the first time they're asked for (the UFO's build, at a
// standstill: some tens of ms); the tests measure them on its real one. -> [{ s, from, dir, miss, near }]
export const BOLT = { first: 9750, every: 265, count: 10, speed: 520, reach: 260, length: 24 };
const NEAR = 4.5, TOLERANCE = 0.6;
const AIM = [
  { along: [4, 11], up: [-1.5, 2.5] }, { along: [-1, 3], up: [2, 6.5] }, { along: [-11, -4], up: [-1.5, 3] }, { along: [2, 9], up: [3, 7.5] },
];
const ANYWHERE = { along: [-12, 12], up: [-2, 8] };
function nearest(from, dir) {
  let best = Infinity;
  for (let d = 0; d <= BOLT.reach; d += 0.5) {
    best = Math.min(best, craftDistance(from.side + dir.side * d, from.up + dir.up * d, from.along + dir.along * d));
  }
  return best;
}
function aim(s, ufo, patch) {
  let pick = null;
  for (let a = patch.along[0]; a <= patch.along[1]; a += 0.5) for (let u = patch.up[0]; u <= patch.up[1]; u += 0.5) for (const sd of [0, 2, -2, 4, -4]) {
    const dx = a - ufo.along, dy = sd - ufo.side, dz = u - ufo.up, n = Math.hypot(dx, dy, dz);
    const dir = { along: dx / n, side: dy / n, up: dz / n }, r = UFO.radius * 0.8;
    // (it leaves the saucer's rim on the side towards the craft)
    const from = { along: ufo.along + dir.along * r, side: ufo.side + dir.side * r, up: ufo.up + dir.up * r };
    const near = nearest(from, dir);
    if (!pick || Math.abs(near - NEAR) < Math.abs(pick.near - NEAR)) pick = { s, from, dir, miss: { along: a, side: sd, up: u }, near };
  }
  return pick;
}
let made = null;
export function bolts() {
  if (made) return made;
  made = Array.from({ length: BOLT.count }, (_, i) => {
    const s = BOLT.first + i * BOLT.every, ufo = ufoOffset(s), pick = aim(s, ufo, AIM[i % AIM.length]);
    return Math.abs(pick.near - NEAR) <= TOLERANCE ? pick : aim(s, ufo, ANYWHERE);
  });
  return made;
}
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

// how far a world point is from the craft's hull capsule (JET_HULL), and from the craft itself (craftDistance), when
// its holder is at (p.x, p.y, p.z) heading yaw and pitched up `pitch`: 0 inside it
export function fromHull(p, x, y, z) {
  const fx = Math.sin(p.yaw) * Math.cos(p.pitch), fy = Math.sin(p.pitch), fz = Math.cos(p.yaw) * Math.cos(p.pitch);
  const dx = x - p.x, dy = y - p.y, dz = z - p.z, a = clamp(dx * fx + dy * fy + dz * fz, JET_HULL.back, JET_HULL.front);
  return Math.max(0, Math.hypot(dx - fx * a, dy - fy * a, dz - fz * a) - JET_HULL.r);
}
export function fromCraft(p, x, y, z) {
  const fx = Math.sin(p.yaw) * Math.cos(p.pitch), fy = Math.sin(p.pitch), fz = Math.cos(p.yaw) * Math.cos(p.pitch);
  const lx = Math.cos(p.yaw), lz = -Math.sin(p.yaw);   // its left, level (its roll is in the foils' cylinder)
  const dx = x - p.x, dy = y - p.y, dz = z - p.z, along = dx * fx + dy * fy + dz * fz, left = dx * lx + dz * lz;
  const upx = dx - fx * along - lx * left, upy = dy - fy * along, upz = dz - fz * along - lz * left;
  const up = Math.sign(upy || 1) * Math.hypot(upx, upy, upz);
  return craftDistance(left, up, along);
}
