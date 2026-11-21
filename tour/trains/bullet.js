// The Silver Arrow: a bullet train built in code (Polyfork has none), in the kits' low-poly look: flat colours, few
// faces, the Chrome Arcology's whites and greys with a blue window band and stripe. Lofted from trains/bullet-shape.js:
// white cars on skirts that hide the running gear, a long sculpted nose on both end cars with a dark glass canopy, a
// pantograph on its fairing. Returns the same Train as vehicles.js buildTrain: { name, group, cars }, each car measured.
import * as THREE from 'three';
import { BULLET, carLengths, ring, bandOf, CANOPY } from './bullet-shape.js';
import { measureVehicle } from '../vehicles.js';

const COLOURS = {
  white: '#f4f7fa', skirt: '#9aa8b8', under: '#3f4a58', stripe: '#2e6fd0', window: '#264f96', pane: '#17233a',
  canopy: '#1b2534', end: '#7b8a9c', pan: '#5d6b7c',
};
const body = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.42, metalness: 0.08, flatShading: true });
// the windows, lit from inside after dark (night())
const panes = new THREE.MeshStandardMaterial({ name: 'bullet panes', color: COLOURS.pane, roughness: 0.2, metalness: 0.3, flatShading: true, emissive: '#ffe1b0', emissiveIntensity: 0 });
const head = new THREE.MeshStandardMaterial({ color: '#ffffff', emissive: '#fff6e0', emissiveIntensity: 2.2 });
const tail = new THREE.MeshStandardMaterial({ color: '#ff3a2a', emissive: '#ff2010', emissiveIntensity: 1.8 });

// a bag of flat-coloured triangles, each turned to face `out`
function mesher() {
  const pos = [], col = [], c = new THREE.Color(), ab = new THREE.Vector3(), ac = new THREE.Vector3();
  return {
    tri(a, b, d, colour, out) {
      ab.subVectors(b, a); ac.subVectors(d, a);
      if (out && ab.cross(ac).dot(out) < 0) [b, d] = [d, b];
      c.set(colour);
      for (const p of [a, b, d]) { pos.push(p.x, p.y, p.z); col.push(c.r, c.g, c.b); }
    },
    geometry() {
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
      g.computeVertexNormals();
      return g;
    },
  };
}

const V = (x, y, z) => new THREE.Vector3(x, y, z);
// the window band's panes and pillars along a body: a pane 1.5 m long every 2.1 m, none within 2.6 m of a car end
// (its doors)
function paneAt(z, len) { if (z < 2.6 || z > len - 2.6) return false; return (z - 2.6) % 2.1 < 1.5; }

// the stations along a car (z, t along its nose: <= 0 for the body), rear end at z = 0. `nose`: the front ('front'),
// the rear ('rear') or neither
function stations(len, nose) {
  const zs = new Set([0, len]);
  for (let z = 2.6; z < len - 2.6; z += 2.1) { zs.add(+z.toFixed(3)); zs.add(+(z + 1.5).toFixed(3)); }
  const noseZ = (t) => (nose === 'front' ? BULLET.body + t * BULLET.nose : (1 - t) * BULLET.nose);
  const ts = [0, CANOPY[0], 0.12, 0.22, 0.32, CANOPY[1], 0.55, 0.65, 0.75, 0.84, 0.92, 0.97, 1];
  const out = [...zs].filter((z) => nose === 'front' ? z <= BULLET.body : nose === 'rear' ? z >= BULLET.nose : true)
    .map((z) => ({ z, t: -1 }));
  if (nose) for (const t of ts) out.push({ z: noseZ(t), t });
  return out.sort((a, b) => a.z - b.z).filter((s, i, a) => i === 0 || s.z - a[i - 1].z > 1e-6 || s.t > 0);
}

// one car: its shell lofted through its stations, end caps, panes in its window band; lamps on a nose
function car(len, nose, { lamps, pantograph } = {}) {
  const m = mesher(), glass = mesher(), st = stations(len, nose);
  const rings = st.map(({ z, t }) => ring(t).map((p) => ({ ...p, z })));
  for (let k = 0; k < st.length - 1; k++) {
    const A = rings[k], B = rings[k + 1], t = Math.max(st[k].t, st[k + 1].t, -1);
    const tMid = st[k].t < 0 && st[k + 1].t < 0 ? -1 : (Math.max(0, st[k].t) + Math.max(0, st[k + 1].t)) / 2;
    const zMid = (st[k].z + st[k + 1].z) / 2;
    for (let i = 0; i < A.length - 1; i++) {
      const a = V(A[i].x, A[i].y, A[i].z), b = V(A[i + 1].x, A[i + 1].y, A[i + 1].z);
      const c = V(B[i + 1].x, B[i + 1].y, B[i + 1].z), d = V(B[i].x, B[i].y, B[i].z);
      const mid = (A[0].y + A[A.length / 2 | 0].y) / 2, out = V((a.x + c.x) / 2, (a.y + c.y) / 2 - mid, nose === 'front' ? 0.2 * Math.max(0, tMid) : nose === 'rear' ? -0.2 * Math.max(0, tMid) : 0);
      const band = bandOf(A[i].v, A[i + 1].v, tMid);
      if (t === -1 && band === 'window' && paneAt(zMid, len)) { glass.tri(a, b, c, COLOURS.pane, out); glass.tri(a, c, d, COLOURS.pane, out); continue; }
      const colour = COLOURS[band];
      m.tri(a, b, c, colour, out); m.tri(a, c, d, colour, out);
    }
  }
  // the end caps: a car's flat ends (the gangway), and a nose's tip
  const cap = (k, dir, colour) => {
    const R = rings[k], cy = (R[0].y + R[R.length / 2 | 0].y) / 2, o = V(0, cy, R[0].z), out = V(0, 0, dir);
    for (let i = 0; i < R.length - 1; i++) m.tri(o, V(R[i].x, R[i].y, R[i].z), V(R[i + 1].x, R[i + 1].y, R[i + 1].z), colour, out);
  };
  cap(0, -1, nose === 'rear' ? COLOURS.white : COLOURS.end);
  cap(rings.length - 1, 1, nose === 'front' ? COLOURS.white : COLOURS.end);

  const g = new THREE.Group();
  g.name = `bullet car ${nose ?? 'middle'}`;
  const shell = new THREE.Mesh(m.geometry(), body);
  shell.name = 'shell';
  g.add(shell);
  const win = new THREE.Mesh(glass.geometry(), panes);
  win.name = 'panes';
  g.add(win);
  // the lamps: a pair low on the nose, either side of its stripe
  if (nose && lamps) {
    const t = 0.82, r = ring(t), s = r.find((p) => p.v >= 0.32), z = nose === 'front' ? BULLET.body + t * BULLET.nose : (1 - t) * BULLET.nose;
    const geo = new THREE.SphereGeometry(0.16, 8, 4).scale(1, 0.55, 1.6);
    for (const sx of [-1, 1]) {
      const l = new THREE.Mesh(geo, lamps);
      l.position.set(sx * (s.x - 0.08), s.y - 0.06, z);
      l.rotation.y = sx * (nose === 'front' ? 0.35 : -0.35);
      l.name = 'lamp';
      g.add(l);
    }
  }
  // a pantograph on its low fairing, folded down
  if (pantograph) {
    const pg = mesher(), zc = len / 2, top = BULLET.roof;
    const box = (x0, x1, y0, y1, z0, z1, colour) => {
      const P = [V(x0, y0, z0), V(x1, y0, z0), V(x1, y0, z1), V(x0, y0, z1), V(x0, y1, z0), V(x1, y1, z0), V(x1, y1, z1), V(x0, y1, z1)];
      const C = V((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2);
      for (const [a, b, c, d] of [[0, 1, 2, 3], [4, 5, 6, 7], [0, 1, 5, 4], [1, 2, 6, 5], [2, 3, 7, 6], [3, 0, 4, 7]]) {
        const out = V(0, 0, 0).add(P[a]).add(P[c]).multiplyScalar(0.5).sub(C);
        pg.tri(P[a], P[b], P[c], colour, out); pg.tri(P[a], P[c], P[d], colour, out);
      }
    };
    box(-0.55, 0.55, top - 0.05, top + 0.12, zc - 2.2, zc + 2.2, COLOURS.white);   // the fairing
    box(-0.25, 0.25, top + 0.12, top + 0.32, zc - 0.4, zc + 0.4, COLOURS.pan);     // the base, its insulators
    box(-0.06, 0.06, top + 0.3, top + 0.42, zc - 0.2, zc + 1.6, COLOURS.pan);      // the folded arm
    box(-0.8, 0.8, top + 0.42, top + 0.5, zc + 1.45, zc + 1.65, COLOURS.pan);      // its head
    const p = new THREE.Mesh(pg.geometry(), body);
    p.name = 'pantograph';
    g.add(p);
  }
  g.traverse((o) => { if (o.isMesh) { o.castShadow = o.material !== head && o.material !== tail; o.receiveShadow = true; } });
  return g;
}

export async function buildBullet({ cars = 4, name = 'Silver Arrow' } = {}) {
  const group = new THREE.Group();
  group.name = name;
  const lens = carLengths(cars), train = [];
  lens.forEach((len, i) => {
    const nose = i === 0 ? 'front' : i === cars - 1 ? 'rear' : null;
    const obj = car(len, nose, { lamps: i === 0 ? head : tail, pantograph: i === 1 });
    const v = measureVehicle(obj, false);
    // its pivots where its bogies would be (it has no visible running gear to find them by)
    const [p0, p1] = nose === 'front' ? BULLET.pivots.end : nose === 'rear' ? BULLET.pivots.end.map((z) => len - z).reverse() : BULLET.pivots.middle;
    Object.assign(v, { key: 'bullet', pr: Math.min(p0, p1), pf: Math.max(p0, p1) });
    group.add(v.holder);
    train.push(v);
  });
  // after dark its windows light up from inside (the panes' material, and any copy of it a fitted cab made)
  const night = (k) => {
    const e = 0.55 * Math.min(1, Math.max(0, k));
    group.traverse((o) => { if (o.material?.name === 'bullet panes') o.material.emissiveIntensity = e; });
  };
  return { name, group, cars: train, night };
}
