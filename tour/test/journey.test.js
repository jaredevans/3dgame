import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeJourney } from '../journey.js';
import { LEGS, PLACES, BUFFER_GAP, STOP_SHORT, legRoute, laneOf } from '../world-data.js';
import { ringPosition } from '../sky.js';

const near = (a, b, tol, msg) => assert.ok(Math.abs(a - b) <= tol, `${msg ?? ''} expected ${b} ± ${tol}, got ${a}`);
const j = makeJourney({ legs: LEGS, places: PLACES });
// drive a run to its far end and get out there
const arrive = (leg, dir) => { const s = j.start(leg, dir); return j.getOut(s, j.runRoute(leg, dir).destination.place); };

const OCEANSIDE = [
  { leg: 'ocean-mountain', dir: 'out', station: 'departure', to: 'mountain' },
  { leg: 'city-ocean', dir: 'back', station: 'arrival', to: 'city' },
];

test('trainsAt in Oceanside', () => {
  const s = arrive('city-ocean', 'out');
  assert.deepEqual({ mode: s.mode, place: s.place }, { mode: 'foot', place: 'ocean' });
  assert.deepEqual(j.trainsAt(s, 'ocean'), OCEANSIDE);
  // each waits at its own station in this place, ready to leave it: its run starts here, on the town-side line
  for (const t of j.trainsAt(s, 'ocean')) {
    const run = j.runRoute(t.leg, t.dir);
    assert.equal(run.origin.place, 'ocean');
    assert.equal(run.destination.place, t.to);
    const st = PLACES.ocean.stations.find((x) => x.role === t.station);
    assert.equal(st.leg, t.leg);
  }
});

test('trainsAt after arriving backwards', () => {
  const s = arrive('ocean-mountain', 'back');
  assert.deepEqual({ mode: s.mode, place: s.place, leg: s.leg, dir: s.dir }, { mode: 'foot', place: 'ocean', leg: 'ocean-mountain', dir: 'back' });
  assert.deepEqual(j.trainsAt(s, 'ocean'), OCEANSIDE);
});

test('boarding the onward train starts its leg out', () => {
  const s = j.board(arrive('city-ocean', 'out'), 'ocean-mountain', 'out');
  assert.deepEqual(s, { mode: 'drive', leg: 'ocean-mountain', dir: 'out', place: 'ocean' });
  const run = j.runRoute('ocean-mountain', 'out'), L = legRoute('ocean-mountain').length;
  assert.equal(run.route, legRoute('ocean-mountain'));
  assert.equal(run.lane, laneOf('ocean-mountain'));
  assert.equal(run.lane, -2, 'ocean-mountain has its town on the right');
  assert.deepEqual({ from: run.origin.place, to: run.destination.place }, { from: 'ocean', to: 'mountain' });
  near(run.origin.platform.sFrom, BUFFER_GAP, 1e-9);
  near(run.platform.stopS, L - BUFFER_GAP - STOP_SHORT, 1e-9);
  assert.equal(run.platform, run.destination.platform);
});

test('boarding the back train starts its leg back', () => {
  const s = j.board(arrive('city-ocean', 'out'), 'city-ocean', 'back');
  assert.deepEqual(s, { mode: 'drive', leg: 'city-ocean', dir: 'back', place: 'ocean' });
  const run = j.runRoute('city-ocean', 'back'), leg = legRoute('city-ocean'), L = leg.length;
  near(run.route.length, L, 1e-9);
  // s = 0 on the run is the Oceanside end of the leg, and the same town-side line (its offset changes sign)
  const a = run.route.offsetAt(10, run.lane), b = leg.offsetAt(L - 10, laneOf('city-ocean'));
  near(a.x, b.x, 1e-6); near(a.z, b.z, 1e-6);
  assert.deepEqual({ from: run.origin.place, to: run.destination.place }, { from: 'ocean', to: 'city' });
  near(run.platform.stopS, L - BUFFER_GAP - STOP_SHORT, 1e-9, 'stops short of City\'s buffers');
  near(run.origin.platform.sFrom, BUFFER_GAP, 1e-9, 'leaves from the Oceanside platform');
  // only a waiting train can be boarded, and only on foot
  assert.throws(() => j.board(arrive('city-ocean', 'out'), 'mountain-west', 'out'));
  assert.throws(() => j.board(j.start('city-ocean', 'out'), 'city-ocean', 'out'));
});

test('getting out only at a place on the run\'s route ends', () => {
  const s = j.start('city-ocean', 'out');
  assert.equal(s.place, 'city');
  assert.equal(j.getOut(s, 'city').place, 'city');
  assert.equal(j.getOut(s, 'ocean').place, 'ocean');
  assert.throws(() => j.getOut(s, 'mountain'));
  assert.throws(() => j.getOut(j.getOut(s, 'ocean'), 'ocean'), 'already on foot');
  // where a stopped train lets you out: either end's platform, never between them, never moving
  const run = j.runRoute('city-ocean', 'out');
  assert.equal(j.stopAt(run, { s: run.platform.stopS, v: 0 }), 'ocean');
  assert.equal(j.stopAt(run, { s: run.origin.platform.sTo - 1, v: 0 }), 'city');
  assert.equal(j.stopAt(run, { s: run.route.length / 2, v: 0 }), null);
  assert.equal(j.stopAt(run, { s: run.platform.stopS, v: 3 }), null);
  const back = j.runRoute('ocean-mountain', 'back');
  assert.equal(j.stopAt(back, { s: back.platform.stopS, v: 0 }), 'ocean');
});

test('getting out lands on the platform', () => {
  for (const leg of ['city-ocean', 'ocean-mountain']) for (const dir of ['out', 'back']) {
    const run = j.runRoute(leg, dir), side = LEGS[leg].side;
    for (const pl of [run.origin.platform, run.destination.platform]) {
      for (let s = pl.sFrom; s <= pl.sTo + 1e-9; s += 2) {
        const out = j.stepOut(run, s);
        assert.ok(out.s >= pl.sFrom + 4 && out.s <= pl.sTo - 4, `${leg} ${dir} at ${s}: steps out at ${out.s}, off the platform ${pl.sFrom}..${pl.sTo}`);
        // on the leg's own frame: the town side, across the platform's width (3.5..8 m from the centre line)
        const across = dir === 'out' ? out.lateral : -out.lateral;
        assert.equal(Math.sign(across), side, `${leg} ${dir}: town side`);
        assert.ok(Math.abs(across) >= 3.5 && Math.abs(across) <= 8, `${leg} ${dir}: ${across} m across`);
      }
    }
  }
});

test('the sky and the streamer follow any leg, either way', () => {
  const run = j.runRoute('ocean-mountain', 'back'), L = run.route.length;
  const w = j.where(j.start('ocean-mountain', 'back'), run, 0);
  assert.deepEqual({ leg: w.leg, back: w.back }, { leg: 'ocean-mountain', back: true });
  near(w.s, L, 1e-9, 'leaving Mountain is the far end of the leg');
  near(w.fraction, 1, 1e-9);
  near(ringPosition(w), 2, 1e-9);
  near(ringPosition(j.where(j.start('ocean-mountain', 'back'), run, L / 4)), 1.75, 1e-9);
  const out = j.runRoute('city-ocean', 'out');
  near(ringPosition(j.where(j.start('city-ocean', 'out'), out, out.route.length / 2)), 0.5, 1e-9);
  assert.deepEqual(j.where(arrive('city-ocean', 'out'), out, 0), { place: 'ocean' });
});

// what happens to the trains when you get out: the one you came on turns round for the trip back (or, if it hasn't
// left yet, stays as it is); the other train serving this place is put at its own station
test('arriving forwards at Oceanside: your train turns for City, the climb waits at the departure station', () => {
  const a = j.arrive(arrive('city-ocean', 'out'));
  assert.deepEqual(a.turn, { leg: 'city-ocean', dir: 'back', station: 'arrival', to: 'city' });
  assert.deepEqual(a.wait, [{ leg: 'ocean-mountain', dir: 'out', station: 'departure', to: 'mountain' }]);
});

test('arriving backwards at Oceanside: your train turns for the Mountain, City\'s waits at the arrival station', () => {
  const a = j.arrive(arrive('ocean-mountain', 'back'));
  assert.deepEqual(a.turn, { leg: 'ocean-mountain', dir: 'out', station: 'departure', to: 'mountain' });
  assert.deepEqual(a.wait, [{ leg: 'city-ocean', dir: 'back', station: 'arrival', to: 'city' }]);
  // both face away from the town: each one's run leaves from Oceanside
  for (const t of [a.turn, ...a.wait]) assert.equal(j.runRoute(t.leg, t.dir).origin.place, 'ocean');
});

test('getting out before leaving: no turn, the other leg\'s train waits', () => {
  const a = j.arrive(j.getOut(j.start('city-ocean', 'out'), 'city'));
  assert.equal(a.turn, null);
  assert.deepEqual(a.wait, [{ leg: 'future-city', dir: 'back', station: 'arrival', to: 'future' }]);
  const b = j.arrive(j.getOut(j.start('ocean-mountain', 'back'), 'mountain'));
  assert.equal(b.turn, null);
  assert.deepEqual(b.wait, [{ leg: 'mountain-west', dir: 'out', station: 'departure', to: 'west' }]);
  assert.throws(() => j.arrive(j.start('city-ocean', 'out')), 'only once you\'re on foot');
});

// which platform's window a train is in at s, moving or not: what lies beyond that place stays wanted while it's there
// (a creep along the platform, or a stop and a start, doesn't drop it)
test('the platform window a train is in, whatever its speed', () => {
  const run = j.runRoute('ocean-mountain', 'out');
  assert.equal(j.windowAt(run, run.destination.platform.sFrom + 1), 'mountain');
  assert.equal(j.windowAt(run, run.stopS), 'mountain');
  assert.equal(j.windowAt(run, run.origin.platform.sTo - 1), 'ocean');
  assert.equal(j.windowAt(run, run.route.length / 2), null);
  const back = j.runRoute('ocean-mountain', 'back');
  assert.equal(j.windowAt(back, back.stopS), 'ocean');
});
