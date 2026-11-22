// A place's walkways (world-data.js PLACES[id].walkways, walk-world.js): the City's path from its town to the
// speedboat's jetty, Oceanside's jetty where the boat lands. Built with the place, so they stand whether or not the
// boat is about: a path of packed sand draped on the land, and a timber jetty on piles where it runs out over the sea
// (WALKWAY_DECK over it, the level the walk world gives you there), and a sign where one says so (in the departure
// signs' look, stations.js). Made in code, a few merged meshes each.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { SEA_LEVEL } from './world-data.js';
import { WALKWAY_DECK, walkwayLevel } from './walk-world.js';
import { signBoard, SIGN } from './stations.js';

const STEP = 1;            // m between the path's cross-sections
const ACROSS = 4;          // points across it, edge to edge (draped on the land's slope across it)
const OVER = 0.06;         // m the path's surface stands over the land, against the land's own triangles
const PLANK = { w: 0.22, gap: 0.04, t: 0.07 };
const PILE = { every: 2.6, r: 0.13, sink: 1 };   // piles down each side, this far into the sea bed
const COLORS = { path: '#c8b388', plank: '#9c7b56', pile: '#5b4632', bollard: '#2f3337' };

const mats = {
  path: new THREE.MeshStandardMaterial({ color: COLORS.path, roughness: 0.95, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }),
  plank: new THREE.MeshStandardMaterial({ color: COLORS.plank, roughness: 0.85, flatShading: true }),
  pile: new THREE.MeshStandardMaterial({ color: COLORS.pile, roughness: 0.9, flatShading: true }),
  bollard: new THREE.MeshStandardMaterial({ color: COLORS.bollard, roughness: 0.6, metalness: 0.3 }),
};

// the walkway's centre line, a cross-section every STEP m: [{ x, z, dx, dz (its way along), d (m from its start) }]
function sections(points) {
  const out = [];
  let d = 0;
  for (let i = 0; i < points.length - 1; i++) {
    const a = points[i], b = points[i + 1], len = Math.hypot(b.x - a.x, b.z - a.z), dx = (b.x - a.x) / len, dz = (b.z - a.z) / len;
    const n = Math.max(1, Math.round(len / STEP));
    for (let k = i === 0 ? 0 : 1; k <= n; k++) out.push({ x: a.x + dx * len * k / n, z: a.z + dz * len * k / n, dx, dz, d: d + len * k / n });
    d += len;
  }
  return out;
}

// w: { points, width, sign? }; terrain: the page's land (its places' patches on it). -> a Group of its meshes
export function buildWalkway(w, terrain, name = 'walkway') {
  const group = new THREE.Group();
  group.name = name;
  const S = sections(w.points), half = w.width / 2, deck = SEA_LEVEL + WALKWAY_DECK;
  const ground = (x, z) => terrain.heightAt(x, z);
  // over the sea where the land under its middle is below the deck: the jetty
  const wet = S.map((c) => ground(c.x, c.z) < deck - 0.05);

  // the path: a strip draped on the land, wherever it isn't the jetty (and a step onto the jetty's planks)
  const pos = [], idx = [];
  for (let i = 0; i < S.length; i++) {
    const c = S[i], lx = c.dz, lz = -c.dx;   // its left
    for (let k = 0; k < ACROSS; k++) {
      const a = -half + (w.width * k) / (ACROSS - 1), x = c.x + lx * a, z = c.z + lz * a;
      pos.push(x, walkwayLevel(ground(x, z), SEA_LEVEL) + OVER, z);
    }
    if (i > 0 && !(wet[i] && wet[i - 1])) {
      for (let k = 0; k < ACROSS - 1; k++) {
        const p = (i - 1) * ACROSS + k, q = i * ACROSS + k;
        idx.push(p, q, p + 1, p + 1, q, q + 1);   // (wound to face up)
      }
    }
  }
  if (idx.length) {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setIndex(idx);
    g.computeVertexNormals();
    const path = new THREE.Mesh(g, mats.path);
    path.name = `${name} path`;
    path.receiveShadow = true;
    group.add(path);
  }

  // the jetty: planks across its way, two stringers under them, piles down both sides into the sea bed, and a pair of
  // bollards at its end
  const planks = [], piles = [], o = new THREE.Object3D();
  const along = (c, a, y, ax, geo) => {
    o.position.set(c.x + c.dz * a + c.dx * ax, y, c.z - c.dx * a + c.dz * ax);
    o.rotation.set(0, Math.atan2(c.dx, c.dz), 0);
    o.updateMatrix();
    return geo.applyMatrix4(o.matrix);
  };
  let lastPile = -Infinity, first = -1, last = -1;
  for (let i = 0; i < S.length; i++) {
    if (!wet[i]) continue;
    if (first < 0) first = i;
    last = i;
  }
  if (first >= 0) {
    // from a metre before the land drops below the deck (its planks over the path's end) to the walkway's end
    const d0 = Math.max(0, S[first].d - 1), d1 = S[last].d, at = (d) => S[Math.min(S.length - 1, Math.max(0, Math.round(d / STEP)))];
    for (let d = d0; d <= d1 + 1e-6; d += PLANK.w + PLANK.gap) {
      const c = at(d);
      planks.push(along(c, 0, deck - PLANK.t / 2, d - c.d, new THREE.BoxGeometry(w.width, PLANK.t, PLANK.w)));
    }
    for (let d = d0; d <= d1 + 1e-6; d += STEP) {
      const c = at(d);
      for (const a of [-half + 0.35, half - 0.35]) planks.push(along(c, a, deck - PLANK.t - 0.1, 0, new THREE.BoxGeometry(0.12, 0.2, STEP + 0.02)));
      if (d - lastPile >= PILE.every || d + STEP > d1) {
        lastPile = d;
        for (const a of [-half + 0.15, half - 0.15]) {
          const x = c.x + c.dz * a, z = c.z - c.dx * a, bed = ground(x, z) - PILE.sink, top = deck - PLANK.t, h = top - bed;
          if (h > 0.2) piles.push(along(c, a, bed + h / 2, 0, new THREE.CylinderGeometry(PILE.r, PILE.r * 1.1, h, 7)));
        }
      }
    }
    const end = S[last];
    for (const a of [-half + 0.4, half - 0.4]) {
      const b = along(end, a, deck + 0.25, -0.4, new THREE.CylinderGeometry(0.14, 0.18, 0.5, 9));
      const m = new THREE.Mesh(b, mats.bollard);
      m.name = `${name} bollard`;
      m.castShadow = true;
      group.add(m);
    }
  }
  for (const [list, mat, label] of [[planks, mats.plank, 'deck'], [piles, mats.pile, 'piles']]) {
    if (!list.length) continue;
    const m = new THREE.Mesh(mergeGeometries(list), mat);
    for (const g of list) g.dispose();
    m.name = `${name} ${label}`;
    m.castShadow = true; m.receiveShadow = true;
    group.add(m);
  }

  // its sign, where it leaves the town (its second point), beside the path on its right, facing back the way you come
  if (w.sign) {
    const p = w.points[1], prev = w.points[0], len = Math.hypot(p.x - prev.x, p.z - prev.z);
    const dx = (p.x - prev.x) / len, dz = (p.z - prev.z) / len, out = half + SIGN.w / 2 + 0.3;
    const sign = signBoard(w.sign);
    sign.name = `${name} sign`;
    const x = p.x - dz * out, z = p.z + dx * out;
    sign.position.set(x, ground(x, z), z);
    sign.rotation.y = Math.atan2(-dx, -dz);
    sign.traverse((m) => { if (m.isMesh) m.castShadow = true; });
    group.add(sign);
  }
  return group;
}
