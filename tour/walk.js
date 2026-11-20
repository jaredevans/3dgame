// On foot at a station: getting out, walking with collisions, and finding a train to board. Pure maths, no three.js.
// Heading convention as everywhere: yaw 0 faces +z; forward is (sin yaw, cos yaw), right is (-cos yaw, sin yaw).

export const WALK = 1.4, RUN = 4.0, BODY = 0.35;
const MAX_DT = 0.1;

// the cab (the train's front, s) is alongside the platform and the train has stopped
export function canGetOut(train, platform) {
  if (!platform) return false;
  return Math.abs(train.v) < 0.05 && train.s >= platform.sFrom && train.s <= platform.sTo;
}

// p { x, z, yaw }; input { fwd, right: -1..1, run, yawDelta }; world { blocked(x, z, r), heightAt, inBounds(x, z) }
export function stepWalker(p, input, dt, world) {
  dt = Math.min(MAX_DT, Math.max(0, dt));
  const yaw = p.yaw + (input.yawDelta ?? 0);
  let f = input.fwd ?? 0, r = input.right ?? 0;
  const len = Math.hypot(f, r);
  if (len > 1) { f /= len; r /= len; }
  const speed = input.run ? RUN : WALK;
  const dx = (Math.sin(yaw) * f - Math.cos(yaw) * r) * speed * dt;
  const dz = (Math.cos(yaw) * f + Math.sin(yaw) * r) * speed * dt;
  const ok = (x, z) => world.inBounds(x, z) && !world.blocked(x, z, BODY);
  let { x, z } = p;
  if (ok(x + dx, z + dz)) { x += dx; z += dz; }
  else if (dx && ok(x + dx, z)) x += dx;      // slide along whatever is in the way
  else if (dz && ok(x, z + dz)) z += dz;
  return { x, z, yaw };
}

// trains: [{ stopped, cars: [{ x, z }, ...] }] (points along each car); the closest stopped one within reach
export function nearestBoardable(p, trains, maxDist = 4) {
  let best = null, bd = maxDist;
  for (const t of trains) {
    if (!t.stopped) continue;
    for (const c of t.cars) {
      const d = Math.hypot(c.x - p.x, c.z - p.z);
      if (d <= bd) { bd = d; best = t; }
    }
  }
  return best;
}
