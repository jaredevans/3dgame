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
