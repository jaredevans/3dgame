import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeRoute, reverseRoute } from '../route.js';

const near = (a, b, tol, msg) => assert.ok(Math.abs(a - b) <= tol, `${msg ?? ''} expected ${b} ± ${tol}, got ${a}`);
const straightZ = () => makeRoute([{ x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: 100 }, { x: 0, y: 0, z: 200 }]);

test('straight route length', () => {
  near(straightZ().length, 200, 0.5);
});

test('at clamps and hits the ends', () => {
  const r = straightZ();
  const a = r.at(-5), b = r.at(1e9);
  near(a.x, 0, 0.01); near(a.z, 0, 0.01);
  near(b.x, 0, 0.01); near(b.z, 200, 0.01);
});

test('yaw convention: +z is 0, +x is pi/2', () => {
  near(straightZ().at(100).yaw, 0, 1e-3);
  const rx = makeRoute([{ x: 0, y: 0, z: 0 }, { x: 100, y: 0, z: 0 }, { x: 200, y: 0, z: 0 }]);
  near(rx.at(100).yaw, Math.PI / 2, 1e-3);
});

test('offsetAt is to the left', () => {
  const p = straightZ().offsetAt(100, 2);
  near(p.x, 2, 1e-3); near(p.z, 100, 0.01);
});

test('pitch on a 2% climb', () => {
  const r = makeRoute([{ x: 0, y: 0, z: 0 }, { x: 0, y: 2, z: 100 }, { x: 0, y: 4, z: 200 }]);
  near(r.at(100).pitch, Math.atan(0.02), 0.002);
  near(r.maxGrade(), 0.02, 0.002);
});

test('minRadius of a quarter circle', () => {
  const R = 300, pts = [];
  for (let i = 0; i <= 8; i++) { const a = (i / 8) * (Math.PI / 2); pts.push({ x: R - R * Math.cos(a), y: 0, z: R * Math.sin(a) }); }
  near(makeRoute(pts).minRadius(), R, R * 0.05);
});

test('arc length is monotonic and even', () => {
  const R = 300, pts = [];
  for (let i = 0; i <= 8; i++) { const a = (i / 8) * (Math.PI / 2); pts.push({ x: R - R * Math.cos(a), y: i * 2, z: R * Math.sin(a) }); }
  const r = makeRoute(pts);
  let prev = r.at(0);
  for (let s = 1; s <= r.length; s += 1) {
    const p = r.at(s);
    const d = Math.hypot(p.x - prev.x, p.y - prev.y, p.z - prev.z);
    near(d, 1, 0.02, `step at s=${s}`);
    prev = p;
  }
});

test('reverseRoute runs the other way', () => {
  const r = straightZ(), v = reverseRoute(r);
  near(v.length, r.length, 1e-9);
  near(v.at(0).z, 200, 0.01);
  near(v.at(50).z, 150, 0.01);
  near(Math.abs(v.at(50).yaw), Math.PI, 1e-3);
  // its left is the original's right
  near(v.offsetAt(50, 2).x, -2, 1e-3);
  const c = makeRoute([{ x: 0, y: 0, z: 0 }, { x: 0, y: 2, z: 100 }, { x: 0, y: 4, z: 200 }]);
  near(reverseRoute(c).at(100).pitch, -Math.atan(0.02), 0.002);
});
