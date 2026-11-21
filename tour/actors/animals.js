// Polyfork's CDN animals with their own authored clips: the GLB (its .mjs builds the model without them), loaded once
// per id, each copy cloned with its skeleton and played by its own AnimationMixer.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import * as SkeletonUtils from 'three/addons/utils/SkeletonUtils.js';
import { CDN } from '../config.js';
import { clipFor } from './clips.js';

export { clipFor };

const loader = new GLTFLoader();
const loads = new Map();   // id -> promise of the gltf

// -> { make() -> Animal }; throws an error naming the URL if the load fails (and forgets it, so it's tried again)
export function loadAnimal(id) {
  if (!loads.has(id)) {
    const url = `${CDN}${id}.glb`;
    loads.set(id, loader.loadAsync(url).catch((err) => {
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
