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

// you, the conductor, riding along: the figure you walk as (player.js: the railway kit's engine driver), posed in a
// clip ('Sitting' on a seat, 'Idle' standing) and named so; seen from a ride's chase and director views, hidden in its
// seat view and whenever you're not riding (ride-run.js: the kit's vehicle.rider). -> crewFigure's { figure, anim } or null
export const CONDUCTOR = { kitKey: 'railway', key: 'engine-driver', params: { colorway: 'driver', oilCan: false } };
export const conductorFigure = (ctx, clip = 'Sitting') => crewFigure(ctx, { ...CONDUCTOR, clip, name: 'conductor', what: 'conductor' });

// a figure's arm (side 'Right' or 'Left') raised to point along `aim` (a unit vector in the figure's own frame): its
// upper arm and forearm turned in the world so shoulder to elbow and elbow to hand point that way, and those turns kept
// as their bones' own (re-put after each clip update, which poses them again); `held` (a gun, a bow: its +z along the
// aim) put in the hand, a little out along the aim. -> the arm's bones and their aimed turns, or null if it has none
const AV = new THREE.Vector3(), AW = new THREE.Vector3(), AD = new THREE.Vector3(), AQ = new THREE.Quaternion(), AP = new THREE.Quaternion();
export function aimArm(figure, held, aim, side = 'Right') {
  const arm = figure.getObjectByName(`${side}Arm`), fore = figure.getObjectByName(`${side}ForeArm`), hand = figure.getObjectByName(`${side}Hand`);
  if (!arm || !fore || !hand) return null;
  figure.updateMatrixWorld(true);
  figure.getWorldQuaternion(AQ);
  AD.copy(aim).applyQuaternion(AQ);   // the aim, in the world
  const turn = (bone, from, to) => {
    bone.updateMatrixWorld(true);
    from.getWorldPosition(AV); to.getWorldPosition(AW);
    const q = new THREE.Quaternion().setFromUnitVectors(AW.sub(AV).normalize(), AD);
    // the bone's world turn, turned by q, back into its parent's frame
    bone.getWorldQuaternion(AP);
    AP.premultiply(q);
    bone.parent.getWorldQuaternion(AQ);
    bone.quaternion.copy(AQ.invert().multiply(AP));
    bone.updateMatrixWorld(true);
  };
  turn(arm, arm, fore);
  turn(fore, fore, hand);
  hand.updateMatrixWorld(true);
  hand.getWorldQuaternion(AP);
  AQ.setFromUnitVectors(new THREE.Vector3(0, 0, 1), AD);
  held.quaternion.copy(AP.invert().multiply(AQ));
  hand.getWorldPosition(AV);
  hand.worldToLocal(AV.addScaledVector(AD, 0.06));
  held.position.copy(AV);
  hand.add(held);
  return { arm, fore, qa: arm.quaternion.clone(), qf: fore.quaternion.clone() };
}
