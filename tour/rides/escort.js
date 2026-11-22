// The flying car's escort: other hover pods and cargo skiffs of the Chrome Arcology kit flying with it in loose formation
// (rides.js formationOffsets / placeEscort say where), one of them passing it over the river with a whoosh. They stand
// in the scene from the build, hidden until the ride's event ('escort') runs, and are lit after dark as the car is.
import * as THREE from 'three';
import { kitNight } from '../actors/metro.js';
import { lightZones } from '../actors/coast.js';
import { sound } from '../audio.js';
import { ESCORT, formationOffsets, placeEscort } from '../rides.js';

const KINDS = [
  { key: 'commuter-hover-pod', params: {} },
  { key: 'hover-cargo-skiff', params: {} },
];

// -> the actor of the 'escort' event (actors/index.js contract), or throws if neither kind of craft can be loaded (the
// caller leaves the escort out and warns). One of each is made and lit once; the escort are clones that share their
// geometry and materials (so the night level is set once for all)
export async function buildEscort({ ride, slicer, still, kit, warn }) {
  const made = [], glow = [];
  for (const k of KINDS) {
    await slicer.frame();
    await still();
    try {
      const craft = await kit('future', k.key, k.params);
      craft.traverse((o) => { if (o.isMesh) { o.castShadow = false; o.receiveShadow = false; } });
      try { glow.push(...lightZones(craft, await kitNight('future', k.key, k.params)).mats); } catch (err) { warn('escort lights', err); }
      made.push(craft);
    } catch (err) {
      if (err?.dropped) throw err;
      warn(`escort ${k.key}`, err);
    }
  }
  if (!made.length) throw new Error('no escort craft could be loaded');
  const group = new THREE.Group();
  group.name = 'flying car escort';
  const craft = [];
  for (let i = 0; i < ESCORT.count; i++) {
    const c = made[i % made.length].clone(true);
    c.visible = false;
    group.add(c);
    craft.push(c);
  }
  const offs = formationOffsets(0), slot = {}, o = {};
  let passing = 0, night = -1;
  return {
    group,
    update(f) {
      if (!f.on) { for (const c of craft) c.visible = false; passing = 0; return; }
      formationOffsets(f.on.t, offs);
      for (let i = 0; i < craft.length; i++) {
        placeEscort(ride, f.rideS, offs[i], o);
        const c = craft[i];
        c.visible = o.visible;
        if (!o.visible) continue;
        c.position.set(o.x, o.y - ride.rest, o.z);   // (the path is ride.rest over a craft's own origin, as the car's is)
        c.rotation.set(o.pitch, o.yaw, 0, 'YXZ');
        c.scale.setScalar(o.scale);
      }
      // the last of them passes: the whoosh as it draws level with the car
      const along = offs[craft.length - 1].along;
      if (passing < 0 && along >= 0) sound('whoosh');
      passing = along < 0 ? -1 : 1;
      const k = Math.min(1, Math.max(0, f.night));
      if (k !== night) { night = k; for (const m of glow) m.emissiveIntensity = k; }
    },
    dispose() {},   // (the group is freed with the rest of the ride's, at a standstill)
  };
}
