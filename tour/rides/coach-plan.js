// The stagecoach's gang: five outlaws on horseback lying in wait on the open flats beside the road below the col, who
// break into a gallop as the coach comes by and chase it, up behind and alongside it, firing (and always missing), then
// fall in behind it in file as the road climbs onto the col's hillside, and pull up one by one before its crest, left
// standing far behind as the coach runs on down to the Wild West. Pure, no three.js: the gang's ground tracks, keyed to
// the coach's ride-s (so the same s always gives the same picture, whatever the frame rate), and their shots, worked
// out once a ride; rides/gang.js poses them and the test measures them from the same numbers.
//
// Where it can happen is forced by the land and the ride (owner's ruling R12): the land beside the road is open and
// level only from ride-s ~200 to ~450 (its left, between the road and the railway), the road then climbs the col's
// steep flank on its bench, and the gang must be over 400 m back by the last 300 m of the ride (ride-s ~1090), which
// a rider pulled up on the climb past ~630 m wouldn't be (the road bends back on itself below the col). So the chase
// runs over ride-s ~240-650.
//
// A rider's track: it waits at (aW, its lane), on its own line-s `a` along the road's line (world-data.js coachRoad)
// and a lane out to the road's left; as the coach comes within reach it sets off, reaching the coach's speed over
// GANG.go metres of the coach's travel while the coach passes it, so it settles `along` metres behind the coach; it
// rides in its lane beside the road, weaving a little, surging up alongside now and then; comes in onto the road in
// file over GANG.funnel; and pulls up over GANG.stop metres of the coach's travel, standing there after. Its lane is a
// function of its own `a` (a track on the ground), so a rider pulled up stays where it stopped.
import { coachRoad, legRoute, LEGS } from '../world-data.js';

// the coach and its team in its holder's frame (metres; +z ahead, +x its left): its body and wheels (2 m across, 4.5
// m long, its middle on the holder) and the pair ahead of it (to 5.6 m), measured in the page
export const COACH_FOOT = { half: 1.1, back: -2.4, front: 5.6 };
// its team, a pair abreast ahead of it on its pole (the holder's frame): each horse's middle x either side, z ahead; its
// hooves stand about `hooves` (z, from its hind feet to its fore) and `wide` either side of its middle
export const COACH_TEAM = { x: 0.52, z: 4.15, hooves: [3.3, 5.0], wide: 0.15 };
export const RIDER_REACH = 1.3;   // a horse and its rider reach this far from its middle (the horse 2.4 m long)
export const GANG = {
  count: 5,
  s0: 20, s1: 1085,     // the event's window in ride-s: in wait from early on, all gone before the last 300 m
  clear: 4,             // never nearer the coach than this (body to body)
  gone: 400,            // a rider pulled up is out of sight once the coach is this far from it
  go: 110, stop: 90,    // metres of the coach's travel a rider takes to get up to its speed, and to pull up
  settle: 90,           // metres of its own way over which it comes in from its waiting lane to its riding lane
  funnel: [470, 520],   // the road's line-s over which they come in onto the road in file (the climb to the col)
  weave: 1.4,           // m either way a rider weaves in its lane beside the road
  // the chase's own stretch of the road (line-s) and how far out to its left it reaches, for the scenery's clearing
  sweep: { a0: 240, a1: 520, out: 30 },
};
// each rider: when it sets off (coach ride-s), how far behind the coach it settles (m; - behind), its waiting lane, its
// riding lane, its lane on the road in file, when it pulls up (coach ride-s), its weave's phase, and its surge (how far
// forward it comes, alongside, over ride-s 330-450)
const RIDERS = [
  { go: 240, along: -9, wait: 20, lane: 8.5, file: 1.0, stop: 590, phase: 0.0, surge: 6 },
  { go: 250, along: -15, wait: 22, lane: 12.5, file: -1.0, stop: 545, phase: 1.3, surge: 5 },
  { go: 230, along: -21, wait: 17, lane: 9.5, file: 1.0, stop: 570, phase: 2.6, surge: 6 },
  { go: 262, along: -27, wait: 27, lane: 13.5, file: -1.0, stop: 515, phase: 3.9, surge: 0 },
  { go: 245, along: -33, wait: 21, lane: 9.0, file: 0.0, stop: 480, phase: 5.2, surge: 0 },
];
const SURGE = [330, 390, 450];   // ride-s: the surge rises from the first, holds from the second, falls back by the third
// the director's two over the chase: the chase from low ahead beside the road (on its right, the gang's lanes on its
// left) as the gang breaks from its ambush, and a heli abreast out past the gang's lanes as they ride level with it
export const GANG_SHOTS = [
  { id: 'gang-low', s0: 255, s1: 345, shot: { kind: 'trackside', at: 350, lateral: -6, height: 1.2, fov: 45 } },
  { id: 'gang-heli', s0: 360, s1: 460, shot: { kind: 'heli', lateral: 30, height: 7, fov: 52 } },
];

const smooth = (u) => { u = Math.min(1, Math.max(0, u)); return u * u * (3 - 2 * u); };
// the integral of smoothstep from 0 (so a speed eased in by it gives a position that runs on smoothly)
const ramped = (x) => (x <= 0 ? 0 : x >= 1 ? x - 0.5 : x ** 3 - x ** 4 / 2);
const surgeAt = (s) => smooth((s - SURGE[0]) / (SURGE[1] - SURGE[0])) * (1 - smooth((s - SURGE[1]) / (SURGE[2] - SURGE[1])));

// rider i's own line-s when the coach is at ride-s s
function riderA(i, s) {
  const R = RIDERS[i], aW = R.go + GANG.go / 2 + R.along;
  return aW + GANG.go * ramped((s - R.go) / GANG.go) - GANG.stop * ramped((s - R.stop) / GANG.stop) + R.surge * surgeAt(s);
}
// rider i's lane at its own line-s a (m out to the road's left)
function riderLane(i, a) {
  const R = RIDERS[i], aW = R.go + GANG.go / 2 + R.along;
  const f = smooth((a - GANG.funnel[0]) / (GANG.funnel[1] - GANG.funnel[0]));
  const riding = R.lane + GANG.weave * Math.sin(a / 19 + R.phase) * (1 - f);
  const lane = R.wait + (riding - R.wait) * smooth((a - aW) / GANG.settle);
  return lane + (R.file - lane) * f;
}

// the coach's footprint at ride-s s (its holder on the path there): into out { x, z, sx, sz (its heading's sine and
// cosine) }
const FP = {};
function coachAt(ride, s, out) {
  const p = ride.path.at(Math.min(ride.path.length, Math.max(0, s)), FP);
  out.x = p.x; out.z = p.z; out.sx = Math.sin(p.yaw); out.sz = Math.cos(p.yaw);
  return out;
}
// how far (x, z) is from the coach's footprint (0 inside it)
export function fromCoach(c, x, z) {
  const dx = x - c.x, dz = z - c.z, along = dx * c.sx + dz * c.sz, left = dx * c.sz - dz * c.sx, F = COACH_FOOT;
  return Math.hypot(Math.max(0, F.back - along, along - F.front), Math.max(0, Math.abs(left) - F.half));
}

// rider i with the coach at ride-s s: into out { x, z (its middle on the ground), yaw (its heading), pace (metres it
// moves per metre of the coach's: times the coach's speed, its own), stopped (0..1: pulled up), a, lane, visible }
const RP = {}, RQ = {}, RC = {};
function spot(i, s, out) {
  const line = coachRoad().line, a = riderA(i, s);
  line.offsetAt(Math.min(line.length, Math.max(0, a)), riderLane(i, a), out);
  out.a = a;
  return out;
}
export function placeRider(ride, s, i, out) {
  spot(i, s, out);
  const R = RIDERS[i];
  out.lane = riderLane(i, out.a);
  // its way: where it is a moment either side (standing, the road's way where it waits or stopped)
  spot(i, s - 0.5, RP); spot(i, s + 0.5, RQ);
  const dx = RQ.x - RP.x, dz = RQ.z - RP.z, d = Math.hypot(dx, dz);
  out.pace = d;
  if (d > 0.02) out.yaw = Math.atan2(dx, dz);
  else { const line = coachRoad().line; out.yaw = line.at(Math.min(line.length, Math.max(0, out.a)), RP).yaw; }
  out.stopped = smooth((s - R.stop) / GANG.stop);
  const c = coachAt(ride, s, RC);
  out.visible = !(out.stopped >= 1 && Math.hypot(out.x - c.x, out.z - c.z) > GANG.gone);
  return out;
}

// ---- the shots ----
// Each rider fires every 1.7-2.7 s while it's up to speed and chasing; every shot misses well wide: it kicks up a
// puff of dust on the ground where it lands (PUFF.life s), all of it (PUFF.spread round where it lands) kept PUFF.coach
// m from the coach for all its life and PUFF.riders from every rider, its line of fire PUFF.line clear of the coach and the other riders; some ring off a
// rock as they land (a ricochet's ping). Beside the road the riders' misses fly on past it, landing out beyond their
// lanes ahead of it (away from the coach, never across it); in file behind it, ahead of it either side. Worked out
// once a ride (pseudo-random, the same every ride).
// (life: the longest a puff's dust hangs, s; spread: how far its dust drifts out from where the shot lands, m)
export const PUFF = { life: 3, spread: 2, coach: 6, riders: 4, line: 1.5, rail: 14 };
const hash = (...k) => {
  let h = 2166136261;
  for (const v of k) { h ^= Math.round(v * 1000) | 0; h = Math.imul(h, 16777619); h ^= h >>> 13; }
  return ((h >>> 0) % 1000003) / 1000003;
};
// how far the segment (ax, az)-(bx, bz) passes from (px, pz)
function segDist(ax, az, bx, bz, px, pz) {
  const dx = bx - ax, dz = bz - az, t = Math.min(1, Math.max(0, ((px - ax) * dx + (pz - az) * dz) / (dx * dx + dz * dz || 1)));
  return Math.hypot(ax + dx * t - px, az + dz * t - pz);
}
// how near the railway's lines (x, z) is (sampled every 4 m along each)
function fromRails(x, z) {
  let best = Infinity;
  const p = {};
  for (const id of Object.keys(LEGS)) {
    const r = legRoute(id);
    for (let s = 0; s <= r.length; s += 4) { r.at(s, p); best = Math.min(best, Math.hypot(p.x - x, p.z - z)); }
  }
  return best;
}
const PLANS = new WeakMap();
// -> { shots: [{ s (the coach's ride-s as it's fired), rider, x, z (where it lands), ping }] in order of s }
export function gangPlan(ride) {
  let plan = PLANS.get(ride);
  if (plan) return plan;
  const shots = [], r = {}, q = {}, c = {}, o = {}, span = PUFF.life * ride.profile.v;
  for (let i = 0; i < RIDERS.length; i++) {
    const R = RIDERS[i];
    for (let s = R.go + GANG.go * 0.7 + hash(i, 1) * 30; s < R.stop; s += 28 + 17 * hash(i, s)) {
      placeRider(ride, s, i, r);
      const beside = r.lane > 4;
      coachAt(ride, s, c);
      // candidates, tried in turn: ahead of the coach and out past the riders' lanes (beside it), or ahead either side
      for (let k = 0; k < 8; k++) {
        const u = hash(i, s, k, 1), w = hash(i, s, k, 2);
        const along = beside ? 14 + 28 * u : 22 + 24 * u;
        const side = beside ? 19 + 5 * w : (w < 0.5 ? -1 : 1) * (10.5 + 5 * (2 * w % 1));
        ride.path.offsetAt(Math.min(ride.path.length, s + along), side, o);
        if (fromRails(o.x, o.z) < PUFF.rail) continue;
        // clear of the coach over its life, its line of fire clear of the coach (front and back of its footprint) and
        // of the other riders, and clear of every rider over its life
        let ok = true;
        for (let t = 0; t <= span && ok; t += 2) { coachAt(ride, s + t, c); if (fromCoach(c, o.x, o.z) < PUFF.coach + PUFF.spread) ok = false; }
        coachAt(ride, s, c);
        const F = COACH_FOOT;
        for (const [al, le] of [[F.back, -F.half], [F.back, F.half], [F.front, -F.half], [F.front, F.half], [0, 0], [F.back, 0], [F.front, 0]]) {
          const px = c.x + c.sx * al + c.sz * le, pz = c.z + c.sz * al - c.sx * le;
          if (segDist(r.x, r.z, o.x, o.z, px, pz) < PUFF.line) ok = false;
        }
        for (let j = 0; j < RIDERS.length && ok; j++) {
          if (j !== i) { placeRider(ride, s, j, q); if (segDist(r.x, r.z, o.x, o.z, q.x, q.z) < PUFF.line + RIDER_REACH) ok = false; }
          for (let t = 0; t <= span && ok; t += 2) { placeRider(ride, s + t, j, q); if (Math.hypot(q.x - o.x, q.z - o.z) - RIDER_REACH - PUFF.spread < PUFF.riders) ok = false; }
        }
        if (!ok) continue;
        shots.push({ s, rider: i, x: o.x, z: o.z, ping: hash(i, s, 9) < 0.45 });
        break;
      }
    }
  }
  shots.sort((a, b) => a.s - b.s);
  plan = { shots };
  PLANS.set(ride, plan);
  return plan;
}
export const GANG_RIDERS = RIDERS.length;
