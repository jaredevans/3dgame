// The speedboat's sea life (owner, 2026-11-23): dolphins racing it, three either side alongside its hull, leaping in
// turn as it runs along the coast; and later a humpback (whale-model.js) breaching beside it, crashing down in a great
// splash just off its side as it races past. Each is a ride set piece (ride-run.js), shown only through its event's
// window, posed off the boat's path in ride-s.
import * as THREE from 'three';
import { SEA_LEVEL } from '../world-data.js';
import { leapAt } from '../actors/paths.js';
import { makeWhale } from '../actors/whale-model.js';
import { breachAt, breachSecs } from '../actors/sea-moves.js';
import { makeSpray } from './spray.js';
import { BOAT_DOLPHINS, BOAT_WHALE } from '../rides.js';


export async function buildBoatDolphins({ ride, slicer, loadAnimal }) {
  const group = new THREE.Group();
  group.name = 'boat dolphins';
  await slicer.frame();
  const kind = await loadAnimal('dolphin-base');
  const pod = BOAT_DOLPHINS.pod.map(([ahead, out], i) => {
    const a = kind.make();
    a.object.visible = false;
    a.play('Swim fast', { fade: 0, timeScale: 1.6 });
    group.add(a.object);
    return { a, ahead, out, phase: i * 1.7, air: false };
  });
  const spray = makeSpray({ count: 260, size: 0.6, life: 0.9, gravity: 9.8, name: 'boat dolphins spray' });
  group.add(spray.points);
  const P = {}, L = {};
  return {
    group,
    update(f) {
      if (!f.on) { for (const d of pod) d.a.object.visible = false; spray.update(f.dt ?? 0); return; }
      const t = f.on.t, s = f.rideS, v = f.rideV ?? ride.profile.v;
      for (let i = 0; i < pod.length; i++) {
        const d = pod[i];
        ride.path.offsetAt(Math.min(ride.path.length, s + d.ahead), d.out + BOAT_DOLPHINS.weave * Math.sin(t * 1.3 + d.phase), P);
        leapAt(t, i, pod.length, v, L);
        if (d.air && !L.air) spray.burst(P.x, SEA_LEVEL, P.z, 24, [2, 4.5], [0.4, 1.8], 0.4);
        d.air = L.air;
        d.a.object.visible = true;
        d.a.object.position.set(P.x, SEA_LEVEL + L.y, P.z);
        d.a.object.rotation.set(-L.pitch, P.yaw, 0, 'YXZ');
        d.a.update(f.dt);
      }
      spray.update(f.dt);
    },
  };
}

export async function buildBoatWhale({ ride, slicer }) {
  const group = new THREE.Group();
  group.name = 'boat whale';
  await slicer.frame();
  const w = makeWhale();
  w.object.visible = false;
  group.add(w.object);
  const spray = makeSpray({ count: 700, size: 1.2, life: 2.2, gravity: 7, name: 'boat whale spray', floor: SEA_LEVEL - 0.5 });
  group.add(spray.points);
  // it begins as the boat is this far short of it, so it comes down as the boat draws level
  const lead = ride.profile.v * breachSecs() * BOAT_WHALE.down;
  const P = {}, B = {};
  ride.path.offsetAt(BOAT_WHALE.at, BOAT_WHALE.out, P);
  const spot = { x: P.x, z: P.z, yaw: P.yaw };
  let lastY = -10;
  return {
    group,
    update(f) {
      if (!f.on) { w.object.visible = false; lastY = -10; spray.update(f.dt ?? 0); return; }
      const tb = (f.rideS - (BOAT_WHALE.at - lead)) / Math.max(1, f.rideV ?? ride.profile.v);
      breachAt(tb, B);
      w.object.visible = B.on;
      if (B.on) {
        // along the boat's way, rolling over towards it as it falls
        const x = spot.x + Math.sin(spot.yaw) * B.along, z = spot.z + Math.cos(spot.yaw) * B.along;
        w.object.position.set(x, SEA_LEVEL + B.y, z);
        w.object.rotation.set(-B.pitch, spot.yaw, -B.roll, 'YXZ');
        w.flukes.rotation.x = Math.sin(tb * 6) * 0.25;
        if (lastY < -1.5 && B.y >= -1.5) spray.burst(x, SEA_LEVEL, z, 160, [3, 8], [1, 4], 2.5);
        if (B.u > 0.5 && lastY > 0 && B.y <= 0) spray.burst(x, SEA_LEVEL, z, 420, [5, 12], [3, 9], 5);
        lastY = B.y;
      }
      spray.update(f.dt);
    },
  };
}
