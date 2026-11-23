// Two unlimited hydroplanes racing a course along the Seaside Excursion's coast (owner, 2026-11-23): its laps and
// timing are hydro-plan.js's, the boats hydroplane-model.js's. Each skims along nose up on its sponsons, chattering over
// the water and leaning into the turns, throwing a rooster tail: water flung up from its stern that hangs in a high arc
// far behind it as it races on, falling back in a long way astern (thrown straight up, so its own speed draws the arc);
// a fan of spray off each sponson's tip, and a wake of foam lying on the water behind. An `always` actor: it races
// wherever you are, and is timed to you going out along the coast (on the train or the speedboat).
import * as THREE from 'three';
import { SEA_LEVEL } from '../world-data.js';
import { makeSpray } from '../rides/spray.js';
import { shoreTable } from './paths.js';
import { makeHydroplane } from './hydroplane-model.js';
import { HYDRO, hydroCourse, raceStep, duelGap } from './hydro-plan.js';

const SEA = 1;
const BOATS = [
  { livery: { hull: '#f4f3ee', trim: '#d0202a', cowl: '#d0202a', number: '7' }, side: -HYDRO.sub, phase: 0 },
  { livery: { hull: '#1d3f8f', trim: '#f2c230', cowl: '#f2c230', number: '21', ink: '#f2c230' }, side: HYDRO.sub, phase: 2.1 },
];
// the rooster tail: particles a metre of the way; flung up (m/s, at full speed: less, slower), back and out a little;
// the sponsons' fans; the wake's foam. Its ride: m over the water, nose up (radians), chatter (m, radians, Hz)
const TAIL = { perM: 14, up: [12, 19], back: [0, 7], out: 2.2, life: 4 };
const FAN = { perM: 1.2, up: [1.5, 4], out: [4, 8], life: 1.1 };
const FOAM = { perM: 0.5, life: 7, spread: 1.4 };
const RIDE = { lift: 0.18, nose: 0.045, chatter: [0.05, 0.012, 21], lean: 0.22 };
// the director's place by the leader (m out to sea, ahead of it, up), and how far behind it it looks: back across the
// two of them along their rooster tails
const WATCH = { out: 42, ahead: 24, up: 8, behind: 10 };
const SEEN = 900;   // m: further than this from the camera, a boat can't be made out (the race may be put right)

async function buildHydroplanes({ leg, route, def, terrain, slicer }) {
  const group = new THREE.Group();
  group.name = `hydroplanes ${leg}`;
  await slicer.frame();
  const shore = shoreTable(route, terrain.heightAt, SEA, 0, route.length, { step: 10 });
  await slicer.frame();
  const course = hydroCourse(route, shore, SEA);
  const boats = BOATS.map((b) => {
    const m = makeHydroplane(b.livery);
    m.object.rotation.order = 'YXZ';
    group.add(m.object);
    return { ...b, m, last: null };
  });
  await slicer.frame();
  const tail = makeSpray({ count: 7000, size: 2.1, life: TAIL.life, gravity: 9.8, opacity: 0.85, name: 'hydroplanes rooster tails' });
  const fan = makeSpray({ count: 500, size: 0.7, life: FAN.life, gravity: 9.8, name: 'hydroplanes spray' });
  const foam = makeSpray({ count: 700, size: 2.6, life: FOAM.life, gravity: 0, opacity: 0.55, name: 'hydroplanes wake', floor: SEA_LEVEL - 5 });
  group.add(tail.points, fan.points, foam.points);
  const st = { tau: Math.random() * course.lap, t: 0, k: 1, timed: false };
  const P = {}, Q = {}, w = new THREE.Vector3(), frustum = new THREE.Frustum(), m4 = new THREE.Matrix4(), ball = new THREE.Sphere();
  // whether neither boat's place at race time `a` nor at `b` can be seen from the camera
  const unseen = (cam, a, b) => {
    if (!cam) return true;
    cam.updateMatrixWorld();
    frustum.setFromProjectionMatrix(m4.multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse));
    for (const tau of [a, b]) {
      for (const lag of [0, HYDRO.duel.gap + HYDRO.duel.swing]) {
        course.at(tau - lag, 0, Q);
        ball.center.set(Q.x, SEA_LEVEL + 6, Q.z); ball.radius = 60;
        if (ball.center.distanceTo(cam.position) < SEEN && frustum.intersectsSphere(ball)) return false;
      }
    }
    return true;
  };
  const rnd = (lo, hi) => lo + Math.random() * (hi - lo);
  // the director's place to watch them from, going out along the coast (events.js: its shot looks at 'focus'): out on
  // the leader's seaward side, ahead of it, looking back across the two of them along their rooster tails, the shore
  // beyond
  const follow = { pos: new THREE.Vector3(), at: new THREE.Vector3() };
  const actor = {
    group, follow: null,
    update(f) {
      const dt = Math.min(f.dt ?? 0, 0.1);
      raceStep(st, course, { dt, legS: f.legS ?? null, dir: f.dir ?? null, v: f.train?.v ?? 0, ride: !!f.ride, canJump: (a, b) => unseen(f.camera, a, b) });
      const near = f.camera?.position;
      for (let i = 0; i < boats.length; i++) {
        const b = boats[i], o = b.m.object;
        course.at(st.tau - (i ? duelGap(st.t) : 0), b.side, P);
        const v = P.v * st.k, t = st.t + b.phase;
        const lean = Math.max(-RIDE.lean, Math.min(RIDE.lean, Math.atan(v * v * P.bend / 9.8) * 0.5));
        o.position.set(P.x, SEA_LEVEL + RIDE.lift + RIDE.chatter[0] * Math.sin(t * RIDE.chatter[2] * 2 * Math.PI), P.z);
        o.rotation.set(-(RIDE.nose + RIDE.chatter[1] * Math.sin(t * 17)), P.yaw, -lean);
        // the spray: per metre come since the last frame (none if it jumped, or it's too far off to be seen)
        const moved = b.last ? Math.hypot(P.x - b.last.x, P.z - b.last.z) : 0;
        b.last = b.last ?? {};
        b.last.x = P.x; b.last.z = P.z;
        if (moved <= 0 || moved > v * dt * 2 + 1 || (near && near.distanceTo(o.position) > 2500)) continue;
        o.updateMatrixWorld();
        const fx = Math.sin(P.yaw), fz = Math.cos(P.yaw), lx = Math.cos(P.yaw), lz = -Math.sin(P.yaw), pace = Math.min(1, v / HYDRO.top);
        w.copy(b.m.stern).applyMatrix4(o.matrixWorld);
        for (let n = Math.round(moved * TAIL.perM * pace); n > 0; n--) {
          // (strewn back along the way it came this frame, so the tail is unbroken)
          const back = Math.random() * moved, up = rnd(...TAIL.up) * pace, aft = rnd(...TAIL.back), out = rnd(-TAIL.out, TAIL.out);
          tail.emit(w.x - fx * back, w.y, w.z - fz * back, -fx * aft + lx * out, up, -fz * aft + lz * out, TAIL.life * rnd(0.85, 1.1));
        }
        for (let n = Math.round(moved * FOAM.perM); n > 0; n--) {
          const back = Math.random() * moved, s = rnd(-FOAM.spread, FOAM.spread);
          foam.emit(w.x - fx * back + lx * s, SEA_LEVEL + 0.05, w.z - fz * back + lz * s, lx * s * 0.6, 0, lz * s * 0.6, FOAM.life * rnd(0.7, 1.1), false);
        }
        for (const [k, bow] of b.m.bows.entries()) {
          w.copy(bow).applyMatrix4(o.matrixWorld);
          const side = k ? 1 : -1;
          for (let n = Math.round(moved * FAN.perM * pace); n > 0; n--) {
            const o2 = rnd(...FAN.out);
            fan.emit(w.x, SEA_LEVEL + 0.1, w.z, lx * side * o2 + fx * v * 0.25, rnd(...FAN.up), lz * side * o2 + fz * v * 0.25, FAN.life * rnd(0.7, 1.1));
          }
        }
      }
      tail.update(dt); fan.update(dt); foam.update(dt);
      const lead = boats[0].m.object, y = lead.rotation.y, fx = Math.sin(y), fz = Math.cos(y), lx = Math.cos(y), lz = -Math.sin(y);
      follow.pos.set(lead.position.x + lx * WATCH.out + fx * WATCH.ahead, SEA_LEVEL + WATCH.up, lead.position.z + lz * WATCH.out + fz * WATCH.ahead);
      follow.at.set(lead.position.x - fx * WATCH.behind, SEA_LEVEL + 3, lead.position.z - fz * WATCH.behind);
      actor.follow = f.here && f.dir === 'out' && f.on ? follow : null;
    },
  };
  return actor;
}

export const hydro = { hydroplanes: buildHydroplanes };
