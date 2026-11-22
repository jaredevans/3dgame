// The rides: a second way along each leg, onward, each vehicle riding a path of its own (a speedboat along the coast, a
// hot-air balloon over the forest, a stagecoach over the hills, a starfighter round the rocket pad, a flying car into
// the City).
// Pure data and maths, no three.js. Each ride's path is a makeRoute curve in the world's metres, built from the world's
// data where it gives the way (the stations, the coast, the leg's line and sections, the rocket's pad); a vehicle rides
// it on its own, at a speed that eases out of the start, cruises and eases into the landing, in about 90 s. Its progress
// is mapped to the leg's s (rideLegS), so everything keyed to the leg (what's loaded, the sky) follows the ride.
// The path is where the vehicle's holder rides: `rest` metres over its pad where it stands at either end (on the
// water's surface for the boat, on the ground for the coach), so a vehicle's own model sits that far below it.
import { makeRoute } from './route.js';
import { PLACES, LEGS, COAST, SEA_LEVEL, FEATURES, legRoute, laneOf, legSections, worldTerrain, stationSpot, coachRoad, drawnGround } from './world-data.js';
import { rocketPad } from './actors/paths.js';
import { GANG, GANG_SHOTS } from './rides/coach-plan.js';
import { ROCKET_CUE, BUZZ, UFO, STRIKE } from './rides/jet-plan.js';

export const RIDE_LEGS = ['city-ocean', 'ocean-mountain', 'mountain-west', 'west-future', 'future-city'];
export const RIDE_DT = 0.1;   // the most a ride moves on in one frame (a long frame or a hidden tab)
const DURATION = 90;          // seconds, start to landing, as a train leg takes

const ground = (x, z) => worldTerrain().heightAt(x, z);
// the highest land (or the sea) within r of (x, z) (its middle and two rings of eight), and h over it
function over(x, z, r, h) {
  let top = Math.max(SEA_LEVEL, ground(x, z));
  for (const k of [0.5, 1]) for (let i = 0; i < 8; i++) {
    const a = i * Math.PI / 4;
    top = Math.max(top, ground(x + Math.cos(a) * r * k, z + Math.sin(a) * r * k));
  }
  return top + h;
}

// facing out from the platform towards the town, at a station (placeId, role)
function townward(placeId, role) {
  const st = PLACES[placeId].stations.find((s) => s.role === role), town = Math.sign(laneOf(st.leg));
  return (yaw) => Math.atan2(town * Math.cos(yaw), -town * Math.sin(yaw));
}
const onGround = (spot, rest = 0) => ({ ...spot, y: ground(spot.x, spot.z) + rest });

// ---- the coast (the boat) ----

// the coast's line: where it is at x (its points run west to east), and the way out to sea there (left of its travel)
function coastAt(x) {
  const P = COAST.points;
  let i = 0;
  while (i < P.length - 2 && P[i + 1].x < x) i++;
  const a = P[i], b = P[i + 1], w = Math.min(1, Math.max(0, (x - a.x) / (b.x - a.x)));
  const dx = b.x - a.x, dz = b.z - a.z, len = Math.hypot(dx, dz);
  return { x: a.x + dx * w, z: a.z + dz * w, nx: dz / len, nz: -dx / len };
}
// the nearest point of the coast's line to (x, z), with its way out to sea
function nearestCoast(x, z) {
  const P = COAST.points;
  let best = null;
  for (let i = 0; i < P.length - 1; i++) {
    const a = P[i], b = P[i + 1], dx = b.x - a.x, dz = b.z - a.z, len2 = dx * dx + dz * dz;
    const w = Math.min(1, Math.max(0, ((x - a.x) * dx + (z - a.z) * dz) / len2));
    const px = a.x + dx * w, pz = a.z + dz * w, d = Math.hypot(x - px, z - pz), len = Math.sqrt(len2);
    if (!best || d < best.d) best = { x: px, z: pz, d, nx: dz / len, nz: -dx / len };
  }
  return best;
}
// marching from p along (nx, nz), the first point where the sea is `depth` deep (0: the waterline)
function toDepth(p, nx, nz, depth, reach = 600) {
  for (let t = 0; t <= reach; t += 0.5) {
    const x = p.x + nx * t, z = p.z + nz * t;
    if (ground(x, z) <= SEA_LEVEL - depth) return { x, z };
  }
  throw new Error(`no sea ${depth} m deep out from ${p.x}, ${p.z}`);
}

// ---- the paths ----

const JETTY_DEPTH = 2.2;   // a jetty's end stands over water this deep (2 m, with a little to spare)
const OFFSHORE = 180;      // the boat keeps this far out from the shore along the coast (120-250 m)

// The speedboat (city-ocean): from a jetty on Downtown City's seafront, where the coast comes nearest the City's middle
// (some 300 m from its departure station, through the town), out to sea and east along the coast at sea level, the
// cliffs on its right, into Oceanside's harbour: a short jetty out from the beach by the shore end of the Highland
// Climber's station, so you step off beside its platform.
function boat() {
  const c = PLACES.city.centre, n = nearestCoast(c.x, c.z);
  const board = { ...toDepth(n, n.nx, n.nz, JETTY_DEPTH), y: SEA_LEVEL };
  const pts = [board, { x: board.x + n.nx * 40, z: board.z + n.nz * 40, y: SEA_LEVEL }];
  // along the coast, OFFSHORE out from its waterline (found marching out from inland of the coast's line)
  for (let x = 400; x <= 1800; x += 200) {
    const k = coastAt(x), shore = toDepth({ x: k.x - k.nx * 200, z: k.z - k.nz * 200 }, k.nx, k.nz, 0);
    pts.push({ x: shore.x + k.nx * OFFSHORE, z: shore.z + k.nz * OFFSHORE, y: SEA_LEVEL });
  }
  // the harbour: the jetty runs straight out to sea from beyond the buffer end of the station's line (its s 0, 121.5 m
  // in from its platform's open end), 20 m out on its town side, beside the walk where you step off
  const at = stationSpot('ocean', 'departure'), BUFFERS = 121.5, OUT = 20;
  let d = 0;
  while (d < 300 && ground(at(BUFFERS + d, OUT).x, at(BUFFERS + d, OUT).z) > SEA_LEVEL - JETTY_DEPTH) d += 0.5;
  pts.push({ ...at(BUFFERS + d + 160, OUT), y: SEA_LEVEL }, { ...at(BUFFERS + d + 60, OUT), y: SEA_LEVEL });
  const land = { ...at(BUFFERS + d, OUT), y: SEA_LEVEL };
  pts.push(land);
  const step = onGround(at(BUFFERS - 1.5, OUT));   // on the approach at the platform's buffer end
  // the giant octopus about the middle, filmed wide from low over the water on the shore side (the boat swerving
  // towards the camera, the octopus beyond it with the open sea behind) as its arms come over the hull; and a run along
  // the cliffs' highest stretch (16 m, some 700-950 m along the path) from out at sea, the cliffs behind the boat
  return {
    pts, step: { ...step, yaw: townward('ocean', 'departure')(step.yaw) }, ease: [8, 10], rest: 0,
    events: [{ id: 'octopus', s0: OCTOPUS.s0, s1: OCTOPUS.s1, actor: 'octopus', shot: { kind: 'high-wide', at: 975, lateral: -60, height: 3, fov: 42 } }],
    showpieces: [{ id: 'cliffs', s0: 560, s1: 800, shot: { kind: 'heli', lateral: 35, height: 5 } }],
  };
}

// The hot-air balloon (ocean-mountain): up from a pad beside Oceanside's departure platform, ~150 m over the forest,
// the hill the line tunnels through, and the waterfall's valley by the viaduct, jets pushing it along, then down to a
// pad beside the Mountain's arrival platform.
// Its pad stands 88 m in from the platform's open end, not by it (owner's ruling, 2026-11-22): Oceanside's town is by
// the buffer end, and over the last 86 m to the open end the walk is the platform alone, so this is the nearest the
// walk comes off the platform to the open end. 30 m out, just past the station building's far end, on level ground.
function balloon() {
  const REST = BALLOON.rest, at = stationSpot('ocean', 'departure'), to = stationSpot('mountain', 'arrival');
  const r = legRoute('ocean-mountain'), town = Math.sign(laneOf('ocean-mountain'));
  const sec = (kind) => legSections('ocean-mountain').find((x) => x.kind === kind);
  const tunnel = sec('tunnel'), viaduct = sec('viaduct');
  const valley = FEATURES.find((f) => f.kind === 'valley' && f.leg === 'ocean-mountain');
  const high = (p, h = 150) => ({ x: p.x, z: p.z, y: over(p.x, p.z, 100, h) });
  const board = onGround(at(88, 30), REST);
  const lift = { ...at(82, 36), y: board.y + 30 };
  const forest = high(r.offsetAt(300, town * 40));
  const hill = high(r.at((tunnel.s0 + tunnel.s1) / 2));
  // over the valley a third of the way from the viaduct's middle to the waterfall at its head
  const v = r.at((viaduct.s0 + viaduct.s1) / 2);
  const falls = high({ x: v.x + (valley.x0 - v.x) * 0.35, z: v.z + (valley.z0 - v.z) * 0.35 });
  const down = high(r.offsetAt(viaduct.s1 + 60, town * 40), 100);
  const land = onGround(to(50, 30), REST);
  const settle = { ...to(32, 36), y: land.y + 40 };
  const step = onGround(to(50, 22));
  // the crows over its cruise; the director's two: the crows wheeling round the canopy from out past their ring (a heli
  // abreast, a little above the basket, over the forest and the hill), and the balloon going out over the valley, filmed
  // from behind it over the hill (22 m over its path: cameras.js puts a wide shot there), looking on over it down to
  // the waterfall at the valley's head on one side and the viaduct and the Mountain on the other (abreast of it, the
  // camera looked across at the mountain's flank, or out to the desert, the valley under the frame)
  return {
    pts: [board, lift, forest, hill, falls, down, settle, land], step: { ...step, yaw: townward('mountain', 'arrival')(step.yaw) },
    ease: [16, 18], rest: REST, burn: burnAt,
    events: [{ id: 'crows', s0: CROWS.s0, s1: CROWS.s1, actor: 'crows' }],
    showpieces: [
      { id: 'canopy', s0: 430, s1: 700, shot: { kind: 'heli', lateral: 55, height: 10, fov: 58 } },
      { id: 'falls', s0: 690, s1: 860, shot: { kind: 'wide', at: 560, lateral: 0, fov: 62 } },
    ],
  };
}

// the col the stagecoach's road crosses west of the canyon's mouth, where it may climb steeper than its 12%: the land
// can't take a road there gentler than about 16% that a coach could drive (one with no hairpins under 15 m), between
// the canyon's wall and the massif (owner's ruling, 2026-11-22). Each steep stretch of it at most `run` metres long.
export const COACH_GRADE = 0.12;
export const COACH_COL = { x: 2650, z: 1420, r: 200, grade: 0.17, run: 60 };
// The stagecoach (mountain-west): along its dirt road (world-data.js coachRoad: over the col west of the canyon, on a
// bench cut into the land) from the Mountain's station yard to the Wild West's arrival station. The coach rides on the
// ground (0.2 m over it): the bench is level across the road at the road's own level, so its wheels are on the land.
function coach() {
  const REST = 0.2, to = stationSpot('west', 'arrival');
  // (on the land as it's drawn where that stands a little higher, as the road's surface is: where the bench meets the
  // Wild West's station pad, a metre lower, the drawn land rounds the crease off)
  const t = worldTerrain(), pts = coachRoad().path.map((p) => ({ x: p.x, y: Math.max(ground(p.x, p.z), drawnGround(t, p.x, p.z)) + REST, z: p.z }));
  const step = onGround(to(60, 9.5));
  // the gang over the middle of the ride (rides/coach-plan.js); the director's two: the chase from low ahead beside the
  // road as the gang breaks from its ambush, and a heli alongside on the open side as they ride level with it
  return {
    pts, step: { ...step, yaw: townward('west', 'arrival')(step.yaw) }, ease: [6, 8], rest: REST,
    events: [{ id: 'gang', s0: GANG.s0, s1: GANG.s1, actor: 'gang' }],
    showpieces: GANG_SHOTS,
  };
}

export const JET = { radius: 1800, cruise: 80, rest: 1.0, pass: 90, pastPad: 500 };
// The starfighter (west-future; ride id 'jet'): Polyfork's agile starfighter (7 m, its X-foils 6.4 m across), from a
// pad beside the Wild West's departure platform, out low across the desert (80 m over the highest land within 300 m),
// buzzing the rocket as it climbs off its pad (Task 6's launch, where it stands, 5.5 km off the line), wheeling round
// the pad on a circle JET.radius about it as the rocket climbs away, and back east to set down on an apron beside the
// Futuristic place's arrival platform, on its far side: coming from the west, its own side, the town's, would mean
// flying over the place and turning back (3 km more, too far for 90 s).
// Its pad is 35 m in from the platform's open end, not by it (owner's ruling, 2026-11-22): the Wild West's town is by
// the buffer end, and over the last 33 m to the open end the walk is the platform alone, so this is the nearest the walk
// comes off the platform to the open end; 17 m out. It has no wheels: it lifts off in a short low hover (straight up a
// few metres, nose a little up, its nozzles turned down, rides/jet-plan.js) and away, and sets down the same way on its
// apron, 45 m out from the Futuristic line, clear of the foot of the station's embankment. Its pad and apron are level
// pads in the land (world-data.js JET_PADS), the path JET.rest over them where it stands.
// The buzz: the rocket lifts off as it runs in (rides/jet-plan.js ROCKET_CUE: `cues`, the leg's events it triggers),
// timed so it passes the rocket JET.pass metres to the side (the pad on its right) some 13.5 s into the rocket's
// flight, as high as the rocket's middle then (rides/jet-plan.js BUZZ), climbing to it from its cruise and back down
// after; then on JET.pastPad metres and round the far side of the pad as the rocket climbs away. The UFO paces it once
// it's been round (UFO), and the director has the lift-off from behind, the buzz from outside, the wheel round the pad
// and the UFO alongside
function jet() {
  const at = stationSpot('west', 'departure'), to = stationSpot('future', 'arrival');
  const pad = rocketPad(legRoute('west-future')), R = JET.radius, REST = JET.rest;
  // on its pad; a short hover straight up, nose to its way; away low over the wash, and climbing out
  const board = onGround(at(35, 17), REST);
  const lift = [[34.6, 2.5], [33.5, 5], [30, 8], [20, 12], [0, 18]].map(([inn, up]) => ({ ...at(inn, 17), y: board.y + up }));
  const climb = { ...at(-160, 19), y: board.y + 40 };
  // the buzz: along a line JET.pass to the side of the pad, at the height of the rocket's middle as it passes
  const buzzY = ground(pad.x, pad.z) + BUZZ.at;
  const line = (dx, y) => ({ x: pad.x + dx, z: pad.z + JET.pass, y });
  const runIn = [], E = line(3200, 0);
  for (const f of [0.15, 0.35, 0.55, 0.75, 0.92]) {
    const x = climb.x + (E.x - climb.x) * f, z = climb.z + (E.z - climb.z) * f;
    runIn.push({ x, z, y: over(x, z, 300, JET.cruise) });
  }
  const cruiseY = over(E.x, E.z, 300, JET.cruise), up = (k) => cruiseY + (buzzY - cruiseY) * k;
  const buzz = [line(3200, cruiseY), line(2100, up(0.45)), line(1100, up(0.85)), line(450, buzzY), line(0, buzzY),
    line(-JET.pastPad, buzzY - 25)];
  // round the far side of the pad (bearings 185 to 285 degrees, through 270: north) back down to its cruise
  const circle = [];
  for (let deg = 185; deg <= 285; deg += 20) {
    const a = deg * Math.PI / 180, x = pad.x + R * Math.cos(a), z = pad.z + R * Math.sin(a);
    circle.push({ x, z, y: Math.max(over(x, z, 300, JET.cruise), deg < 215 ? buzzY - 80 : 0) });
  }
  // the landing: down a 3.5-degree glide to a hover 5 m over the apron 20 m short of where it sets down, then down
  const OUT = -45, level = ground(to(60, OUT).x, to(60, OUT).z) + REST;
  const glide = (inn) => ({ ...to(inn, OUT), y: level + 5 + Math.max(0, inn - 60) * Math.tan(3.5 * Math.PI / 180) });
  const home = [1700, 900, 450, 260, 160, 100, 60].map(glide);
  const settle = [[48, 4], [42.5, 2], [40.6, 0.7]].map(([inn, h]) => ({ ...to(inn, OUT), y: level + h }));
  const land = { ...to(40, OUT), y: level };
  const back = circle[circle.length - 1], mid = { x: (back.x + home[0].x) / 2, z: (back.z + home[0].z) / 2 };
  const inbound = { ...mid, y: over(mid.x, mid.z, 300, JET.cruise) };
  const step = onGround(to(40, 20));   // on the town-side approach, across the tracks from the apron
  const pts = [board, ...lift, climb, ...runIn, ...buzz, ...circle, inbound, ...home, ...settle, land];
  return { pts, step: { ...step, yaw: townward('future', 'arrival')(step.yaw) },
    ease: [16, 16], rest: REST, rolls: [],
    cues: { rocket: ROCKET_CUE },
    events: [
      { id: 'rocket-pass', s0: BUZZ.s - 1300, s1: BUZZ.s + 150, shot: { kind: 'wide', at: BUZZ.s, lateral: 160, fov: 50 } },
      { id: 'ufo', s0: UFO.s0, s1: UFO.s1, actor: 'ufo', shot: { kind: 'heli', lateral: 40, height: 5, fov: 50 } },
      { id: 'strike', s0: STRIKE.turn[0], s1: STRIKE.hit + 400, shot: { kind: 'chase', height: 6, fov: 55 } },
    ],
    showpieces: JET_SHOTS };
}
// the director's: the lift-off from behind as it runs in (a chase: the rocket's pad straight ahead); the buzz, from out
// past the craft on its other side as it passes the rocket (an event's wide shot, held till it's by: the rocket beyond
// it); swinging out to wheel round the pad, a wide shot from its side away from the pad (its left: it turns right round
// the pad), the rocket climbing away beyond it; the UFO alongside, its event's heli from its other side, the saucer beyond it; and the
// strike, a chase from behind as it swings onto the saucer, fires and blows it up ahead of it (a heli or a wide shot
// would have the blast behind the camera or the craft long gone by it)
export const JET_SHOTS = [
  { id: 'rocket-launch', s0: 4200, s1: 6000, shot: { kind: 'chase' } },
  { id: 'rocket-circle', s0: 7850, s1: 9000, shot: { kind: 'wide', lateral: 200, fov: 55 } },
];

// The flying car (future-city): up from a pad beside the Futuristic place's departure platform, 55 m over the highest
// of the suburbs and the river within 60 m (40-80 m up), round to the south of Downtown City and in among its towers
// from there, under their tops (26 m up) through the open middle of the town, clear of them all by 15 m (its streets
// are too narrow for that), and down to a pad beside the City's arrival platform, near its open end.
function car() {
  const REST = 1.2, at = stationSpot('future', 'departure'), to = stationSpot('city', 'arrival');
  const r = legRoute('future-city'), town = Math.sign(laneOf('future-city')), C = PLACES.city;
  const high = (p) => ({ x: p.x, z: p.z, y: over(p.x, p.z, 60, 55) });
  // in the City's kit frame (it isn't turned): the gaps between its towers, as the actors' tests measure them
  const kit = (x, z, up) => ({ x: C.centre.x + x, z: C.centre.z + z, y: C.y + up });
  const board = onGround(at(12, 13), REST);
  const rise = { ...at(-30, 18), y: board.y + 12 };
  const land = onGround(to(20, 11.5), REST);
  const pts = [board, rise, ...[300, 600, 1000, 1400].map((s) => high(r.offsetAt(s, town * 60))), high(r.offsetAt(1700, town * 80)),
    kit(12, 110, 30), kit(12, 60, 26), kit(12, 20, 26), kit(10, -16, 24), kit(-10, -48, 16), { ...to(32, 12), y: land.y + 5 }, land];
  const step = onGround(to(34, 9.5));
  // the escort over the whole flight but its ends; a wide shot of the formation over the river (the path is over it from
  // some 400 m to 900 m, the camera 90 m out and 60 m up), and a chase among the towers
  const len = makeRoute(pts).length;
  return {
    pts, step: { ...step, yaw: townward('city', 'arrival')(step.yaw) }, ease: [10, 12], rest: REST,
    events: [{ id: 'escort', s0: ESCORT.from, s1: len - ESCORT.away, actor: 'escort' }],
    showpieces: [
      { id: 'formation', s0: 450, s1: 850, shot: { kind: 'high-wide', at: 650, lateral: 90, height: 60 } },
      { id: 'tower-chase', s0: 1760, s1: 1960, shot: { kind: 'chase', at: 1860 } },
    ],
  };
}

// ---- the flying car's escort ----
// Other flying cars fly with the car in loose formation, some ahead, some behind and beside, over its whole flight bar
// its take-off and landing: they join from behind as it climbs away and peel off upward before it lands. Each keeps a
// slot, an offset from the car's place on its path (metres along it, out to its left, up), that eases about a little and
// weaves side to side, so they swap places now and then; one (the last) sweeps from far behind to far ahead over the
// river, high over the rest (its pass). Pure: formationOffsets is in the formation's own seconds, placeEscort puts a slot
// on the ride's path.
export const ESCORT = {
  count: 7,
  from: 60, away: 70,          // the escort flies from this ride-s to this far from the path's end
  join: 300, joinBehind: 260,  // joining over this many metres, from this far back
  leaveOver: 120,              // peeling off upward over the last this many metres of its flight (past the last of the towers)
  town: [150, 150],            // over the City's towers its sides are drawn in to a fifth: inside 150 m of its middle, opening out over the next 150
  pass: [10, 20],              // the pass: from this many seconds, and for this long
  passUp: 16,
};
const SLOT = [
  // along, side (its weave's reach), up, the weave's rate (1/s) and phase
  [30, 12, 3, 0.20, 0.0], [55, 12, -2, 0.17, 2.1], [80, 10, 4, 0.23, 4.0],
  [-28, 12, -1, 0.19, 1.0], [-52, 12, 2, 0.16, 3.0], [-76, 10, -3, 0.21, 5.0],
];
const smooth = (u) => { u = Math.min(1, Math.max(0, u)); return u * u * (3 - 2 * u); };

// where each of the escort's slots is about the car, t seconds into its flight: out[i] = { along, side, up } (metres:
// ahead along the path, to the car's left, up), filled and returned. No two within 8 m of each other or the car.
export function formationOffsets(t, out = Array.from({ length: ESCORT.count }, () => ({ along: 0, side: 0, up: 0 }))) {
  for (let i = 0; i < SLOT.length; i++) {
    const [along, reach, up, w, ph] = SLOT[i], o = out[i];
    o.along = along + 5 * Math.sin(0.35 * t + ph);
    o.side = reach * Math.cos(w * t + ph);
    o.up = up + 1.5 * Math.sin(0.5 * t + 2 * ph);
  }
  const u = (t - ESCORT.pass[0]) / ESCORT.pass[1], o = out[SLOT.length];
  o.along = -110 + 230 * smooth(u);
  o.side = 0;
  o.up = ESCORT.passUp * smooth(u / 0.25) * smooth((1 - u) / 0.25);
  return out;
}

// a slot on the ride's path when the car is at ride-s s: into out { x, y, z, yaw, pitch, scale (0 while it isn't in),
// visible }. It follows the path's own line ahead and behind (so it keeps to the path's clearances), its side drawn in
// over the City's towers, joining from behind and peeling off upward at the end
const EP = {}, EQ = {};
export function placeEscort(ride, s, slot, out) {
  const L = ride.path.length, C = PLACES.city.centre;
  const j = smooth((s - ESCORT.from) / ESCORT.join), k = smooth((s - (L - ESCORT.away - ESCORT.leaveOver)) / ESCORT.leaveOver);
  const want = Math.max(0, s + slot.along - (1 - j) * ESCORT.joinBehind), se = Math.min(L, want);
  const p = ride.path.at(se, EP), car = ride.path.at(s, EQ);
  // a craft ahead of the path's end carries straight on along its last heading, not bunched onto the end point
  const over = want - se, px = p.x + Math.sin(p.yaw) * over, pz = p.z + Math.cos(p.yaw) * over;
  const d = Math.hypot(car.x - C.x, car.z - C.z);
  const spread = 0.2 + 0.8 * smooth((d - ESCORT.town[0]) / ESCORT.town[1]);
  const side = slot.side * spread * (1 + 2 * k);
  out.x = px + Math.cos(p.yaw) * side;
  out.z = pz - Math.sin(p.yaw) * side;
  out.y = p.y + slot.up + 90 * k;
  out.yaw = p.yaw;
  out.pitch = -p.pitch * 0.35;
  out.scale = smooth((se - 60) / 30) * (1 - smooth((k - 0.8) / 0.2));
  out.visible = out.scale > 0;
  return out;
}

// ---- the boat's giant octopus ----
// At the ride's middle a giant octopus (Polyfork's octopus-base, 5x: some 17 m across, the owner's call) comes up from
// the deep on the sea side of the boat, a little ahead of it, keeping pace; rises half out of the water, lifts its two
// front arms high and arches them over the hull while the boat swerves hard away towards the shore, slams them down
// into the sea where the boat was, and falls behind and sinks back. All of it in the boat's frame along its path, keyed
// to ride-s (so the same s always gives the same picture, whatever the frame rate), and pure: the page poses the
// octopus's bones from octopusPose and the test measures how near any of it comes to the hull from the same numbers.
export const OCTOPUS = {
  s0: 830, s1: 1170,   // its window in ride-s, about the ride's middle (the path is ~1990 m): ~14 s at cruise
  scale: 5,            // the model is 3.45 m across with its arms splayed
  swerve: 14,          // m the boat swerves to its right (towards the shore: it's 180 m out), away from it
  swerveIn: [0.4, 0.56], swerveOut: [0.64, 0.95],   // (u) out over these, and back onto its path
  bank: 0.16,          // radians the boat heels into the swerve at its hardest
};
// where it is through its window (u 0..1), in the boat's frame: `along` m ahead of the boat on its path, `side` m out
// to its left (the sea side), `rise` m from the sea's surface to the model's origin (its arms' crown is 3.6 m above
// that at 5x, the top of its mantle 9.8 m). Joined by a Catmull-Rom curve through these keys
const OCTO_KEYS = [
  // u      along  side  rise
  [0.00,   52,   26,  -17],
  [0.15,   34,   19,  -11],
  [0.30,   16,   10.5, -3.4],
  [0.42,   7,    6.8, -2.6],   // (its arms' crown just out of the water, its back arms awash)
  [0.52,   3,    8.4, -2.8],
  [0.64,   -4,   9.5, -3.6],
  [0.78,   -18,  13,  -4.5],
  [0.90,   -34,  18,  -11],
  [1.00,   -46,  22,  -17],
];
// the model's arms at rest (its bones' rest positions, model metres: every bone's rest rotation is none, so these are
// the sums of their offsets): root, mid, distal, curl and tip of each, left 1-4 then right 1-4 (1 at the front, +z)
export const OCTOPUS_ARMS = [
  [[0.147, 0.727, 0.325], [0.387, 0.405, 0.903], [0.555, 0.355, 1.309], [0.411, 0.596, 1.661], [0.349, 0.576, 1.454]],
  [[0.356, 0.727, 0.117], [0.933, 0.405, 0.356], [1.34, 0.355, 0.524], [1.601, 0.714, 0.599], [1.401, 0.684, 0.519]],
  [[0.356, 0.727, -0.178], [0.933, 0.405, -0.417], [1.34, 0.355, -0.585], [1.575, 0.713, -0.724], [1.377, 0.683, -0.638]],
  [[0.147, 0.727, -0.386], [0.387, 0.405, -0.964], [0.555, 0.355, -1.37], [0.612, 0.711, -1.639], [0.534, 0.682, -1.439]],
  [[-0.147, 0.727, 0.325], [-0.387, 0.405, 0.903], [-0.555, 0.355, 1.309], [-0.687, 0.714, 1.547], [-0.603, 0.684, 1.349]],
  [[-0.356, 0.727, 0.117], [-0.933, 0.405, 0.356], [-1.34, 0.355, 0.524], [-1.603, 0.713, 0.593], [-1.404, 0.683, 0.514]],
  [[-0.356, 0.727, -0.178], [-0.933, 0.405, -0.417], [-1.34, 0.355, -0.585], [-1.57, 0.711, -0.735], [-1.373, 0.682, -0.649]],
  [[-0.147, 0.727, -0.386], [-0.387, 0.405, -0.964], [-0.555, 0.355, -1.37], [-0.905, 0.596, -1.517], [-0.803, 0.576, -1.327]],
].map((joints) => {
  // each arm bends about one axis: level, across the arm's way out from the body (+ lifts it)
  const [rx, rz] = [joints[2][0], joints[2][2]], n = Math.hypot(rx, rz);
  return { joints, axis: [-rz / n, 0, rx / n] };
});
export const OCTOPUS_BODY = { hips: [0, 0.72, -0.031], head: [0, 1.045, 0.314], mantle: [0, 1.31, -0.371] };
// how thick it is round each bone (model metres, measured from its skinned mesh: the furthest vertex from each bone's
// segment), arms' segments root to tip; and how far the clips move its hips off rest at most (Swim backward)
export const OCTOPUS_GIRTH = { arm: [0.26, 0.22, 0.235, 0.13], tip: 0.08, hips: 0.7, head: 0.6, mantle: 0.75, sway: 0.85 };
// each arm's bend at its root, mid, distal and curl joints (radians about its axis; + up), in each of its poses
const LIFT = [2.1, -0.15, -0.2, 0];       // the front arms reared up out of the sea
const ARCH = [1.4, -0.7, -1.2, -0.3];   // and arched over the boat
const SLAM = [0.05, 0.12, 0.05, 0.1];     // flung out low across the water where the boat was
const RAISE = [0.95, -0.25, -0.35, -0.4]; // the next pair lifted, menacing
const DROOP = [0.3, 0.05, 0.1, 0.2];      // the back arms lying out awash
const ROLE = ['front', 'raise', 'droop', 'droop', 'front', 'raise', 'droop', 'droop'];
const ramp = (u, a, b) => smooth((u - a) / (b - a));
// the octopus at u through its window: into out { along, side, rise, w (0..1: how much of its pose is ours, not its
// clip's), clip (its clip's name), bend: Float64Array(32) (arm i's joint j at 4i + j) }
export function octopusPose(u, out = { along: 0, side: 0, rise: 0, w: 0, clip: '', bend: new Float64Array(32) }) {
  u = Math.min(1, Math.max(0, u));
  const K = OCTO_KEYS, n = K.length;
  let i = 0;
  while (i < n - 2 && K[i + 1][0] < u) i++;
  const t = (u - K[i][0]) / (K[i + 1][0] - K[i][0]);
  for (let c = 1; c <= 3; c++) {
    // uniform Catmull-Rom between keys i and i+1 (its tangents from the keys either side, scaled to the gaps)
    const p0 = K[Math.max(0, i - 1)], p1 = K[i], p2 = K[i + 1], p3 = K[Math.min(n - 1, i + 2)];
    const h = p2[0] - p1[0];
    const m1 = (p2[c] - p0[c]) / (p2[0] - p0[0] || 1) * h, m2 = (p3[c] - p1[c]) / (p3[0] - p1[0] || 1) * h;
    const t2 = t * t, t3 = t2 * t;
    const v = (2 * t3 - 3 * t2 + 1) * p1[c] + (t3 - 2 * t2 + t) * m1 + (-2 * t3 + 3 * t2) * p2[c] + (t3 - t2) * m2;
    if (c === 1) out.along = v; else if (c === 2) out.side = v; else out.rise = v;
  }
  out.w = ramp(u, 0.13, 0.21) * (1 - ramp(u, 0.76, 0.84));
  out.clip = u < 0.5 ? 'Swim fast' : u < 0.7 ? 'Swim' : 'Swim backward';
  const lift = ramp(u, 0.2, 0.34), over = ramp(u, 0.31, 0.42), down = ramp(u, 0.5, 0.6), loose = ramp(u, 0.64, 0.8);
  const up = lift * (1 - down);
  const wave = 0.14 * (1 - loose), cyc = 2 * Math.PI * 9 * u;   // (some nine slow writhes over the window)
  for (let a = 0; a < 8; a++) {
    const role = ROLE[a];
    for (let j = 0; j < 4; j++) {
      let v;
      if (role === 'front') v = ((LIFT[j] + (ARCH[j] - LIFT[j]) * over) * lift * (1 - down) + SLAM[j] * down) * (1 - loose);
      else if (role === 'raise') v = RAISE[j] * up * (1 - loose);
      else v = DROOP[j] * ramp(u, 0.14, 0.3) * (1 - loose);
      if (j > 0) v += wave * Math.sin(cyc + a * 1.7 + j * 0.9) * (role === 'front' ? 1 - up : 1)   // (a front arm held still while it's up);
      out.bend[4 * a + j] = v;
    }
  }
  return out;
}
// arm a's five joints in the model's frame (model metres) for a pose's bends: into out[0..4] ({ x, y, z })
const rot = (v, ax, ang, o) => {
  // Rodrigues' rotation of v about the unit axis ax by ang
  const c = Math.cos(ang), s = Math.sin(ang), d = ax[0] * v[0] + ax[1] * v[1] + ax[2] * v[2];
  const cx = ax[1] * v[2] - ax[2] * v[1], cy = ax[2] * v[0] - ax[0] * v[2], cz = ax[0] * v[1] - ax[1] * v[0];
  o[0] = v[0] * c + cx * s + ax[0] * d * (1 - c); o[1] = v[1] * c + cy * s + ax[1] * d * (1 - c); o[2] = v[2] * c + cz * s + ax[2] * d * (1 - c);
  return o;
};
const AV = [0, 0, 0], AR = [0, 0, 0];
export function armJoints(pose, a, out = Array.from({ length: 5 }, () => ({ x: 0, y: 0, z: 0 }))) {
  const { joints, axis } = OCTOPUS_ARMS[a];
  out[0].x = joints[0][0]; out[0].y = joints[0][1]; out[0].z = joints[0][2];
  let ang = 0;
  for (let j = 0; j < 4; j++) {
    ang += pose.bend[4 * a + j];
    AV[0] = joints[j + 1][0] - joints[j][0]; AV[1] = joints[j + 1][1] - joints[j][1]; AV[2] = joints[j + 1][2] - joints[j][2];
    rot(AV, axis, ang, AR);
    out[j + 1].x = out[j].x + AR[0]; out[j + 1].y = out[j].y + AR[1]; out[j + 1].z = out[j].z + AR[2];
  }
  return out;
}
// the boat's swerve at ride-s s: into out { lateral (m to its left: negative, right), yaw (radians its heading turns:
// + left), bank (radians it heels into the turn: + its right side down, as ride-run.js rolls it) }. Smooth (C1) and 0
// outside its stretch
// (a ramp's slope: the smoothstep's derivative)
const dRamp = (x, a, b) => (x <= a || x >= b ? 0 : 6 * ((x - a) / (b - a)) * (1 - (x - a) / (b - a)) / (b - a));
export function swerveAt(s, out = { lateral: 0, yaw: 0, bank: 0 }) {
  const O = OCTOPUS, len = O.s1 - O.s0, u = (s - O.s0) / len;
  const a0 = O.swerveIn[0], a1 = O.swerveIn[1], b0 = O.swerveOut[0], b1 = O.swerveOut[1];
  const k = ramp(u, a0, a1) * (1 - ramp(u, b0, b1));
  // its slope along the path (d lateral / d s)
  const dk = dRamp(u, a0, a1) * (1 - ramp(u, b0, b1)) - ramp(u, a0, a1) * dRamp(u, b0, b1);
  const slope = -O.swerve * dk / len;
  out.lateral = k > 0 ? -O.swerve * k : 0;
  out.yaw = Math.atan(slope);
  out.bank = Math.max(-O.bank, Math.min(O.bank, -out.yaw * 1.4));
  return out;
}
// where the octopus is at ride-s s (the boat there), for a pose: into out { x, y, z, yaw } (its model's origin, and
// its heading: it faces the boat's place on its path, not where the boat has swerved to)
const OP = {}, OB = {};
export function placeOctopus(ride, s, pose, out = {}) {
  const p = ride.path.offsetAt(Math.min(ride.path.length, s + pose.along), pose.side, OP), b = ride.path.at(s, OB);
  out.x = p.x; out.z = p.z; out.y = SEA_LEVEL + pose.rise;
  out.yaw = Math.atan2(b.x - p.x, b.z - p.z);
  return out;
}

// ---- the balloon and its crows ----
// The balloon in its holder's frame (metres, y up from the path, which rides BALLOON.rest over its pad): the basket's
// floor on the pad, its rim at waist height; over it the burners, and the envelope's throat over them, the envelope a
// teardrop 20 m tall and 17 m across (as a real one carrying a basket for a few), widest high up. Its basket hangs
// level (no pitch or bank) and turns only about its upright, so the envelope is round its holder's vertical axis.
export const BALLOON = {
  rest: 1.2, floor: -1.2, rim: -0.1,   // (the basket's walls 1.1 m high)
  envelope: { throat: 3.2, throatR: 1.4, belly: 15, crown: 23.2, radius: 8.5 },
};
// the envelope's radius at height y (0 above its crown or below its throat): from the throat out along a quarter sine
// to its widest at the belly (some 43 degrees out at the throat, as an envelope's skirt flares), and a dome over it
export function envelopeRadius(y) {
  const E = BALLOON.envelope;
  if (y < E.throat || y > E.crown) return 0;
  if (y <= E.belly) return E.throatR + (E.radius - E.throatR) * Math.sin((y - E.throat) / (E.belly - E.throat) * Math.PI / 2);
  const u = (y - E.belly) / (E.crown - E.belly);
  return E.radius * Math.sqrt(Math.max(0, 1 - u * u));
}
// the burners, in seconds since it set off: long burns lifting it off its pad, short bursts every eight seconds or so
// cruising (holding its height, the jets pushing it on), little coming down, and a flare just before it sets down to
// land softly. burnAt(t): 0..1, how hard they're burning (the flame and its roar), eased in and out over a fraction of
// a second
export const BURNS = [
  [0.4, 4], [5, 8.6], [9.6, 13], [14.2, 16.4],
  [22, 24.2], [30.5, 32.8], [38.6, 40.6], [46.5, 48.8], [54.4, 56.6], [62.5, 64.6],
  [74, 75.2], [83, 85.4],
];
const BURN_IN = 0.15, BURN_OUT = 0.3;
export function burnAt(t) {
  for (let i = 0; i < BURNS.length; i++) {
    const a = BURNS[i][0], b = BURNS[i][1];   // (indexed, not destructured: it's called every frame)
    if (t > a && t < b + BURN_OUT) return Math.min(smooth((t - a) / BURN_IN), 1 - smooth((t - b) / BURN_OUT));
  }
  return 0;
}

// The crows: Polyfork's crow-base at 4x (the owner's call, 3-4x: 2.2 m long, 3.7 m across its wings), six of them wheeling
// round the canopy over the balloon's cruise, now and then one swooping down past the basket, ahead of the seat. Each
// circles the balloon's upright axis at a radius and height of its own, all at one rate (so the flock keeps its spacing,
// a sixth of the way round apart), in the path's frame: `along` ahead, `side` out to its left, `up` from the holder.
// They come in from far out and a little above, straight in at first, the circling taking hold as they near (over the
// second half of their coming in), and leave the same way, ceasing to circle over the first half of their going; their
// heading is their way through the air (the world's), which the rates keep forward: they circle at 6-8 m/s against
// the balloon's 17. All keyed to the crows' own seconds (their event's t), the same picture for the same t.
export const CROWS = {
  count: 6, scale: 4,
  model: { reach: 0.68 },      // the furthest any vertex of its Fly clip comes from its origin (model metres, measured)
  get reach() { return this.model.reach * this.scale; },
  s0: 150, s1: 1070,           // their window in ride-s, inside the cruise (135-1080 m)
  rate: 0.38,                  // radians a second round the balloon
  join: 14, leave: 12,         // seconds coming in and going off
  from: { out: 60, up: 25 },   // how far out (and up) they come in from and go off to
  // the furthest out any circles (its radius as it breathes out; m from the balloon's axis)
  get ring() { return Math.max(...CIRCLES.map((c) => c[0] + c[2])); },
  swoop: { secs: 6, out: 9, up: 1.2, bearing: 0.1, gap: 9 },    // its low point 9 m out, 1.2 m up, dead ahead (clear of the basket's uprights)
};
// each crow's circle: radius, height (the canopy's 3.2-23.2 m), how its radius and height breathe (m) and how fast (1/s)
const CIRCLES = [
  [15.5, 7, 1.2, 1.4, 0.21], [18.5, 14, 1.4, 1.2, 0.17], [21, 20, 0.8, 1.5, 0.23],
  [16.5, 10, 1.0, 1.3, 0.19], [19.5, 17, 1.2, 1.0, 0.15], [14.5, 23, 0.6, 1.2, 0.25],
];
// how far round its circle a crow has come by t: the rate eased in as it joins and out as it leaves (the integral of
// smoothstep, so its angle runs on smoothly)
const ramped = (x) => (x <= 0 ? 0 : x >= 1 ? x - 0.5 : x ** 3 - x ** 4 / 2);
// the ride's seconds at ride-s s (sAt the other way, by halving)
function tAt(p, s) {
  let lo = 0, hi = p.duration;
  for (let k = 0; k < 50; k++) { const m = (lo + hi) / 2; if (sAt(p, m) < s) lo = m; else hi = m; }
  return (lo + hi) / 2;
}
// worked out once a ride: when the crows start to leave (their seconds), and their swoops ({ crow, mid: its low point's
// seconds }), one at a time, each crow once at most, as each comes round to the swoop's bearing between their joining
// and their leaving
const PLANS = new WeakMap();
function crowPlan(ride) {
  let plan = PLANS.get(ride);
  if (plan) return plan;
  const C = CROWS, W = C.swoop, end = tAt(ride.profile, C.s1) - tAt(ride.profile, C.s0);
  const leaveAt = end - C.leave - 0.5, swoops = [], used = new Set();
  // (while circling, crow i's angle is phase(i) + rate * (t - 3 join / 4): its circling eased in over join / 2 from join / 2)
  for (let t = C.join + W.secs / 2 + 1; t <= leaveAt - W.secs / 2 - 1;) {
    let best = null;
    for (let i = 0; i < C.count; i++) {
      if (used.has(i)) continue;
      const turns = (W.bearing - (2 * Math.PI * i) / C.count) / (2 * Math.PI);
      const period = (2 * Math.PI) / C.rate;
      let mid = 0.75 * C.join + turns * period;
      mid += Math.ceil((t - mid) / period) * period;
      if (!best || mid < best.mid) best = { crow: i, mid };
    }
    if (!best || best.mid > leaveAt - W.secs / 2 - 1) break;
    swoops.push(best);
    used.add(best.crow);
    t = best.mid + W.secs + W.gap - W.secs / 2;
  }
  plan = { end, leaveAt, swoops };
  PLANS.set(ride, plan);
  return plan;
}
// crow i, t seconds into the crows' window: into out { along, side, up (m from the balloon's holder, in the path's
// frame), scale (0..1: 0 out of sight, far off at either end) }
export function crowOffset(ride, t, i, out) {
  const C = CROWS, W = C.swoop, plan = crowPlan(ride), c = CIRCLES[i];
  const radius = c[0], height = c[1], breathe = c[2], bob = c[3], w = c[4];   // (indexed: it's called every frame)
  const ph = (2 * Math.PI * i) / C.count;
  const joined = smooth(t / C.join), gone = smooth((t - plan.leaveAt) / C.leave);
  const theta = ph + C.rate * (C.join / 2 * ramped((t - C.join / 2) / (C.join / 2)) - C.leave / 2 * ramped((t - plan.leaveAt) / (C.leave / 2)));
  let rho = radius + breathe * Math.sin(w * t + ph), up = height + bob * Math.sin(0.8 * w * t + 2 * ph);
  // its swoop: down past the basket and up again, drawing in to it only once it's below the envelope's belly
  for (let k = 0; k < plan.swoops.length; k++) {
    const sw = plan.swoops[k];
    if (sw.crow !== i) continue;
    const u = (t - sw.mid) / W.secs + 0.5;
    if (u <= 0 || u >= 1) continue;
    const dip = u < 0.5 ? smooth(u / 0.5) : smooth((1 - u) / 0.5), near = dip * dip * dip;
    up += (W.up - up) * dip;
    rho += (W.out - rho) * near;
  }
  const far = (1 - joined) + gone;
  rho += C.from.out * far;
  up += C.from.up * far;
  out.along = rho * Math.cos(theta);
  out.side = rho * Math.sin(theta);
  out.up = up;
  out.scale = smooth(t / 1.5) * (1 - smooth((t - (plan.end - 1.5)) / 1.5));
  return out;
}
// crow i in the world, the balloon at ride-s s and the crows t seconds in: into out { x, y, z (its model's origin),
// scale, visible }
const CO = {}, CP = {};
export function placeCrow(ride, s, t, i, out) {
  crowOffset(ride, t, i, CO);
  const p = ride.path.at(s, CP), sn = Math.sin(p.yaw), cs = Math.cos(p.yaw);
  out.x = p.x + sn * CO.along + cs * CO.side;
  out.z = p.z + cs * CO.along - sn * CO.side;
  out.y = p.y + CO.up;
  out.scale = CO.scale;
  out.visible = CO.scale > 0;
  return out;
}

const BUILD = {
  'city-ocean': { id: 'boat', name: 'speedboat', make: boat },
  'ocean-mountain': { id: 'balloon', name: 'hot-air balloon', make: balloon },
  'mountain-west': { id: 'coach', name: 'stagecoach', make: coach },
  'west-future': { id: 'jet', name: 'starfighter', make: jet },
  'future-city': { id: 'car', name: 'flying car', make: car },
};

// ---- the timing ----

// ease out of the start over ease[0] seconds and into the landing over ease[1], cruising at v between, so that the
// whole path takes `duration` (each ease a smoothstep in speed, covering half what cruising would)
function profileFor(length, duration, [a, b]) {
  return { ease: [a, b], v: length / (duration - (a + b) / 2), duration, length };
}
function sAt(p, t) {
  const [a, b] = p.ease, T = p.duration;
  if (t <= 0) return 0;
  if (t >= T) return p.length;
  if (t < a) { const u = t / a; return p.v * a * (u ** 3 - u ** 4 / 2); }
  if (t > T - b) { const w = (T - t) / b; return p.length - p.v * b * (w ** 3 - w ** 4 / 2); }
  return p.v * a / 2 + p.v * (t - a);
}
function vAt(p, t) {
  const [a, b] = p.ease, T = p.duration, ss = (u) => u * u * (3 - 2 * u);
  if (t <= 0 || t >= T) return 0;
  if (t < a) return p.v * ss(t / a);
  if (t > T - b) return p.v * ss((T - t) / b);
  return p.v;
}

// state { s, t } (s: metres along the ride's path, t: seconds since it set off) -> the next, dt on (at most RIDE_DT)
export function rideStep(state, dt, ride) {
  let t = Math.min(ride.duration, state.t + Math.min(RIDE_DT, Math.max(0, dt)));
  if (t > ride.duration - 1e-9) t = ride.duration;   // (sixtieths of a second don't add up to it exactly)
  const s = sAt(ride.profile, t);
  return { s, t, v: vAt(ride.profile, t), done: s >= ride.path.length };
}

// ---- the leg-s ----

// the leg's s nearest each metre of the path, never going back. A ride whose nearest s reaches the leg's arrival end
// (within 150 m) before three-quarters of its way (the jet, whose circle round the rocket lies past the line's end) has
// its s laid out along its path instead, from where it starts to where it ends, so the sky follows its progress.
function legTable(path, leg) {
  const r = legRoute(leg), L = r.length, COARSE = 4, coarse = [];
  for (let s = 0; s <= L; s += COARSE) coarse.push(r.at(s));
  const n = Math.floor(path.length) + 1, out = new Float64Array(n), p = {}, q = {};
  for (let i = 0; i < n; i++) {
    path.at(i, p);
    let best = Infinity, bs = 0;
    for (let k = 0; k < coarse.length; k++) { const d = (coarse[k].x - p.x) ** 2 + (coarse[k].z - p.z) ** 2; if (d < best) { best = d; bs = k * COARSE; } }
    for (let s = Math.max(0, bs - COARSE); s <= Math.min(L, bs + COARSE); s += 0.5) {
      r.at(s, q); const d = (q.x - p.x) ** 2 + (q.z - p.z) ** 2;
      if (d < best) { best = d; bs = s; }
    }
    out[i] = Math.max(i ? out[i - 1] : 0, bs);
  }
  const early = out.findIndex((s) => s >= L - 150);
  if (early >= 0 && early < 0.75 * n) {
    const a = out[0], b = out[n - 1];
    for (let i = 0; i < n; i++) out[i] = a + (b - a) * i / (n - 1);
  }
  return out;
}

// the leg's events as they play for a ride along it: as for a train at the ride's leg-s, but one the ride cues itself
// (ride.cues: the jet's rocket, which lifts off as the jet runs in, wherever the leg-s it maps to then is) has its window
// moved to start at the leg-s the ride is at as it reaches its cue, its length kept
export function rideLegEvents(ride, defs) {
  return defs.map((e) => {
    const cue = ride.cues?.[e.id];
    if (cue === undefined) return e;
    const s0 = rideLegS(ride, cue);
    return { ...e, s0, s1: s0 + (e.s1 - e.s0) };
  });
}

// the leg's s for ride-s s (read between the path's metres)
export function rideLegS(ride, s) {
  const T = ride.legS, f = Math.min(T.length - 1, Math.max(0, s)), i = Math.min(T.length - 2, Math.floor(f));
  return T[i] + (T[i + 1] - T[i]) * (f - i);
}

// ---- low flight ----
// where the starfighter flies within LOW_FLIGHT.up metres of the land (hovering up off its pad and climbing away, coming
// down to its apron): its path's points every `step` metres there, { x, z }. Nothing of the scenery may stand within its
// half-span (`reach`) of these (scenery.js), so its foils never sweep a tree's crown
export const LOW_FLIGHT = { up: 30, reach: 3.3 };
export function lowFlight(ride, step = 3) {
  const out = [], p = {};
  for (let s = 0; s <= ride.path.length; s += step) {
    ride.path.at(Math.min(s, ride.path.length), p);
    if (p.y - ground(p.x, p.z) < LOW_FLIGHT.up) out.push({ x: p.x, z: p.z });
  }
  return out;
}

// ---- the land while riding ----
// The land is built a slice a frame round where you are (main.js), a fine piece in some 55 ms of slices, a mid one in 11
// and a coarse 512 m tile in 8: a train's pace, or a slow ride's. A fast one (the jet, at 212 m/s, crossing a 256 m
// piece in 1.2 s) would outrun it: fine pieces under it unbuilt and those it left rebuilt coarser, the building falling
// further behind until the land round it went missing. So while a ride goes faster than RIDE_LAND.slow the land is
// asked for round a point `lead` seconds ahead along its path at its speed, at mid detail out to `mid` (from under it to
// some 1.1 km ahead: from 50-150 m up the land below needs no finer; coming in to land, its landing is within that some
// 12 s before it stops) and coarse beyond, the coarse tiles within `first` built before the rest (chunks.js coarseFirst:
// what it flies into is then always there, if coarse at first, while the finer come; the furthest, in the haze, last),
// the line's corridor not fine. Slower (rolling to take off, and the last seconds of its landing roll), round it as for a
// train: the land it stops on goes fine as you step off, as after a train. Asked for again each `every` metres the point
// moves. -> out { x, z, fine, mid, corridor, coarseFirst, every }
export const RIDE_LAND = { slow: 60, lead: 2, mid: 700, first: 3000, every: 48 };
const RL = {};
export function rideLand(ride, s, v, out = {}) {
  const fast = v > RIDE_LAND.slow;
  ride.path.at(fast ? Math.min(ride.path.length, s + v * RIDE_LAND.lead) : s, RL);
  out.x = RL.x; out.z = RL.z;
  out.fine = fast ? 0 : 700;
  out.mid = fast ? RIDE_LAND.mid : 1500;
  out.corridor = !fast;
  out.coarseFirst = fast ? RIDE_LAND.first : 0;
  out.every = fast ? RIDE_LAND.every : 16;
  return out;
}

const rides = new Map();
export function rideFor(leg) {
  if (!rides.has(leg)) {
    const b = BUILD[leg];
    if (!b) throw new Error(`no ride along ${leg}`);
    const { pts, step, ease, rest, rolls = [], events = [], showpieces = [], burn = null, cues = {} } = b.make();
    const path = makeRoute(pts);
    // a roll's ends given as points (null: the path's end) -> ride-s, the path's nearest metre to each
    const sOf = (p, fallback) => {
      if (!p) return fallback;
      let best = Infinity, bs = 0;
      for (let s = 0, q = {}; s <= path.length; s += 1) { path.at(s, q); const d = Math.hypot(q.x - p.x, q.z - p.z); if (d < best) { best = d; bs = s; } }
      return bs;
    };
    const end = (s) => { const o = path.at(s); return { x: o.x, z: o.z, y: o.y, yaw: o.yaw }; };
    rides.set(leg, {
      leg, id: b.id, name: b.name, from: LEGS[leg].from, to: LEGS[leg].to, rest,
      rolls: rolls.map(([a, z]) => [sOf(a, 0), sOf(z, path.length)]),
      board: end(0), land: end(path.length), step: { x: step.x, z: step.z, y: step.y, yaw: step.yaw },
      path, duration: DURATION, profile: profileFor(path.length, DURATION, ease), legS: legTable(path, leg),
      events, showpieces,   // each ride's own set pieces (Tasks 4-8)
      burn,   // the balloon's burners: how hard they burn at the ride's t (0..1; its engine roars with them), or null
      cues,   // the leg's own events the ride sets off itself, by id: the ride-s at which each starts (the jet's rocket)
    });
  }
  return rides.get(leg);
}
