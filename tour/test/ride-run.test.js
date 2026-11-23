// The ride runner (ride-run.js): the vehicle carried along its ride's path, the one-car stand-in the views and the
// director use, the ride's own set pieces in ride-s, and where you can board it from. Pure, no three.js: the runner only
// moves what it's handed (a holder with a position and a rotation).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { rideFor, rideLegS, RIDE_DT, burnAt } from '../rides.js';
import { vehicleCar, nearRide, makeRideTrack, makeRideRunner, poseVehicle, parkVehicle, vehicleFoot, RIDE_REACH } from '../ride-run.js';

// a stand-in for a three.js Object3D: just what the runner writes
const holder = () => ({
  position: { x: 0, y: 0, z: 0, set(x, y, z) { this.x = x; this.y = y; this.z = z; return this; } },
  rotation: { x: 0, y: 0, z: 0, order: 'XYZ', set(x, y, z, order) { Object.assign(this, { x, y, z, order }); return this; } },
  visible: false,
});
const box = (min, max) => ({ min: { x: min[0], y: min[1], z: min[2] }, max: { x: max[0], y: max[1], z: max[2] } });
const kitOf = (extra = {}) => ({
  vehicle: { holder: holder(), box: box([-1, -1.2, -2.3], [1, 0.9, 2.2]), seat: { x: 0, y: 0.3, z: 0.4 } },
  actors: new Map(), boardMarker: {}, update() {}, dispose() {}, ...extra,
});

test('the one-car stand-in: its front is the box\'s +z face, its length the box\'s depth', () => {
  const v = kitOf().vehicle, car = vehicleCar(v);
  assert.equal(car.holder, v.holder);
  assert.equal(car.box, v.box);
  assert.equal(car.front, 2.2);
  assert.ok(Math.abs(car.length - 4.5) < 1e-9);
});

test('you can board a ride within 6 m of where it waits (across the ground), not further (main.js RIDE_REACH, R22)', () => {
  const r = rideFor('future-city'), b = r.board;
  assert.equal(nearRide({ x: b.x, z: b.z }, r, 6), true);
  assert.equal(nearRide({ x: b.x + 5.9, z: b.z }, r, 6), true);
  assert.equal(nearRide({ x: b.x + 4.3, z: b.z + 4.3 }, r, 6), false);
  assert.equal(nearRide({ x: b.x, z: b.z - 6.1 }, r, 6), false);
  assert.equal(nearRide(null, r, 6), false);
});

// the jet moves ~21 m a frame at RIDE_DT: a set piece's window narrower than that must still start (and end) as it's
// crossed, not only when a frame lands inside it
test('a ride track starts its events in ride-s, a window crossed within one step included', () => {
  const tr = makeRideTrack([
    { id: 'wide', s0: 100, s1: 300 },
    { id: 'narrow', s0: 150, s1: 155 },   // narrower than a step
    { id: 'late', s0: 1000, s1: 1100 },
  ]);
  const seen = { started: [], ended: [] };
  let s = 0;
  for (let k = 0; k < 60; k++) {
    s += 21;   // the jet at the clamp: 210 m/s x 0.1 s
    const on = tr.step({ s, dt: RIDE_DT });
    for (const id of on.started) seen.started.push([id, s]);
    for (const id of on.ended) seen.ended.push([id, s]);
    if (on.started.includes('narrow')) assert.ok(on.active.has('narrow'), 'crossed: active for that step');
    for (const [, a] of on.active) assert.ok(a.u >= 0 && a.u <= 1, `u ${a.u}`);
  }
  assert.deepEqual(seen.started.map(([id]) => id), ['wide', 'narrow', 'late']);
  assert.ok(seen.ended.some(([id]) => id === 'narrow'), 'the narrow one ended too');
  const wide = seen.started.find(([id]) => id === 'wide')[1];
  assert.ok(wide >= 100 && wide <= 121, `the wide one started at ${wide}`);
  // its clock counts in seconds, dt clamped as the train's track
  const t2 = makeRideTrack([{ id: 'a', s0: 0, s1: 100 }]);
  t2.step({ s: 1, dt: 5 });
  assert.ok(Math.abs(t2.step({ s: 2, dt: 0.05 }).active.get('a').t - 0.15) < 1e-9);
});

test('posing: the holder on the path at s, facing along it, pitched and banked in YXZ as the trains are', () => {
  const r = rideFor('future-city'), h = holder(), p = r.path.at(400);
  poseVehicle(h, r, 400, 0.1);
  assert.ok(Math.abs(h.position.x - p.x) < 1e-9 && Math.abs(h.position.y - p.y) < 1e-9 && Math.abs(h.position.z - p.z) < 1e-9);
  assert.equal(h.rotation.order, 'YXZ');
  assert.ok(Math.abs(h.rotation.y - p.yaw) < 1e-9);
  assert.ok(Math.abs(h.rotation.x + p.pitch) < 1e-9);
  assert.equal(h.rotation.z, 0.1);
});

test('the runner carries the vehicle from its pad to its landing in about 90 s, its leg-s never going back', () => {
  const r = rideFor('future-city'), kit = kitOf(), calls = [];
  const views = { attachCab: (c) => calls.push(['cab', c]), setDriving: (on) => calls.push(['driving', on]), restart: () => calls.push(['restart']) };
  const sound = { level: [], start() { calls.push(['engine']); }, stop() { calls.push(['quiet']); }, set(v) { this.level.push(v); } };
  const runner = makeRideRunner({ views, audio: { engine: (kind) => { calls.push(['kind', kind]); return sound; } }, interior: {} });
  runner.start(r, kit);
  // the seat is the cab: the views ride in the vehicle's holder at its seat
  const cab = calls.find(([k]) => k === 'cab')[1];
  assert.equal(cab.holder, kit.vehicle.holder);
  assert.equal(cab.seat, kit.vehicle.seat);
  assert.equal(typeof cab.clip, 'function');
  assert.ok(calls.some(([k, on]) => k === 'driving' && on === true));
  assert.ok(calls.some(([k, kind]) => k === 'kind' && kind === 'car'));
  assert.equal(runner.train.cars.length, 1);
  assert.equal(runner.train.cars[0].holder, kit.vehicle.holder);
  assert.equal(runner.train.spec.name, 'flying car');
  let t = 0, last = -1, out;
  for (;;) {
    out = runner.update(1 / 30);
    t += 1 / 30;
    assert.ok(out.legS >= last - 1e-9, `leg-s went back at ${t.toFixed(2)} s`);
    last = out.legS;
    if (out.done || t > 200) break;
  }
  assert.ok(out.done, 'it lands');
  assert.ok(Math.abs(t - 90) < 0.5, `took ${t.toFixed(1)} s`);
  assert.ok(Math.abs(out.legS - rideLegS(r, r.path.length)) < 1e-6);
  assert.equal(out.pos, kit.vehicle.holder.position);
  assert.ok(Math.hypot(out.pos.x - r.land.x, out.pos.z - r.land.z) < 0.01, 'at its landing');
  assert.ok(sound.level.length > 0 && sound.level.every((v) => v >= 0 && v <= 1.0001));
  // the director's view of it: the ride's own path, in ride-s, going out
  const ctx = runner.viewContext(0.1);
  assert.equal(ctx.route, r.path);
  assert.equal(ctx.dir, 'out');
  assert.ok(Math.abs(ctx.legS - r.path.length) < 1e-6);
  assert.deepEqual(ctx.tunnels, []);
  assert.equal(ctx.showpieces, r.showpieces);
  assert.ok(Math.abs(ctx.length - 4.5) < 1e-9);
  runner.stop();
  assert.ok(calls.some(([k]) => k === 'quiet'));
  assert.ok(calls.some(([k, on]) => k === 'driving' && on === false));
});

test('the runner plays the ride\'s own set pieces from its own track, in ride-s, and tells an ended one so', () => {
  const r = { ...rideFor('future-city'), events: [{ id: 'show', s0: 500, s1: 520, shot: { kind: 'heli' } }] };
  const seen = [];
  const actor = { group: {}, update(f) { seen.push({ on: f.on, rideS: f.rideS, legS: f.legS, here: f.here, dir: f.dir }); } };
  const kit = kitOf({ actors: new Map([['show', actor]]) });
  const runner = makeRideRunner({ views: { attachCab() {}, setDriving() {}, restart() {} }, audio: null, interior: {} });
  runner.start(r, kit);
  let started = null;
  for (let k = 0; k < 3000 && !runner.update(1 / 30).done; k++) {
    const ctx = runner.viewContext(1 / 30);
    if (ctx.started.length) started = ctx.started[0];
  }
  assert.ok(seen.length > 0, 'updated while its window was on');
  assert.ok(seen.some((f) => f.on && f.rideS >= 500 && f.rideS <= 520 && f.here === true && f.dir === 'out'));
  assert.equal(seen[seen.length - 1].on, null, 'told once its window ended');
  assert.equal(started?.id, 'show', 'the director is told it started');
});

test('a vehicle waiting at its pad stands level if it settles level, else on its path\'s slope', () => {
  const r = rideFor('future-city');
  const flat = kitOf(), slope = kitOf();
  flat.vehicle.attitude = { level: 8 };
  parkVehicle(flat, r, 0);
  parkVehicle(slope, r, 0);
  assert.ok(Math.abs(flat.vehicle.holder.rotation.x) < 1e-12);
  assert.ok(Math.abs(slope.vehicle.holder.rotation.x + r.path.at(0).pitch) < 1e-9);
  assert.ok(Math.abs(flat.vehicle.holder.position.y - r.board.y) < 1e-9);
});

test('the drone orbits a small vehicle nearer than a train, in proportion to its size', () => {
  const runner = makeRideRunner({ views: { attachCab() {}, setDriving() {}, restart() {} }, interior: {} });
  runner.start(rideFor('future-city'), kitOf());
  assert.ok(Math.abs(runner.train.droneScale - 0.3) < 1e-9, `${runner.train.droneScale}`);
  const big = kitOf();
  big.vehicle.box = box([-8, -1, -8.5], [8, 5, 8.5]);
  runner.start(rideFor('future-city'), big);
  assert.equal(runner.train.droneScale, 1);
});

// the balloon's burners roar as its flame burns: the engine is told how hard they burn on the ride's own clock (its
// seconds clamped as the ride's are), not the audio clock, which runs on through a stall or a hidden tab
test('the runner tells the engine the burners\' level on the ride\'s clock, through a stall too; 0 for a ride with none', () => {
  const run = (leg, steps) => {
    const sets = [];
    const sound = { start() {}, stop() {}, set(level, burn) { sets.push([level, burn]); } };
    const runner = makeRideRunner({ views: { attachCab() {}, setDriving() {}, restart() {} }, audio: { engine: () => sound }, interior: {} });
    runner.start(rideFor(leg), kitOf());
    const ts = [];
    for (const dt of steps) ts.push(runner.update(dt).t);
    runner.stop();
    return { sets, ts };
  };
  // a stall of 5 s counts as RIDE_DT, as the ride's own clock (and the kit's flame) does
  const steps = [...Array(30).fill(1 / 30), 5, ...Array(60).fill(1 / 30)];
  const { sets, ts } = run('ocean-mountain', steps);
  assert.equal(sets.length, steps.length);
  for (let i = 0; i < sets.length; i++) assert.ok(Math.abs(sets[i][1] - burnAt(ts[i])) < 1e-12, `burn at ${ts[i]}`);
  assert.ok(sets.some(([, b]) => b > 0.9), 'the burners never fire');
  assert.ok(Math.abs(ts[30] - ts[29] - RIDE_DT) < 1e-9);
  assert.equal(rideFor('ocean-mountain').burn, burnAt);
  // a ride with no burners: always 0
  assert.ok(run('future-city', Array(30).fill(1 / 30)).sets.every(([, b]) => b === 0));
});

test('the reach is 6 m (owner\'s ruling R22), and nearRide takes it by default', () => {
  assert.equal(RIDE_REACH, 6);
  const r = rideFor('future-city'), b = r.board;
  assert.equal(nearRide({ x: b.x + 5.9, z: b.z }, r), true);
  assert.equal(nearRide({ x: b.x + 6.1, z: b.z }, r), false);
});

test('a vehicle\'s footprint is its own foot if it has one (the balloon\'s basket), else its box', () => {
  const v = kitOf().vehicle;
  assert.equal(vehicleFoot(v), v.box);
  const foot = { min: { x: -1.75, z: -0.85 }, max: { x: 1.75, z: 0.85 } };
  assert.equal(vehicleFoot({ ...v, foot }), foot);
});

test('the conductor rides along: hidden in the seat view (you see through his eyes), seen in the others, gone once you step off', () => {
  const rider = { visible: true }, kit = kitOf(), calls = [];
  kit.vehicle.rider = rider;
  let cab = null;
  const views = { attachCab: (c) => { cab = c; }, setDriving: (on) => calls.push(on), restart() {} };
  const runner = makeRideRunner({ views, interior: {} });
  runner.start(rideFor('future-city'), kit);
  cab.clip(true);    // the seat view
  assert.equal(rider.visible, false);
  cab.clip(false);   // chase or director
  assert.equal(rider.visible, true);
  runner.stop();     // stepped off: you're the figure on foot again
  assert.equal(rider.visible, false);
  // a ride with no conductor goes on as before
  const bare = makeRideRunner({ views: { attachCab: (c) => { c.clip(true); c.clip(false); }, setDriving() {}, restart() {} }, interior: {} });
  bare.start(rideFor('future-city'), kitOf());
  bare.stop();
});

test('the director may look down on the balloon from close by, and on no other ride (owner, 2026-11-22)', () => {
  for (const leg of ['city-ocean', 'ocean-mountain', 'mountain-west', 'west-future', 'future-city']) {
    const r = rideFor(leg), runner = makeRideRunner({ views: { attachCab() {}, setDriving() {}, restart() {} }, interior: {} });
    assert.equal(r.overhead, r.id === 'balloon');
    runner.start(r, kitOf());
    assert.equal(runner.viewContext(0.1).overhead, r.id === 'balloon');
    runner.stop();
  }
});
