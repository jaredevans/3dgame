// The Wild West's living things: its tumbleweeds (owner, 2026-11-22), the kit's own swapped for Polyfork's tumbleweed in
// its HD edition when HD is on (hd.js hdAsset; flat otherwise), each where the kit's stood, as big and turned as it was,
// rocking a little in the wind. (The kit keeps its own out of its merged meshes for this: world-data.js `keep`.)
import * as THREE from 'three';
import { hdAsset } from '../hd.js';
import { TUMBLEWEED } from '../actors/canyon.js';

const ROCK = { amp: 0.05, rate: 0.7 };   // radians, and turns a second

export async function buildWestLife({ place, still, warn = (what, err) => console.warn(`The Wild West's ${what} were left out: ${err?.url ?? err?.message ?? err}`) }) {
  const group = new THREE.Group();
  group.name = 'Wild West life';
  const kept = place.kitPlace.of?.('tumbleweed') ?? [];
  const weeds = [], box = new THREE.Box3(), size = new THREE.Vector3();
  for (const [i, old] of kept.entries()) {
    await still();
    old.updateMatrixWorld(true);
    box.setFromObject(old).getSize(size);
    let obj;
    try {
      obj = await hdAsset(TUMBLEWEED, { diameter: Math.min(1.1, Math.max(0.5, Math.max(size.x, size.z))), arrangement: 1 + (i % 8), colorway: i % 2 ? 'sun-bleached' : 'desert-straw' });
    } catch (err) { if (err?.dropped) throw err; warn('tumbleweeds', err); break; }
    obj.name = 'tumbleweed';
    obj.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
    // where the kit's stood, in its frame
    obj.position.copy(old.position);
    obj.rotation.copy(old.rotation);
    old.parent.add(obj);
    old.visible = false;
    weeds.push({ obj, yaw: obj.rotation.y, phase: i * 1.3 });
  }
  let t = 0;
  return {
    group,
    update(dt) {
      t += dt;
      for (const w of weeds) w.obj.rotation.z = ROCK.amp * Math.sin(2 * Math.PI * ROCK.rate * t + w.phase);
    },
  };
}
