// Polyfork's animals with their own authored clips: the GLB (its .mjs builds the model without them), loaded once per
// id from the parts folder beside the kits (or Polyfork's public CDN if it isn't there), each copy cloned with its
// skeleton and played by its own AnimationMixer. While HD is on (hd.js) each is dressed in HD once, as it loads: Polyfork's
// materials engine gives this same mesh PBR materials by colour zone (its -params.json says what each zone is made of),
// and every copy shares them (a clone shares its source's geometry and materials). If that fails, it stays flat.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import * as SkeletonUtils from 'three/addons/utils/SkeletonUtils.js';
import { firstOf, fellBack, partBases } from '../parts.js';
import { animalHow, warnFlat, hdLight, HD_WAIT } from '../hd.js';
import { withTimeout } from '../hd-switch.js';
import { clipFor } from './clips.js';

export { clipFor };

const loader = new GLTFLoader();
const loads = new Map();   // id -> promise of the gltf

// dress a loaded animal in HD (hd.js), in place, if HD is on: its zones found by their albedo, smoothed and blended as
// the materials engine does for an organic body, and lit for its materials (whatever was dressed, even if dressing the
// rest threw); -> meshes dressed (0: left flat). How it's dressed is waited on HD_WAIT s at most (its -params.json from a
// host that never answers): after that it stays flat
async function dressHd(id, scene) {
  let how;
  try { how = await withTimeout(animalHow(id), HD_WAIT * 1000, `the ${id}'s -params.json`); } catch (err) { warnFlat(`dress of the ${id}`, err); return 0; }
  if (!how) return 0;
  try {
    return how.engine.dressByAlbedo(scene, how.zones, how.materials);
  } catch (err) { warnFlat(`dress of the ${id}`, err); return 0; } finally { hdLight(scene, (o) => Array.isArray(o.material)); }
}

// -> { make() -> Animal }; throws an error naming the URL if the load fails (and forgets it, so it's tried again)
export function loadAnimal(id) {
  if (!loads.has(id)) {
    const bases = partBases(), url = `${bases[bases.length - 1]}${id}.glb`;
    // each base given HD_WAIT s (the account CDN first, when configured: a host that never answers is given up on and the
    // next base tried)
    const load = (u) => withTimeout(loader.loadAsync(u), HD_WAIT * 1000, `${id}.glb`);
    loads.set(id, firstOf(bases, `${id}.glb`, load, fellBack).then(async (gltf) => {
      await dressHd(id, gltf.scene);
      return gltf;
    }, (err) => {
      loads.delete(id);
      const e = new Error(`could not load ${url}: ${err?.message ?? err}`);
      e.url = url;
      throw e;
    }));
  }
  return loads.get(id).then((gltf) => ({
    clips: gltf.animations.map((a) => a.name),
    // Animal = { object, clips, play(name, { timeScale, fade }), update(dt) }
    make() {
      const object = SkeletonUtils.clone(gltf.scene);
      object.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
      const mixer = new THREE.AnimationMixer(object);
      const actions = new Map(gltf.animations.map((a) => [a.name, mixer.clipAction(a)]));
      let current = null;
      return {
        object,
        clips: [...actions.keys()],
        play(name, { timeScale = 1, fade = 0.3 } = {}) {
          const next = actions.get(name);
          if (!next) return;
          next.timeScale = timeScale;
          if (next === current) return;
          next.reset().play();
          if (current) current.crossFadeTo(next, fade, false);
          current = next;
        },
        update(dt) { mixer.update(dt); },
      };
    },
  }));
}
