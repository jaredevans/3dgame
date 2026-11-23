// The airliner buzzing the balloon (owner, 2026-11-23): Polyfork's narrow-body airliner (38 m), gear down and flaps
// out on its way in to land, flying straight at the balloon at the top of its flight, then rolling hard into a bank
// close in and turning away behind it (rides.js AIRLINER, airlinerAt); a roar as it breaks. Placed by the balloon's
// ride-s, so it comes past as the balloon reaches the spot whatever the frame rate; hidden outside its event's window.
import * as THREE from 'three';
import { sound } from '../audio.js';
import { cdnPart } from '../parts.js';
import { AIRLINER, airlinerAt } from '../rides.js';

export async function buildAirliner({ ride, slicer }) {
  const group = new THREE.Group();
  group.name = 'airliner';
  await slicer.frame();
  const plane = await cdnPart(AIRLINER.id, { gear: 1, flaps: 'landing', colorway: 'blue' });
  plane.traverse((o) => { if (o.isMesh) { o.castShadow = true; } });
  plane.visible = false;
  group.add(plane);
  const at = {};
  let roared = false;
  return {
    group,
    update(f) {
      if (!f.on || f.rideS === null) { plane.visible = false; roared = false; return; }
      // seconds from its crossing, by the balloon's way along (its speed)
      const t = (f.rideS - AIRLINER.at) / Math.max(f.rideV ?? ride.profile.v, 0.1);
      airlinerAt(ride, t, at);
      plane.visible = true;
      plane.position.set(at.x, at.y, at.z);
      // (its left wing down: the model faces +z, its left +x)
      plane.rotation.set(at.pitch, at.yaw, -at.roll, 'YXZ');
      if (!roared && t > -AIRLINER.dodge.at) { roared = true; sound('roar'); }
    },
  };
}
