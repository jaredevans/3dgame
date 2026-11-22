// The boat's giant octopus: Polyfork's octopus-base scaled to a giant (OCTOPUS.scale, the owner's call), rising beside
// the boat through the 'octopus' event's window as rides.js octopusPose says. Its clips (Swim fast coming up from the
// deep, Swim while it's up, Swim backward as it falls behind) play throughout; while it's close, its hips and arms are
// ours (the pose's w): each arm bent joint by joint about its own axis (its bones' rest rotations are all none, so a
// bone's bend is a turn about that axis alone), exactly as the clearance test bends them. Spray where it breaks the
// surface, where its arms slam down and where it goes under; the surge of water as it comes up and the splash.
import * as THREE from 'three';
import { sound } from '../audio.js';
import { SEA_LEVEL } from '../world-data.js';
import { OCTOPUS, OCTOPUS_ARMS, octopusPose, placeOctopus } from '../rides.js';
import { makeSpray } from './spray.js';

const ARM_NAMES = ['Left', 'Right'].flatMap((side) => [1, 2, 3, 4].map((n) => `${side}Arm${n}`));
const JOINTS = ['', 'Mid', 'Distal', 'Curl', 'Tip'];
const CREST = 1.95;   // the top of its mantle over its origin (model metres)
// its moments, in u through its window: the water surging as its mantle breaks the surface, its arms slamming down,
// and it going under
const SLAM = 0.56, UNDER = 0.8;
const PLAY = { fade: 0.5 };   // (its clips cross-fade over half a second)
// each splash's spray: how fast it's flung up and out (m/s, lowest and highest)
const RISE_UP = [5, 11], RISE_OUT = [2, 7], SLAM_UP = [4, 9], SLAM_OUT = [1.5, 5], UNDER_UP = [3, 7], UNDER_OUT = [2, 6];

export async function buildOctopus({ ride, slicer, still, loadAnimal }) {
  await slicer.frame();
  await still();
  const kind = await loadAnimal('octopus-base');
  await slicer.frame();
  await still();   // (cloned with its skeleton: only where it may land)
  const a = kind.make(), obj = a.object;
  obj.name = 'giant octopus';
  obj.scale.setScalar(OCTOPUS.scale);
  // its arms reach far past its rest pose's bounds: never culled by them
  obj.traverse((o) => { if (o.isMesh) { o.frustumCulled = false; o.castShadow = true; o.receiveShadow = false; } });
  obj.visible = false;
  const bone = (name) => {
    const b = obj.getObjectByName(name);
    if (!b) throw new Error(`the octopus has no ${name}`);
    return b;
  };
  // the bones we pose, each with its rest place; an arm's with the turn about its axis for each bend (filled per frame)
  const body = ['Hips', 'Head', 'Mantle'].map((n) => { const b = bone(n); return { b, rest: b.position.clone() }; });
  const hips = body[0].b;
  const arms = ARM_NAMES.map((name, i) => ({
    axis: new THREE.Vector3(...OCTOPUS_ARMS[i].axis),
    bones: JOINTS.map((j) => { const b = bone(name + j); return { b, rest: b.position.clone() }; }),
  }));
  const tips = [arms[0].bones[4].b, arms[4].bones[4].b];   // the front arms' tips, where they slam down

  const group = new THREE.Group();
  group.name = 'octopus';
  group.add(obj);
  const spray = makeSpray({ count: 420, size: 2.4, life: 1.6, gravity: 9.8, name: 'octopus spray' });
  group.add(spray.points);

  const pose = octopusPose(0), at = {}, q = new THREE.Quaternion(), none = new THREE.Quaternion(), v = new THREE.Vector3();
  let last = -1;
  const burst = (x, z, n, up, out) => spray.burst(x, SEA_LEVEL + 0.2, z, n, up, out, 3);
  return {
    group,
    update(f) {
      if (!f.on) { obj.visible = false; spray.clear(); last = -1; return; }
      const u = Math.min(1, Math.max(0, (f.rideS - OCTOPUS.s0) / (OCTOPUS.s1 - OCTOPUS.s0)));
      octopusPose(u, pose);
      placeOctopus(ride, f.rideS, pose, at);
      obj.visible = true;
      obj.position.set(at.x, at.y, at.z);
      obj.rotation.set(0, at.yaw, 0);
      a.play(pose.clip, PLAY);
      a.update(f.dt);
      // ours over the clip's, by w: its hips held still and its arms bent as the pose says
      const w = pose.w;
      if (w > 0) {
        for (let k = 0; k < body.length; k++) body[k].b.position.lerp(body[k].rest, w);
        hips.quaternion.slerp(none, w);
        for (let i = 0; i < 8; i++) {
          const arm = arms[i];
          for (let j = 0; j < 5; j++) {
            const bj = arm.bones[j];
            if (j < 4) q.setFromAxisAngle(arm.axis, pose.bend[4 * i + j]); else q.identity();
            bj.b.quaternion.slerp(q, w);
            bj.b.position.lerp(bj.rest, w);
          }
        }
      }
      // its moments, each once as the window passes it
      if (last >= 0) {
        if (crossed(last, u, surfaceU)) { burst(at.x, at.z, 160, RISE_UP, RISE_OUT); sound('surge'); }
        if (crossed(last, u, SLAM)) {
          obj.updateMatrixWorld(true);
          for (let k = 0; k < tips.length; k++) { tips[k].getWorldPosition(v); burst(v.x, v.z, 110, SLAM_UP, SLAM_OUT); }
          sound('splash');
        }
        if (crossed(last, u, UNDER)) { burst(at.x, at.z, 120, UNDER_UP, UNDER_OUT); sound('splash'); }
      }
      last = u;
      spray.update(f.dt);
    },
    dispose() { spray.dispose(); },
  };
}
const crossed = (a, b, at) => a < at && b >= at;
// where in its window its mantle first breaks the surface
const surfaceU = (() => {
  const p = octopusPose(0);
  for (let u = 0; u <= 1; u += 0.001) if (octopusPose(u, p).rise + CREST * OCTOPUS.scale > 0) return u;
  return 0.2;
})();
