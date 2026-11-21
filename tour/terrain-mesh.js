// Ground meshes from the terrain height function, in square chunks with skirts so neighbours of different detail never crack.
import * as THREE from 'three';

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

const material = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, metalness: 0, flatShading: false });

export function buildTerrainChunk(terrain, x0, z0, size = 256, cell = 4) {
  const n = Math.round(size / cell) + 1;
  // grid plus a skirt ring: (n + 2)^2 vertices, the outer ring dropped 4 m below its neighbour
  const N = n + 2, pos = new Float32Array(N * N * 3), col = new Float32Array(N * N * 3), nor = new Float32Array(N * N * 3);
  // heights on the grid plus one cell beyond it, so normals at chunk edges match the neighbour's
  const H = new Float32Array((n + 2) * (n + 2));
  for (let j = -1; j <= n; j++) for (let i = -1; i <= n; i++) H[(j + 1) * (n + 2) + (i + 1)] = terrain.heightAt(x0 + i * cell, z0 + j * cell);
  const hAt = (i, j) => H[(j + 1) * (n + 2) + (i + 1)];
  const c = new THREE.Color(), nv = new THREE.Vector3();
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
    const gi = Math.min(n - 1, Math.max(0, i - 1)), gj = Math.min(n - 1, Math.max(0, j - 1));
    const x = x0 + gi * cell, z = z0 + gj * cell;
    const skirt = i === 0 || j === 0 || i === N - 1 || j === N - 1;
    const h = hAt(gi, gj) - (skirt ? 4 : 0);
    const k = (j * N + i) * 3;
    pos[k] = x; pos[k + 1] = h; pos[k + 2] = z;
    nv.set(hAt(gi - 1, gj) - hAt(gi + 1, gj), 2 * cell, hAt(gi, gj - 1) - hAt(gi, gj + 1)).normalize();
    nor[k] = nv.x; nor[k + 1] = nv.y; nor[k + 2] = nv.z;
    const set = COLOURS[terrain.regionAt(x, z)] ?? COLOURS.grass;
    const t = tint(x, z);
    c.copy(set[0]).lerp(set[Math.min(set.length - 1, 1)], t);
    if (set.length > 2) c.lerp(set[2], Math.max(0, 0.5 - t));
    col[k] = c.r; col[k + 1] = c.g; col[k + 2] = c.b;
  }
  const idx = [];
  for (let j = 0; j < N - 1; j++) for (let i = 0; i < N - 1; i++) {
    const a = j * N + i, b = a + 1, d = a + N, e = d + 1;
    idx.push(a, d, b, b, d, e);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  geo.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  geo.setIndex(idx);
  const mesh = new THREE.Mesh(geo, material);
  mesh.receiveShadow = true;
  mesh.name = `terrain ${x0},${z0}`;
  return mesh;
}

// every chunk over an area; finer where `fine(x, z)` says the player will be close
export function buildTerrain(terrain, { x0, z0, x1, z1, size = 256, fine }) {
  const group = new THREE.Group();
  group.name = 'terrain';
  for (let z = z0; z < z1; z += size) for (let x = x0; x < x1; x += size) {
    const cell = fine(x + size / 2, z + size / 2) ? 4 : 16;
    group.add(buildTerrainChunk(terrain, x, z, size, cell));
  }
  return group;
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
