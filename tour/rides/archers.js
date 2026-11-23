// The band of five Native archers on the hillside off the stagecoach road (owner, 2026-11-22: Polyfork's Tapati dancer,
// the owner's choice for them), who drive the gang off: each where coach-plan.js arrowPlan looses its rider's volley
// from, facing where it lands, Polyfork's recurve bow raised in its left hand towards it, rocking back a little as it
// looses. Shown while the gang's event runs. -> { group, lead (the band's middle, chest high), update(f) }
import * as THREE from 'three';
import { KITS } from '../config.js';
import { kitModule, cdnPart } from '../parts.js';
import { arrowPlan } from './coach-plan.js';
import { aimArm } from './crew.js';

const ARCHER = { id: 'tapati-dancer-5557aa', bow: 'recurve-hunting-bow-2903c8', grip: 0.725, rise: 30 * Math.PI / 180, recoil: 0.12, settle: 4 };

// Polyfork's recurve bow (1.45 m, standing on its lower tip, its depth along x), held at its grip: the grip at the
// origin, its depth turned onto z (the way it's aimed)
async function bow() {
  const g = new THREE.Group();
  g.name = 'bow';
  const b = await cdnPart(ARCHER.bow, {});
  b.position.y = -ARCHER.grip;
  b.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  const turn = new THREE.Group();
  turn.rotation.y = Math.PI / 2;
  turn.add(b);
  g.add(turn);
  return g;
}

export async function buildArchers({ ride, slicer, still, terrain, warn }) {
  const group = new THREE.Group();
  group.name = 'archers';
  const plan = arrowPlan(ride).arrows;
  let animate = null;
  try { ({ animate } = await kitModule(KITS.railway, 'clips.mjs')); } catch (err) { if (err?.dropped) throw err; warn('archers\' clips', err); }
  const archers = [];
  // each archer's first arrow: where it looses from and where it lands
  const volleys = [...new Set(plan.map((a) => a.archer))].map((j) => plan.find((a) => a.archer === j));
  for (const [k, v] of volleys.entries()) {
    const dx = v.to.x - v.from.x, dz = v.to.z - v.from.z, yaw = Math.atan2(dx, dz);
    await slicer.frame();
    await still();
    let figure;
    try { figure = await cdnPart(ARCHER.id, {}); } catch (err) { if (err?.dropped) throw err; warn('archers', err); return null; }
    figure.name = 'archer';
    figure.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
    figure.position.set(v.from.x, terrain.heightAt(v.from.x, v.from.z), v.from.z);
    figure.rotation.y = yaw;
    let anim = null;
    if (animate) {
      try { anim = await animate(figure, { clips: ['Idle'] }); anim.play('Idle', { fade: 0 }); anim.update(k * 0.37); } catch (err) { if (err?.dropped) throw err; anim = null; }
    }
    group.add(figure);
    let aim = null;
    try { aim = aimArm(figure, await bow(), new THREE.Vector3(0, Math.sin(ARCHER.rise), Math.cos(ARCHER.rise)), 'Left'); } catch (err) { if (err?.dropped) throw err; warn('bows', err); }
    archers.push({ figure, anim, aim, yaw, looses: plan.filter((a) => a.archer === v.archer).map((a) => a.sLoose), next: 0, shot: 0 });
  }
  group.visible = false;
  // the band's middle, chest high: what the director's arrows shot looks at as it glides in, before they loose
  const lead = new THREE.Vector3();
  for (const a of archers) lead.add(a.figure.position);
  if (archers.length) lead.multiplyScalar(1 / archers.length).add(new THREE.Vector3(0, 1.4, 0));
  return {
    group,
    lead: archers.length ? lead : null,
    update(f) {
      group.visible = !!f.on;
      if (!f.on) { for (const a of archers) { a.shot = 0; a.next = 0; } return; }
      const s = f.rideS;
      for (const a of archers) {
        a.anim?.update(f.dt);
        if (a.aim) { a.aim.arm.quaternion.copy(a.aim.qa); a.aim.fore.quaternion.copy(a.aim.qf); }
        // rocked back at each of its three shots, settling again between
        if (a.next < a.looses.length && s >= a.looses[a.next]) { a.shot = 1; a.next++; }
        else if (a.shot) a.shot = Math.max(0.0001, a.shot - f.dt * ARCHER.settle);
        a.figure.rotation.set(-ARCHER.recoil * (a.shot > 0.001 ? a.shot : 0), a.yaw, 0, 'YXZ');
      }
    },
  };
}
