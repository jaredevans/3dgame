// A ride's crew and riders: a kit's figure (a captain, a pilot, a coach's driver, an outlaw) made, posed by one of
// Polyfork's humanoid clips (the railway kit's clips.mjs) and placed; and a figure seated on what it sits on (a saddle,
// a driver's box) in the Sitting clip.
import * as THREE from 'three';
import { KITS } from '../config.js';
import { kitModule } from '../parts.js';

// a seated figure's hips sit this far above what it sits on
export const HIPS_OVER_SEAT = 0.1;

// -> { figure, anim } (anim null if its clips couldn't be had: warned, the figure standing in its rest pose), or null
// if the figure couldn't be had (warned; the ride goes on without it). ctx: the ride registry's { kit, warn }; what:
// its name in a warning ('captain'). A build let go meanwhile (err.dropped) is thrown on, not warned about.
export async function crewFigure({ kit, warn }, { kitKey, key, params = {}, clip = 'Idle', name = key, what = name, shadow = true }) {
  let figure;
  try { figure = await kit(kitKey, key, params); } catch (err) { if (err?.dropped) throw err; warn(what, err); return null; }
  figure.name = name;
  if (shadow) figure.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  let anim = null;
  try {
    const { animate } = await kitModule(KITS.railway, 'clips.mjs');
    anim = await animate(figure, { clips: [clip] });
    anim.play(clip, { fade: 0 });
    anim.update(0);
  } catch (err) { if (err?.dropped) throw err; warn(`${what}'s clips`, err); anim = null; }
  return { figure, anim };
}

// a figure in the Sitting clip (posed already) put on a seat whose top is at height `top`, `z` along, in `on`'s own
// frame (`on`: the object it's added to; its frame as it stands at rest): its hips HIPS_OVER_SEAT over the seat
const HIP = new THREE.Vector3(), AT = new THREE.Vector3();
export function sitOn(figure, on, top, z = 0, x = 0) {
  figure.position.set(0, 0, 0);
  figure.updateMatrixWorld(true);
  (figure.getObjectByName('Hips') ?? figure).getWorldPosition(HIP);
  figure.position.set(x - HIP.x, top + HIPS_OVER_SEAT - HIP.y, z - HIP.z);
  on.add(figure);
  return figure;
}

// a seated figure on a saddled horse (Polyfork's saddled-horse-da86d3): parented to the horse's spine, so it rides
// its gallop. SADDLE: where the saddle's seat is in the horse's own frame (from its rest pose: the saddle's mesh spans
// y 0.68-1.59 and z -0.32..0.38 under the withers at 1.44)
export const SADDLE = { y: 1.36, z: 0.0 };
export function seatOnHorse(figure, horse) {
  horse.object.updateMatrixWorld(true);
  const spine = horse.object.getObjectByName('Spine') ?? horse.object;
  spine.getWorldPosition(AT);
  horse.object.worldToLocal(AT);
  // (the spine's frame at rest has no turn of its own: its offset from the horse's origin is all there is to take off)
  return sitOn(figure, spine, SADDLE.y - AT.y, SADDLE.z - AT.z);
}
