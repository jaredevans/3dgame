import test from 'node:test';
import assert from 'node:assert/strict';
import { makeDirector } from '../director.js';

const seq = (xs) => { let i = 0; return () => xs[i++ % xs.length]; };
const base = { dt: 0.1, legS: 500, dir: 'out', v: 20, showpieces: [], started: [], length: 100 };
const run = (d, n, over = {}) => { let r; for (let i = 0; i < n; i++) r = d.step({ ...base, ...over }); return r; };
// steps until the next cut after the first; returns seconds elapsed (0.1 s steps)
const untilCut = (d, over = {}, max = 400) => {
  for (let i = 1; i <= max; i++) if (d.step({ ...base, ...over }).cut) return i * 0.1;
  return Infinity;
};

test('holds 5 to 8 s between cuts', () => {
  for (const [r, lo, hi] of [[0, 4.95, 5.15], [0.999, 7.9, 8.15]]) {
    const d = makeDirector({ rand: () => r });
    assert.ok(d.step(base).cut);                       // the first step cuts to a first shot
    const t = untilCut(d);
    assert.ok(t >= lo && t <= hi, `rand ${r}: cut after ${t}`);
  }
});

test('cuts to a started event after 1.5 s at the least', () => {
  const d = makeDirector({ rand: () => 0.5 });
  d.step(base);
  const e = { id: 'rainbow', s0: 520, s1: 1000, shot: { kind: 'high-wide', at: 760, lateral: -150 } };
  run(d, 4);                                           // age 0.4
  let r = d.step({ ...base, started: [e] });           // age 0.5: no cut
  assert.equal(r.cut, false);
  assert.notEqual(r.shot.id, 'rainbow');
  r = run(d, 9);                                       // age 1.4
  assert.equal(r.cut, false);
  r = d.step(base);                                    // age 1.5
  assert.equal(r.cut, true);
  assert.equal(r.shot.kind, 'high-wide');
  assert.equal(r.shot.id, 'rainbow');
  assert.equal(r.shot.at, 760);
  assert.equal(r.shot.lateral, -150);
  // from a shot already 2 s old it cuts at once
  const d2 = makeDirector({ rand: () => 0.99 });
  d2.step(base); run(d2, 20);
  r = d2.step({ ...base, started: [e] });
  assert.equal(r.cut, true);
  assert.equal(r.shot.id, 'rainbow');
  assert.ok(r.shot.hold >= 5);
});

test('prefers a showpiece the train is in, not twice in a row', () => {
  const viaduct = { id: 'viaduct', s0: 646, s1: 896, shot: { kind: 'below', at: 771 } };
  const d = makeDirector({ rand: () => 0 });
  d.step({ ...base, legS: 100 });                      // first cut: no showpiece near
  let r;
  for (let i = 0; i < 100; i++) { r = d.step({ ...base, legS: 700, v: 0, showpieces: [viaduct] }); if (r.cut) break; }
  assert.equal(r.shot.kind, 'below');
  assert.equal(r.shot.id, 'viaduct');
  assert.equal(r.shot.at, 771);
  assert.equal(r.shot.height, 1.5);
  assert.equal(r.shot.fov, 50);
  // not again at the next cut, nor the one after (last two cuts)
  for (let k = 0; k < 2; k++) {
    for (let i = 0; i < 300; i++) { r = d.step({ ...base, legS: 700, showpieces: [viaduct] }); if (r.cut) break; }
    assert.notEqual(r.shot.id, 'viaduct');
  }
  // within v*4 m before the window (out: 646 - 600 = 46 <= 80) it also counts; 200 m before it does not
  const d2 = makeDirector({ rand: () => 0 });
  d2.step({ ...base, legS: 100 });
  r = null;
  for (let i = 0; i < 100; i++) { r = d2.step({ ...base, legS: 600, showpieces: [viaduct] }); if (r.cut) break; }
  assert.equal(r.shot.id, 'viaduct');
  const d3 = makeDirector({ rand: () => 0 });
  d3.step({ ...base, legS: 100 });
  for (let i = 0; i < 100; i++) { r = d3.step({ ...base, legS: 400, showpieces: [viaduct] }); if (r.cut) break; }
  assert.equal(r.shot.id, null);
  // back run: ahead is smaller leg-s, so just above the window's top edge counts
  const d4 = makeDirector({ rand: () => 0 });
  d4.step({ ...base, legS: 1000, dir: 'back' });
  for (let i = 0; i < 100; i++) { r = d4.step({ ...base, legS: 950, dir: 'back', showpieces: [viaduct] }); if (r.cut) break; }
  assert.equal(r.shot.id, 'viaduct');
});

test('general kinds rotate, never the same twice running', () => {
  const d = makeDirector({ rand: seq([0, 0.3, 0.7, 0.99]) });
  const kinds = [d.step(base).shot.kind];
  for (let n = 0; n < 19; n++) {
    for (let i = 0; i < 400; i++) { const r = d.step(base); if (r.cut) { kinds.push(r.shot.kind); break; } }
  }
  assert.equal(kinds.length, 20);
  for (let i = 1; i < kinds.length; i++) assert.notEqual(kinds[i], kinds[i - 1]);
  assert.deepEqual([...new Set(kinds)].sort(), ['chase', 'heli', 'high-wide', 'trackside']);
});

test('a portal shot holds through the tunnel, up to 20 s', () => {
  const portal = { id: 'portal', s0: 434, s1: 700, shot: { kind: 'portal', at: 642 } };
  const d = makeDirector({ rand: () => 0 });
  d.step({ ...base, legS: 100, v: 16 });
  let r, legS = 440;
  for (let i = 0; i < 100; i++) { r = d.step({ ...base, legS, v: 16, showpieces: [portal] }); if (r.cut) break; legS += 1.6; }
  assert.equal(r.shot.id, 'portal');
  assert.equal(r.shot.kind, 'portal');
  assert.equal(r.shot.fov, 45);
  // 15 s inside the tunnel: still the same shot (legS 440 -> 680)
  legS = 440;
  for (let i = 0; i < 150; i++) {
    legS += 1.6;
    r = d.step({ ...base, legS, v: 16, showpieces: [portal] });
    assert.equal(r.cut, false, `cut at ${i / 10} s`);
  }
  assert.ok(legS < 700);
  // leaves the window: cuts
  r = d.step({ ...base, legS: 701, v: 16, showpieces: [portal] });
  assert.equal(r.cut, true);
  // and a train that stays in the window is cut at 20 s
  const d2 = makeDirector({ rand: () => 0 });
  d2.step({ ...base, legS: 100, v: 16 });
  for (let i = 0; i < 100; i++) { r = d2.step({ ...base, legS: 500, v: 16, showpieces: [portal] }); if (r.cut) break; }
  assert.equal(r.shot.id, 'portal');
  const t = untilCut(d2, { legS: 500, v: 16, showpieces: [portal] });
  assert.ok(t >= 19.9 && t <= 20.2, `held ${t}`);
  // an event that starts while it holds still cuts in
  const d3 = makeDirector({ rand: () => 0 });
  d3.step({ ...base, legS: 100, v: 16 });
  for (let i = 0; i < 100; i++) { r = d3.step({ ...base, legS: 500, v: 16, showpieces: [portal] }); if (r.cut) break; }
  run(d3, 20, { legS: 500, v: 16, showpieces: [portal] });
  r = d3.step({ ...base, legS: 510, v: 16, showpieces: [portal], started: [{ id: 'eagle', s0: 500, s1: 900, shot: { kind: 'heli', at: 820, lateral: 70 } }] });
  assert.equal(r.cut, true);
  assert.equal(r.shot.id, 'eagle');
});

test('trackside is ahead of the train, mirrored on a back run', () => {
  // rand 0 -> trackside is the first general kind; |v|*3 + 40 = 100 ahead
  const out = makeDirector({ rand: () => 0 }).step({ ...base, v: 20, legS: 500, dir: 'out' });
  assert.equal(out.shot.kind, 'trackside');
  assert.equal(out.shot.at, 600);
  assert.equal(out.shot.height, 1.2);
  assert.equal(out.shot.fov, 45);
  assert.ok(Math.abs(out.shot.lateral) >= 4.5 && Math.abs(out.shot.lateral) <= 7.5);
  const back = makeDirector({ rand: () => 0 }).step({ ...base, v: 20, legS: 500, dir: 'back' });
  assert.equal(back.shot.kind, 'trackside');
  assert.equal(back.shot.at, 400);
  // too slow for trackside: falls through to the next kind
  const slow = makeDirector({ rand: () => 0 }).step({ ...base, v: 2, legS: 500 });
  assert.notEqual(slow.shot.kind, 'trackside');
});

test('standstill: no trackside, no division by speed', () => {
  const d = makeDirector({ rand: seq([0, 0.5, 0.99]) });
  const shots = [d.step({ ...base, v: 0 }).shot];
  for (let n = 0; n < 15; n++) {
    for (let i = 0; i < 400; i++) { const r = d.step({ ...base, v: 0 }); if (r.cut) { shots.push(r.shot); break; } }
  }
  assert.equal(shots.length, 16);
  for (const s of shots) {
    assert.ok(['chase', 'heli', 'high-wide'].includes(s.kind), s.kind);
    for (const k of ['lateral', 'height', 'fov', 'hold']) assert.ok(Number.isFinite(s[k]), `${s.kind}.${k}`);
  }
});

test('reset forgets the shot', () => {
  const d = makeDirector({ rand: () => 0 });
  d.step(base); run(d, 3);
  d.reset();
  assert.equal(d.step(base).cut, true);
});
