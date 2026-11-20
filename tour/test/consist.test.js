import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeRoute } from '../route.js';
import { placeCars, COUPLING_GAP } from '../consist.js';

const near = (a, b, tol, msg) => assert.ok(Math.abs(a - b) <= tol, `${msg ?? ''} expected ${b} ± ${tol}, got ${a}`);
const coach = () => ({ front: 8, length: 16, pf: 5, pr: -5, bogieZ: [5, -5] });
const straight = makeRoute([{ x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: 150 }, { x: 0, y: 0, z: 300 }]);

test('coupling gap matches the basement', () => assert.equal(COUPLING_GAP, 0.15));

test('cars follow each other on a straight', () => {
  const [a, b] = placeCars(straight, 100, [coach(), coach()]);
  near(a.z, 92, 0.01); near(b.z, 100 - 16.15 - 8, 0.01);
  near(a.yaw, 0, 1e-3); near(b.yaw, 0, 1e-3);
});

test('both pivots sit on the curve', () => {
  const R = 200, pts = [];
  for (let i = 0; i <= 12; i++) { const a = (i / 12) * Math.PI; pts.push({ x: R - R * Math.cos(a), y: 0, z: R * Math.sin(a) }); }
  const arc = makeRoute(pts);
  const cars = [coach(), coach(), coach()];
  const poses = placeCars(arc, 300, cars);
  let front = 300;
  poses.forEach((p, i) => {
    const c = cars[i], origin = front - c.front;
    for (const pz of [c.pf, c.pr]) {
      const px = p.x + Math.sin(p.yaw) * Math.cos(p.pitch) * pz, pzz = p.z + Math.cos(p.yaw) * Math.cos(p.pitch) * pz;
      const on = arc.at(origin + pz);
      assert.ok(Math.hypot(px - on.x, pzz - on.z) < 0.05, `car ${i} pivot ${pz} off the line`);
    }
    front -= c.length + COUPLING_GAP;
  });
});

test('pitch on a climb', () => {
  const climb = makeRoute([{ x: 0, y: 0, z: 0 }, { x: 0, y: 3, z: 150 }, { x: 0, y: 6, z: 300 }]);
  for (const p of placeCars(climb, 120, [coach(), coach()])) near(p.pitch, Math.atan(0.02), 0.002);
});

test('lateral offset moves the train left', () => {
  for (const p of placeCars(straight, 100, [coach(), coach()], { lateral: 2 })) near(p.x, 2, 1e-3);
});

test('bogies turn into a curve', () => {
  const R = 200, pts = [];
  for (let i = 0; i <= 12; i++) { const a = (i / 12) * Math.PI; pts.push({ x: R - R * Math.cos(a), y: 0, z: R * Math.sin(a) }); }
  const [p] = placeCars(makeRoute(pts), 300, [coach()]);
  // this curve turns toward +x (yaw rising with s): the front bogie points further round than the body, the rear less,
  // each by about pivot distance / R
  near(p.bogieYaw[0], 5 / R, 0.005); near(p.bogieYaw[1], -5 / R, 0.005);
});
