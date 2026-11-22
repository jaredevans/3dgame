import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mapFrame } from '../map.js';

const pts = [{ x: -100, z: -50 }, { x: 300, z: 150 }, { x: 0, z: 0 }];
const W = 800, H = 600, PAD = 40;

test('mapFrame puts the bounds inside the padding', () => {
  const f = mapFrame(pts, { w: W, h: H, pad: PAD });
  for (const p of pts) {
    const [px, py] = f.toScreen(p.x, p.z);
    assert.ok(px >= PAD - 1e-9 && px <= W - PAD + 1e-9, `px ${px}`);
    assert.ok(py >= PAD - 1e-9 && py <= H - PAD + 1e-9, `py ${py}`);
  }
  const [x0] = f.toScreen(-100, 0), [x1] = f.toScreen(300, 0);
  assert.ok(Math.abs((x0 + x1) / 2 - W / 2) < 1e-9, 'centred');
});

test('equal distances on x and z are equal pixels', () => {
  const f = mapFrame(pts, { w: W, h: H, pad: PAD });
  const [ax, ay] = f.toScreen(0, 0), [bx] = f.toScreen(50, 0), [, cy] = f.toScreen(0, 50);
  assert.ok(Math.abs((bx - ax) - Math.abs(cy - ay)) < 1e-9);
  assert.ok(f.scale > 0);
});

test('north (smaller z) is up: a smaller py', () => {
  const f = mapFrame(pts, { w: W, h: H, pad: PAD });
  assert.ok(f.toScreen(0, -20)[1] < f.toScreen(0, 20)[1]);
});
