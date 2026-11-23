// The flying car (future-city): the Chrome Arcology kit's commuter hover pod, its cabin glazed all round so the seat
// sees 360 degrees. The pod's own cabin (its windows, roof and the lining inside them) gives a view only through its
// windows, so everything of it above the waist (BELT) is cut away and a cabin of glass panels on a thin frame, built here,
// stands on what's left; a bench inside it is the seat. Its headlights, tail lamps and light strips (the kit's night map)
// and its pads' rings come on after dark. Pads at both ends: where it waits beside the Futuristic place's
// departure platform, and where it sets down beside Downtown City's arrival platform.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { kitNight } from '../actors/metro.js';
import { lightZones } from '../actors/coast.js';
import { buildEscort } from './escort.js';
import { conductorFigure, sitOn } from './crew.js';

const POD = { key: 'commuter-hover-pod', params: { colorway: 'arcology-white', glazing: 'canopy', roofHatch: false } };
// the pod, measured (2 x 2.12 x 4.52 m, +z forward, its floor 0.5 m up, its windows from 0.98 to 1.92 m): cut at its
// waist, below the bonnet's top (0.86-0.9 m): cut higher, the flat of the bonnet filled over a third of the seat's view
// and the door panels stood out past the hull, and now the ground ahead and below shows through the glass. The cabin's
// foot and top rings in the pod's own frame (x half-width, z front and back, the corners cut off `cut`): its foot on the
// cut hull, its windscreen raked back over the bonnet, a little taller than the pod's roof so you sit with your head
// clear of the frame
const BELT = 0.8;
const FOOT = { y: BELT, w: 0.8, front: 1.65, back: -2.0, cut: 0.3 };
const TOP = { y: 2.06, w: 0.7, front: 0.7, back: -1.6, cut: 0.25 };
const BAR = 0.03;   // the frame's bars, square, metres across
const SEAT = { y: 1.52, z: -0.35 };   // your eyes, on the bench (its cushion 0.95 m up, 0.45 over the floor)
const CUSHION = { top: 0.95, z: -0.48 };   // where you (the conductor) sit on it: its top, your hips over it
const PAD = { r: 3.4, ring: 0.18, up: 0.04 };
const NIGHT_STRIP = '#8ff5e8';

// a ring of the cabin's plan, its corners cut, at height y: eight points round from the front left
function ring({ y, w, front, back, cut }) {
  return [[w - cut, front], [w, front - cut], [w, back + cut], [w - cut, back], [-w + cut, back], [-w, back + cut], [-w, front - cut], [-w + cut, front]]
    .map(([x, z]) => new THREE.Vector3(x, y, z));
}

// every mesh under root cut along the plane y = belt (in root's frame), only what's below kept: each triangle crossing it
// clipped to its part below, its attributes (normals, colours) carried to the new corners
function cutAbove(root, belt) {
  root.updateMatrixWorld(true);
  const toRoot = new THREE.Matrix4(), v = new THREE.Vector3();
  root.traverse((mesh) => {
    if (!mesh.isMesh) return;
    const src = mesh.geometry.index ? mesh.geometry.toNonIndexed() : mesh.geometry;
    // each corner's height in root's frame (a part may be moved or turned inside it: a door, a nacelle); the plane cuts
    // an edge where those heights pass the belt, and its attributes are mixed in that same ratio
    toRoot.copy(root.matrixWorld).invert().multiply(mesh.matrixWorld);
    const names = Object.keys(src.attributes), pos = src.attributes.position;
    const outs = Object.fromEntries(names.map((n) => [n, []]));
    const vert = (i) => names.map((n) => { const a = src.attributes[n]; return Array.from({ length: a.itemSize }, (_, k) => a.array[i * a.itemSize + k]); });
    const mix = (a, b, t) => a.map((va, j) => va.map((x, k) => x + (b[j][k] - x) * t));
    const push = (vx) => names.forEach((n, j) => outs[n].push(...vx[j]));
    const yOf = (i) => v.fromBufferAttribute(pos, i).applyMatrix4(toRoot).y;
    for (let t = 0; t < pos.count; t += 3) {
      const vs = [vert(t), vert(t + 1), vert(t + 2)], ys = [yOf(t), yOf(t + 1), yOf(t + 2)];
      const below = ys.map((y) => y <= belt);
      const n = below.filter(Boolean).length;
      if (n === 3) { vs.forEach(push); continue; }
      if (n === 0) continue;
      // walk the triangle's edges keeping the part below (one triangle if one corner is below, two if two are)
      const poly = [];
      for (let i = 0; i < 3; i++) {
        const j = (i + 1) % 3;
        if (below[i]) poly.push(vs[i]);
        if (below[i] !== below[j]) poly.push(mix(vs[i], vs[j], (belt - ys[i]) / (ys[j] - ys[i])));
      }
      for (let i = 1; i + 1 < poly.length; i++) { push(poly[0]); push(poly[i]); push(poly[i + 1]); }
    }
    const g = new THREE.BufferGeometry();
    for (const nm of names) {
      const a = src.attributes[nm];
      g.setAttribute(nm, new THREE.BufferAttribute(new a.array.constructor(outs[nm]), a.itemSize, a.normalized));
    }
    if (src !== mesh.geometry) src.dispose();
    mesh.geometry.dispose();
    mesh.geometry = g;
  });
}

// a square bar from a to b, BAR across
function bar(a, b, size = BAR) {
  const len = a.distanceTo(b), g = new THREE.BoxGeometry(size, size, len), o = new THREE.Object3D();
  o.position.copy(a).add(b).multiplyScalar(0.5);
  o.lookAt(b);
  o.updateMatrix();
  return g.applyMatrix4(o.matrix);
}

// the glazed cabin: eight panes round and one over the top, on a frame of thin bars (a post at each corner, a rail round
// the foot and the top, and two across the roof); the bench you sit on
function cabin() {
  const foot = ring(FOOT), top = ring(TOP), group = new THREE.Group();
  group.name = 'glazed cabin';
  const quads = [];
  for (let i = 0; i < 8; i++) { const j = (i + 1) % 8; quads.push(foot[i], foot[j], top[j], foot[i], top[j], top[i]); }
  for (let i = 1; i < 7; i++) quads.push(top[0], top[i], top[i + 1]);
  const glassGeo = new THREE.BufferGeometry().setFromPoints(quads);
  glassGeo.computeVertexNormals();
  const glass = new THREE.Mesh(glassGeo, new THREE.MeshStandardMaterial({
    color: '#bfe6f2', transparent: true, opacity: 0.16, roughness: 0.05, metalness: 0.2, side: THREE.DoubleSide, depthWrite: false,
  }));
  glass.name = 'cabin glass';
  glass.castShadow = false;
  const bars = [];
  for (let i = 0; i < 8; i++) {
    const j = (i + 1) % 8;
    bars.push(bar(foot[i], top[i]), bar(top[i], top[j]));
  }
  bars.push(bar(top[1], top[6]), bar(top[2], top[5]));
  const frame = new THREE.Mesh(mergeGeometries(bars), new THREE.MeshStandardMaterial({ color: '#dfe6ec', metalness: 0.55, roughness: 0.35 }));
  frame.name = 'cabin frame';
  frame.castShadow = true;
  const rail = [];
  for (let i = 0; i < 8; i++) rail.push(bar(foot[i], foot[(i + 1) % 8], BAR * 1.6));
  const sill = new THREE.Mesh(mergeGeometries(rail), frame.material);
  sill.name = 'cabin sill';
  sill.castShadow = true;
  // the bench across the cabin, its back behind you
  const cushion = new THREE.BoxGeometry(1.3, 0.14, 0.55).translate(0, 0.88, SEAT.z - 0.05);
  const back = new THREE.BoxGeometry(1.3, 0.6, 0.12).translate(0, 1.22, SEAT.z - 0.36);
  const bench = new THREE.Mesh(mergeGeometries([cushion, back]), new THREE.MeshStandardMaterial({ color: '#8e9eae', roughness: 0.8 }));
  bench.name = 'bench';
  bench.castShadow = true;
  for (const g of [...bars, ...rail]) g.dispose();
  cushion.dispose(); back.dispose();
  group.add(glass, frame, sill, bench);
  return group;
}

// a landing pad on the ground at (x, z): a dark disc with a light ring round it, lit after dark
function pad(name, x, y, z, ringMat) {
  const g = new THREE.Group();
  g.name = name;
  const disc = new THREE.Mesh(new THREE.CircleGeometry(PAD.r, 32).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ color: '#3a434e', roughness: 0.9 }));
  const edge = new THREE.Mesh(new THREE.RingGeometry(PAD.r - PAD.ring, PAD.r, 48).rotateX(-Math.PI / 2).translate(0, 0.005, 0), ringMat);
  const mark = new THREE.Mesh(new THREE.RingGeometry(1.1, 1.1 + PAD.ring, 32).rotateX(-Math.PI / 2).translate(0, 0.005, 0), ringMat);
  disc.receiveShadow = true;
  g.add(disc, edge, mark);
  g.position.set(x, y + PAD.up, z);
  return g;
}

// ctx: the registry's (rides/index.js)
export async function buildCar({ ride, slicer, still, kit, terrain, warn }) {
  await slicer.frame();
  await still();   // (the pod made and cut, some 35 ms: only where it may land)
  const pod = await kit('future', POD.key, POD.params);   // (a vehicle that can't be loaded fails the build)
  pod.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  cutAbove(pod, BELT);
  await slicer.frame();
  await still();
  let lit = [];
  try { lit = lightZones(pod, await kitNight('future', POD.key, POD.params)).mats; } catch (err) { warn('lights', err); }
  const holder = new THREE.Group();
  holder.name = 'flying car';
  pod.position.y = -ride.rest;   // the path is ride.rest over its pad
  holder.add(pod);
  const glazed = cabin();
  glazed.position.y = -ride.rest;
  holder.add(glazed);
  holder.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(holder);   // (at the origin, unturned: in the holder's own frame)
  // you, the conductor, on the bench in the middle (seen from outside: ride-run.js)
  await slicer.frame();
  await still();
  const rider = await conductorFigure({ kit, warn });
  if (rider) sitOn(rider.figure, glazed, CUSHION.top, CUSHION.z);
  await slicer.frame();
  const ringMat = new THREE.MeshStandardMaterial({ color: '#9fb4c2', roughness: 0.5, emissive: new THREE.Color(NIGHT_STRIP), emissiveIntensity: 0 });
  const at = (p) => [p.x, terrain.heightAt(p.x, p.z), p.z];
  const boardMarker = pad('flying car pad', ...at(ride.board), ringMat);
  const landPad = pad('flying car landing pad', ...at(ride.land), ringMat);
  const glow = [...lit, ringMat];
  // its escort: left out, the ride going on, if its parts can't be had
  const actors = new Map();
  try { actors.set('escort', await buildEscort({ ride, slicer, still, kit, warn })); } catch (err) { if (err?.dropped) throw err; warn('escort', err); }
  let night = -1;
  return {
    vehicle: {
      holder, box, seat: new THREE.Vector3(0, SEAT.y - ride.rest, SEAT.z), rider: rider?.figure ?? null,
      // banked gently into its turns, nosing up or down only a little as it climbs and comes down (it lifts on its
      // nacelles, not its wings); lifting off and settling onto its pad level
      attitude: { pitch: 0.35, bank: 0.3, level: 8 },
    },
    crew: [],
    actors,
    boardMarker, landPad,
    update(f) {
      const k = Math.min(1, Math.max(0, f.night));
      if (k !== night) { night = k; for (const m of glow) m.emissiveIntensity = k; }
    },
    dispose() {},
  };
}
