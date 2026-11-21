// The suburbs beside a line (suburbs.js lays them out) built from the Neighborhood Pathways kit's parts, loaded one by one
// from the parts folder beside the kits, or Polyfork's CDN (parts.js cdnPart: that kit isn't self-hosted whole). Each
// different part is made once, its meshes merged into one shape, and
// drawn as an InstancedMesh, one instance per piece (some thirty meshes for every house, fence and tree); each house
// stands on a plinth of dressed stone down to its lowest ground (one more instanced box). Built a slice at a time
// (slicer.js): the layout and the instances in small steps a frame, the parts one a frame, so no frame waits on it.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { cdnPart } from './parts.js';
import { suburbLayoutJob } from './suburbs.js';

// each part's Polyfork asset id
export const ASSETS = {
  'single-storey-ranch-house': 'single-storey-ranch-house-3880ea', 'split-level-house': 'split-level-house-40fe1a',
  'two-storey-family-house': 'two-storey-family-house-c63c4a', 'porch-front-cottage': 'porch-front-cottage-620c29',
  'ornamental-front-yard-tree': 'ornamental-front-yard-tree-c6781a', 'broad-canopy-shade-tree': 'broad-canopy-shade-tree-e7c4a2',
  'wooden-fence-section': 'wooden-fence-section-d72055', 'residential-street-tile': 'residential-street-tile-f07dda',
  'curbside-mailbox': 'curbside-mailbox-0e0736', 'family-crossover-suv': 'family-crossover-suv-42027f',
};
const plinthMat = new THREE.MeshStandardMaterial({ color: '#b3a894', roughness: 0.95, flatShading: true });
const STEP = 60;   // pieces placed between yields

const partKey = (q) => q.key + JSON.stringify(q.params);

// a part's meshes as few shapes as it has materials (a Polyfork part has one): its meshes' geometry, each placed as it
// stands in the part, merged into one (a few thousand triangles: a part-sized copy, once)
export function shapes(part) {
  const byMat = new Map();
  part.traverse((o) => {
    if (!o.isMesh) return;
    const g = (o.geometry.index ? o.geometry.toNonIndexed() : o.geometry.clone()).applyMatrix4(o.matrixWorld);
    if (!byMat.has(o.material)) byMat.set(o.material, []);
    byMat.get(o.material).push(g);
  });
  return [...byMat].map(([material, gs]) => {
    const names = Object.keys(gs[0].attributes).filter((n) => gs.every((g) => g.attributes[n]));
    for (const g of gs) for (const n of Object.keys(g.attributes)) if (!names.includes(n)) g.deleteAttribute(n);
    const geometry = gs.length === 1 ? gs[0] : mergeGeometries(gs);
    if (gs.length > 1) for (const g of gs) g.dispose();
    return { geometry, material };
  });
}

// the instances, as a job: each piece's matrix, then one InstancedMesh per part's shape
function* instancesJob(pieces, parts) {
  const group = new THREE.Group();
  const lists = new Map();   // part key -> [matrix]
  const plinths = [];
  const e = new THREE.Euler(0, 0, 0, 'YXZ'), qt = new THREE.Quaternion(), at = new THREE.Vector3(), one = new THREE.Vector3(1, 1, 1);
  pieces.forEach((q) => { if (!lists.has(partKey(q))) lists.set(partKey(q), []); });
  for (let i = 0; i < pieces.length; i++) {
    const q = pieces[i];
    // turned by its yaw, tilted (a street tile or a car) to its slope: its local (u, v) rising v sin pitch + u sin roll
    e.set(-(q.pitch ?? 0), q.yaw, q.roll ?? 0);
    const place = new THREE.Matrix4().compose(at.set(q.x, q.y, q.z), qt.setFromEuler(e), one);
    lists.get(partKey(q)).push(place);
    if (q.kind === 'house') {
      const h = q.y - q.plinth;
      // a unit box, its top at the house's floor, as wide and deep as the house and a little more
      plinths.push(place.clone().multiply(new THREE.Matrix4().makeScale(q.along + 0.3, h, q.across + 0.3)).multiply(new THREE.Matrix4().makeTranslation(0, -0.5, 0)));
    }
    if (i % STEP === STEP - 1) yield;
  }
  for (const [k, places] of lists) {
    for (const { geometry, material } of shapes(parts.get(k))) {
      const im = new THREE.InstancedMesh(geometry, material, places.length);
      places.forEach((m, j) => im.setMatrixAt(j, m));
      im.computeBoundingSphere();
      im.castShadow = true; im.receiveShadow = true;
      im.name = `suburbs ${k.split('{')[0]}`;
      im.userData.own = true;
      group.add(im);
    }
    yield;
  }
  if (plinths.length) {
    const im = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), plinthMat, plinths.length);
    plinths.forEach((m, j) => im.setMatrixAt(j, m));
    im.computeBoundingSphere();
    im.castShadow = true; im.receiveShadow = true;
    im.name = 'suburbs plinths';
    im.userData.own = true;
    group.add(im);
  }
  return group;
}

// -> { group, dispose() }: the suburbs along a leg, built through `slicer`
export async function buildSuburbs(legId, terrain, slicer) {
  const pieces = await slicer.run(suburbLayoutJob(legId, terrain));
  const parts = new Map();
  for (const q of pieces) {
    const k = partKey(q);
    if (parts.has(k)) continue;
    await slicer.frame();   // a kit part can't be sliced: one a frame
    const o = await cdnPart(ASSETS[q.key], q.params);
    o.updateMatrixWorld(true);
    parts.set(k, o);
  }
  const group = await slicer.run(instancesJob(pieces, parts));
  for (const o of parts.values()) o.traverse((m) => m.geometry?.dispose());   // the parts themselves: their shapes were copied
  group.name = `suburbs ${legId}`;
  return {
    group,
    dispose() {
      group.removeFromParent();
      for (const im of group.children) { im.dispose(); im.geometry.dispose(); }   // the instance buffers and the shapes
    },
  };
}
