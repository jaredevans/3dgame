// The balloon's crows: Polyfork's crow-base at CROWS.scale (the owner's call: big black birds, 3.7 m across their wings),
// wheeling round the envelope through the 'crows' event as rides.js crowOffset says, one now and then swooping down
// past the basket. Each flies its Fly clip, out of step with the others, beating slower as it glides down and harder
// as it climbs; it faces its way through the air (the world's: the balloon is carried through it by its jets) and banks
// into its turns, both taken from where rides.js puts it a moment either side of now, so it's always the same picture
// for the same moment of the ride.
import * as THREE from 'three';
import { CROWS, placeCrow } from '../rides.js';

const DT = 0.05;                 // s either side of now its way and its turn are measured over
const G = 9.81, BANK = 0.5;      // its most bank (radians)
const BEAT = { level: 0.62, per: 0.07, lo: 0.35, hi: 0.95 };   // the clip's rate, level and per m/s it climbs

export async function buildCrows({ ride, slicer, still, loadAnimal }) {
  await slicer.frame();
  await still();
  const kind = await loadAnimal('crow-base');
  const group = new THREE.Group();
  group.name = 'crows';
  const crows = [];
  for (let i = 0; i < CROWS.count; i++) {
    await slicer.frame();
    await still();   // (each cloned with its skeleton: only where it may land)
    const a = kind.make(), obj = a.object;
    obj.name = `crow ${i}`;
    obj.scale.setScalar(CROWS.scale);
    // its wings reach far past its folded rest pose's bounds: never culled by them
    obj.traverse((o) => { if (o.isMesh) { o.frustumCulled = false; o.castShadow = true; o.receiveShadow = false; } });
    obj.visible = false;
    a.play('Fly', { fade: 0, timeScale: BEAT.level });
    a.update(i * 0.53);   // (each beating its wings out of step with the others)
    group.add(obj);
    crows.push({ a, obj });
  }
  const p0 = { x: 0, y: 0, z: 0 }, p1 = { x: 0, y: 0, z: 0 }, p2 = { x: 0, y: 0, z: 0 }, beat = { fade: 0.4, timeScale: 1 };
  return {
    group,
    update(f) {
      if (!f.on) { for (let i = 0; i < crows.length; i++) crows[i].obj.visible = false; return; }
      const t = f.on.t, s = f.rideS, v = f.rideV;
      for (let i = 0; i < crows.length; i++) {
        const c = crows[i];
        placeCrow(ride, s, t, i, p1);
        c.obj.visible = p1.visible;
        if (!p1.visible) continue;
        placeCrow(ride, s - v * DT, t - DT, i, p0);
        placeCrow(ride, s + v * DT, t + DT, i, p2);
        // its way (velocity) and how that's turning (acceleration), from either side of now
        const vx = (p2.x - p0.x) / (2 * DT), vy = (p2.y - p0.y) / (2 * DT), vz = (p2.z - p0.z) / (2 * DT);
        const ax = (p2.x - 2 * p1.x + p0.x) / (DT * DT), az = (p2.z - 2 * p1.z + p0.z) / (DT * DT);
        const flat = Math.hypot(vx, vz) || 1;
        // banked into the turn as a glider is: its pull to its left over g, its left wing down (- roll) turning left
        const left = (ax * vz - az * vx) / flat;
        const bank = -Math.max(-BANK, Math.min(BANK, Math.atan(left / G)));
        c.obj.position.set(p1.x, p1.y, p1.z);
        c.obj.rotation.set(-Math.atan2(vy, flat), Math.atan2(vx, vz), bank, 'YXZ');
        c.obj.scale.setScalar(CROWS.scale * p1.scale);
        beat.timeScale = Math.max(BEAT.lo, Math.min(BEAT.hi, BEAT.level + BEAT.per * vy));
        c.a.play('Fly', beat);
        c.a.update(f.dt);
      }
    },
    dispose() {},   // (the group is freed with the rest of the ride's, at a standstill)
  };
}
