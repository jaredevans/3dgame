// The Silver Arrow's shape, from its pure measurements (trains/bullet-shape.js; the mesh is made from these in the
// browser): it fits its platforms, clears their faces, rides on the rails without floating, and has its long noses.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { COUPLING_GAP } from '../consist.js';
import { PLATFORM_TOP } from '../station-walk.js';
import { STOP_SHORT, BUFFER_GAP } from '../world-data.js';

const shape = () => import('../trains/bullet-shape.js');
const RAIL_TOP = 0.30;       // track-mesh.js: rail tops above the formation, on the guideway as everywhere
const PLATFORM_FACE = 1.6;   // the Countryside Railway platform's face, from its line's centre (measured)

test('four cars, two of them with long noses, that fit a 120 m platform at the stop', async () => {
  const { BULLET, carLengths } = await shape();
  const lens = carLengths(4);
  assert.equal(lens.length, 4);
  assert.ok(BULLET.nose >= 7 && BULLET.nose <= 9, `nose ${BULLET.nose} m`);
  for (const l of lens) assert.ok(l >= 24 && l <= 28, `a ${l} m car`);
  const total = lens.reduce((a, b) => a + b, 0) + COUPLING_GAP * 3;
  // at its stopping mark its rear is still on the platform (which starts 120 m from the buffers' end)
  assert.ok(STOP_SHORT + total <= 120, `the train is ${total.toFixed(2)} m: its rear is off the platform at the stop`);
  assert.ok(BUFFER_GAP + STOP_SHORT + total <= 120 + BUFFER_GAP);
});

test('the body clears the platform faces and rides just above the rails', async () => {
  const { BULLET, ring } = await shape();
  assert.ok(BULLET.skirt > RAIL_TOP && BULLET.skirt <= RAIL_TOP + 0.2, `skirts end ${BULLET.skirt} m up: below the rails or floating`);
  for (const t of [-1, 0, 0.25, 0.5, 0.75, 0.95]) for (const { x, y } of ring(t)) {
    assert.ok(y >= BULLET.skirt - 1e-9, `t ${t}: a point at ${y.toFixed(2)} m, under the skirts`);
    if (y <= PLATFORM_TOP + 0.3) assert.ok(Math.abs(x) <= PLATFORM_FACE - 0.08, `t ${t}: ${Math.abs(x).toFixed(2)} m out at ${y.toFixed(2)} m, into the platform`);
  }
});

test('the nose falls from the roof to a low tip, narrowing as it goes', async () => {
  const { section, BULLET } = await shape();
  const at = [0, 0.2, 0.4, 0.6, 0.8, 1].map(section);
  for (let i = 1; i < at.length; i++) {
    assert.ok(at[i].top < at[i - 1].top, 'the nose top falls all the way');
    assert.ok(at[i].half <= at[i - 1].half, 'and narrows');
  }
  assert.equal(at[0].top, BULLET.roof);
  assert.ok(at[5].top < 1.6, `the tip is ${at[5].top.toFixed(2)} m up`);
});
