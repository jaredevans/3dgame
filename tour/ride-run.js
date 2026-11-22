// The ride runner: a ride (rides.js) taken, its vehicle carried along its own path on the ride's clock, its progress
// mapped onto the leg (rideLegS) for everything keyed to the leg, and its own set pieces played from a track in ride-s.
// The views and the director ride it as a one-car train. No three.js: it moves only what it's handed (the kit's holder,
// an Object3D, by its position and rotation), so Node can test it.
//
// A RideKit (tour/rides/index.js builds one per ride, at a standstill) =
//   { vehicle: { holder, box, seat, attitude? }, crew?, actors: Map<event id, Actor>, boardMarker, landPad?, update(f),
//     dispose() }
//   holder  rides the path (its origin on it, +z forward); the model inside it stands `ride.rest` below
//   box     the vehicle's bounds in the holder's frame; seat: where you sit, in the holder's frame (the seat view)
//   attitude { pitch: how much of the path's climb it takes (1: all; a hanging basket 0), bank: the most it rolls
//            into a turn (radians; 0, the default, for one on the ground or the water), level: below this speed (m/s)
//            its pitch and bank ease back to level (a craft lifting off or settling onto its pad) }
//   actors  the ride's set pieces (Actor as actors/index.js), by the id of the ride's event that plays each; f below
//   update(f) every frame while it's built (the vehicle's own lights and moving parts), with f.on null; riding, f is the
//            runner's; waiting at its pad (or on the one it landed on), the page's, with rideS null and here false
// f, each actor's (and the kit's) frame: { rideS, rideV, legS, dir: 'out', here: true, dt, time, on: { t, u } | null,
//   react: null, camera, train: { front, v, length }, night, sunDir } (time, camera, night and sunDir as the page
//   passes them to update(dt, env))
import { rideStep, rideLegS } from './rides.js';

const T_STEP_MAX = 0.1;
const BANK_G = 9.81, BANK_EASE = 2.5, LOOK = 3;   // m/s², 1/s, metres either side the turn is measured over
const DRONE_SIZE = 15, DRONE_MIN = 0.3;            // a vehicle this big (m) is orbited as far as a train; never nearer than this share
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));

// the one car the views and the director see: the vehicle's holder, its box, and its front and length along +z
export function vehicleCar(vehicle) {
  const b = vehicle.box;
  return { holder: vehicle.holder, box: b, front: b.max.z, length: b.max.z - b.min.z };
}

// p ({ x, z }) within r metres of where the ride waits, across the ground
export function nearRide(p, ride, r = 4) {
  if (!p || !ride) return false;
  return Math.hypot(p.x - ride.board.x, p.z - ride.board.z) <= r;
}

// the holder at ride-s s on the ride's path: on it, facing along it, pitched by `pitch` of its climb and rolled `roll`
// (radians about its nose; - rolls its left, +x, side down), in YXZ as the trains are posed (vehicles.js poseTrain)
const P = {};
export function poseVehicle(holder, ride, s, roll = 0, pitch = 1) {
  const p = ride.path.at(s, P);
  holder.position.set(p.x, p.y, p.z);
  holder.rotation.set(-p.pitch * pitch, p.yaw, roll, 'YXZ');
  return p;
}

// a kit's vehicle standing still at ride-s s (built and waiting at its pad, or after landing): as the runner poses it
// at no speed, level if it settles level
export function parkVehicle(kit, ride, s = 0) {
  const a = kit.vehicle.attitude ?? {};
  return poseVehicle(kit.vehicle.holder, ride, s, 0, (a.level ?? 0) > 0 ? 0 : a.pitch ?? 1);
}

// the ride's own set pieces through ride-s, which only grows: as events.js makeEventTrack (active, started, ended; t in
// seconds, dt clamped; u through the window), and a window crossed between one step and the next (the jet goes ~21 m a
// frame) is started, active for that step at its far end, and ended at the next, so no set piece is ever skipped
export function makeRideTrack(defs = []) {
  const running = new Map();   // id -> seconds since it started
  let prev = null;
  const out = { active: new Map(), started: [], ended: [] };
  return {
    step({ s, dt }) {
      const { active, started, ended } = out;
      active.clear(); started.length = 0; ended.length = 0;
      for (const e of defs) {
        const inside = s >= e.s0 && s <= e.s1, crossed = prev !== null && prev < e.s0 && s > e.s1;
        if (inside || crossed) {
          let t = running.get(e.id);
          if (t === undefined) { t = 0; started.push(e.id); }
          t += Math.min(dt, T_STEP_MAX);
          running.set(e.id, t);
          active.set(e.id, { t, u: clamp((s - e.s0) / Math.max(1e-9, e.s1 - e.s0), 0, 1) });
        } else if (running.delete(e.id)) ended.push(e.id);
      }
      prev = s;
      return out;
    },
  };
}

// scene: unused for now (the kit is in the scene already, built so); views (cameras.js): the seat is attached as the
// cab; audio: { engine(kind) -> { start(), stop(), set(level 0..1) } } (audio.js), or null; interior: an empty Object3D
// standing in for a cab's interior (the views show and hide it)
export function makeRideRunner({ views, audio = null, interior }) {
  let ride = null, kit = null, sound = null, state = null, roll = 0, defs = new Map(), track = null;
  const car = { holder: null, box: null, front: 0, length: 0 };
  // (the drone view orbits it nearer than a train, in proportion to its size: a car's 4.5 m, a jet's 17)
  const train = { cars: [car], spec: { name: '' }, droneScale: 1 };
  const out = { done: false, s: 0, t: 0, v: 0, legS: 0, pos: null, yaw: 0, on: null };
  const trainF = { front: null, v: 0, length: 0 };
  const f = { rideS: 0, rideV: 0, legS: 0, dir: 'out', here: true, dt: 0, time: 0, on: null, react: null, camera: null, train: trainF, night: 0, sunDir: null };
  const started = [];   // this frame's started set pieces with a shot, for the director
  const ctx = { dt: 0, legS: 0, dir: 'out', v: 0, route: null, length: 0, showpieces: [], started, tunnels: [] };
  const q = {};
  const attitude = () => ({ pitch: 1, bank: 0, level: 0, ...kit.vehicle.attitude });
  let att = null;
  // a set piece (or the kit) that throws is reported, each different error once, and the ride goes on
  const errors = new Set();
  const report = (err) => { const k = String(err?.stack ?? err); if (!errors.has(k)) { errors.add(k); console.error(err); } };

  // how far into a turn at s (yaw per metre)
  function turnAt(s) {
    const a = ride.path.at(Math.max(0, s - LOOK), q).yaw, b = ride.path.at(Math.min(ride.path.length, s + LOOK), q).yaw;
    return wrap(b - a) / (2 * LOOK);
  }
  function pose(dt) {
    const { s, v } = state;
    // banked as a glider is (paths.js laneAt), eased; both it and the climb ease to level as it slows to its pad
    const level = att.level > 0 ? clamp(v / att.level, 0, 1) : 1;
    const want = att.bank > 0 ? clamp(-Math.atan(v * v * turnAt(s) / BANK_G), -att.bank, att.bank) * level : 0;
    roll = dt > 0 ? roll + (want - roll) * (1 - Math.exp(-dt * BANK_EASE)) : want;
    return poseVehicle(kit.vehicle.holder, ride, s, roll, att.pitch * level);
  }
  function play(env, dt) {
    const on = track.step({ s: state.s, dt });
    out.on = on;
    started.length = 0;
    for (const id of on.started) { const e = defs.get(id); if (e?.shot) started.push(e); }
    f.rideS = state.s; f.rideV = state.v; f.legS = out.legS; f.dt = dt;
    if (env) { f.time = env.time; f.camera = env.camera; f.night = env.night; f.sunDir = env.sunDir; }
    trainF.v = state.v;
    for (const [id, actor] of kit.actors) {
      const a = on.active.get(id) ?? null;
      if (!a && !defs.get(id)?.always && !on.ended.includes(id)) continue;
      f.on = a;
      try { actor.update(f); } catch (err) { report(err); }
    }
    f.on = null;
    try { kit.update?.(f); } catch (err) { report(err); }
  }

  return {
    train,
    get ride() { return ride; },
    get kit() { return kit; },
    start(r, k) {
      ride = r; kit = k; att = attitude();
      Object.assign(car, vehicleCar(k.vehicle));
      train.spec.name = r.name;
      const b = k.vehicle.box;
      train.droneScale = clamp(Math.max(b.max.x - b.min.x, b.max.y - b.min.y, car.length) / DRONE_SIZE, DRONE_MIN, 1);
      state = { s: 0, t: 0, v: 0, done: false };
      defs = new Map(r.events.map((e) => [e.id, e]));
      track = makeRideTrack(r.events);
      roll = 0;
      k.vehicle.holder.visible = true;
      pose(0);
      Object.assign(out, { done: false, s: 0, t: 0, v: 0, legS: rideLegS(r, 0), pos: k.vehicle.holder.position, yaw: k.vehicle.holder.rotation.y, on: null });
      trainF.front = k.vehicle.holder.position; trainF.length = car.length;
      Object.assign(ctx, { route: r.path, length: car.length, showpieces: r.showpieces });
      // the seat is the cab: its view rides the holder at the seat (no shell to cut away: the kit's cabin is glazed)
      views.attachCab({ holder: k.vehicle.holder, seat: k.vehicle.seat, interior, clip() {} });
      views.setDriving(true);
      views.restart();
      sound = audio?.engine(r.id) ?? null;
      sound?.start();
    },
    // a frame: on along the path (dt clamped, as rideStep does) -> { done, s, t, v, legS, pos, yaw, on } (the same
    // object each frame). env: { time, camera, night, sunDir } for the set pieces
    update(dt, env = null) {
      state = rideStep(state, dt, ride);
      const p = pose(Math.min(dt, T_STEP_MAX));
      out.done = state.done; out.s = state.s; out.t = state.t; out.v = state.v; out.yaw = p.yaw;
      out.legS = rideLegS(ride, state.s);
      play(env, Math.min(dt, T_STEP_MAX));
      // (and the balloon's burners, on the ride's clock: the audio clock runs on through a stall or a hidden tab, and
      // the roar would drift from the flame, which keeps the ride's time)
      sound?.set(clamp(state.v / ride.profile.v, 0, 1), ride.burn ? ride.burn(state.t) : 0);
      return out;
    },
    // what the director is told this frame (cameras.js): the ride's own path, in ride-s, always out
    viewContext(dt) {
      ctx.dt = dt; ctx.legS = state.s; ctx.v = state.v;
      return ctx;
    },
    // the ride is over (or let go): its set pieces told so, the engine quiet, the views off the seat. The vehicle stays
    // where it is (at its landing)
    stop() {
      if (!ride) return;
      if (kit && out.on) {
        f.on = null;
        for (const id of out.on.active.keys()) { const a = kit.actors.get(id); try { a?.update(f); } catch (err) { report(err); } }
      }
      sound?.stop();
      sound = null;
      views.setDriving(false);
      ride = null; kit = null; out.on = null;
    },
  };
}
