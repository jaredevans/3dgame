// The stagecoach (mountain-west): the Frontier kit's stagecoach, drawn by two saddled horses at a gallop along its own
// dirt road (world-data.js coachRoad: the road and the bench cut for it are the leg's, drawn with it). Its driver (the
// kit's prospector) sits on the box at the front, on its right; you sit beside him on its left, up on the roof's front.
// Its wheels turn with its speed and its front axle steers into the bends; its body rocks and jolts on its springs
// over the running gear, which stays on the road; its wheels throw up dust behind it. Waiting in the Mountain's station
// yard, its team stands idle. The gang is its set piece (gang.js).
import * as THREE from 'three';
import { crewFigure, conductorFigure, sitOn } from './crew.js';
import { buildGang } from './gang.js';
import { COACH_TEAM } from './coach-plan.js';
import { makeSpray } from './spray.js';
import { clipFor, HORSE } from '../actors/clips.js';

const COACH = { key: 'stagecoach', params: { colorway: 'saloon-red', load: 'baggage' } };
// the coach, measured (2 x 2.79 x 4.5 m, +z forward, +x its left): the driver's box at the front, its cushion's top
// 2.06 m up from z 1.1 to 1.5, the footboard below it (1.5 m up, ahead to z 1.8); the roof's deck at 2.44 m behind it
const BOX = { top: 2.06, z: 1.22, x: 0.38 };
// your eyes, sitting on the box's left (the driver on its right, as on a Western coach), looking ahead over the team
const SEAT = { x: BOX.x, y: BOX.top + 0.78, z: BOX.z + 0.08 };
// the team: a pair abreast, ahead of the coach's front on a pole from its front axle
const TEAM = { ...COACH_TEAM, pole: [2.0, 4.9] };
const WHEELS = ['wheel-fl', 'wheel-fr', 'wheel-rl', 'wheel-rr'];
const RUNNING = new Set(['wheel-rl', 'wheel-rr', 'steer-front']);   // the running gear: on the road, not on the springs
// its body on its springs at speed: how far it bobs (m), rocks side to side and pitches (radians), and how hard it jolts
const SPRING = { bob: 0.035, roll: 0.022, pitch: 0.014, jolt: 0.03 };
const STEER = { base: 2.9, most: 0.4, ease: 4 };   // the front axle turned to its turn's radius (its wheelbase, m), at most, eased
const DUST = { per: 30, life: 1.6 };                // dust off each rear wheel a second, at cruise
// the reins, from your hands (the conductor's: you help the driver with the team) to each horse's bit, taut at a gallop
const REIN = { r: 0.012, color: '#3b2a1c' };

// ctx: the registry's (rides/index.js)
export async function buildCoach({ ride, slicer, still, kit, terrain, loadAnimal, warn }) {
  await slicer.frame();
  await still();
  const coach = await kit('west', COACH.key, COACH.params);   // (a vehicle that can't be loaded fails the build)
  coach.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  const holder = new THREE.Group();
  holder.name = 'stagecoach';
  const rig = new THREE.Group();   // the coach and its team, on the ground (the path rides ride.rest over it)
  rig.name = 'stagecoach rig';
  rig.position.y = -ride.rest;
  // its body (everything but the running gear) in a group of its own, rocked on its springs
  const body = new THREE.Group();
  body.name = 'stagecoach body';
  for (const c of [...coach.children]) if (!RUNNING.has(c.name)) body.add(c);
  coach.add(body);
  rig.add(coach);
  holder.add(rig);
  const wheels = WHEELS.map((n) => coach.getObjectByName(n)).filter(Boolean).map((w) => {
    const b = new THREE.Box3().setFromObject(w);
    return { w, r: Math.max(0.2, (b.max.y - b.min.y) / 2) };
  });
  const steer = coach.getObjectByName('steer-front');
  // the pole between the team, from the front axle
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.05, TEAM.pole[1] - TEAM.pole[0], 6).rotateX(Math.PI / 2)
    .translate(0, 0.75, (TEAM.pole[0] + TEAM.pole[1]) / 2), new THREE.MeshStandardMaterial({ color: '#6e4b2e', roughness: 0.85 }));
  pole.name = 'coach pole';
  pole.castShadow = true;
  rig.add(pole);

  // the team: left out (the coach going on, horseless) if the horses can't be had
  let team = [];
  await slicer.frame();
  await still();
  try {
    const kind = await loadAnimal('saddled-horse-da86d3');
    team = [-1, 1].map((sx) => {
      const h = kind.make();
      h.object.name = 'coach horse';
      h.object.position.set(sx * TEAM.x, 0, TEAM.z);
      rig.add(h.object);
      h.play('Idle', { fade: 0 });
      return h;
    });
  } catch (err) { if (err?.dropped) throw err; warn('team', err); }

  // its driver on the box, on its right (Polyfork's humanoid clips: Sitting); left out, the coach going on, if he can't be had
  await slicer.frame();
  await still();
  const driver = await crewFigure({ kit, warn }, { kitKey: 'west', key: 'prospector-character', params: { age: 'adult' }, clip: 'Sitting', name: 'coach driver', what: 'driver' });
  if (driver) sitOn(driver.figure, body, BOX.top, BOX.z, -BOX.x);
  holder.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(holder);   // (at the origin, unturned: in the holder's own frame; the team in it)
  // you, the conductor, beside him on the box's left (seen from outside: ride-run.js)
  await slicer.frame();
  await still();
  const rider = await conductorFigure({ kit, warn });
  if (rider) sitOn(rider.figure, body, BOX.top, BOX.z, BOX.x);
  // the reins in your hands: your right to the right horse, your left to the left one (+x, the coach's left); drawn
  // only while you ride (no one holds them as it waits in the yard)
  const reins = [];
  if (rider && team.length) {
    const geo = new THREE.CylinderGeometry(REIN.r, REIN.r, 1, 4, 1, true).translate(0, 0.5, 0).rotateX(Math.PI / 2);   // 1 m along +z
    const mat = new THREE.MeshStandardMaterial({ color: REIN.color, roughness: 0.9 });
    ['RightHand', 'LeftHand'].forEach((n, i) => {
      const hand = rider.figure.getObjectByName(n), bit = team[i]?.object.getObjectByName('Jaw') ?? team[i]?.object.getObjectByName('Head');
      if (!hand || !bit) return;
      const mesh = new THREE.Mesh(geo, mat);
      mesh.name = 'rein';
      mesh.visible = false;
      holder.add(mesh);
      reins.push({ hand, bit, mesh });
    });
  }

  // the dust its wheels throw up, in the world's frame (left hanging where it was thrown)
  await slicer.frame();
  await still();
  const dust = makeSpray({ count: 360, size: 1.3, life: DUST.life, gravity: 0.3, name: 'stagecoach dust', color: '#c8ab80', opacity: 0.55, air: 1.8, floor: -Infinity });
  const marker = new THREE.Group();   // (its road is the leg's: here, only what it throws up)
  marker.name = 'stagecoach dust';
  marker.add(dust.points);

  // its gang: left out, the ride going on without it, if the horses can't be had
  const actors = new Map();
  try { actors.set('gang', await buildGang({ ride, slicer, still, kit, terrain, loadAnimal, warn })); } catch (err) { if (err?.dropped) throw err; warn('gang', err); }

  const gait = { name: 'Idle', timeScale: 1, fade: 0.4 }, p = new THREE.Vector3();
  const A = new THREE.Vector3(), B = new THREE.Vector3(), Z = new THREE.Vector3(0, 0, 1);
  let t = 0, steerNow = 0, lastYaw = null, dustDue = 0;
  return {
    vehicle: { holder, box, seat: new THREE.Vector3(SEAT.x, SEAT.y - ride.rest, SEAT.z), rider: rider?.figure ?? null },
    crew: [],
    actors,
    boardMarker: marker,
    update(f) {
      const dt = f.dt;
      t += dt;
      driver?.anim?.update(dt);
      if (f.rideS !== null) rider?.anim?.update(dt);
      const v = f.rideS === null ? 0 : f.rideV, k = Math.min(1, Math.max(0, v / ride.profile.v));
      // the team: standing, trotting off, galloping
      if (team.length) clipFor(v, team[0].clips, HORSE, gait);
      for (let i = 0; i < team.length; i++) { team[i].play(gait.name, gait); team[i].update(dt); }
      // the wheels turn with its way along (rolling forward: its tops going ahead); the front axle steers into its turn
      for (let i = 0; i < wheels.length; i++) wheels[i].w.rotation.x += v * dt / wheels[i].r;
      const yaw = holder.rotation.y;
      if (f.rideS === null || lastYaw === null || v < 0.5) lastYaw = yaw;
      const turn = Math.atan2(Math.sin(yaw - lastYaw), Math.cos(yaw - lastYaw)) / Math.max(1e-3, v * dt);
      lastYaw = yaw;
      const want = Math.max(-STEER.most, Math.min(STEER.most, Math.atan(turn * STEER.base)));
      steerNow += (want - steerNow) * (1 - Math.exp(-dt * STEER.ease));
      if (steer) steer.rotation.y = steerNow;
      // its body on its springs: bobbing and rocking with its speed, a jolt now and then
      const jolt = Math.max(0, Math.sin(t * 2.3) * Math.sin(t * 5.1 + 1) - 0.6) * 2.5;
      body.position.y = k * (SPRING.bob * Math.sin(t * 9.4) * Math.sin(t * 3.1 + 0.5) + SPRING.jolt * jolt);
      body.rotation.z = k * SPRING.roll * Math.sin(t * 3.3 + 1.1);
      body.rotation.x = k * SPRING.pitch * Math.sin(t * 4.6) - k * SPRING.jolt * jolt * 0.3;
      // dust off its rear wheels
      if (f.rideS !== null) {
        holder.updateMatrixWorld(true);
        dustDue += dt * DUST.per * 2 * k;
        while (dustDue >= 1) {
          dustDue -= 1;
          const sx = Math.random() < 0.5 ? -1 : 1;
          p.set(sx * 0.85, -ride.rest + 0.15, -2.2).applyMatrix4(holder.matrixWorld);
          const o = 0.4 + Math.random() * 0.8, a = Math.random() * 2 * Math.PI;
          dust.emit(p.x, p.y, p.z, Math.cos(a) * o, 0.4 + Math.random() * 0.9, Math.sin(a) * o, DUST.life * (0.7 + Math.random() * 0.6), true);
        }
        // the reins, hand to bit (both found in the holder's frame, its matrices brought up to date above)
        for (const r of reins) {
          holder.worldToLocal(r.hand.getWorldPosition(A));
          holder.worldToLocal(r.bit.getWorldPosition(B));
          B.sub(A);
          const len = B.length();
          r.mesh.position.copy(A);
          r.mesh.quaternion.setFromUnitVectors(Z, B.divideScalar(len || 1));
          r.mesh.scale.set(1, 1, len);
          r.mesh.visible = true;
        }
      } else for (const r of reins) r.mesh.visible = false;
      dust.update(dt);
    },
    dispose() { dust.dispose(); },
  };
}
