import { test } from 'node:test';
import assert from 'node:assert/strict';
import { canGetOut, stepWalker, nearestBoardable, WALK, RUN, BODY } from '../walk.js';

const near = (a, b, tol, msg) => assert.ok(Math.abs(a - b) <= tol, `${msg ?? ''} expected ${b} ± ${tol}, got ${a}`);
const platform = { sFrom: 1000, sTo: 1120, stopS: 1108 };
const open = { blocked: () => null, heightAt: () => 0, inBounds: () => true };
const walk = (p, input, seconds, world = open) => { for (let t = 0; t < seconds - 1e-9; t += 0.05) p = stepWalker(p, input, 0.05, world); return p; };

test('walking and running speeds', () => {
  assert.equal(WALK, 1.4); assert.equal(RUN, 4.0); assert.equal(BODY, 0.35);
});

test('canGetOut false when moving or off-platform', () => {
  assert.equal(canGetOut({ s: 1108, v: 2 }, platform), false);
  assert.equal(canGetOut({ s: 950, v: 0 }, platform), false);
  assert.equal(canGetOut({ s: 1108, v: 0 }, platform), true);
  assert.equal(canGetOut({ s: 1108, v: 0.01 }, platform), true);
  assert.equal(canGetOut({ s: 1108, v: 0 }, null), false);
});

test('stepWalker walks and runs', () => {
  // yaw 0 faces +z
  const a = walk({ x: 0, z: 0, yaw: 0 }, { fwd: 1 }, 1);
  near(a.z, 1.4, 1e-6); near(a.x, 0, 1e-6);
  const b = walk({ x: 0, z: 0, yaw: 0 }, { fwd: 1, run: true }, 1);
  near(b.z, 4.0, 1e-6);
  // strafing right of +z is -x, and diagonal input is no faster than straight
  const c = walk({ x: 0, z: 0, yaw: 0 }, { right: 1 }, 1);
  near(c.x, -1.4, 1e-6);
  const d = walk({ x: 0, z: 0, yaw: 0 }, { fwd: 1, right: 1 }, 1);
  near(Math.hypot(d.x, d.z), 1.4, 1e-6);
});

test('stepWalker stays in bounds and slides along blockers', () => {
  const wall = { ...open, blocked: (x, z, r) => (x + r > 5 ? 'wall' : null) };
  const p = walk({ x: 0, z: 0, yaw: Math.PI / 4 }, { fwd: 1, run: true }, 3, wall);   // heading +x+z into the wall
  assert.ok(p.x <= 4.65 + 1e-9, `went through the wall: x=${p.x}`);
  assert.ok(p.z > 4, `didn't slide along it: z=${p.z}`);
  const edge = { ...open, inBounds: (x) => x < 10 };
  const q = walk({ x: 8, z: 0, yaw: Math.PI / 2 }, { fwd: 1 }, 5, edge);
  assert.ok(q.x < 10, `left the walkable area: x=${q.x}`);
});

test('stepWalker clamps dt', () => {
  const p = stepWalker({ x: 0, z: 0, yaw: 0 }, { fwd: 1 }, 3, open);
  assert.ok(Math.hypot(p.x, p.z) <= 0.14 + 1e-9);
});

test('stepWalker turns with the mouse', () => {
  const p = stepWalker({ x: 0, z: 0, yaw: 0 }, { yawDelta: 0.5 }, 0.05, open);
  near(p.yaw, 0.5, 1e-9);
});

test('nearestBoardable', () => {
  const stopped = { name: 'A', stopped: true, cars: [{ x: 3, z: 0 }] };
  const moving = { name: 'B', stopped: false, cars: [{ x: 1, z: 0 }] };
  const far = { name: 'C', stopped: true, cars: [{ x: 6, z: 0 }] };
  assert.equal(nearestBoardable({ x: 0, z: 0 }, [stopped, moving, far])?.name, 'A');
  assert.equal(nearestBoardable({ x: 0, z: 0 }, [moving, far]), null);
});
