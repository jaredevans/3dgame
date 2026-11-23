// The airliner buzzing the balloon (owner, 2026-11-23): Polyfork's narrow-body airliner (38 m), gear down and flaps
// out on its way in to land, crossing square over the balloon's path at the top of its flight AIRLINER.over m over its
// envelope's crown (rides.js AIRLINER), descending gently; a roar as it goes over. Placed by the balloon's ride-s, so
// it crosses as the balloon reaches the spot whatever the frame rate; hidden outside its event's window.
import * as THREE from 'three';
import { sound } from '../audio.js';
import { cdnPart } from '../parts.js';
import { AIRLINER } from '../rides.js';

export async function buildAirliner({ ride, slicer, crown }) {
  const group = new THREE.Group();
  group.name = 'airliner';
  await slicer.frame();
  const plane = await cdnPart(AIRLINER.id, { gear: 1, flaps: 'landing', colorway: 'blue' });
  plane.traverse((o) => { if (o.isMesh) { o.castShadow = true; } });
  plane.visible = false;
  group.add(plane);
  // where it crosses: over the path at its top, square across its way
  const P = ride.path.at(AIRLINER.at), yaw = P.yaw + Math.PI / 2, dx = Math.sin(yaw), dz = Math.cos(yaw);
  const over = { x: P.x, y: P.y + crown + AIRLINER.over, z: P.z };
  let roared = false;
  return {
    group,
    update(f) {
      if (!f.on || f.rideS === null) { plane.visible = false; roared = false; return; }
      // seconds from its crossing, by the balloon's way along (its speed)
      const t = (f.rideS - AIRLINER.at) / Math.max(f.rideV ?? ride.profile.v, 0.1), d = AIRLINER.speed * t;
      plane.visible = true;
      plane.position.set(over.x + dx * d, over.y - AIRLINER.glide * d, over.z + dz * d);
      plane.rotation.set(Math.atan(AIRLINER.glide), yaw, 0, 'YXZ');
      if (!roared && t > -1.2) { roared = true; sound('roar'); }
    },
  };
}
