// Oceanside's living things (owner, 2026-11-22), round the town while it's in: Polyfork's starfish on the beach by the
// shore crab; a dock out from the seafront east of the town, an old fisherman at its end catching a grouper (his float
// bobs, a bite, the grouper hauled up out of the water flapping on his line, swung in and dropped in his bucket, and
// again); and, close in off the beach to be watched from the town, the sea's creatures from the leg: a pod of
// humpbacks blowing, diving and now and then breaching, dolphins leaping and stingrays somersaulting.
//
// Everything is placed in the coast kit's own frame (the place turns it: world east is its -x, the sea its +z), its
// waterline about z 26 east of the composed place. Nothing is allocated as it plays.
import * as THREE from 'three';
import { KITS } from '../config.js';
import { part, cdnPart } from '../parts.js';
import { SEA_LEVEL } from '../world-data.js';
import { loadAnimal } from '../actors/animals.js';
import { leapAt, loopAt } from '../actors/paths.js';
import { makeWhale } from '../actors/whale-model.js';
import { breachAt, breachSecs, swimAt, flipAt } from '../actors/sea-moves.js';
import { makeSpray } from '../rides/spray.js';
import { crewFigure } from '../rides/crew.js';

// the starfish round the crab (the kit's layout has it at -4.2, 14 among its rock pools): kit x, z, turn
const STARFISH = { id: 'starfish-772749', spots: [[-6.6, 12.4, 0.4], [-2.1, 13.0, 2.0], [-5.7, 15.4, 3.6], [-1.3, 15.1, 5.1], [-7.5, 14.3, 1.1]] };
// the dock: pier pieces (4 m square) out from the sand at kit x -50, z 20, into the sea; the fisherman at its end
const DOCK = { x: -50, z0: 20, n: 5, size: 4 };
// the fishing, s: a round of `round`; the float bobs till the bite, the grouper is hauled up over `haul`, hangs on the
// line, is swung in and dropped in the bucket; the float lies `cast` m out past the dock's end
const FISH = { round: 16, bite: 7, haul: 2.5, hang: 3.2, drop: 1.2, cast: 6.5, hangBelow: 0.9 };
// close in off the beach (its waterline about z 26; the sea floor some 7 m down from z 80): the whales' loop, some
// 95 m out (its middle, half-length along the coast and across, m/s), the dolphins' 35 m out and the rays' 12 m out,
// between the town and the dock; and how often a whale breaches
const WHALES = { x: -20, z: 120, a: 70, b: 22, speed: 1.4, breachEvery: 21, lanes: [-18, 0, 20] };
const DOLPHINS = { x: -10, z: 62, a: 45, b: 14, speed: 5, offsets: [[0, 0], [-7, 4], [5, -3], [-3, -6]] };
const RAYS = { x: -15, z: 38, a: 14, b: 5, speed: 2, offsets: [[0, 0], [5, 3], [-5, 2]] };

const DEG = Math.PI / 180;
const tmp = new THREE.Vector3(), tmp2 = new THREE.Vector3(), Z = new THREE.Vector3(0, 0, 1);

export async function buildOceansideLife({ place, terrain, still, warn = (what, err) => console.warn(`Oceanside's ${what} were left out: ${err?.url ?? err?.message ?? err}`) }) {
  const group = new THREE.Group();
  group.name = 'Oceanside life';
  const rot = place.def.rot;
  const W = (kx, kz) => place.toWorld(kx, kz);
  const updates = [];
  const kit = (kitKey, key, params) => part(KITS[kitKey], key, params);

  // ---- the starfish by the crab ----
  await still();
  try {
    for (const [kx, kz, turn] of STARFISH.spots) {
      const s = await cdnPart(STARFISH.id, {});
      const [x, z] = W(kx, kz);
      s.position.set(x, place.groundAt(x, z) + 0.01, z);
      s.rotation.y = rot + turn;
      s.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
      group.add(s);
    }
  } catch (err) { if (err?.dropped) throw err; warn('starfish', err); }

  // ---- the dock, the fisherman and his grouper ----
  await still();
  try { updates.push(await buildDock({ group, place, terrain, kit, rot, W, warn })); } catch (err) { if (err?.dropped) throw err; warn('dock and fisherman', err); }

  // ---- the sea's creatures, close in ----
  await still();
  const spray = makeSpray({ count: 1600, size: 1, life: 2, gravity: 7, name: 'Oceanside spray', floor: SEA_LEVEL - 0.5 });
  group.add(spray.points);
  updates.push(buildWhales({ group, W, rot, spray }));
  await still();
  try { updates.push(await buildDolphins({ group, W, rot, spray })); } catch (err) { if (err?.dropped) throw err; warn('dolphins', err); }
  try { updates.push(await buildRays({ group, W, rot, spray })); } catch (err) { if (err?.dropped) throw err; warn('stingrays', err); }
  updates.push((dt) => spray.update(dt));

  return {
    group,
    update(dt, time) { for (const u of updates) u(dt, time); },
  };
}

// the dock out into the sea, the fisherman at its end with his bucket, his line and the grouper -> its update
async function buildDock({ group, place, kit, rot, W, warn }) {
  const pieces = [];
  for (let i = 0; i < DOCK.n; i++) {
    const piece = i === 0 ? 'start' : i === DOCK.n - 1 ? 'end' : 'middle';
    const p = await kit('ocean', 'pier-head-platform', { piece, railing: 'timber', tide: 0, weather: 0.5 });
    const [x, z] = W(DOCK.x, DOCK.z0 + i * DOCK.size);
    p.position.set(x, SEA_LEVEL + place.def.y, z);
    p.rotation.y = rot;
    p.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
    group.add(p);
    pieces.push(p);
  }
  // the end piece's deck: straight down onto it from above its middle
  const end = pieces[pieces.length - 1];
  end.updateMatrixWorld(true);
  const ray = new THREE.Raycaster(new THREE.Vector3(end.position.x, end.position.y + 10, end.position.z), new THREE.Vector3(0, -1, 0));
  const hit = ray.intersectObject(end, true)[0];
  const deck = hit ? hit.point.y : end.position.y + 1.3;
  // the fisherman at its end, facing out to sea, his bucket beside him
  const kz = DOCK.z0 + (DOCK.n - 1) * DOCK.size + 1.1;
  const man = await crewFigure({ kit, warn }, { kitKey: 'ocean', key: 'fisherman', params: { age: 'old' }, clip: 'Idle', name: 'Oceanside fisherman', what: 'fisherman' });
  if (!man) return () => {};
  const [mx, mz] = W(DOCK.x, kz);
  man.figure.position.set(mx, deck, mz);
  man.figure.rotation.y = rot;
  group.add(man.figure);
  let bucket = null;
  try {
    bucket = await kit('ocean', 'beach-bucket', {});
    const [bx, bz] = W(DOCK.x + 0.75, kz - 0.4);
    bucket.position.set(bx, deck, bz);
    group.add(bucket);
  } catch (err) { if (err?.dropped) throw err; warn('bucket', err); }
  // the rod's tip, from his right hand: the point of the rod's mesh furthest from the hand, in the hand's own frame
  man.figure.updateMatrixWorld(true);
  const hand = man.figure.getObjectByName('RightHand'), rod = man.figure.getObjectByName('attach-righthand-mesh');
  const tipLocal = new THREE.Vector3();
  if (hand && rod) {
    const hp = hand.getWorldPosition(new THREE.Vector3()), v = new THREE.Vector3(), pos = rod.geometry.attributes.position;
    let far = -1;
    for (let i = 0; i < pos.count; i++) {
      if (rod.isSkinnedMesh) rod.getVertexPosition(i, v); else v.fromBufferAttribute(pos, i);
      v.applyMatrix4(rod.matrixWorld);
      const d = v.distanceToSquared(hp);
      if (d > far) { far = d; tipLocal.copy(v); }
    }
    hand.worldToLocal(tipLocal);
  }
  const tipOf = (out) => (hand ? hand.localToWorld(out.copy(tipLocal)) : out.set(mx, deck + 2.6, mz));
  // the float out past the dock's end, on the water; the line from the tip to the float, then to the grouper
  const [fx, fz] = W(DOCK.x + 0.4, kz + FISH.cast);
  const float = new THREE.Mesh(new THREE.SphereGeometry(0.09, 8, 6), new THREE.MeshStandardMaterial({ color: '#e8432d', roughness: 0.5 }));
  float.name = 'float';
  group.add(float);
  const line = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.006, 1, 3, 1, true).translate(0, 0.5, 0).rotateX(Math.PI / 2),
    new THREE.MeshBasicMaterial({ color: '#d8d8d0' }));
  line.name = 'fishing line';
  line.frustumCulled = false;
  group.add(line);
  const kind = await loadAnimal('grouper-base');
  const fish = kind.make();
  fish.object.name = 'grouper';
  fish.object.visible = false;
  fish.play('Swim fast', { fade: 0, timeScale: 2.2 });
  group.add(fish.object);
  const splash = makeSpray({ count: 120, size: 0.35, life: 0.8, gravity: 9.8, name: 'grouper splash' });
  group.add(splash.points);
  const tip = new THREE.Vector3(), end2 = new THREE.Vector3(), at = new THREE.Vector3(), basket = new THREE.Vector3();
  if (bucket) basket.copy(bucket.position).add(tmp.set(0, 0.35, 0)); else basket.set(mx, deck + 0.3, mz);
  let t = 0, splashed = false, bit = false;
  const aim = (from, to) => {
    tmp2.subVectors(to, from);
    const len = tmp2.length() || 1e-3;
    line.position.copy(from);
    line.quaternion.setFromUnitVectors(Z, tmp2.divideScalar(len));
    line.scale.set(1, 1, len);
  };
  return (dt, time) => {
    t = (t + dt) % FISH.round;
    man.anim?.update(dt);
    man.figure.updateMatrixWorld(true);
    tipOf(tip);
    const hauled = t - FISH.bite, F = FISH;
    if (hauled < 0) {
      // waiting: the float bobs on the swell, the line out to it; a sharper bob or two just before the bite
      if (!bit) splashed = false;
      bit = false;
      const tug = t > F.bite - 1.2 ? Math.max(0, Math.sin((t - F.bite + 1.2) * 14)) * 0.12 : 0;
      float.visible = true;
      float.position.set(fx, SEA_LEVEL + 0.04 + Math.sin(time * 1.7) * 0.03 - tug, fz);
      fish.object.visible = false;
      aim(tip, float.position);
      return;
    }
    bit = true;
    float.visible = false;
    fish.object.visible = true;
    fish.update(dt);
    if (hauled < F.haul) {
      // hauled up out of the water to hang under the rod's tip, flapping
      const u = hauled / F.haul, e = u * u * (3 - 2 * u);
      end2.set(tip.x, tip.y - F.hangBelow, tip.z);
      at.set(fx + (end2.x - fx) * e, SEA_LEVEL + (end2.y - SEA_LEVEL) * e + Math.sin(Math.PI * u) * 1.2, fz + (end2.z - fz) * e);
      if (!splashed) { splash.burst(fx, SEA_LEVEL, fz, 40, [1.5, 3.5], [0.4, 1.5], 0.3); splashed = true; }
    } else if (hauled < F.haul + F.hang) {
      at.set(tip.x, tip.y - F.hangBelow, tip.z);
    } else if (hauled < F.haul + F.hang + F.drop) {
      // swung in over the bucket and dropped in
      const u = (hauled - F.haul - F.hang) / F.drop;
      at.set(tip.x + (basket.x - tip.x) * u, tip.y - F.hangBelow + (basket.y - tip.y + F.hangBelow) * u, tip.z + (basket.z - tip.z) * u);
    } else {
      fish.object.visible = false;
      at.copy(basket);
    }
    // the grouper hangs head up from the line, wriggling
    fish.object.position.set(at.x, at.y - 0.55, at.z);
    fish.object.rotation.set(-Math.PI / 2 + Math.sin(time * 9) * 0.25, rot + Math.sin(time * 5) * 0.6, 0, 'YXZ');
    aim(tip, at);
    splash.update(dt);
  };
}

// the humpbacks: three on a slow loop off the beach, at the surface and diving in turn, one breaching every so often
function buildWhales({ group, W, rot, spray }) {
  const L = {}, S = {}, B = {}, hole = new THREE.Vector3();
  const pod = WHALES.lanes.map((lane, k) => {
    const m = makeWhale();
    group.add(m.object);
    return { m, lane, phase: k * 6, lastT: null, lastY: -10 };
  });
  let t = 0;
  return (dt) => {
    t += dt;
    const which = Math.floor(t / WHALES.breachEvery) % pod.length, tb = t % WHALES.breachEvery;
    for (let k = 0; k < pod.length; k++) {
      const w = pod[k], o = w.m.object;
      loopAt(t, { a: WHALES.a, b: WHALES.b, speed: WHALES.speed, phase: k * 0.5 }, L);
      const along = WHALES.x + L.along + Math.cos(L.heading) * w.lane, across = WHALES.z + L.across - Math.sin(L.heading) * w.lane;
      const [x, z] = W(along, across), yaw = rot + L.heading;
      let y, pitch, roll = 0, fwd = 0, under;
      if (k === which && tb < breachSecs()) {
        breachAt(tb, B);
        y = B.y; pitch = B.pitch; roll = B.roll; fwd = B.along; under = false;
        if (w.lastY < -1.5 && y >= -1.5) spray.burst(x, SEA_LEVEL, z, 150, [3, 8], [1, 4], 2.5);
        if (B.u > 0.5 && w.lastY > 0 && y <= 0) spray.burst(x + Math.sin(yaw) * fwd, SEA_LEVEL, z + Math.cos(yaw) * fwd, 260, [4, 11], [2, 7], 4);
      } else {
        swimAt(t, w.phase, w.lastT, S);
        y = S.y; pitch = S.pitch; under = S.under;
      }
      o.visible = !under;
      o.position.set(x + Math.sin(yaw) * fwd, SEA_LEVEL + y, z + Math.cos(yaw) * fwd);
      o.rotation.set(-pitch, yaw, roll, 'YXZ');
      w.m.flukes.rotation.x = Math.sin(t * 2.2 + w.phase) * 0.2;
      if (!under && !(k === which && tb < breachSecs()) && S.blow) {
        o.updateMatrixWorld();
        hole.set(0, 1.25, 3.6).applyMatrix4(o.matrixWorld);
        spray.burst(hole.x, hole.y, hole.z, 70, [7, 11], [0.3, 1.1], 0.3);
      }
      w.lastT = t; w.lastY = y;
    }
  };
}

// the dolphins: a pod of four on a loop nearer in, leaping in turn
async function buildDolphins({ group, W, rot, spray }) {
  const kind = await loadAnimal('dolphin-base');
  const L = {}, J = {};
  const pod = DOLPHINS.offsets.map(([dx, dz]) => {
    const a = kind.make();
    a.play('Swim fast', { fade: 0 });
    group.add(a.object);
    return { a, dx, dz, air: false };
  });
  let t = 0;
  return (dt) => {
    t += dt;
    loopAt(t, { a: DOLPHINS.a, b: DOLPHINS.b, speed: DOLPHINS.speed }, L);
    const c = Math.cos(L.heading), s = Math.sin(L.heading);
    for (let i = 0; i < pod.length; i++) {
      const d = pod[i];
      leapAt(t, i, pod.length, DOLPHINS.speed, J);
      const [x, z] = W(DOLPHINS.x + L.along + c * d.dx + s * d.dz, DOLPHINS.z + L.across - s * d.dx + c * d.dz);
      if (d.air && !J.air) spray.burst(x, SEA_LEVEL, z, 26, [2.2, 4.6], [0.4, 2], 0.4);
      d.air = J.air;
      d.a.object.position.set(x, SEA_LEVEL + J.y, z);
      d.a.object.rotation.set(-J.pitch, rot + L.heading, 0, 'YXZ');
      d.a.update(dt);
    }
  };
}

// the stingrays: three on a small loop close in, leaping in turn and somersaulting back in
async function buildRays({ group, W, rot, spray }) {
  const kind = await loadAnimal('stingray-base');
  const L = {}, F = {};
  const rays = RAYS.offsets.map(([dx, dz]) => {
    const a = kind.make();
    a.play('Swim fast', { fade: 0 });
    a.object.visible = false;
    group.add(a.object);
    return { a, dx, dz, air: false };
  });
  let t = 0;
  return (dt) => {
    t += dt;
    loopAt(t, { a: RAYS.a, b: RAYS.b, speed: RAYS.speed }, L);
    for (let i = 0; i < rays.length; i++) {
      const r = rays[i];
      flipAt(t, i, rays.length, F);
      const [x, z] = W(RAYS.x + L.along + r.dx, RAYS.z + L.across + r.dz);
      if (r.air !== F.air) spray.burst(x, SEA_LEVEL, z, r.air ? 28 : 14, [2, 4.5], [0.4, 1.8], 0.5);
      r.air = F.air;
      r.a.object.visible = F.air;
      r.a.object.position.set(x, SEA_LEVEL + F.y, z);
      r.a.object.rotation.set(-F.pitch, rot + L.heading, 0, 'YXZ');
      r.a.update(dt);
    }
  };
}
