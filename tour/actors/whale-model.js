// A humpback whale, made here (Polyfork has none: owner, 2026-11-22): 13.5 m long, low-poly and flat-shaded as the
// rest. Its body is rings round its length (+z its nose, its middle at the origin), dark slate over a pale throat and
// belly; long white flippers; a small hump of a dorsal fin; its flukes on a hinge at the tail stock (`flukes`, which
// beat up and down), white beneath. -> { object, flukes, flippers: [left, right], length }
import * as THREE from 'three';

export const WHALE = { length: 13.5, tail: -6.35 };
const BACK = new THREE.Color('#2e3944'), FLANK = new THREE.Color('#47535e'), BELLY = new THREE.Color('#d6dadc');
const SIDES = 12, GIRTH = 1.1;   // (a humpback is stout: the rings below, a tenth fuller)
// along its length, nose to tail: z, half-width, half-height, the ring's middle's height
const RINGS = [
  [6.75, 0.1, 0.08, -0.15], [6.3, 0.55, 0.4, -0.1], [5.3, 1.0, 0.78, -0.08], [3.9, 1.32, 1.12, -0.12],
  [2.0, 1.45, 1.28, 0], [0, 1.4, 1.25, 0.05], [-2.0, 1.12, 1.0, 0.1], [-3.8, 0.72, 0.72, 0.15],
  [-5.2, 0.36, 0.48, 0.15], [-6.0, 0.2, 0.3, 0.12], [-6.4, 0.1, 0.14, 0.1],
];

function body() {
  const pos = [];
  const ring = (k, j) => {
    const [z, rx, ry, cy] = RINGS[k], a = (j / SIDES) * Math.PI * 2;
    return [Math.cos(a) * rx * GIRTH, cy + Math.sin(a) * ry * GIRTH, z];
  };
  for (let k = 0; k < RINGS.length - 1; k++) {
    for (let j = 0; j < SIDES; j++) {
      const a = ring(k, j), b = ring(k, j + 1), c = ring(k + 1, j), d = ring(k + 1, j + 1);
      pos.push(...a, ...c, ...b, ...b, ...c, ...d);
    }
  }
  // its snout's and tail stock's ends closed
  for (const [k, flip] of [[0, false], [RINGS.length - 1, true]]) {
    const [z, , , cy] = RINGS[k];
    for (let j = 0; j < SIDES; j++) {
      const a = ring(k, j), b = ring(k, j + 1), m = [0, cy, z + (flip ? -0.05 : 0.05)];
      pos.push(...(flip ? [...a, ...b, ...m] : [...a, ...m, ...b]));
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.computeVertexNormals();
  // coloured by where on its ring a face is: the lower third pale (its throat and belly, greyer toward the tail), the
  // upper half dark, between them its flank
  const col = new Float32Array(pos.length), c = new THREE.Color();
  for (let t = 0; t < pos.length / 9; t++) {
    const y = (pos[t * 9 + 1] + pos[t * 9 + 4] + pos[t * 9 + 7]) / 3, z = (pos[t * 9 + 2] + pos[t * 9 + 5] + pos[t * 9 + 8]) / 3;
    const k = RINGS.findIndex((r) => r[0] <= z), r = RINGS[Math.max(0, k)], h = (y - r[3]) / r[2];
    if (h < -0.45) c.copy(BELLY).lerp(FLANK, Math.min(1, Math.max(0, -z / 6)) * 0.6);
    else if (h < 0.25) c.copy(FLANK);
    else c.copy(BACK);
    for (let v = 0; v < 3; v++) col.set([c.r, c.g, c.b], t * 9 + v * 3);
  }
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return geo;
}

// a flat blade from an outline (x across, y along) `thick` m thick, lying in the xz plane: dark above, white beneath
function blade(points, thick, top) {
  const shape = new THREE.Shape(points.map(([x, y]) => new THREE.Vector2(x, y)));
  const geo = new THREE.ExtrudeGeometry(shape, { depth: thick, bevelEnabled: false }).rotateX(Math.PI / 2).translate(0, thick / 2, 0).toNonIndexed();
  geo.computeVertexNormals();
  const n = geo.attributes.normal, col = new Float32Array(n.count * 3), c = new THREE.Color();
  for (let i = 0; i < n.count; i++) { c.copy(n.getY(i) > 0.3 ? top : BELLY); col.set([c.r, c.g, c.b], i * 3); }
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return geo;
}

export function makeWhale() {
  const mat = new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.55 });
  const object = new THREE.Group();
  object.name = 'whale';
  const trunk = new THREE.Mesh(body(), mat);
  trunk.name = 'whale body';
  // the dorsal fin: a low hump on its back, two thirds of the way back
  const fin = new THREE.Mesh(new THREE.ConeGeometry(0.32, 0.55, 4).scale(0.45, 1, 1.6).translate(0, 1.32, -2.6).toNonIndexed(), mat);
  fin.geometry.computeVertexNormals();
  fin.geometry.setAttribute('color', new THREE.BufferAttribute(new Float32Array(fin.geometry.attributes.position.count * 3).map((_, i) => [BACK.r, BACK.g, BACK.b][i % 3]), 3));
  object.add(trunk, fin);
  // the flukes: 4.2 m across, swept back, notched in the middle, on a hinge at the tail stock
  const flukes = new THREE.Group();
  flukes.name = 'whale flukes';
  flukes.position.set(0, 0.1, WHALE.tail);
  const half = [[0, 0.15], [0.7, -0.05], [1.6, -0.45], [2.15, -0.95], [2.05, -1.15], [1.3, -1.0], [0.5, -0.95], [0, -0.75]];
  const outline = [...half, ...half.slice(1, -1).reverse().map(([x, y]) => [-x, y])];
  flukes.add(new THREE.Mesh(blade(outline, 0.12, BACK), mat));
  object.add(flukes);
  // the flippers: long and white, a third of its length, out and down from behind its head, swept back
  const flippers = [1, -1].map((side) => {
    const g = new THREE.Group();
    g.name = 'whale flipper';
    g.position.set(side * 1.2, -0.7, 3.3);
    const outline = [[0, 0.3], [side * 1.4, 0.05], [side * 2.8, -0.35], [side * 4.0, -0.95], [side * 3.9, -1.15], [side * 2.6, -0.75], [side * 1.2, -0.45], [0, -0.3]];
    const m = new THREE.Mesh(blade(side > 0 ? outline : outline.slice().reverse(), 0.1, BELLY), mat);
    g.add(m);
    g.rotation.set(0, side * 0.35, side * -0.75);   // (out, down and back, clear of its flank)
    object.add(g);
    return g;
  });
  object.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  return { object, flukes, flippers, length: WHALE.length };
}
