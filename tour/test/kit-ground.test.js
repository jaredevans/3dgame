// A kit's ground as a lookup (kit-ground.js): the same height a ray cast straight down from above would find, without
// testing every triangle of the kit's terrain at each point.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { groundIndex } from '../kit-ground.js';

// a bumpy island as a triangle mesh: an n x n grid `step` metres apart, centred on the origin, every triangle wound
// to face up (as a kit's ground is)
function island(n = 40, step = 1.7) {
  const h = (i, j) => Math.sin(i * 0.37) * 3 + Math.cos(j * 0.29) * 2 + ((i * 7 + j * 13) % 5) * 0.1;
  const p = (i, j) => [(i - n / 2) * step, h(i, j), (j - n / 2) * step];
  const tris = [];
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
    const a = p(i, j), b = p(i + 1, j), c = p(i, j + 1), d = p(i + 1, j + 1);
    tris.push(...a, ...c, ...b, ...b, ...c, ...d);   // (c - a) x (b - a) points up: wound to face up
  }
  return tris;
}

// a ray straight down onto every triangle, as three.js casts it: the highest hit on a face turned up to meet it
function bruteForce(tris, x, z) {
  let best = null;
  for (let t = 0; t < tris.length; t += 9) {
    const [ax, ay, az, bx, by, bz, cx, cy, cz] = tris.slice(t, t + 9);
    const ny = (bz - az) * (cx - ax) - (bx - ax) * (cz - az);
    if (ny <= 0) continue;   // facing down: a front-side face the ray meets from behind
    const d = (bx - ax) * (cz - az) - (bz - az) * (cx - ax);
    const u = ((x - ax) * (cz - az) - (z - az) * (cx - ax)) / d, v = ((bx - ax) * (z - az) - (bz - az) * (x - ax)) / d;
    if (u < -1e-9 || v < -1e-9 || u + v > 1 + 1e-9) continue;
    const y = ay + u * (by - ay) + v * (cy - ay);
    if (best === null || y > best) best = y;
  }
  return best;
}

test('the lookup finds the same ground as a ray cast down onto every triangle', () => {
  const tris = island(), g = groundIndex(tris);
  let worst = 0, n = 0;
  for (let k = 0; k < 3000; k++) {
    const x = Math.sin(k * 12.9898) * 40, z = Math.cos(k * 78.233) * 40;
    const want = bruteForce(tris, x, z), got = g.at(x, z);
    if (want === null) { assert.equal(got, null, `(${x}, ${z}) is off the island`); continue; }
    worst = Math.max(worst, Math.abs(got - want)); n++;
  }
  assert.ok(n > 1000, `${n} points on the island`);
  assert.ok(worst < 1e-6, `largest difference ${worst}`);
});

test('a face turned down is not ground (a ray from above meets it from behind), and the highest face wins', () => {
  // a ledge 5 m up, facing up, over a floor at 0; and an overhang at 9 m wound to face down
  const up = (y) => [-10, y, -10, -10, y, 10, 10, y, -10, 10, y, -10, -10, y, 10, 10, y, 10];
  const down = (y) => [-10, y, -10, 10, y, -10, -10, y, 10, 10, y, -10, 10, y, 10, -10, y, 10];
  const g = groundIndex([...up(0), ...up(5), ...down(9)]);
  assert.equal(g.at(1, 2), 5);
  assert.equal(g.at(30, 2), null);
});

test('points on a shared edge or corner find the ground', () => {
  const tris = island(10, 2), g = groundIndex(tris);
  for (const [x, z] of [[0, 0], [2, 0], [0, 4], [-4, -4], [1, 1]]) {
    assert.ok(Math.abs(g.at(x, z) - bruteForce(tris, x, z)) < 1e-6, `(${x}, ${z})`);
  }
});

test('a lookup over a big terrain answers far quicker than casting onto every triangle', () => {
  const tris = island(150, 1), g = groundIndex(tris);   // 45,000 triangles, like the Alpine kit's ground
  const t0 = performance.now();
  for (let k = 0; k < 20000; k++) g.at(Math.sin(k) * 70, Math.cos(k * 1.3) * 70);
  const each = (performance.now() - t0) / 20000;
  assert.ok(each < 0.01, `${(each * 1000).toFixed(2)} µs a point`);
});
