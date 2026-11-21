// The futuristic cab in the Metro Glide's front car, the Chrome Arcology's guideway-rail-shuttle (trains/shuttle-shape.js:
// it faces +z, its windscreen raked back from z 5.0 at the belt line to 4.0 at its head). fitCab cuts the shell away above
// a floor just over the head lamps, from a wall clear of the doors to past the nose, windscreen and all (the shell's glass
// is opaque); this lines that stretch with the shell's own shape, seen from inside: wraparound glass where its glass band
// runs round the flanks and across the windscreen, pale panels below and above it, slim pillars at the windscreen's
// corners. The driver sits in the middle at a low console under the windscreen, its readout set by userData.speed(kmh),
// looking down the guideway. The car stands `ride` up off the formation (its cars are built so): the cab is too.
import * as THREE from 'three';
import { SHUTTLE, SHUTTLE_CAB, GLASS, halfAt, frontAt, cornerAt, levelsFrom } from '../trains/shuttle-shape.js';
import { M, mesher, box, speedReadout } from './future.js';

const V = (x, y, z) => new THREE.Vector3(x, y, z);
const INSET = 0.04;   // the lining sits this far inside the shell
const ARC = 5;        // segments round each front corner

// the shell's outline in plan at height y, pulled in by INSET, from its right side at zBack round the front to its left
function outline(y, zBack) {
  const hw = halfAt(y) - INSET, zf = frontAt(y) - INSET, cf = cornerAt(y) - INSET, cz = Math.max(zBack, zf - cf);
  const right = [[hw, zBack], [hw, cz]];
  for (let k = 1; k <= ARC; k++) {
    const a = (Math.PI / 2) * k / ARC;
    right.push([hw - cf + cf * Math.cos(a), cz + cf * Math.sin(a)]);
  }
  return [...right, ...right.slice().reverse().map(([x, z]) => [-x, z])];
}

export function makeShuttleCab({ c = SHUTTLE_CAB, ride = SHUTTLE.ride, top = 120 } = {}) {
  const g = new THREE.Group();   // in the shuttle's own frame; lifted by its ride at the end
  g.name = 'shuttle cab';
  const ys = levelsFrom(c.floor), mid = V(0, 0, (c.zBack + frontAt(c.floor)) / 2);
  const rings = ys.map((y) => ({ y, pts: outline(y, c.zBack).map(([x, z]) => V(x, Math.min(y, c.roof - INSET), z)) }));

  // the lining: panels and glass between each pair of levels, facing in
  const panels = mesher(), glass = mesher();
  for (let k = 0; k < rings.length - 1; k++) {
    const A = rings[k], B = rings[k + 1], into = A.y >= GLASS[0] - 1e-6 && B.y <= GLASS[1] + 1e-6 ? glass : panels;
    for (let i = 0; i < A.pts.length - 1; i++) {
      const a = A.pts[i], b = A.pts[i + 1], d = B.pts[i + 1], e = B.pts[i];
      if (a.distanceTo(b) < 1e-6 && e.distanceTo(d) < 1e-6) continue;
      const inward = V(mid.x - (a.x + d.x) / 2, 0, mid.z - (a.z + d.z) / 2);
      into.tri(a, b, d, inward); into.tri(a, d, e, inward);
    }
  }
  // the ceiling under the roof, and the floor
  const lid = (y, up, m, name) => {
    const f = mesher(), pts = outline(y, c.zBack).map(([x, z]) => V(x, up > 0 ? c.floor : c.roof - INSET, z)), o = V(0, pts[0].y, mid.z);
    for (let i = 0; i < pts.length - 1; i++) f.tri(o, pts[i], pts[i + 1], V(0, up, 0));
    f.tri(o, pts[pts.length - 1], pts[0], V(0, up, 0));
    return f.mesh(m, name);
  };
  g.add(panels.mesh(M.panel, 'lining'), glass.mesh(M.glass, 'glass'), lid(c.roof, -1, M.panel, 'ceiling'), lid(c.floor, 1, M.floor, 'floor'));

  // the back wall across the cab, from the floor to the roof, with the door back into the car and a light strip
  {
    const w = mesher(), z = c.zBack + 0.01, out = V(0, 0, 1);
    for (let k = 0; k < rings.length - 1; k++) {
      const ya = rings[k].y, yb = Math.min(rings[k + 1].y, c.roof - INSET), ha = halfAt(ya) - INSET, hb = halfAt(yb) - INSET;
      w.tri(V(-ha, ya, z), V(ha, ya, z), V(hb, yb, z), out); w.tri(V(-ha, ya, z), V(hb, yb, z), V(-hb, yb, z), out);
    }
    g.add(w.mesh(M.panel, 'back wall'));
    g.add(box(0.8, 1.95, 0.03, M.door, 0, c.floor + 0.98, c.zBack + 0.03));
    g.add(box(0.05, 1.95, 0.04, M.glow, 0.42, c.floor + 0.98, c.zBack + 0.04));
  }

  // the glass's frame: a sill and a head bar right round it, and a pillar up each front corner
  const bar = (a, b, r = 0.025) => {
    const d = new THREE.Vector3().subVectors(b, a), m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, d.length(), 6), M.trim);
    m.position.copy(a).addScaledVector(d, 0.5);
    m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize());
    return m;
  };
  for (const y of GLASS) {
    const r = rings.find((q) => Math.abs(q.y - y) < 1e-6);
    for (let i = 0; i < r.pts.length - 1; i++) if (r.pts[i].distanceTo(r.pts[i + 1]) > 1e-6) g.add(bar(r.pts[i], r.pts[i + 1]));
  }
  const glassRings = rings.filter((q) => q.y >= GLASS[0] - 1e-6 && q.y <= GLASS[1] + 1e-6), n = rings[0].pts.length;
  for (const i of [2 + Math.floor(ARC / 2), n - 3 - Math.floor(ARC / 2)]) {
    for (let k = 0; k < glassRings.length - 1; k++) g.add(bar(glassRings[k].pts[i], glassRings[k + 1].pts[i], 0.04));
  }

  // the console: a low desk across the front under the windscreen's sill, its top falling towards the glass, a cyan light
  // along its edge
  const cz0 = c.zFront - 1.15, cz1 = frontAt(c.floor) - INSET - 0.05, top0 = GLASS[0] - 0.04, top1 = GLASS[0] - 0.12;
  const hw = halfAt(GLASS[0]) - cornerAt(GLASS[0]) - 0.05;
  {
    const d = mesher(), P = [
      V(-hw, c.floor, cz0 + 0.25), V(hw, c.floor, cz0 + 0.25), V(hw, c.floor, cz1), V(-hw, c.floor, cz1),
      V(-hw, top0, cz0), V(hw, top0, cz0), V(hw, top1, cz1), V(-hw, top1, cz1),
    ], C = V(0, (c.floor + top1) / 2, (cz0 + cz1) / 2);
    for (const [a, b, e, f] of [[0, 1, 2, 3], [4, 5, 6, 7], [0, 1, 5, 4], [1, 2, 6, 5], [2, 3, 7, 6], [3, 0, 4, 7]]) {
      const out = V(0, 0, 0).add(P[a]).add(P[e]).multiplyScalar(0.5).sub(C);
      d.tri(P[a], P[b], P[e], out); d.tri(P[a], P[e], P[f], out);
    }
    g.add(d.mesh(M.console, 'console'));
    g.add(box(hw * 2, 0.025, 0.03, M.glow, 0, top0 + 0.01, cz0 + 0.01));
  }
  // the readout and a second screen, one either side of the middle, turned up at the driver's eye; two small controllers
  const [ex, ey, ez] = c.eye, onTop = (z) => top0 + (top1 - top0) * (z - cz0) / (cz1 - cz0) + 0.015;
  const facing = (o) => { g.add(o); o.lookAt(ex, ey, ez); return o; };
  const readout = speedReadout(top);
  if (readout.screen) { readout.screen.position.set(0.42, onTop(cz0 + 0.3) + 0.06, cz0 + 0.3); facing(readout.screen); }
  const side = new THREE.Mesh(new THREE.PlaneGeometry(0.4, 0.2), M.screen);
  side.position.set(-0.42, onTop(cz0 + 0.3) + 0.05, cz0 + 0.3);
  facing(side);
  for (const sx of [-1, 1]) {
    g.add(box(0.07, 0.12, 0.07, M.trim, sx * 0.2, top0 + 0.04, cz0 + 0.1));
    g.add(box(0.1, 0.03, 0.1, M.glow, sx * 0.2, top0 + 0.11, cz0 + 0.1));
  }

  // the driver's seat, behind the eye
  g.add(box(0.56, 0.1, 0.52, M.cushion, ex, c.floor + 0.5, ez - 0.25));
  g.add(box(0.56, 0.75, 0.1, M.cushion, ex, c.floor + 0.95, ez - 0.55).rotateX(-0.12));
  g.add(box(0.12, 0.45, 0.12, M.seat, ex, c.floor + 0.22, ez - 0.25));
  g.add(box(0.6, 0.04, 0.6, M.seat, ex, c.floor + 0.02, ez - 0.25));

  // under all that glass nothing in here casts a shadow, though everything takes the shell's
  g.traverse((o) => { if (o.isMesh) { o.castShadow = false; o.receiveShadow = o.material !== M.glass; } });
  // the car stands `ride` up off the formation: so does its cab (fitCab's box is in the car's holder, as the seat is)
  const lifted = new THREE.Group();
  lifted.name = 'shuttle cab';
  lifted.position.y = ride;
  lifted.add(g);
  lifted.userData.speed = readout.set;
  readout.set(0);
  return {
    group: lifted, seat: new THREE.Vector3(ex, ey + ride, ez),
    box: { zBack: c.zBack, zFront: c.zFront, floor: c.floor + ride, roof: c.roof + ride, half: c.half },
  };
}
