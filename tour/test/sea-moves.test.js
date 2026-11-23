// The whales' and stingrays' moves (actors/sea-moves.js): the breach, the round at the surface, the ray's flip.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BREACH, breachAt, breachSecs, SURFACE, swimAt, FLIP, flipAt } from '../actors/sea-moves.js';

const DEG = Math.PI / 180;

test('a breach: up from deep to its top over the sea nose first, over onto its side as it falls, back in where it began', () => {
  const T = breachSecs(), o = {};
  assert.ok(T > 2 && T < 3.5, `${T} s`);
  breachAt(0, o);
  assert.ok(o.on && Math.abs(o.y + BREACH.deep) < 1e-9 && Math.abs(o.pitch - BREACH.tilt * DEG) < 1e-9 && o.roll === 0);
  breachAt(T / 2, o);
  assert.ok(Math.abs(o.y - BREACH.high) < 1e-9, `top ${o.y}`);
  breachAt(T, o);
  assert.ok(Math.abs(o.y + BREACH.deep) < 1e-9 && o.pitch < 0 && Math.abs(o.roll - BREACH.roll * DEG) < 1e-9);
  assert.ok(Math.abs(o.along - BREACH.drift * T) < 1e-9);
  assert.equal(breachAt(T + 0.1, o).on, false);
  // its height rises then falls, and it's nose-up all the way to its top
  let last = -Infinity;
  for (let t = 0; t <= T / 2; t += 0.05) { breachAt(t, o); assert.ok(o.y >= last - 1e-9 && o.pitch > 0); last = o.y; }
});

test('a whale\'s round: up, lying at the surface blowing twice, an arched dive, and down out of sight', () => {
  const S = SURFACE, o = {};
  const blows = [];
  let prev = null, minPitch = 0;
  for (let t = 0; t < S.period; t += 0.05) {
    swimAt(t, 0, prev, o);
    if (o.blow) blows.push(+t.toFixed(2));
    minPitch = Math.min(minPitch, o.pitch);
    prev = t;
  }
  assert.equal(blows.length, 2, `${blows}`);
  assert.ok(Math.abs(blows[0] - (S.rise + S.blow)) < 0.06 && Math.abs(blows[1] - blows[0] - S.again) < 0.06, `${blows}`);
  assert.equal(swimAt(S.rise + 1, 0, null, o).y, S.top);
  assert.ok(swimAt(S.period - 0.5, 0, null, o).under);
  assert.ok(!swimAt(S.rise + 1, 0, null, o).under);
  // the dive arches it nose down (its flukes come up behind)
  assert.ok(minPitch < -S.arch * DEG * 0.9, `${minPitch / DEG}`);
  // a phase moves its round on; and no blow on the first frame
  assert.equal(swimAt(0, S.rise + 1, null, o).y, S.top);
  assert.equal(swimAt(S.rise + S.blow, 0, null, o).blow, false);
});

test('a stingray\'s flip: out of the water nose up, a somersault and a half over, back in nose down, each ray in turn', () => {
  const o = {};
  flipAt(0, 0, 3, o);
  assert.ok(o.air && Math.abs(o.y + FLIP.deep) < 1e-9 && Math.abs(o.pitch - FLIP.rise * DEG) < 1e-9);
  flipAt(FLIP.secs / 2, 0, 3, o);
  assert.ok(o.y > 1, `top ${o.y}`);
  flipAt(FLIP.secs - 1e-6, 0, 3, o);
  assert.ok(Math.abs(o.y + FLIP.deep) < 1e-3 && Math.abs(o.pitch - (FLIP.rise - FLIP.turn) * DEG) < 1e-3);
  // the turn over is more than a whole somersault, ending nose down
  assert.ok(FLIP.turn > 360 && Math.sin(o.pitch) < -0.5);
  // ray 1 waits its turn, then leaps
  assert.equal(flipAt(0.5, 1, 3, o).air, false);
  assert.equal(flipAt(FLIP.gap + 0.1, 1, 3, o).air, true);
  assert.equal(flipAt(FLIP.secs + 0.1, 0, 3, o).air, false);
});
