// The scenery along the routes (scenery.js lays it out) drawn with the land's chunks: each part made once, its meshes
// merged into one shape (suburbs-mesh.js shapes()), and a chunk's pieces of it drawn as one InstancedMesh. The shapes are
// shared by every chunk and kept; a chunk's own instance buffers go with it. A fine chunk draws all its pieces; a
// mid-detail one (700 m and more away) only its big trees.
import * as THREE from 'three';
import { part } from './parts.js';
import { VARIANTS } from './scenery.js';
import { shapes } from './suburbs-mesh.js';

const made = new Map();   // variant id -> its shapes [{ geometry, material }], or null if its part couldn't be made

// make every part the scenery uses, once; one that can't be made is left out (warn(variant, err)), never stopping the tour
export async function loadScenery(warn = (v, err) => console.warn(`The ${v.key} was left out of the scenery: ${err?.url ? `could not load ${err.url}` : err?.message ?? err}`)) {
  await Promise.all(Object.values(VARIANTS).map(async (v) => {
    if (made.has(v.id)) return;
    try {
      const o = await part(v.kit, v.key, v.params);
      o.updateMatrixWorld(true);
      made.set(v.id, shapes(o));
      o.traverse((m) => m.geometry?.dispose());   // the part itself: its shapes were copied
    } catch (err) { made.set(v.id, null); warn(v, err); }
  }));
}

const e = new THREE.Euler(), q = new THREE.Quaternion(), at = new THREE.Vector3(), one = new THREE.Vector3(1, 1, 1), m = new THREE.Matrix4();
// a chunk's pieces as a group of InstancedMeshes (fine: all of them; else only the big trees), or null if none
export function sceneryGroup(items, { fine = true, name = 'scenery' } = {}) {
  const byV = new Map();
  for (const it of items) {
    const v = VARIANTS[it.v];
    if (!(fine || v.far) || !made.get(it.v)) continue;
    if (!byV.has(it.v)) byV.set(it.v, []);
    byV.get(it.v).push(it);
  }
  if (!byV.size) return null;
  const group = new THREE.Group();
  group.name = name;
  for (const [id, list] of byV) {
    for (const { geometry, material } of made.get(id)) {
      const im = new THREE.InstancedMesh(geometry, material, list.length);
      list.forEach((it, k) => im.setMatrixAt(k, m.compose(at.set(it.x, it.y, it.z), q.setFromEuler(e.set(0, it.ry, 0)), one)));
      im.computeBoundingSphere();
      im.castShadow = !!VARIANTS[id].far;   // the trees cast shadows; the small things don't
      im.receiveShadow = true;
      im.name = `${name} ${id}`;
      group.add(im);
    }
  }
  return group;
}

// one piece of every scenery shape, far below the ground: to compile their programs once, before any chunk draws them
export function sceneryWarmup() {
  return sceneryGroup(Object.keys(VARIANTS).map((v) => ({ v, x: 0, y: -1000, z: 0, ry: 0 })), { name: 'scenery warm-up' });
}

// free a chunk's group: its instance buffers (the shapes are shared, and kept)
export function disposeScenery(group) {
  if (!group) return;
  group.removeFromParent();
  for (const im of group.children) im.dispose();
}
