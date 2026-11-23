import { test } from 'node:test';
import assert from 'node:assert/strict';
import { findPath, makeFollower, PATH, straightWay } from '../autopath.js';
import { stepWalker, BODY, RUN } from '../walk.js';
import { footControls } from '../foot-view.js';

// a job run straight through (the page slices it: slicer.js)
const drain = (job) => { for (;;) { const r = job.next(); if (r.done) return r.value; } };
// a world of boxes { x0, x1, z0, z1 } in a square field |x|, |z| < size
const boxes = (list, size = 30) => ({
  blocked: (x, z, r) => list.find((b) => x > b.x0 - r && x < b.x1 + r && z > b.z0 - r && z < b.z1 + r) ?? null,
  inBounds: (x, z) => Math.abs(x) < size && Math.abs(z) < size,
  heightAt: () => 0,
});
// every 5 cm along the path: in bounds and clear of everything for the walker's body
function assertWalkable(world, points, msg = '') {
  for (let k = 1; k < points.length; k++) {
    const a = points[k - 1], b = points[k], n = Math.ceil(Math.hypot(b.x - a.x, b.z - a.z) / 0.05);
    for (let j = 0; j <= n; j++) {
      const x = a.x + ((b.x - a.x) * j) / n, z = a.z + ((b.z - a.z) * j) / n;
      if (k === 1 && Math.hypot(x - points[0].x, z - points[0].z) < 0.3) continue;   // where he stands
      assert.ok(world.inBounds(x, z) && !world.blocked(x, z, BODY), `${msg} the path runs through (${x.toFixed(2)}, ${z.toFixed(2)})`);
    }
  }
}
// follow a path as the page does: the follower's keys through footControls into stepWalker
function follow(world, path, from, seconds = 120, dt = 1 / 60) {
  const f = makeFollower(), out = { fwd: 0, right: 0, run: false };
  f.set(path);
  let p = { ...from }, t = 0, status = 'going';
  for (; t < seconds && status === 'going'; t += dt) {
    status = f.step(p, dt, out);
    if (status !== 'going') break;
    const next = stepWalker(p, footControls(out, dt), dt, world);
    p = { ...p, ...next };
  }
  return { p, t, status };
}

test('round an obstacle: a path, clear all the way, simplified to a few waypoints', () => {
  const world = boxes([{ x0: -1, x1: 1, z0: -12, z1: 12 }]);
  const from = { x: -10, z: 0 }, to = { x: 10, z: 0 };
  const path = drain(findPath(world, from, to));
  assert.ok(path, 'no path found');
  const pts = path.points;
  assert.deepEqual(pts[0], from);
  assert.ok(Math.hypot(pts.at(-1).x - to.x, pts.at(-1).z - to.z) <= PATH.reach + 1e-9, 'ends within reach of the goal');
  assert.ok(pts.some((q) => Math.abs(q.z) > 12), 'goes round the end of the wall');
  assert.ok(pts.length <= 8, `${pts.length} waypoints`);
  assertWalkable(world, pts);
  // straight across open ground: a straight line
  const open = drain(findPath(boxes([]), from, to));
  assert.equal(open.points.length, 2);
});

test('walled in: no path, whether the goal or the start is shut in', () => {
  const ring = (cx, cz) => [
    { x0: cx - 4, x1: cx + 4, z0: cz - 4, z1: cz - 3 }, { x0: cx - 4, x1: cx + 4, z0: cz + 3, z1: cz + 4 },
    { x0: cx - 4, x1: cx - 3, z0: cz - 4, z1: cz + 4 }, { x0: cx + 3, x1: cx + 4, z0: cz - 4, z1: cz + 4 },
  ];
  assert.equal(drain(findPath(boxes(ring(10, 0)), { x: -10, z: 0 }, { x: 10, z: 0 })), null);
  assert.equal(drain(findPath(boxes(ring(-10, 0)), { x: -10, z: 0 }, { x: 10, z: 0 })), null);
  // and off the edge of the world: a gap too narrow for him (0.6 m) is no way through either
  const wall = boxes([{ x0: -1, x1: 1, z0: -40, z1: -0.3 }, { x0: -1, x1: 1, z0: 0.3, z1: 40 }]);
  assert.equal(drain(findPath(wall, { x: -10, z: 0 }, { x: 10, z: 0 })), null);
});

test('it never routes through a blocked cell: random clutter, many trips', () => {
  let seed = 7;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  let found = 0;
  for (let trial = 0; trial < 12; trial++) {
    const list = [];
    for (let k = 0; k < 40; k++) {
      const x = rnd() * 50 - 25, z = rnd() * 50 - 25, w = 0.3 + rnd() * 4, h = 0.3 + rnd() * 4;
      if (Math.hypot(x + 20, z + 20) < 6 || Math.hypot(x - 20, z - 20) < 6) continue;   // keep the ends clear
      list.push({ x0: x, x1: x + w, z0: z, z1: z + h });
    }
    const world = boxes(list);
    const path = drain(findPath(world, { x: -20, z: -20 }, { x: 20, z: 20 }));
    if (!path) continue;
    found++;
    assertWalkable(world, path.points, `trial ${trial}:`);
    for (const c of path.cells) assert.ok(world.inBounds(c.x, c.z) && !world.blocked(c.x, c.z, BODY), `trial ${trial}: through a blocked cell`);
  }
  assert.ok(found >= 8, `paths found in only ${found} of 12`);
});

test('a narrow way through (1.3 m between two walls, off the grid) is found and walked', () => {
  const world = boxes([{ x0: -1, x1: 1, z0: -40, z1: 0.17 }, { x0: -1, x1: 1, z0: 1.47, z1: 40 }]);
  const from = { x: -12, z: -6, yaw: 0 }, to = { x: 12, z: 7 };
  const path = drain(findPath(world, from, to));
  assert.ok(path, 'no way through the gap');
  assertWalkable(world, path.points);
  const r = follow(world, path.points, from);
  assert.equal(r.status, 'arrived', `${r.status} at (${r.p.x.toFixed(2)}, ${r.p.z.toFixed(2)}) after ${r.t.toFixed(1)} s`);
  const length = path.points.reduce((a, q, k) => (k ? a + Math.hypot(q.x - path.points[k - 1].x, q.z - path.points[k - 1].z) : 0), 0);
  assert.ok(r.t < length / RUN + 6, `took ${r.t.toFixed(1)} s for ${length.toFixed(1)} m`);
});

test('a way only 0.2 m wide for his middle (0.9 m between two blocks) is found on the world grid and walked', () => {
  // as at Oceanside: the beach hut and a marram tuft, 0.9 m apart, a few metres of it
  const world = boxes([{ x0: -3, x1: 3, z0: -40, z1: -0.45 }, { x0: -3, x1: 3, z0: 0.45, z1: 40 }]);
  for (const from of [{ x: -9.83, z: -5.41, yaw: 0 }, { x: -12.1, z: 6.77, yaw: 2 }]) {
    const path = drain(findPath(world, from, { x: 10.3, z: 3.9 }));
    assert.ok(path, `no way through from (${from.x}, ${from.z})`);
    assertWalkable(world, path.points);
    for (const dt of [1 / 60, 0.1]) {
      const r = follow(world, path.points, from, 60, dt);
      assert.equal(r.status, 'arrived', `dt ${dt}: ${r.status} at (${r.p.x.toFixed(2)}, ${r.p.z.toFixed(2)}) after ${r.t.toFixed(1)} s`);
    }
  }
});

test('the walker follows a winding path with the A/D and W keys (running), at 60 and 10 frames a second', () => {
  const world = boxes([
    { x0: -15, x1: -13, z0: -30, z1: 20 }, { x0: -7, x1: -5, z0: -20, z1: 30 }, { x0: 1, x1: 3, z0: -30, z1: 20 },
    { x0: 9, x1: 11, z0: -20, z1: 30 },
  ]);
  const from = { x: -25, z: 0, yaw: Math.PI }, to = { x: 25, z: 0 };
  const path = drain(findPath(world, from, to));
  assert.ok(path);
  for (const dt of [1 / 60, 0.1]) {
    const r = follow(world, path.points, from, 200, dt);
    assert.equal(r.status, 'arrived', `dt ${dt}: ${r.status} at (${r.p.x.toFixed(2)}, ${r.p.z.toFixed(2)}) after ${r.t.toFixed(1)} s`);
  }
});

test('the follower runs, turns on the spot when facing well off its way, and says when it is stuck', () => {
  const f = makeFollower(), out = { fwd: 0, right: 0, run: false };
  f.set([{ x: 0, z: 0 }, { x: 0, z: 10 }]);
  assert.equal(f.step({ x: 0, z: 0, yaw: 0 }, 1 / 60, out), 'going');
  assert.deepEqual(out, { fwd: 1, right: 0, run: true });
  f.step({ x: 0, z: 0, yaw: Math.PI / 2 }, 1 / 60, out);   // facing +x, the way (+z) is to his right: D, on the spot
  assert.deepEqual(out, { fwd: 0, right: 1, run: true });
  f.step({ x: 0, z: 0, yaw: -0.2 }, 1 / 60, out);          // a little right of it: turn left, still running
  assert.deepEqual(out, { fwd: 1, right: -1, run: true });
  assert.equal(f.step({ x: 0, z: 9.7, yaw: 0 }, 1 / 60, out), 'arrived');
  // a wall put across the way after it was planned: no progress for 3 s is stuck
  const world = boxes([{ x0: -30, x1: 30, z0: 4, z1: 5 }]);
  const r = follow(world, [{ x: 0, z: 0 }, { x: 0, z: 10 }], { x: 0, z: 0, yaw: 0 }, 20);
  assert.equal(r.status, 'stuck');
  assert.ok(r.t > 3 && r.t < 5, `stuck after ${r.t.toFixed(1)} s`);
});

test('the search is a job a frame can slice: it yields as it goes', () => {
  const world = boxes([{ x0: -1, x1: 1, z0: -12, z1: 12 }]);
  const job = findPath(world, { x: -10, z: 0 }, { x: 10, z: 0 });
  let yields = 0, r;
  while (!(r = job.next()).done) yields++;
  assert.ok(yields > 3, `${yields} yields`);
  assert.ok(r.value.points.length >= 2);
});

// owner, 2026-11-23: a long pause after getting off the balloon, the search taking seconds for a way that ran straight
test('straightWay: the straight line when it is clear (no search), to within reach; null when anything is in the way', () => {
  const open = boxes([]), w = straightWay(open, { x: -20, z: 0 }, { x: 20, z: 0 }, { reach: 5 });
  assert.ok(w && w.points.length === 2);
  assert.ok(Math.abs(w.points[1].x - 15) < 1e-9, 'it stops within reach, short of the goal (a ride\'s vehicle is solid)');
  assertWalkable(open, w.points);
  assert.equal(straightWay(boxes([{ x0: -1, x1: 1, z0: -1, z1: 1 }]), { x: -20, z: 0 }, { x: 20, z: 0 }), null);
  assert.equal(straightWay(boxes([], 10), { x: -5, z: 0 }, { x: 20, z: 0 }), null, 'out of bounds on the way');
  // the goal itself inside something solid, but reachable within reach: the straight way stops short of it
  assert.ok(straightWay(boxes([{ x0: 18, x1: 22, z0: -2, z1: 2 }]), { x: -20, z: 0 }, { x: 20, z: 0 }, { reach: 5 }));
});
