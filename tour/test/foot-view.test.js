import { test } from 'node:test';
import assert from 'node:assert/strict';
import { footControls, stepFootView, footCamera, FOOT_VIEW } from '../foot-view.js';

const near = (a, b, eps = 1e-6) => assert.ok(Math.abs(a - b) < eps, `${a} vs ${b}`);

test('W walks along your heading; A and D turn you rather than step sideways', () => {
  assert.deepEqual(footControls({ fwd: 1 }, 0.1), { fwd: 1, right: 0, run: false, yawDelta: -0 });
  const left = footControls({ right: -1 }, 0.1), right = footControls({ right: 1, run: true }, 0.1);
  near(left.yawDelta, FOOT_VIEW.turn * 0.1);
  near(right.yawDelta, -FOOT_VIEW.turn * 0.1);
  assert.equal(right.right, 0);
  assert.equal(right.run, true);
});

test('a long frame turns you at most a tenth of a second\'s worth', () => {
  near(footControls({ right: 1 }, 5).yawDelta, -FOOT_VIEW.turn * 0.1);
});

test('standing still, dragging looks round you', () => {
  const v = stepFootView({ yaw: 0, pitch: FOOT_VIEW.pitch }, { moving: false, drag: { dx: 0.5, dy: -0.1 } }, 0.016);
  near(v.yaw, -0.5 * FOOT_VIEW.drag.yaw);
  near(v.pitch, FOOT_VIEW.pitch + 0.1 * FOOT_VIEW.drag.pitch);
});

test('looking up or down stops at its limits', () => {
  assert.equal(stepFootView({ yaw: 0, pitch: 0 }, { moving: false, drag: { dx: 0, dy: -5 } }, 0.016).pitch, FOOT_VIEW.maxPitch);
  assert.equal(stepFootView({ yaw: 0, pitch: 0 }, { moving: false, drag: { dx: 0, dy: 5 } }, 0.016).pitch, FOOT_VIEW.minPitch);
});

test('once you move, the view swings back above and behind you, the short way round', () => {
  let v = { yaw: 3.5, pitch: 0.2 };   // looked round past behind you (3.5 rad = -2.78), and up
  const first = stepFootView(v, { moving: true }, 0.05);
  assert.ok(first.yaw > 3.5, 'swings on round to 2 pi, not back through pi to zero');
  for (let i = 0; i < 40; i++) v = stepFootView(v, { moving: true }, 0.05);
  near(Math.atan2(Math.sin(v.yaw), Math.cos(v.yaw)), 0, 0.01);
  near(v.pitch, FOOT_VIEW.pitch, 0.01);
});

test('moving ignores a drag: the view keeps behind you', () => {
  const v = stepFootView({ yaw: 0, pitch: FOOT_VIEW.pitch }, { moving: true, drag: { dx: 1, dy: 1 } }, 0.016);
  near(v.yaw, 0);
  near(v.pitch, FOOT_VIEW.pitch);
});

test('the camera sits above and behind you, looking at your head', () => {
  const { pos, target } = footCamera({ x: 0, y: 0, z: 0, yaw: 0 }, { yaw: 0, pitch: FOOT_VIEW.pitch });
  assert.ok(pos.z < -4, 'behind (you face +z)');
  near(pos.x, 0);
  assert.ok(pos.y > 2.5, 'above');
  near(target.y, FOOT_VIEW.head);
  // facing +x (yaw pi/2), it's behind on -x
  assert.ok(footCamera({ x: 0, y: 0, z: 0, yaw: Math.PI / 2 }, { yaw: 0, pitch: FOOT_VIEW.pitch }).pos.x < -4);
});

test('the camera never goes into the ground', () => {
  const { pos } = footCamera({ x: 0, y: 0, z: 0, yaw: 0 }, { yaw: 0, pitch: 0.35 }, () => 10);
  assert.equal(pos.y, 10.4);
});
