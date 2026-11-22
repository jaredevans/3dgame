// The stagecoach's road (world-data.js coachRoad), drawn on the bench cut for it: a dirt strip ROAD.half either side
// of its line, its wheel ruts worn darker, laid on the land as it's drawn (world-data.js roadSurface: on heightAt, or
// over the drawn land where that stands higher between its corners) with a skirt hanging from each edge, so no gap
// shows under it where the land falls away. Built with its leg (mountain-west), always there as the bench is; the
// ride's kit has only the coach and its set piece.
import * as THREE from 'three';
import { coachRoad, roadSurface, ROAD } from '../world-data.js';

// across the road (m to its left): its edges, its ruts, its crown; and the skirts, out a little and hanging down
const ACROSS = [-ROAD.half, -1.25, -0.85, -0.45, 0, 0.45, 0.85, 1.25, ROAD.half];
const SKIRT = { out: 0.25, down: 0.6 };
const DIRT = new THREE.Color('#a98a62'), RUT = new THREE.Color('#87694a'), EDGE = new THREE.Color('#9c8a68');
const material = new THREE.MeshStandardMaterial({
  vertexColors: true, roughness: 1, metalness: 0, flatShading: false,
  polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3,   // (over the land, and over the canyon's own coach road where they cross)
});

// the road's arrays, a row at a time (a generator for the slicer: it yields after each row; it returns { pos, col,
// idx, origin }), on `terrain` as it stands
export function* roadJob(terrain) {
  const { pts } = coachRoad(), n = pts.length, cols = ACROSS.length + 2;
  const pos = new Float32Array(n * cols * 3), col = new Float32Array(n * cols * 3), o = pts[0], q = {}, c = new THREE.Color();
  for (let i = 0; i < n; i++) {
    // its way here (from the samples either side) and its left
    const a = pts[Math.max(0, i - 1)], b = pts[Math.min(n - 1, i + 1)], len = Math.hypot(b.x - a.x, b.z - a.z) || 1;
    const lx = (b.z - a.z) / len, lz = -(b.x - a.x) / len, s = i * 2;
    const edgeY = [0, 0];
    for (let j = 0; j < cols; j++) {
      // the skirts at either end of the row, then the road across
      const skirt = j === 0 ? -1 : j === cols - 1 ? 1 : 0;
      const d = skirt ? skirt * (ROAD.half + SKIRT.out) : ACROSS[j - 1];
      q.x = pts[i].x + lx * d; q.z = pts[i].z + lz * d;
      let y;
      if (skirt) y = edgeY[skirt < 0 ? 0 : 1] - SKIRT.down;
      else {
        y = roadSurface(terrain, q.x, q.z);
        if (j === 1) edgeY[0] = y;
        if (j === cols - 2) edgeY[1] = y;
      }
      const k = (i * cols + j) * 3;
      pos[k] = q.x - o.x; pos[k + 1] = y; pos[k + 2] = q.z - o.z;
      // dirt, its ruts darker, its edges paler, mottled along its way
      const a = Math.abs(d), mottle = 0.94 + 0.06 * Math.sin(s * 0.37 + d * 1.7) * Math.sin(s * 0.11 + 1);
      c.copy(a > ROAD.half - 0.1 ? EDGE : Math.abs(a - 0.85) < 0.2 ? RUT : DIRT).multiplyScalar(mottle);
      col[k] = c.r; col[k + 1] = c.g; col[k + 2] = c.b;
    }
    // (the skirt's top is its edge's: fill in its edge's height now it's known)
    pos[(i * cols) * 3 + 1] = edgeY[0] - SKIRT.down;
    pos[(i * cols + cols - 1) * 3 + 1] = edgeY[1] - SKIRT.down;
    yield;
  }
  const idx = new Uint32Array((n - 1) * (cols - 1) * 6);
  let m = 0;
  for (let i = 0; i < n - 1; i++) for (let j = 0; j < cols - 1; j++) {
    // (wound face-up: the row ahead is +along, the column to its left +across)
    const a = i * cols + j, b = a + 1, e = a + cols, f = e + 1;
    idx[m++] = a; idx[m++] = b; idx[m++] = e; idx[m++] = b; idx[m++] = f; idx[m++] = e;
  }
  return { pos, col, idx, origin: { x: o.x, z: o.z } };
}

// the road's mesh from its arrays
export function roadMesh({ pos, col, idx, origin }) {
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  geo.setIndex(new THREE.BufferAttribute(idx, 1));
  geo.computeVertexNormals();
  geo.computeBoundingSphere();
  // wound face-up whichever way the road runs
  if (geo.attributes.normal.getY(Math.floor(ACROSS.length / 2) + 1) < 0) {
    for (let i = 0; i < idx.length; i += 3) { const t = idx[i + 1]; idx[i + 1] = idx[i + 2]; idx[i + 2] = t; }
    geo.index.needsUpdate = true;
    geo.computeVertexNormals();
  }
  const mesh = new THREE.Mesh(geo, material);
  mesh.name = 'stagecoach ride road';
  mesh.position.set(origin.x, 0, origin.z);
  mesh.receiveShadow = true;
  mesh.castShadow = false;
  return mesh;
}
