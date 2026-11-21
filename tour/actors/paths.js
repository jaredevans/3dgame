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
