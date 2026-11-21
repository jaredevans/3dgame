// The suburbs beside a line (suburbs.js lays them out) built from the Neighborhood Pathways kit's parts, loaded from
// Polyfork's CDN (that kit isn't self-hosted): each different part made once, then every piece's copy merged with the
// others of the same material into one mesh, so a few hundred houses, fences and trees cost a few draw calls. Each house
// stands on a plinth of dressed stone down to its lowest ground. Built with its leg and freed with it.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { cdnPart } from './parts.js';
import { suburbLayout } from './suburbs.js';

// each part's Polyfork asset id
export const ASSETS = {
  'single-storey-ranch-house': 'single-storey-ranch-house-3880ea', 'split-level-house': 'split-level-house-40fe1a',
  'two-storey-family-house': 'two-storey-family-house-c63c4a', 'porch-front-cottage': 'porch-front-cottage-620c29',
  'ornamental-front-yard-tree': 'ornamental-front-yard-tree-c6781a', 'broad-canopy-shade-tree': 'broad-canopy-shade-tree-e7c4a2',
  'wooden-fence-section': 'wooden-fence-section-d72055', 'residential-street-tile': 'residential-street-tile-f07dda',
  'curbside-mailbox': 'curbside-mailbox-0e0736', 'family-crossover-suv': 'family-crossover-suv-42027f',
};
const plinthMat = new THREE.MeshStandardMaterial({ color: '#b3a894', roughness: 0.95, flatShading: true });

// -> a group of merged meshes; group.userData.dispose() frees them
export async function buildSuburbs(legId, terrain) {
  const pieces = suburbLayout(legId, terrain);
  const group = new THREE.Group();
  group.name = `suburbs ${legId}`;
  const made = new Map();   // key + params -> the part, made once
  for (const q of pieces) {
    const k = q.key + JSON.stringify(q.params);
    if (!made.has(k)) made.set(k, cdnPart(ASSETS[q.key], q.params));
  }
  const parts = new Map(await Promise.all([...made].map(async ([k, p]) => { const o = await p; o.updateMatrixWorld(true); return [k, o]; })));
  const bags = new Map();   // material -> geometries placed in the world
  const bag = (m) => { if (!bags.has(m)) bags.set(m, []); return bags.get(m); };
  const place = new THREE.Matrix4(), each = new THREE.Matrix4(), e = new THREE.Euler(0, 0, 0, 'YXZ'), qt = new THREE.Quaternion();
  const at = new THREE.Vector3(), one = new THREE.Vector3(1, 1, 1);
  const plinths = [];
  for (const q of pieces) {
    // turned by its yaw, tilted (a street tile or a car) to its slope: its local (u, v) rising v sin pitch + u sin roll
    e.set(-(q.pitch ?? 0), q.yaw, q.roll ?? 0);
    place.compose(at.set(q.x, q.y, q.z), qt.setFromEuler(e), one);
    parts.get(q.key + JSON.stringify(q.params)).traverse((o) => {
      if (!o.isMesh) return;
      const g = o.geometry.index ? o.geometry.toNonIndexed() : o.geometry.clone();
      bag(o.material).push(g.applyMatrix4(each.multiplyMatrices(place, o.matrixWorld)));
    });
    if (q.kind === 'house') {
      const h = q.y - q.plinth, b = new THREE.BoxGeometry(q.along + 0.3, h, q.across + 0.3).toNonIndexed();
      b.translate(0, -h / 2, 0);
      plinths.push(b.applyMatrix4(place));
    }
  }
  if (plinths.length) bag(plinthMat).push(...plinths);
  for (const [material, gs] of bags) {
    // only the attributes every one of them has, so they merge
    const names = Object.keys(gs[0].attributes).filter((n) => gs.every((g) => g.attributes[n]));
    for (const g of gs) for (const n of Object.keys(g.attributes)) if (!names.includes(n)) g.deleteAttribute(n);
    const merged = mergeGeometries(gs);
    for (const g of gs) g.dispose();
    const mesh = new THREE.Mesh(merged, material);
    mesh.castShadow = true; mesh.receiveShadow = true;
    mesh.name = 'suburbs';
    group.add(mesh);
  }
  for (const o of parts.values()) o.traverse((m) => m.geometry?.dispose());   // the parts were copied: their own geometry goes
  group.userData.dispose = () => {
    group.removeFromParent();
    group.traverse((o) => o.geometry?.dispose());
  };
  return group;
}
