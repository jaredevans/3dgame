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
