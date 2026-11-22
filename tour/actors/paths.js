// Where the actors' things go in the sky and along the land: pure maths on plain { x, y, z }, no three.js, so Node can
// test it (the actors turn them into THREE.Vector3s).

export const RAINBOW_DEG = 42;   // a rainbow's (red) arc stands this far from the antisolar point

// sunDir: towards the sun (any length) -> { centre: unit direction of the antisolar point, radius: the arc's angular
// radius round it, in radians }. With the sun up, the centre is below the horizon and only the arc's top shows
export function rainbowArc(sunDir) {
  const n = Math.hypot(sunDir.x, sunDir.y, sunDir.z) || 1;
  return { centre: { x: -sunDir.x / n, y: -sunDir.y / n, z: -sunDir.z / n }, radius: RAINBOW_DEG * Math.PI / 180 };
}

// how far round from its top (radians, either way) an arc of angular radius `radius` about the antisolar point reaches
// before it meets the horizon, the sun `elevation` radians up: 0 once the sun is as high as the radius (the whole arc
// is under the horizon), a half circle with the sun on the horizon
export function arcAboveHorizon(elevation, radius) {
  const c = Math.tan(elevation) / Math.tan(radius);
  return c >= 1 ? 0 : Math.acos(Math.max(-1, c));
}

// the climb's work train beyond the red signal: its front's leg-s while the signal is red, and m/s once green. It stays
// shown until it has left the viaduct (its front past `clear`), then hides once more than `far` ahead of your front; it
// stops at `end` (short of the Mountain's platform), and hides once you're within `near` of it (or past it, after a
// jump), so you never run through it
export const WORK = { at: 700, speed: 6, clear: 950, far: 320, near: 60 };

// { s: its front's leg-s, legS: your front's, aspect, dt, end } -> { s, shown }
export function workTrainStep({ s, legS, aspect, dt, end }) {
  s = aspect === 'red' ? WORK.at : Math.min(end, s + WORK.speed * dt);
  const gap = s - legS;
  return { s, shown: gap >= WORK.near && (s <= WORK.clear || gap <= WORK.far) };
}

// whether the work train runs this frame (f an actor's frame): only for a train you drive out along its leg. Riding the
// leg (f.ride: the ride's frame is a train's at the ride's leg-s, going out) it stands hidden, as the leg's train events
// don't play during a ride (Ruling R10), and back or with no train here it waits for the next run out
export const workTrainRuns = (f) => f.here && f.dir === 'out' && !f.ride;

// a point `lateral` metres out from the line on `side` (+1 left of the leg's out direction, -1 right) at leg-s `s`, the
// line's own height and heading there (the actor puts it on the land): -> out, filled ({ x, y, z, yaw })
export function herdPath(route, s, side, lateral, out = {}) {
  route.at(s, out);
  const d = side * lateral;
  out.x += Math.cos(out.yaw) * d;
  out.z -= Math.sin(out.yaw) * d;
  delete out.pitch;
  return out;
}

// keeping pace with the train (the riders, the wild horses): below `follow` m/s, or `room` seconds short of its
// stretch's end, it stops following and goes its own way: easing to a gallop (`ease` a second) and turning `veer`
// radians away from the line (`turn` a second)
export const PACE = { follow: 3, gallop: 6, veer: 1.3, turn: 1, ease: 0.6, room: 1.5 };

// st: null at first, then what it returned (moved on in place, so nothing's made a frame); input { legS: your front,
// dir, v: the train's speed, dt, lag: m/s it runs slower than the train, ahead: metres ahead of the front it joins at,
// lo, hi: the stretch of leg-s it keeps to (clear of the platform windows and of land it can't run on) } -> { mode:
// 'wait'|'pace'|'off', s, away: metres it has turned out from its track, speed, heading: radians off the line, t:
// seconds since it went its own way }
// It waits (unseen) until the front is inside its stretch with the train moving, joins `ahead` of the front, and keeps
// the train's speed less its lag; it goes its own way once the train is slow or its stretch runs out, and stays so
export function paceStep(st, { legS, dir, v, dt, lag = 0, ahead = 0, lo, hi }) {
  const sgn = dir === 'back' ? -1 : 1, clamp = (s) => Math.min(hi, Math.max(lo, s));
  const speedIn = Math.max(0, v);
  st ??= { mode: 'wait', s: clamp(legS), away: 0, speed: 0, heading: 0, t: 0 };
  if (st.mode === 'wait') {
    if (speedIn >= PACE.follow && legS >= lo && legS <= hi) Object.assign(st, { mode: 'pace', s: clamp(legS + sgn * ahead), speed: speedIn - lag });
    return st;
  }
  if (st.mode === 'pace') {
    const left = sgn > 0 ? hi - st.s : st.s - lo;   // what's left of its stretch ahead of it
    if (speedIn < PACE.follow || left < st.speed * PACE.room) st.mode = 'off';
    else {
      st.speed = Math.max(0, speedIn - lag);
      st.s = clamp(st.s + sgn * st.speed * dt);
      return st;
    }
  }
  // its own way: easing to a gallop, turning out from the line, its s held inside its stretch
  st.speed = Math.max(PACE.gallop, st.speed + (PACE.gallop - st.speed) * Math.min(1, PACE.ease * dt));
  st.heading += (PACE.veer - st.heading) * Math.min(1, PACE.turn * dt);
  st.s = clamp(st.s + sgn * st.speed * Math.cos(st.heading) * dt);
  st.away += st.speed * Math.sin(st.heading) * dt;
  st.t += dt;
  return st;
}

// ---- the Silver Arrow's leg (desert.js) ----

// the other Silver Arrow, passing on the other line the other way at 280 km/h: it whooshes as the fronts come within
// `near`, and hides once more than `behind` metres behind you
export const BULLET = { speed: 280 / 3.6, near: 60, behind: 600 };

// where its front starts (leg-s) so the two fronts meet at leg-s `meet`, given your front's leg-s and speed now (m/s,
// + forwards) and the way you're going; held within [lo, hi] (its whole length clear of the platform windows). Wanted
// further off than the line allows, it starts at the end of it after `wait` seconds; standing, or already past `meet`
// (a jump), it comes from the line's far end at once: -> { s, wait }
export function bulletStart({ legS, v, dir, meet, speed = BULLET.speed, lo, hi }) {
  const sgn = dir === 'back' ? -1 : 1, gap = (meet - legS) * sgn, far = sgn > 0 ? hi : lo;
  if (gap <= 0 || !(v > 0.5)) return { s: far, wait: 0 };
  const want = meet + sgn * speed * (gap / v), s = Math.min(hi, Math.max(lo, want));
  return { s, wait: Math.max(0, (want - s) * sgn / speed) };
}

// st: null at first, then what it returned (moved on in place); input as bulletStart's, plus dt -> { mode: 'wait'|'run'|
// 'gone', s, shown, whoosh: true on the frame the fronts come within `near`, passed }. While it waits (unseen) its start
// is worked out afresh each frame from your speed then, so it keeps its time if you speed up
export function bulletStep(st, { legS, v, dir, dt, meet, speed = BULLET.speed, lo, hi, near = BULLET.near, behind = BULLET.behind }) {
  const sgn = dir === 'back' ? -1 : 1;
  st ??= { mode: 'wait', s: sgn > 0 ? hi : lo, shown: false, whoosh: false, passed: false };
  st.whoosh = false;
  if (st.mode === 'wait') {
    const start = bulletStart({ legS, v, dir, meet, speed, lo, hi });
    if (start.wait > 0) { st.shown = false; return st; }
    st.s = start.s;
    st.mode = 'run';
  } else if (st.mode === 'run') st.s = Math.min(hi, Math.max(lo, st.s - sgn * speed * dt));
  const ahead = (st.s - legS) * sgn;   // its front ahead of yours (negative once it's by)
  if (st.mode === 'run' && !st.passed && ahead <= near) { st.passed = true; st.whoosh = true; }
  if (-ahead > behind) st.mode = 'gone';
  st.shown = st.mode === 'run';
  return st;
}

// true unless (x, z) is within a mesa's radius plus `margin` (features: world-data FEATURES; only mesas count)
export function clearOfMesas(x, z, features, margin) {
  return features.every((f) => f.kind !== 'mesa' || Math.hypot(x - f.x, z - f.z) >= f.r + margin);
}

// the wind farm's turbines: rows `rows` metres out on `side` (+1 left of the leg's out direction), `perRow` each along
// s0..s1, each where ok(x, z) holds and at least `minGap` from the others; spread evenly over each row's stretch that's
// ok (every other row half a pitch on), each the nearest to its mark that fits; what can't fit is left out:
// -> [{ x, z, s, out }]
export function turbineSpots(route, { s0, s1, rows, perRow, side, ok, minGap, step = 10 }) {
  const spots = [], P = {};
  for (const [k, out] of rows.entries()) {
    const cands = [];
    for (let s = s0; s <= s1 + 1e-9; s += step) {
      herdPath(route, s, side, out, P);
      if (ok(P.x, P.z)) cands.push({ x: P.x, z: P.z, s, out });
    }
    if (!cands.length) continue;
    const a = cands[0].s, b = cands[cands.length - 1].s, pitch = perRow > 1 ? (b - a) / (perRow - 0.5) : 0;
    for (let i = 0; i < perRow; i++) {
      const mark = perRow > 1 ? a + (i + (k % 2 ? 0.5 : 0)) * pitch : (a + b) / 2;
      const fits = cands.filter((c) => spots.every((o) => Math.hypot(c.x - o.x, c.z - o.z) >= minGap));
      if (!fits.length) break;
      spots.push(fits.reduce((best, c) => (Math.abs(c.s - mark) < Math.abs(best.s - mark) ? c : best)));
    }
  }
  return spots;
}

// the solar farm's racks: `rows` rows along the line evenly from out[0] to out[1] metres out, `perRow` racks a row
// `pitch` metres apart centred on leg-s s: -> [{ s, out }]
export function solarGrid({ s, rows, perRow, pitch, out: [a, b] }) {
  const grid = [];
  for (let k = 0; k < rows; k++) for (let j = 0; j < perRow; j++) {
    grid.push({ s: s + (j - (perRow - 1) / 2) * pitch, out: rows > 1 ? a + (b - a) * k / (rows - 1) : a });
  }
  return grid;
}

// the nearest leg-s to s, in steps of `step` either way out to `reach`, where fits(s) holds: -> s or null
export function nearestFit(s, fits, step, reach) {
  for (let d = 0; d <= reach + 1e-9; d += step) {
    if (fits(s + d)) return s + d;
    if (d > 0 && fits(s - d)) return s - d;
  }
  return null;
}

// the drones' formations, in the upright plane along the line: `along` metres along the way you're going and `up`
// metres up from the formation's middle. They hold each shape `hold` seconds, the first `morph` of them easing out of the
// one before
export const FORMATION = { shapes: ['ring', 'line', 'arrow'], hold: 6, morph: 2, ring: 18, gap: 4, tip: 20, back: 3.2, rise: 1.6 };

// drone i of n's place in a shape: -> out, filled ({ along, up })
export function formationSpot(shape, i, n, out = {}) {
  const F = FORMATION;
  if (shape === 'ring') {
    const a = 2 * Math.PI * i / n;
    out.along = F.ring * Math.cos(a); out.up = F.ring * Math.sin(a);
  } else if (shape === 'line') {
    out.along = (i - (n - 1) / 2) * F.gap; out.up = 0;
  } else {   // an arrow pointing the way you're going: two arms back from its tip, one above, one below
    const k = Math.floor(i / 2), arm = i % 2 ? 1 : -1;
    out.along = F.tip - k * F.back; out.up = arm * (k * F.rise + F.rise);
  }
  return out;
}

// how far along the line (either way) any drone of n gets from the formation's middle, in any shape or morph between
export function formationReach(n) {
  const o = {};
  let reach = 0;
  for (const shape of FORMATION.shapes) for (let i = 0; i < n; i++) reach = Math.max(reach, Math.abs(formationSpot(shape, i, n, o).along));
  return reach;
}

const was = {};
// drone i of n's place t seconds into the flight: -> out, filled ({ along, up })
export function formationAt(t, i, n, out = {}) {
  const F = FORMATION, k = Math.max(0, Math.floor(t / F.hold)), local = t - k * F.hold;
  formationSpot(F.shapes[k % F.shapes.length], i, n, out);
  if (k === 0 || local >= F.morph) return out;
  formationSpot(F.shapes[(k - 1) % F.shapes.length], i, n, was);
  const x = local / F.morph, w = x * x * (3 - 2 * x);
  out.along = was.along + (out.along - was.along) * w;
  out.up = was.up + (out.up - was.up) * w;
  return out;
}

// the rocket: its pad `dist` metres off, `bearing` left of the nose of an out run entering its window (leg-s `at`, the
// rocket event's s0), so it's seen from the cab ahead; off the pad it climbs straight up for `upright` seconds, then
// pitches over east (behind an out run), `tilt` from upright by the end of its `secs`, gathering speed at `accel`. Its
// climb is kept low enough to stay ahead in the cab's view for most of its minute
export const ROCKET = { at: 1900, dist: 5500, bearing: 10 * Math.PI / 180, secs: 60, upright: 6, accel: 2.2, tilt: 72 * Math.PI / 180 };

// -> { x, z } of the pad (the land there is the actor's)
export function rocketPad(route) {
  const P = route.at(ROCKET.at), a = ROCKET.bearing;
  const ahead = ROCKET.dist * Math.cos(a), left = ROCKET.dist * Math.sin(a);
  return { x: P.x + Math.sin(P.yaw) * ahead + Math.cos(P.yaw) * left, z: P.z + Math.cos(P.yaw) * ahead - Math.sin(P.yaw) * left };
}

// st: null at first, then what it returned (moved on in place); { here: you're driving a run on the leg, on: its event
// is active, dt } -> { t: seconds since lift-off or null, launch: true the frame it lifts off, reset: true the frame
// it's put back on its pad }. It lifts off as you enter its window (either way) and flies on whatever the window, until
// you leave the leg; once per run
export function rocketStep(st, { here, on, dt }) {
  st ??= { t: null, launch: false, reset: false };
  st.launch = false; st.reset = false;
  if (!here) { if (st.t !== null) { st.t = null; st.reset = true; } return st; }
  if (st.t === null) { if (on) { st.t = 0; st.launch = true; } } else st.t += dt;
  return st;
}

const pitchAt = (t) => {
  if (t <= ROCKET.upright) return 0;
  const x = Math.min(1, (t - ROCKET.upright) / (ROCKET.secs - ROCKET.upright));
  return ROCKET.tilt * x * x * (3 - 2 * x);
};
// its flight worked out once, every 1/20 s
const FLIGHT = (() => {
  const h = 0.05, n = Math.round(ROCKET.secs / h), east = new Float64Array(n + 1), up = new Float64Array(n + 1);
  for (let k = 0; k < n; k++) {
    const t = (k + 0.5) * h, v = ROCKET.accel * t, p = pitchAt(t);
    east[k + 1] = east[k] + v * Math.sin(p) * h;
    up[k + 1] = up[k] + v * Math.cos(p) * h;
  }
  return { h, n, east, up };
})();

// t seconds after lift-off (held at its last point past `secs`): -> out, filled ({ east, up: metres from the pad,
// pitch: radians over from upright, towards the east })
export function rocketAt(t, out = {}) {
  const c = Math.min(ROCKET.secs, Math.max(0, t)) / FLIGHT.h, k = Math.min(FLIGHT.n - 1, Math.floor(c)), u = c - k;
  out.east = FLIGHT.east[k] + (FLIGHT.east[k + 1] - FLIGHT.east[k]) * u;
  out.up = FLIGHT.up[k] + (FLIGHT.up[k + 1] - FLIGHT.up[k]) * u;
  out.pitch = pitchAt(Math.min(ROCKET.secs, Math.max(0, t)));
  return out;
}

// ---- the Seaside Excursion's leg (coast.js) ----

// true if the land under (x, z) and round it, out to radius r (two rings of eight), all stands above `level`
// (heightAt: the world terrain's)
export function clearsLevel(heightAt, x, z, r, level) {
  if (!(heightAt(x, z) > level)) return false;
  for (const k of [0.5, 1]) for (let i = 0; i < 8; i++) {
    const a = i * Math.PI / 4;
    if (!(heightAt(x + Math.cos(a) * r * k, z + Math.sin(a) * r * k) > level)) return false;
  }
  return true;
}

// the nearest point to `near` on a grid `step` apart, out to `reach`, where ok(x, z) holds: -> { x, z } or null
export function landSpot(near, ok, { step = 2, reach = 120 } = {}) {
  const n = Math.floor(reach / step), offs = [];
  for (let i = -n; i <= n; i++) for (let j = -n; j <= n; j++) if (Math.hypot(i, j) * step <= reach + 1e-9) offs.push([i, j]);
  offs.sort((a, b) => Math.hypot(a[0], a[1]) - Math.hypot(b[0], b[1]));
  for (const [i, j] of offs) {
    const x = near.x + i * step, z = near.z + j * step;
    if (ok(x, z)) return { x, z };
  }
  return null;
}

// the lighthouse: wanted near (x, z) on the cliff top seaward of the line (that's over the sea, past the cliff's edge,
// so it stands on the nearest land that takes it): its footprint (radius r, round the model's 4.4 x 5.3 m islet) all
// `above` metres over the sea, and within `slack` of the land under its middle, so it's on the top, not over the edge
export const LIGHTHOUSE = { x: 1120, z: -300, r: 6, above: 3, slack: 2 };

// -> { x, z } or null (heightAt: the world terrain's; seaLevel: SEA_LEVEL)
export function lighthouseSpot(heightAt, seaLevel = 0) {
  const L = LIGHTHOUSE;
  const ok = (x, z) => clearsLevel(heightAt, x, z, L.r, seaLevel + L.above) && clearsLevel(heightAt, x, z, L.r, heightAt(x, z) - L.slack);
  return landSpot(L, ok, { step: 2, reach: 120 });
}

// how far out from the line (metres, on `side`: +1 left of the leg's out direction) the waterline is at leg-s s, found
// every `step` metres over s0..s1 by marching out to the first land under `level` (then halving in on it), and read
// between them (held at the ends): -> shore(s) -> lateral
export function shoreTable(route, heightAt, side, s0, s1, { step = 5, march = 2, reach = 600, level = 0 } = {}) {
  const n = Math.max(1, Math.ceil((s1 - s0) / step)), table = new Float64Array(n + 1), P = {};
  const wet = (s, l) => { herdPath(route, s, side, l, P); return heightAt(P.x, P.z) < level; };
  for (let k = 0; k <= n; k++) {
    const s = s0 + (s1 - s0) * k / n;
    let l = 0;
    while (l < reach && !wet(s, l)) l += march;
    let a = Math.max(0, l - march), b = l;
    for (let i = 0; i < 12; i++) { const m = (a + b) / 2; if (wet(s, m)) b = m; else a = m; }
    table[k] = b;
  }
  if (!(s1 > s0)) return () => table[0];   // (one place)
  return (s) => {
    const c = Math.min(n, Math.max(0, (s - s0) / (s1 - s0) * n)), k = Math.min(n - 1, Math.floor(c)), u = c - k;
    return table[k] + (table[k + 1] - table[k]) * u;
  };
}

// a platform window's length: the first and last this many metres of every leg are its platforms (and the train's
// room to stop), and nothing that moves comes into one
export const PLATFORM = 122;

// the stretch of leg-s something keeping pace with the train keeps to: its event's window, less `spread` (how far its
// members reach either way of its middle) clear of each platform window (`platform` metres at either end of the leg)
export function paceBounds(def, length, spread, platform = PLATFORM) {
  return { lo: Math.max(def.s0, platform + spread), hi: Math.min(def.s1, length - platform - spread) };
}

// the dolphins' leaps: each `secs` long, the pod's in turn `gap` seconds apart (so each of n leaps every n x gap
// seconds); its origin (at its belly) from `deep` under the sea up to `high` over it and back. Between leaps each swims
// `deep` under, its fin out. A leap is pitched along its arc for the pod's speed through the water, or a dolphin's own
// `pace` if that's slower (a slow pod's dolphins still swim on as they leap)
export const LEAP = { secs: 1.2, gap: 0.8, high: 2.2, deep: 0.7, pace: 7 };

// t seconds in (dolphin 0 leaps first, at 0; none before its turn), dolphin i of n, the pod going `speed` m/s -> out,
// filled ({ air, u: 0..1 through its leap, y: its height over the sea, pitch: radians nose-up })
export function leapAt(t, i, n, speed, out = {}) {
  const period = n * LEAP.gap, tau = (((t - i * LEAP.gap) % period) + period) % period;
  out.air = t >= i * LEAP.gap && tau < LEAP.secs;
  if (!out.air) { out.u = 0; out.y = -LEAP.deep; out.pitch = 0; return out; }
  const u = tau / LEAP.secs, rise = LEAP.high + LEAP.deep;
  out.u = u;
  out.y = -LEAP.deep + rise * 4 * u * (1 - u);
  out.pitch = Math.atan2(rise * 4 * (1 - 2 * u) / LEAP.secs, Math.max(speed, LEAP.pace));
  return out;
}

// a sailboat's slow loop: an ellipse `a` metres along the coast either way of its middle and `b` across, sailed at
// about `speed` m/s from `phase` (radians round it) -> out, filled ({ along, across, heading: its way, as
// atan2(along, across) of its velocity })
export function loopAt(t, { a, b, speed, phase = 0 }, out = {}) {
  const w = speed / ((a + b) / 2), th = phase + w * t;
  out.along = a * Math.cos(th);
  out.across = b * Math.sin(th);
  out.heading = Math.atan2(-a * Math.sin(th), b * Math.cos(th));
  return out;
}

// the freight on the other line, the other way at 60 km/h (it runs on bulletStep with these): it rumbles as the fronts
// come within `near`, and hides once more than `behind` metres behind you
export const FREIGHT = { speed: 60 / 3.6, near: 60, behind: 400 };

// which zone (index into targets, each { r, g, b } in the geometry's own colour space) each triangle of a non-indexed
// geometry's vertex colours is: all three of its corners within `tol` of it, as Polyfork matches a zone by its albedo;
// -1 for none -> Int16Array
export function zoneOfTriangles(colors, itemSize, targets, tol = 0.004) {
  const tris = Math.floor(colors.length / itemSize / 3), which = new Int16Array(tris).fill(-1);
  for (let t = 0; t < tris; t++) {
    for (let z = 0; z < targets.length && which[t] < 0; z++) {
      const f = targets[z];
      let ok = true;
      for (let c = 0; c < 3 && ok; c++) {
        const i = (t * 3 + c) * itemSize;
        ok = Math.abs(colors[i] - f.r) < tol && Math.abs(colors[i + 1] - f.g) < tol && Math.abs(colors[i + 2] - f.b) < tol;
      }
      if (ok) which[t] = z;
    }
  }
  return which;
}

// ---- the Metro Glide's leg (metro.js) ----

// the fliers: hover pods and cargo skiffs on lanes among the towers of the Futuristic place, gliding at `speed` and
// banked into their turns as a plane is (tan bank = speed x turn rate / g), rising and falling `bob` metres every
// `period` seconds. (loopAt goes round an ellipse at about `speed`: a little faster along its ends, as its a and b
// differ.) A lane may fly its own `speed` and `bob`, and cap its bank at `maxBank` (radians): CITY_AIR's do
export const GLIDE = { speed: 15, g: 9.81, bob: 1, period: 11 };

// each lane an ellipse (paths' loopAt) in its town's own frame (its kit's: x, z about the place's centre, as places.js
// turns it), `a` along x and `b` along z either way of (x, z), `up` metres over the town's ground, `dir` +1 one way
// round and -1 the other, from `phase`. Over the Futuristic place the low ones keep inside the ring of towers (the
// monolith, the capsule towers, the slabs), under the kit's own fliers parked up high; the higher ones clear the
// monolith and keep wide of those parked fliers, the highest over all of it. None over Downtown City: an older city,
// with no flying cars (owner, 2026-11-21; CITY_AIR flies there instead). (The tests hold them to it, and to their
// towns and heights.)
export const LANES = {
  future: [
    { x: 4, z: -4, a: 30, b: 26, up: 33, dir: 1, phase: 0 },
    { x: 6, z: 2, a: 26, b: 30, up: 36, dir: -1, phase: 2.2 },
    { x: 2, z: -2, a: 32, b: 28, up: 39, dir: 1, phase: 4.1 },
    { x: 10, z: -8, a: 28, b: 28, up: 46, dir: -1, phase: 1.0 },
    { x: 4, z: 12, a: 40, b: 34, up: 52, dir: 1, phase: 3.3 },
    { x: -2, z: 2, a: 52, b: 60, up: 59, dir: -1, phase: 5.2 },
  ],
};

// over Downtown City instead of flying cars (owner, 2026-11-21): lanes as LANES' (in its kit's frame), each with its own
// speed, bob and bank. Two helicopters on slow, wide loops round the whole town over its towers (32 m), 80 and 100 m
// up, banked gently (at most 12.6 degrees); four drones darting round short loops, two of them down among the towers
// (31 and 34 m up, under their tops), each along one of the town's two cross streets (the one east-west at kit z -4, the
// one north-south at x 3: clear of anything over 20 m), and two over the towers, at 44 and 55 m. A drone tilts into its
// turns, up to 23 degrees. (The tests hold them to it: their heights, the towers, the streets, the town, the lines.)
export const CITY_AIR = {
  copters: [
    { x: 0, z: 0, a: 58, b: 44, up: 82, dir: 1, phase: 0, speed: 15, bob: 2, maxBank: 0.22 },
    { x: -4, z: 2, a: 50, b: 40, up: 100, dir: -1, phase: 2.5, speed: 13, bob: 2, maxBank: 0.22 },
  ],
  drones: [
    { x: 0, z: -4, a: 24, b: 3, up: 31, dir: 1, phase: 0, speed: 9, bob: 0.6, maxBank: 0.4 },
    { x: 3, z: 0, a: 3, b: 22, up: 34, dir: -1, phase: 1.3, speed: 8, bob: 0.6, maxBank: 0.4 },
    { x: 34, z: -30, a: 12, b: 8, up: 44, dir: 1, phase: 0.6, speed: 7, bob: 0.8, maxBank: 0.4 },
    { x: -46, z: -6, a: 9, b: 14, up: 55, dir: -1, phase: 3.1, speed: 8, bob: 0.8, maxBank: 0.4 },
  ],
};

const lp = {}, loop = {};
// where a flier on `lane` is at time u, and its heading there: round its ellipse (dir -1: the other way), turned by its
// town (c, s: the cos and sin of its rot) -> lp, filled ({ x, z, yaw })
function laneSpot(u, lane, place, c, s) {
  loop.a = lane.a; loop.b = lane.b; loop.speed = lane.speed ?? GLIDE.speed; loop.phase = lane.phase;
  loopAt(lane.dir * u, loop, lp);
  const lx = lane.x + lp.along, lz = lane.z + lp.across;
  const vx = lane.dir * Math.sin(lp.heading), vz = lane.dir * Math.cos(lp.heading);   // (along x, along z: loopAt's)
  lp.x = place.centre.x + lx * c + lz * s; lp.z = place.centre.z - lx * s + lz * c;
  lp.yaw = Math.atan2(vx * c + vz * s, -vx * s + vz * c);
  return lp;
}
// a lane's place in the world at time t (place: its town's PLACES entry): -> out, filled ({ x, y, z, yaw, roll: its bank,
// as the rotation about its nose: - rolls its left (+x) side down, into a left-hand turn; no more than its maxBank })
export function laneAt(t, lane, place, out = {}) {
  const c = Math.cos(place.rot), s = Math.sin(place.rot), h = 0.05;
  const x0 = laneSpot(t - h, lane, place, c, s).x, z0 = lp.z, yaw0 = lp.yaw;
  const x1 = laneSpot(t + h, lane, place, c, s).x, z1 = lp.z, yaw1 = lp.yaw;
  const v = Math.hypot(x1 - x0, z1 - z0) / (2 * h), turn = Math.atan2(Math.sin(yaw1 - yaw0), Math.cos(yaw1 - yaw0)) / (2 * h);
  laneSpot(t, lane, place, c, s);
  out.x = lp.x; out.z = lp.z; out.yaw = lp.yaw;
  out.y = place.y + lane.up + (lane.bob ?? GLIDE.bob) * Math.sin(2 * Math.PI * t / GLIDE.period + lane.phase);
  const cap = lane.maxBank ?? Infinity;
  out.roll = Math.min(cap, Math.max(-cap, -Math.atan(v * turn / GLIDE.g)));
  return out;
}

// the road traffic on the suburbs' street (suburbs.js LAYOUT.street out on either side): each way keeping `keep` metres
// to its own right of the street's middle, at one speed a lane of speeds[0]..speeds[1] m/s (so none runs into the one
// ahead), `gap` metres apart
export const TRAFFIC = { keep: 1, speeds: [10, 14], gap: [40, 80] };

// the lateral (+ left of the leg's out direction) of the lane going `way` (+1 out along the leg, -1 back) on the street
// `street` metres out on `side`
export const laneLateral = (side, way, street) => side * street - way * TRAFFIC.keep;

// the stretches of s0..s1 (kept out of the platform windows) where the street `lateral` metres out stands: where ok(x, z)
// holds across its `width` every `step` metres; each at least `min` long, trimmed `edge` metres at its ends (a car's
// half-length) -> [[a, b]]
export function streetRuns(route, ok, lateral, s0, s1, { step = 2, width = 4, min = 60, edge = 3 } = {}) {
  const lo = Math.max(s0, PLATFORM), hi = Math.min(s1, route.length - PLATFORM), P = {}, runs = [];
  const clear = (s) => [-width / 2, 0, width / 2].every((d) => { route.offsetAt(s, lateral + d, P); return ok(P.x, P.z); });
  let start = null, last = null;
  const close = () => { if (start !== null && last - start - 2 * edge >= min) runs.push([start + edge, last - edge]); start = null; };
  for (let s = lo; s <= hi + 1e-9; s += step) {
    if (clear(s)) { if (start === null) start = s; last = s; } else close();
  }
  close();
  return runs;
}

// the street's path `lateral` metres out over s0..s1, on the land (heightAt: the world terrain's), every `step` metres
// along the street itself (longer than along the line round the outside of a curve): -> { length, at(u, out) -> out,
// filled ({ x, y, z, yaw: along it, pitch: up its slope }) for u metres along it (held at its ends) }
export function streetPath(route, heightAt, lateral, s0, s1, step = 2) {
  const P = {}, fine = [];
  for (let s = s0; s <= s1 + 1e-9; s += 0.5) { route.offsetAt(Math.min(s, s1), lateral, P); fine.push(P.x, P.z); }
  if (fine.length < 4) { route.offsetAt(s1, lateral, P); fine.push(P.x, P.z); }
  // metres along it to each fine point, then resampled every `step` of those
  const m = fine.length / 2, acc = new Float64Array(m);
  for (let i = 1; i < m; i++) acc[i] = acc[i - 1] + Math.hypot(fine[2 * i] - fine[2 * i - 2], fine[2 * i + 1] - fine[2 * i - 1]);
  const length = acc[m - 1], n = Math.max(1, Math.ceil(length / step));
  const x = new Float64Array(n + 1), y = new Float64Array(n + 1), z = new Float64Array(n + 1);
  for (let k = 0, j = 0; k <= n; k++) {
    const u = length * k / n;
    while (j < m - 2 && acc[j + 1] < u) j++;
    const f = acc[j + 1] > acc[j] ? (u - acc[j]) / (acc[j + 1] - acc[j]) : 0;
    x[k] = fine[2 * j] + (fine[2 * j + 2] - fine[2 * j]) * f;
    z[k] = fine[2 * j + 1] + (fine[2 * j + 3] - fine[2 * j + 1]) * f;
    y[k] = heightAt(x[k], z[k]);
  }
  const du = length / n;
  return {
    length,
    at(u, out = {}) {
      const c = Math.min(n, Math.max(0, u / du)), k = Math.min(n - 1, Math.floor(c)), f = c - k;
      out.x = x[k] + (x[k + 1] - x[k]) * f;
      out.y = y[k] + (y[k + 1] - y[k]) * f;
      out.z = z[k] + (z[k + 1] - z[k]) * f;
      out.yaw = Math.atan2(x[k + 1] - x[k], z[k + 1] - z[k]);
      out.pitch = Math.atan2(y[k + 1] - y[k], du);
      return out;
    },
  };
}

// a lane's cars: gaps of gap[0]..gap[1] metres (rnd(): 0..1) one after another round a loop at least `length` long (the
// street, then round the back of it, unseen, to its start): -> { at: each car's metres round the loop at time 0, period:
// the loop's length }
export function laneCars(length, rnd, gap = TRAFFIC.gap) {
  const at = [0];
  for (;;) {
    const g = gap[0] + rnd() * (gap[1] - gap[0]), next = at[at.length - 1] + g;
    if (next >= length) return { at, period: next };   // (that gap the one round the back, to the first car)
    at.push(next);
  }
}

// how far along its street (`length` long) a car is at time t, from `at0` round its loop at `speed` m/s: -> metres along
// it, or -1 while it's round the back
export function carAlong(at0, period, speed, t, length) {
  const u = (((at0 + speed * t) % period) + period) % period;
  return u <= length ? u : -1;
}

// the airliner coming in to land: `up` metres over the line at its window's middle (its event's), coming down at
// `glide` on a heading `cross` off the line's there (+ left of the leg's out direction: 62 degrees takes it across from
// the south-south-east towards the north-north-west, steeply), its nose `nose` up. It's timed to cross the line `lead`
// metres ahead of your front, so it's seen from the cab, low across the view ahead (planeStep): it comes in at `speed`
// m/s, made `slow`..`fast` as it goes to keep that time; it sets off `far` metres short of the line (in the haze, off to
// the side), and is gone `past` metres beyond it, still well up (out over the sea). It roars as it comes within `roar`
// of the line
export const PLANE = {
  up: 90, glide: 3 * Math.PI / 180, cross: 62 * Math.PI / 180, nose: 2 * Math.PI / 180, lead: 350,
  speed: 70, slow: 50, fast: 90, far: 3000, past: 1300, roar: 250,
};

// over: where it's over the line ({ x, y, z: the line at the window's middle, heading: its way, as a yaw }); d: metres
// short of being over it along its way (negative past it) -> out, filled ({ x, y, z, yaw, pitch: nose up })
export function planeAt(over, d, out = {}) {
  out.x = over.x - Math.sin(over.heading) * d;
  out.z = over.z - Math.cos(over.heading) * d;
  out.y = over.y + PLANE.up + d * Math.tan(PLANE.glide);
  out.yaw = over.heading;
  out.pitch = PLANE.nose;
  return out;
}

// seconds for the train to go `gap` metres from v m/s, gathering speed at `accel` up to `top` (the soonest it can be there,
// at full throttle)
export function soonest(gap, v, top, accel) {
  if (!(gap > 0)) return 0;
  v = Math.max(0, v);
  if (v >= top || !(accel > 0)) return gap / Math.max(v, top, 1e-6);
  const t1 = (top - v) / accel, d1 = (v + top) / 2 * t1;
  if (d1 >= gap) return (Math.sqrt(v * v + 2 * accel * gap) - v) / accel;
  return t1 + (gap - d1) / top;
}

// st: null at first, then what it returned (moved on in place); { here: you're driving a run on the leg, legS, v: the
// train's speed (+ forwards), top, accel: its top speed and how fast it gathers speed, dir, dt, meet: the leg-s it
// crosses the line at, s0, s1: its window } -> { mode: 'wait'|'fly'|'gone', d (as planeAt's), speed, shown, roar: true
// the frame it comes within `roar` }. While you're coming (at PACE.follow or more) it waits until it would be no more
// than `far` off at its speed, timed to cross as your front is `lead` short of `meet`: reckoning that while you gather
// speed you'll get there as soon as the train can (so a train leaving a platform close by doesn't beat it), and at the
// speed you hold once you hold one; it keeps that time to what you do. Standing or creeping (or nearer than `lead`) it
// comes from `far` off once you're inside its window. Once a run: it's put back only once you've left the leg
export function planeStep(st, { here, legS, v, top = v, accel = 0, dir, dt, meet, s0, s1 }) {
  st ??= { mode: 'wait', d: PLANE.far, speed: PLANE.speed, shown: false, roar: false };
  st.roar = false;
  if (!here) { Object.assign(st, { mode: 'wait', d: PLANE.far, speed: PLANE.speed, shown: false }); return st; }
  // (below PACE.follow it's not timed to you: it comes as it would for a train standing)
  // (gap: how far your front has to go to be `lead` short of `meet`, where it's to be as the plane crosses)
  const sgn = dir === 'back' ? -1 : 1, gap = (meet - legS) * sgn - PLANE.lead, coming = v >= PACE.follow && gap > 0;
  // gathering speed, you'll be there as soon as the train can be; holding it, at the speed you're going
  const gaining = st.v !== undefined && v > st.v + 0.02 * dt;
  st.v = v;
  const eta = !coming ? 0 : gaining ? soonest(gap, v, Math.max(top, v), accel) : gap / v;
  if (st.mode === 'wait') {
    const want = coming ? PLANE.speed * eta : PLANE.far;
    if (coming ? want > PLANE.far : !(legS >= s0 && legS <= s1)) { st.shown = false; return st; }
    Object.assign(st, { mode: 'fly', d: want, speed: PLANE.speed });
  } else if (st.mode === 'fly') {
    if (st.d > 0 && coming) st.speed = Math.min(PLANE.fast, Math.max(PLANE.slow, st.d / eta));
    const was = st.d;
    st.d -= st.speed * dt;
    if (was > PLANE.roar && st.d <= PLANE.roar) st.roar = true;
    if (st.d < -PLANE.past) st.mode = 'gone';
  }
  st.shown = st.mode === 'fly';
  return st;
}

// ---- the canyon's stagecoach (actors/canyon.js) ----
const OPEN_CLEAR = PLATFORM + 6;   // a platform window's length, and a body's length clear of it
// the longest run of leg-s in s0..s1 (clear of both platform windows) where the land under each of `laterals` metres
// out on `side` lies within `tol` of the line's level: -> { lo, hi } or null
export function openStretch(route, terrain, side, laterals, s0, s1, tol) {
  const lo0 = Math.max(s0, OPEN_CLEAR), hi0 = Math.min(s1, route.length - OPEN_CLEAR), P = {};
  let best = null, start = null;
  for (let s = lo0; s <= hi0; s += 5) {
    const ok = laterals.every((l) => { herdPath(route, s, side, l, P); return Math.abs(terrain.heightAt(P.x, P.z) - P.y) <= tol; });
    if (ok) start ??= s;
    if (start !== null && (!ok || s + 5 > hi0)) {
      const end = ok ? s : s - 5;
      if (end > start && (!best || end - start > best.hi - best.lo)) best = { lo: start, hi: end };
      start = null;
    }
  }
  return best;
}

// a saddled horse's hooves (Polyfork's saddled-horse-da86d3, standing in its Idle clip: its foot bones, measured in the
// page) in its own frame, +z ahead: its forefeet and hind feet, and either side of its middle
export const HORSE_HOOVES = { front: 0.46, back: -0.6, side: 0.13 };
// the canyon's stagecoach: its lane (lateral m out from the line, on the side of its event's shot), the land along its
// stretch within `tol` of the line's level, its wheels' feet in its own frame (+z ahead: the front pair, the back pair,
// and either side), as the Frontier stagecoach's are; and its pair abreast ahead of it (each `x` either side of their
// middle, which is `z` ahead of the coach's: its front, 2.25 m, a pole's 0.6 and a horse's half), who stand on the land
// on their own (the bench cut across their lane would lift or sink them, carried rigid with the coach), their footprint
// the hooves of both
export const CANYON_COACH = {
  lateral: 30, tol: 12, wheels: { front: 1.31, back: -1.59, half: 0.82 },
  pair: { x: 0.5, z: 4.15, feet: { front: HORSE_HOOVES.front, back: HORSE_HOOVES.back, half: 0.5 + HORSE_HOOVES.side } },
};
// a wheeled thing standing on the land at (x, z), heading yaw (wheels: { front, back, half } in its own frame): into out
// { y (its origin's height: on the plane through its wheels' feet), pitch (+ its front up), roll (+ its left side up) },
// for a pose in YXZ (rotation.x = -pitch, rotation.z = roll), so every wheel is on the ground however the land falls
export function standOnGround(heightAt, x, z, yaw, wheels, out = {}) {
  const fx = Math.sin(yaw), fz = Math.cos(yaw), lx = Math.cos(yaw) * wheels.half, lz = -Math.sin(yaw) * wheels.half;
  const front = wheels.front, back = wheels.back, half = wheels.half;
  const fl = heightAt(x + fx * front + lx, z + fz * front + lz), fr = heightAt(x + fx * front - lx, z + fz * front - lz);
  const bl = heightAt(x + fx * back + lx, z + fz * back + lz), br = heightAt(x + fx * back - lx, z + fz * back - lz);
  const hf = (fl + fr) / 2, hb = (bl + br) / 2;
  out.pitch = Math.atan2(hf - hb, front - back);
  out.roll = Math.atan2((fl + bl) / 2 - (fr + br) / 2, 2 * half);
  out.y = hb + (hf - hb) * (0 - back) / (front - back);
  return out;
}
