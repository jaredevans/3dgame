// Track generated along a route: ballast, sleepers and two rails per line. The kit's straight and 45° pieces can't follow
// a free curve, so this matches their look instead: route.y is the formation (vehicle origin), rail tops at +0.30 m.
// None is laid on a guideway (structures.js trackRuns): a train glides on the guideway's own deck there.
import * as THREE from 'three';
import { trackRuns } from './structures.js';

const GAUGE = 1.435, RAIL_TOP = 0.30, RAIL_H = 0.1, RAIL_W = 0.07;
const BALLAST_TOP = 0.17, BALLAST_TOP_HALF = 1.75, BALLAST_FOOT_HALF = 2.5;
const SLEEPER = { len: 2.6, h: 0.12, w: 0.26, every: 0.7 };
const STEP = 2;

const ballastMat = new THREE.MeshStandardMaterial({ color: '#948e84', roughness: 1, side: THREE.DoubleSide });
const railMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.45, metalness: 0.4, side: THREE.DoubleSide });
const sleeperMat = new THREE.MeshStandardMaterial({ color: '#6b5643', roughness: 0.95 });

// a strip along the route from s0 to s1 from a cross-section [[lateral offset, height], ...]; colours per section point
// optional
function sweep(route, lateral, section, colours, s0 = 0, s1 = route.length) {
  const steps = Math.max(1, Math.ceil((s1 - s0) / STEP)), m = section.length;
  const pos = new Float32Array((steps + 1) * m * 3), col = colours ? new Float32Array((steps + 1) * m * 3) : null;
  const p = {};
  for (let i = 0; i <= steps; i++) {
    const s = Math.min(s1, s0 + i * STEP);
    for (let k = 0; k < m; k++) {
      route.offsetAt(s, lateral + section[k][0], p);
      const o = (i * m + k) * 3;
      pos[o] = p.x; pos[o + 1] = p.y + section[k][1]; pos[o + 2] = p.z;
      if (col) { col[o] = colours[k].r; col[o + 1] = colours[k].g; col[o + 2] = colours[k].b; }
    }
  }
  const idx = [];
  for (let i = 0; i < steps; i++) for (let k = 0; k < m - 1; k++) {
    const a = i * m + k, b = a + 1, c = a + m, d = c + 1;
    idx.push(a, b, c, b, d, c);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  if (col) geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  return geo;
}

export function buildTrack(route, lateral, sections = route.sections ?? []) {
  const group = new THREE.Group();
  group.name = `track ${lateral}`;
  const runs = trackRuns(route.length, sections);
  const steel = new THREE.Color('#6d6862'), shine = new THREE.Color('#c4c0b8');
  for (const [s0, s1] of runs) {
    // offsets are measured to the left; a section listed left-to-right in travel faces up with this winding
    const ballast = new THREE.Mesh(sweep(route, lateral, [
      [BALLAST_FOOT_HALF, -0.06], [BALLAST_TOP_HALF, BALLAST_TOP], [-BALLAST_TOP_HALF, BALLAST_TOP], [-BALLAST_FOOT_HALF, -0.06],
    ], null, s0, s1), ballastMat);
    ballast.receiveShadow = true;
    group.add(ballast);
    for (const side of [-1, 1]) {
      const c = side * GAUGE / 2, w = RAIL_W / 2, lo = RAIL_TOP - RAIL_H;
      const rail = new THREE.Mesh(sweep(route, lateral, [
        [c + w, lo], [c + w, RAIL_TOP], [c + w, RAIL_TOP], [c - w, RAIL_TOP], [c - w, RAIL_TOP], [c - w, lo],
      ], [steel, steel, shine, shine, steel, steel], s0, s1), railMat);
      rail.castShadow = true;
      group.add(rail);
    }
  }

  const at = [];
  for (let i = 0; i < Math.floor(route.length / SLEEPER.every); i++) {
    const s = (i + 0.5) * SLEEPER.every;
    if (runs.some(([a, b]) => s >= a && s <= b)) at.push(s);
  }
  const sleepers = new THREE.InstancedMesh(new THREE.BoxGeometry(SLEEPER.len, SLEEPER.h, SLEEPER.w), sleeperMat, Math.max(1, at.length));
  sleepers.count = at.length;
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(0, 0, 0, 'YXZ'), v = new THREE.Vector3(), one = new THREE.Vector3(1, 1, 1);
  const p = {};
  at.forEach((s, i) => {
    route.offsetAt(s, lateral, p);
    e.set(-p.pitch, p.yaw, 0);
    v.set(p.x, p.y + RAIL_TOP - RAIL_H - SLEEPER.h / 2, p.z);
    sleepers.setMatrixAt(i, m.compose(v, q.setFromEuler(e), one));
  });
  sleepers.receiveShadow = true;
  group.add(sleepers);
  return group;
}
