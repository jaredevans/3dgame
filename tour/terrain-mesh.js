// Ground meshes from the terrain height function: one chunk of the world grid at a time (its arrays from chunks.js), and the sea.
import * as THREE from 'three';
import { CHUNK, chunkGrid } from './chunks.js';

const COLOURS = {
  grass: [new THREE.Color('#7da552'), new THREE.Color('#93b562'), new THREE.Color('#6f9a4a')],
  sand: [new THREE.Color('#e4d4a6'), new THREE.Color('#dccb98')],
  rock: [new THREE.Color('#8e877b'), new THREE.Color('#a39b8c')],
  snow: [new THREE.Color('#f3f6f8'), new THREE.Color('#e3ecf3')],
  redrock: [new THREE.Color('#c4633b'), new THREE.Color('#b4532f'), new THREE.Color('#d07a4a')],
  scree: [new THREE.Color('#b3a48f'), new THREE.Color('#a39580')],
  paving: [new THREE.Color('#a19f99')],
  sea: [new THREE.Color('#c9b98d'), new THREE.Color('#9b9a7c')],   // the sea floor, seen through the water
};
const tint = (x, z) => (Math.sin(x * 0.031 + z * 0.017) * Math.sin(z * 0.023 - x * 0.011) + 1) / 2;

// shared by every chunk: never disposed with one
const material = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, metalness: 0, flatShading: false });
const c = new THREE.Color();
function paint(col, k, region, x, z) {
  const set = COLOURS[region] ?? COLOURS.grass, t = tint(x, z);
  c.copy(set[0]).lerp(set[Math.min(set.length - 1, 1)], t);
  if (set.length > 2) c.lerp(set[2], Math.max(0, 0.5 - t));
  col[k] = c.r; col[k + 1] = c.g; col[k + 2] = c.b;
}

// chunk (i, j) of the world grid (chunks.js): `size` metres square, a vertex every `cell` metres
export function buildTerrainChunk(terrain, i, j, size = CHUNK, cell = 4) {
  const { pos, col, nor, idx } = chunkGrid(terrain, i, j, size, cell, paint);
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  geo.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  geo.setIndex(new THREE.BufferAttribute(idx, 1));
  geo.computeBoundingSphere();
  const mesh = new THREE.Mesh(geo, material);
  mesh.receiveShadow = true;
  mesh.name = `terrain ${i},${j}:${cell}`;
  return mesh;
}

export function buildSea(level = 0, span = 16000) {
  const geo = new THREE.PlaneGeometry(span, span, 1, 1);
  geo.rotateX(-Math.PI / 2);
  const sea = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({
    color: '#4f9db0', roughness: 0.25, metalness: 0.05, transparent: true, opacity: 0.86,
  }));
  sea.position.y = level;
  sea.name = 'sea';
  sea.receiveShadow = true;
  return sea;
}
