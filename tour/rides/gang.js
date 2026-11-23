// The stagecoach's gang: five outlaws (the Frontier kit's outlaw-character, seated in the Sitting clip on Polyfork's
// saddled horse, as the canyon's riders are) lying in wait beside the road, then chasing the coach as rides/coach-plan.js
// says, each with a revolver raised, firing: a muzzle flash at the gun, a cap gun's crack, and a puff of dust where the
// shot lands well wide (some with a ricochet's ping). Western-film spectacle: no one is ever hit. They stand in the
// scene from the build, hidden until the ride's event ('gang') runs.
import * as THREE from 'three';
import { cdnPart } from '../parts.js';
import { sound } from '../audio.js';
import { clipFor, HORSE } from '../actors/clips.js';
import { GANG, gangPlan, placeRider, arrowPlan, arrowAt, rearAt, turnedAt } from './coach-plan.js';
import { HORSE_HOOVES } from '../actors/paths.js';
import { crewFigure, seatOnHorse, aimArm } from './crew.js';
import { makeSpray } from './spray.js';
import { buildArchers } from './archers.js';

const COLORWAYS = ['canvas', 'oilskin', 'linen', 'oilskin', 'canvas'];
const FLASH = 0.07;                           // s a muzzle flash shows
const AIM = new THREE.Vector3(-0.2, 0.35, 1).normalize();   // the gun arm's way, in the rider's frame: ahead, up a little, out to its right
const LOUD = 30;                              // m: a shot nearer the camera than this is at its loudest
const DUST = { per: 36, life: 2.2 };          // a puff's dust: how many specks, and how long it hangs

// a revolver (barrel, cylinder, grip), its muzzle at +z; and its flash: a bright star of two crossed quads there
function revolver(flashMat) {
  const metal = new THREE.MeshStandardMaterial({ color: '#2b2b2e', metalness: 0.6, roughness: 0.4 });
  const wood = new THREE.MeshStandardMaterial({ color: '#5b3a22', roughness: 0.8 });
  const g = new THREE.Group();
  g.name = 'revolver';
  const barrel = new THREE.Mesh(new THREE.BoxGeometry(0.028, 0.03, 0.17).translate(0, 0.012, 0.1), metal);
  const drum = new THREE.Mesh(new THREE.CylinderGeometry(0.024, 0.024, 0.05, 8).rotateX(Math.PI / 2).translate(0, 0.004, 0.02), metal);
  const grip = new THREE.Mesh(new THREE.BoxGeometry(0.026, 0.09, 0.04).rotateX(0.35).translate(0, -0.04, -0.02), wood);
  const flash = new THREE.Group();
  flash.name = 'muzzle flash';
  for (const a of [0, Math.PI / 2]) {
    const q = new THREE.Mesh(new THREE.PlaneGeometry(0.6, 0.6), flashMat);
    q.rotation.z = a + Math.PI / 4;
    flash.add(q);
    const side = new THREE.Mesh(new THREE.PlaneGeometry(0.36, 0.9), flashMat);
    side.rotation.set(Math.PI / 2, 0, a);
    side.position.z = 0.35;
    flash.add(side);
  }
  flash.position.z = 0.2;
  flash.visible = false;
  for (const m of [barrel, drum, grip]) m.castShadow = true;
  g.add(barrel, drum, grip, flash);
  return { gun: g, flash };
}

// -> the actor of the 'gang' event (actors/index.js contract), or throws if the horses can't be loaded (the caller
// leaves the gang out and warns). Riders whose figure can't be had ride riderless (warned)
export async function buildGang({ ride, slicer, still, kit, terrain, loadAnimal, warn }) {
  await slicer.frame();
  await still();
  const kind = await loadAnimal('saddled-horse-da86d3');
  const group = new THREE.Group();
  group.name = 'gang';
  const flashMat = new THREE.MeshBasicMaterial({ color: '#ffd27a', transparent: true, opacity: 0.95, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
  const riders = [];
  for (let i = 0; i < GANG.count; i++) {
    await slicer.frame();
    await still();   // (each horse cloned with its skeleton, its rider made and seated: only where it may land)
    const horse = kind.make();
    horse.object.name = `gang horse ${i}`;
    horse.object.visible = false;
    const rider = await crewFigure({ kit, warn }, { kitKey: 'west', key: 'outlaw-character', params: { colorway: COLORWAYS[i], build: 0.95 }, clip: 'Sitting', name: `outlaw ${i}`, what: 'outlaw' });
    let aim = null, flash = null;
    if (rider) {
      seatOnHorse(rider.figure, horse);
      const r = revolver(flashMat);
      flash = r.flash;
      aim = aimArm(rider.figure, r.gun, AIM);
    }
    group.add(horse.object);
    riders.push({ horse, anim: rider?.anim ?? null, aim, flash, flashFor: 0, gait: { name: 'Idle', timeScale: 1, fade: 0.3 } });
  }
  // the puffs of dust where the shots land (in the world's frame)
  await slicer.frame();
  await still();   // (its dust's pool made, and its shots worked out: some 16 ms, only where it may land)
  const dust = makeSpray({ count: 520, size: 1.5, life: DUST.life, gravity: 0.5, name: 'gang shots dust', color: '#c9ad84', opacity: 0.9, air: 1.4, floor: -Infinity });
  group.add(dust.points);
  const plan = gangPlan(ride);   // (worked out here, at the build's standstill, not mid-ride)
  // the arrows that drive them off (coach-plan.js arrowPlan; Polyfork's arrow, 0.8 m, its point at +z), hidden till
  // loosed, stuck where they land till the ride's event is over
  const volley = arrowPlan(ride).arrows, arrows = [], lastLoose = Math.max(...volley.map((a) => a.sLoose));
  const lastLand = Math.max(...volley.filter((a) => a.sLoose === lastLoose).map((a) => a.sLand));
  const FOLLOW = { back: 7, up: 1.2, ahead: 12 };
  const lastMid = new THREE.Vector3(), lastDir = new THREE.Vector3(), followPos = new THREE.Vector3(), followAt = new THREE.Vector3();
  const follow = { pos: followPos, at: followAt };
  for (const a of volley) {
    const m = await cdnPart('arrow-eb66a4', {});
    m.name = 'arrow';
    m.visible = false;
    m.traverse((o) => { if (o.isMesh) o.castShadow = true; });
    group.add(m);
    arrows.push({ a, m, y0: terrain.heightAt(a.from.x, a.from.z) + 1.4, y1: terrain.heightAt(a.to.x, a.to.z), hissed: false, landed: false });
  }
  const A = {}, dir = new THREE.Vector3(), Zf = new THREE.Vector3(0, 0, 1), focusAt = new THREE.Vector3(), lastDown = new THREE.Vector3();
  // the archers who loose them (archers.js): left out, warned, if they can't be had
  let archers = null;
  try { archers = await buildArchers({ ride, slicer, still, terrain, warn }); } catch (err) { if (err?.dropped) throw err; warn('archers', err); }
  if (archers) group.add(archers.group);
  const P0 = { x: 0, z: 0, yaw: 0, pace: 0, stopped: 0, a: 0, lane: 0, visible: false };
  let next = 0;
  const hide = () => {
    for (const r of riders) { r.horse.object.visible = false; if (r.flash) r.flash.visible = false; r.flashFor = 0; }
    for (const x of arrows) { x.m.visible = false; x.hissed = false; x.landed = false; x.m.userData.stuck = false; }
    next = 0; actor.focus = null; actor.follow = null; lastDown.set(0, 0, 0);
  };
  const loud = (cam, x, z) => (cam ? Math.min(1, LOUD / Math.max(LOUD, Math.hypot(cam.position.x - x, cam.position.z - z))) : 1);
  const actor = {
    group,
    focus: null,   // (the director's arrows shot: the volley in flight, or where the last came down; ride-run.js)
    follow: null,  // (and where its camera rides, behind the last volley, and what it looks at)
    update(f) {
      archers?.update(f);
      if (!f.on) { hide(); dust.update(f.dt); return; }
      const s = f.rideS, dt = f.dt;
      for (let i = 0; i < riders.length; i++) {
        const r = riders[i], o = r.horse.object;
        placeRider(ride, s, i, P0);
        o.visible = P0.visible;
        if (!P0.visible) continue;
        // rearing as its volley lands (tipped up about its hind hooves), and turned away once it has pulled up
        // (riding off, it faces the way it goes: its turn is in its way already)
        const rear = rearAt(i, s), hb = HORSE_HOOVES.back, yaw = P0.yaw + (P0.stopped >= 1 && P0.pace > 0.05 ? 0 : Math.PI * turnedAt(i, s));
        const lift = -hb * Math.sin(rear), back = hb * (1 - Math.cos(rear));
        o.position.set(P0.x + Math.sin(yaw) * back, terrain.heightAt(P0.x, P0.z) + lift, P0.z + Math.cos(yaw) * back);
        o.rotation.set(-rear, yaw, 0, 'YXZ');
        // its gait from its speed (the coach's times its pace): standing, trotting up, galloping
        const v = P0.pace * f.rideV;
        clipFor(v, r.horse.clips, HORSE, r.gait);
        r.horse.play(r.gait.name, r.gait);
        r.horse.update(dt);
        if (r.anim) r.anim.update(dt);
        // its gun arm raised while it chases (lowered, as it sits, waiting and once it's pulled up)
        if (r.aim && P0.pace > 0.5 && P0.stopped < 0.5) { r.aim.arm.quaternion.copy(r.aim.qa); r.aim.fore.quaternion.copy(r.aim.qf); }
        if (r.flash) { r.flashFor -= dt; r.flash.visible = r.flashFor > 0; if (r.flash.visible) r.flash.rotation.z += 1.3; }
      }
      // the shots fired since the last frame (ride-s only grows): the flash and crack at the rider, the puff where it lands
      const shots = plan.shots;
      while (next < shots.length && shots[next].s <= s) {
        const sh = shots[next++], r = riders[sh.rider];
        placeRider(ride, s, sh.rider, P0);
        if (!P0.visible) continue;
        r.flashFor = FLASH;
        sound('crack', loud(f.camera, P0.x, P0.z));
        dust.burst(sh.x, terrain.heightAt(sh.x, sh.z) + 0.1, sh.z, DUST.per, [0.8, 2.8], [0.4, 2.0], 0.6);
        if (sh.ping) sound('ping', loud(f.camera, sh.x, sh.z));
      }
      // the arrows: in flight along their arcs, pointing along them; stuck where they came down, a puff and a thud. The
      // director's arrows shot follows the volley in flight (the middle of those in the air), and where the last one
      // came down meanwhile
      let flying = 0, lastFlying = 0;
      focusAt.set(0, 0, 0); lastMid.set(0, 0, 0); lastDir.set(0, 0, 0);
      for (const x of arrows) {
        arrowAt(x.a, s, x.y0, x.y1, A);
        x.m.visible = A.flying || A.landed;
        if (!x.m.visible) continue;
        if (A.flying && !x.hissed) { x.hissed = true; sound('hiss', loud(f.camera, x.a.to.x, x.a.to.z)); }
        if (A.landed && !x.landed) {
          x.landed = true;
          dust.burst(x.a.to.x, x.y1 + 0.05, x.a.to.z, 10, [0.4, 1.4], [0.2, 0.9], 0.2);
          sound('thud', loud(f.camera, x.a.to.x, x.a.to.z));
        }
        if (A.flying) { focusAt.x += A.x; focusAt.y += A.y; focusAt.z += A.z; flying++; }
        if (A.flying && x.a.sLoose === lastLoose) { lastMid.x += A.x; lastMid.y += A.y; lastMid.z += A.z; lastDir.x += A.dx; lastDir.y += A.dy; lastDir.z += A.dz; lastFlying++; }
        else if (A.landed && !x.m.userData.stuck) lastDown.set(A.x, A.y, A.z);
        if (A.landed && x.m.userData.stuck) continue;
        dir.set(A.dx, A.dy, A.dz).normalize();
        // stuck: its point a quarter of the way in, at the angle it came down
        x.m.position.set(A.x - (A.landed ? dir.x * 0.2 : 0), A.y - (A.landed ? dir.y * 0.2 : 0), A.z - (A.landed ? dir.z * 0.2 : 0));
        x.m.quaternion.setFromUnitVectors(Zf, dir);
        x.m.userData.stuck = A.landed;
      }
      if (flying) { focusAt.multiplyScalar(1 / flying); actor.focus = focusAt; }
      else if (lastDown.lengthSq()) actor.focus = lastDown;
      else actor.focus = archers?.lead ?? null;   // (before the first volley: the archers who'll loose it)
      // on the archers as they loose, every shot (owner, 2026-11-22), then the last volley in flight and where it lands
      if (archers?.lead && s < lastLoose) actor.focus = archers.lead;
      // and the camera itself riding just behind the last volley as it flies (FOLLOW.back m behind and FOLLOW.up over
      // the middle of it, looking FOLLOW.ahead m on along its way), held where it ends up as they land, looking at them
      if (lastFlying) {
        lastMid.multiplyScalar(1 / lastFlying);
        lastDir.normalize();
        followPos.copy(lastMid).addScaledVector(lastDir, -FOLLOW.back).y += FOLLOW.up;
        followAt.copy(lastMid).addScaledVector(lastDir, FOLLOW.ahead);
        actor.follow = follow;
      } else if (actor.follow && lastDown.lengthSq() && s >= lastLand) followAt.copy(lastDown);
      dust.update(dt);
    },
    dispose() { dust.dispose(); },
  };
  return actor;
}
