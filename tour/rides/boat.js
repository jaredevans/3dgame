// The speedboat (city-ocean): Polyfork's Caique Fishing Boat, run flat out along the coast. Its cuddy (the long low
// cabin) rather than its wheelhouse, whose glazing is paint: so its captain, the coast kit's fisherman, stands in the
// open behind it at a wheel built here, seen from outside; no mast or sail, a motor boat's low line, so the seat on the
// cuddy's roof sees ahead over the bow (and the octopus coming up to the left, its side). At speed it
// rides up out of the water, its bow lifting, pitching and rolling on the swell, throwing spray from its bow and
// leaving a wake of foam; through the octopus's window it swerves hard away to its right and back (rides.js swerveAt),
// heeling into the turn. Its jetties are the places' own (walkways.js). The octopus is its set piece (octopus.js).
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { crewFigure, conductorFigure, sitOn } from './crew.js';
import { SEA_LEVEL } from '../world-data.js';
import { swerveAt } from '../rides.js';
import { buildOctopus } from './octopus.js';
import { makeSpray } from './spray.js';

const BOAT = { id: 'caique-fishing-boat-262c24', params: { colorway: 'aegean-blue', deckhouse: 'cuddy', mast: 'none', sail: 'none', whitewash: 0.2 } };
const FLOAT = -0.05;   // the model's origin this far under the surface at rest: its boot-top on the waterline
// you, sitting up on the front of the cuddy's roof (1.45 m up), on its left: lower, on the hatch, the foredeck's rising
// sheer and the stem head filled half the view; the captain on the after deck (0.7 m up) behind the cuddy, at a wheel
// on a post in front of him
const SEAT = { x: 0.45, y: 2.3, z: -0.1 };
const ROOF = 1.45;   // the cuddy's roof, where you (the conductor) sit
const HELM = { z: -2.25, deck: 0.7, wheel: { z: -1.9, y: 1.62, r: 0.32 } };
// at cruise: how far it rides up, its bow's lift (radians), and its pitching and rolling on the swell; at its jetty
// it rocks a little
const RIDE = { lift: 0.16, trim: 0.055, pitch: 0.018, roll: 0.03, bob: 0.07, rest: { bob: 0.03, roll: 0.02, pitch: 0.008 } };
// its wake: foam left behind its stern either side, drifting out and fading; its bow throwing spray out to both sides
const WAKE = { per: 70, life: 2.4, out: 1.6 }, BOW = { per: 55, life: 0.7 };

// a ship's wheel on its post: a rim, eight spokes and their handles, its hub, on a pedestal from the deck
function wheel() {
  const W = HELM.wheel, parts = [];
  parts.push(new THREE.TorusGeometry(W.r, 0.025, 6, 20));
  for (let i = 0; i < 8; i++) {
    const a = (i * Math.PI) / 4, sp = new THREE.CylinderGeometry(0.012, 0.012, W.r * 2 + 0.16, 5);
    parts.push(sp.rotateZ(a));
  }
  parts.push(new THREE.CylinderGeometry(0.05, 0.05, 0.08, 10).rotateX(Math.PI / 2));
  const rim = mergeGeometries(parts.map((g) => g.toNonIndexed()));
  for (const g of parts) g.dispose();
  rim.translate(0, W.y, W.z);
  const post = new THREE.CylinderGeometry(0.06, 0.09, W.y - HELM.deck, 8).translate(0, HELM.deck + (W.y - HELM.deck) / 2, W.z + 0.12);
  const g = mergeGeometries([rim, post.toNonIndexed()]);
  rim.dispose(); post.dispose();
  const m = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ color: '#7a5a3a', roughness: 0.7, flatShading: true }));
  m.name = 'wheel';
  m.castShadow = true;
  return m;
}

// ctx: the registry's (rides/index.js)
export async function buildBoat({ ride, slicer, still, cdnPart, loadAnimal, kit, warn }) {
  await slicer.frame();
  await still();
  const model = await cdnPart(BOAT.id, BOAT.params);   // (a vehicle that can't be loaded fails the build)
  model.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  const holder = new THREE.Group();
  holder.name = 'speedboat';
  const hull = new THREE.Group();   // (rocked at its jetty, under the holder; riding, the holder itself pitches and rolls)
  hull.name = 'speedboat hull';
  hull.position.y = -ride.rest + FLOAT;   // the path is on the sea's surface
  hull.add(model, wheel());
  holder.add(hull);
  // its captain, standing at the wheel (Polyfork's humanoid clips: Idle); left out, the boat going on, if he can't be had
  let anim = null;
  await slicer.frame();
  await still();   // (the captain made and his clips put on: only where it may land)
  const captain = await crewFigure({ kit, warn }, { kitKey: 'ocean', key: 'fisherman', params: { age: 'adult', build: 1.05 }, name: 'captain' });
  if (captain) {
    captain.figure.position.set(0, HELM.deck, HELM.z);
    hull.add(captain.figure);
    anim = captain.anim;
  }
  holder.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(holder);   // (at the origin, unturned: in the holder's own frame)
  // you, the conductor, sitting up on the cuddy's roof (seen from outside: ride-run.js)
  await slicer.frame();
  await still();
  const rider = await conductorFigure({ kit, warn });
  if (rider) sitOn(rider.figure, hull, ROOF, SEAT.z, SEAT.x);

  // the wake and spray, in the world's frame (left where they were thrown as the boat runs on)
  await slicer.frame();
  await still();
  const wake = makeSpray({ count: 520, size: 1.4, life: WAKE.life, gravity: 0, name: 'speedboat wake', opacity: 0.85 });
  const bow = makeSpray({ count: 160, size: 0.55, life: BOW.life, gravity: 9.8, name: 'speedboat spray' });
  const marker = new THREE.Group();   // (its jetty is the City's own: here, only what it throws up)
  marker.name = 'speedboat wake';
  marker.add(wake.points, bow.points);

  // its set piece: left out, the ride going on without it (and without the swerve), if the octopus can't be had
  const actors = new Map();
  try { actors.set('octopus', await buildOctopus({ ride, slicer, still, loadAnimal })); } catch (err) { if (err?.dropped) throw err; warn('octopus', err); }
  const octopus = actors.has('octopus');

  const sw = { lateral: 0, yaw: 0, bank: 0 }, p = new THREE.Vector3();
  let t = 0, wakeDue = 0, bowDue = 0;
  // a point of the hull (its own frame) in the world's, into p
  const at = (x, y, z) => p.set(x, y, z).applyMatrix4(hull.matrixWorld);
  return {
    vehicle: { holder, box, seat: new THREE.Vector3(SEAT.x, SEAT.y - ride.rest + FLOAT, SEAT.z), rider: rider?.figure ?? null },
    crew: [],
    actors,
    boardMarker: marker,
    update(f) {
      const dt = f.dt;
      t += dt;
      anim?.update(dt);
      if (f.rideS === null) {
        // waiting at its jetty (or where it landed): rocking gently
        hull.rotation.set(RIDE.rest.pitch * Math.sin(t * 0.9), 0, RIDE.rest.roll * Math.sin(t * 0.7 + 1));
        hull.position.y = -ride.rest + FLOAT + RIDE.rest.bob * Math.sin(t * 1.1);
        wake.update(dt); bow.update(dt);
        return;
      }
      // riding: the runner has just put the holder on its path; the swerve, the lift, the bow's trim and the swell on it
      hull.rotation.set(0, 0, 0);
      hull.position.y = -ride.rest + FLOAT;
      const k = Math.min(1, Math.max(0, f.rideV / ride.profile.v));
      if (octopus) swerveAt(f.rideS, sw); else sw.lateral = sw.yaw = sw.bank = 0;
      const yaw = holder.rotation.y;
      holder.position.x += Math.cos(yaw) * sw.lateral;
      holder.position.z -= Math.sin(yaw) * sw.lateral;
      holder.position.y += RIDE.lift * k + RIDE.bob * k * Math.sin(t * 2.3) * Math.sin(t * 0.7);
      holder.rotation.y = yaw + sw.yaw;
      holder.rotation.x += -RIDE.trim * k + RIDE.pitch * k * Math.sin(t * 2.3 + 0.4);
      holder.rotation.z += sw.bank + RIDE.roll * k * Math.sin(t * 1.3);
      holder.updateMatrixWorld(true);
      // foam off both sides of its stern, spray off both sides of its bow (more of it heeled hard over in the swerve)
      const v = f.rideV;
      wakeDue += dt * WAKE.per * k;
      while (wakeDue >= 1) {
        wakeDue -= 1;
        for (let s = -1; s <= 1; s += 2) {
          at(s * 1.1, 0.1, -3.4);
          const ox = Math.cos(holder.rotation.y) * s, oz = -Math.sin(holder.rotation.y) * s, o = WAKE.out * (0.6 + Math.random() * 0.8);
          wake.emit(p.x, SEA_LEVEL + 0.08, p.z, ox * o, 0, oz * o, WAKE.life * (0.8 + Math.random() * 0.4), false);
        }
      }
      bowDue += dt * BOW.per * k * (1 + 3 * Math.abs(sw.bank) / 0.16);
      while (bowDue >= 1) {
        bowDue -= 1;
        const s = Math.random() < 0.5 ? -1 : 1;
        at(s * 1.0, 0.2, 2.2 + Math.random());
        const ox = Math.cos(holder.rotation.y) * s, oz = -Math.sin(holder.rotation.y) * s, o = 2.5 + Math.random() * 3;
        const fx = Math.sin(holder.rotation.y), fz = Math.cos(holder.rotation.y), ahead = v * 0.15;
        bow.emit(p.x, p.y, p.z, ox * o + fx * ahead, 2 + Math.random() * 2.5, oz * o + fz * ahead);
      }
      wake.update(dt); bow.update(dt);
    },
    dispose() { wake.dispose(); bow.dispose(); },
  };
}
