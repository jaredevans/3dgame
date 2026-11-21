// The futuristic cab, in the Silver Arrow's front car (trains/bullet-shape.js: it faces +z, its nose from z 19 to 27).
// fitCab cuts the shell away above the raised floor from just behind the nose to the bottom of the canopy's glass; this
// lines that stretch with the shell's own surface, seen from inside: wraparound glass where the shell has its canopy and
// its window band, pale panels elsewhere, a bulkhead closing the nose ahead, and a back wall with a door. The driver sits
// in the middle at a low, sleek console with a speed readout (userData.speed(kmh) sets it), looking down the long bill.
import * as THREE from 'three';
import { BULLET_CAB, ring, bandOf, halfAt, CANOPY, BANDS } from '../trains/bullet-shape.js';

const mat = (color, extra = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.6, flatShading: true, ...extra });
export const M = {
  panel: mat('#e8ecf2'), trim: mat('#9aa8b8'), floor: mat('#3f4a58'), console: mat('#2a323d', { roughness: 0.4 }),
  seat: mat('#dde3e9'), cushion: mat('#5d6b7c'), door: mat('#c7cfd8'),
  glass: new THREE.MeshStandardMaterial({ color: '#bfd9e8', roughness: 0.05, metalness: 0.1, transparent: true, opacity: 0.16, side: THREE.DoubleSide, depthWrite: false }),
  glow: new THREE.MeshStandardMaterial({ color: '#7fe7da', emissive: '#7fe7da', emissiveIntensity: 1.4 }),
  screen: new THREE.MeshStandardMaterial({ color: '#0d1a22', emissive: '#5fb3e0', emissiveIntensity: 0.6, roughness: 0.3 }),
};

const V = (x, y, z) => new THREE.Vector3(x, y, z);
export function mesher() {
  const pos = [], ab = new THREE.Vector3(), ac = new THREE.Vector3();
  return {
    tri(a, b, d, out) {
      ab.subVectors(b, a); ac.subVectors(d, a);
      if (out && ab.cross(ac).dot(out) < 0) [b, d] = [d, b];
      for (const p of [a, b, d]) pos.push(p.x, p.y, p.z);
    },
    mesh(material, name) {
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      g.computeVertexNormals();
      const m = new THREE.Mesh(g, material);
      m.name = name;
      return m;
    },
  };
}
export function box(w, h, d, m, x, y, z) {
  const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m);
  b.position.set(x, y, z);
  return b;
}

// t along the nose at z (<= 0 behind it)
const tAt = (c, z) => (z - c.noseAt) / c.nose;
const INSET = 0.04;   // the lining sits this far inside the shell

export function makeFutureCab(c = BULLET_CAB) {
  const g = new THREE.Group();
  g.name = 'future cab';
  const zs = [c.zBack, c.noseAt, c.noseAt + CANOPY[0] * c.nose];
  for (let t = 0.1; t < CANOPY[1]; t += 0.08) zs.push(c.noseAt + t * c.nose);
  zs.push(c.zFront);
  zs.sort((a, b) => a - b);
  // the lining: the shell's surface above the floor, pulled in a little, facing in
  const lining = zs.map((z) => {
    const t = tAt(c, z), r = ring(t), cy = (r[0].y + r[r.length / 2 | 0].y) / 2;
    return { t, z, cy, pts: r.map((p) => ({ x: p.x - Math.sign(p.x) * INSET, y: Math.min(p.y, c.roof) - (p.v > 0.8 ? INSET : 0), v: p.v })) };
  });
  const panels = mesher(), glass = mesher();
  for (let k = 0; k < lining.length - 1; k++) {
    const A = lining[k], B = lining[k + 1], tMid = (Math.max(0, A.t) + Math.max(0, B.t)) / 2 || (A.t < 0 && B.t <= 0 ? -1 : 0);
    for (let i = 0; i < A.pts.length - 1; i++) {
      const p = [A.pts[i], A.pts[i + 1], B.pts[i + 1], B.pts[i]];
      if (Math.max(...p.map((q) => q.y)) < c.floor) continue;   // under the floor: the shell is left there
      const [a, b, cc, d] = p.map((q, j) => V(q.x, Math.max(q.y, c.floor - 0.02), j < 2 ? A.z : B.z));
      const inward = V(-(a.x + cc.x) / 2, A.cy - (a.y + cc.y) / 2, 0);
      const band = bandOf(A.pts[i].v, A.pts[i + 1].v, tMid);
      const into = band === 'canopy' || band === 'window' ? glass : panels;
      into.tri(a, b, cc, inward); into.tri(a, cc, d, inward);
    }
  }
  g.add(panels.mesh(M.panel, 'lining'), glass.mesh(M.glass, 'glass'));
  // the glass's frame: along its lower edge either side, and an arch over the roof where the canopy begins
  const bar = (a, b, r = 0.025) => {
    const d = new THREE.Vector3().subVectors(b, a), m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, d.length(), 6), M.trim);
    m.position.copy(a).addScaledVector(d, 0.5);
    m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize());
    return m;
  };
  const at = (k, i) => { const p = lining[k].pts[i]; return V(p.x, p.y, lining[k].z); };
  const sill = lining[0].pts.findIndex((p) => p.v === BANDS.window[0]);
  for (let k = 0; k < lining.length - 1; k++) {
    g.add(bar(at(k, sill), at(k + 1, sill)), bar(at(k, lining[0].pts.length - 1 - sill), at(k + 1, lining[0].pts.length - 1 - sill)));
  }
  const arch = lining.findIndex((l) => l.t >= CANOPY[0] - 1e-6);
  for (let i = sill; i < lining[0].pts.length - 1 - sill; i++) g.add(bar(at(arch, i), at(arch, i + 1), 0.035));

  // a wall across the cab at z, from the floor up to its section's top (facing `dir` along z)
  const wall = (z, dir, m, name) => {
    const w = mesher(), r = ring(tAt(c, z)).filter((p) => p.y >= c.floor), out = V(0, 0, dir);
    const o = V(0, (c.floor + Math.min(c.roof, Math.max(...r.map((p) => p.y)))) / 2, z);
    const hf = halfAt(tAt(c, z), c.floor) - INSET;
    const edge = [V(hf, c.floor, z), ...r.filter((p) => p.x > 0).map((p) => V(p.x - INSET, Math.min(p.y, c.roof - INSET), z)),
      ...r.filter((p) => p.x <= 0).map((p) => V(p.x + INSET, Math.min(p.y, c.roof - INSET), z)), V(-hf, c.floor, z)];
    for (let i = 0; i < edge.length - 1; i++) w.tri(o, edge[i], edge[i + 1], out);
    w.tri(o, edge[edge.length - 1], edge[0], out);
    return w.mesh(m, name);
  };
  g.add(wall(c.zBack + 0.01, 1, M.panel, 'back wall'), wall(c.zFront - 0.01, -1, M.console, 'bulkhead'));
  g.add(box(0.8, 1.95, 0.03, M.door, 0, c.floor + 0.98, c.zBack + 0.03));       // the door back into the train
  g.add(box(0.05, 1.95, 0.04, M.glow, 0.42, c.floor + 0.98, c.zBack + 0.04));    // a light strip beside it

  // the raised floor, its width following the shell
  {
    const f = mesher(), up = V(0, 1, 0), pts = zs.map((z) => ({ z, h: halfAt(tAt(c, z), c.floor) - INSET }));
    for (let k = 0; k < pts.length - 1; k++) {
      const a = pts[k], b = pts[k + 1];
      f.tri(V(-a.h, c.floor, a.z), V(a.h, c.floor, a.z), V(b.h, c.floor, b.z), up);
      f.tri(V(-a.h, c.floor, a.z), V(b.h, c.floor, b.z), V(-b.h, c.floor, b.z), up);
    }
    g.add(f.mesh(M.floor, 'floor'));
  }

  // the console: a low, sleek desk swept across the front, its top falling toward the glass; a cyan light along its edge
  const cz0 = c.zFront - 1.05, cz1 = c.zFront - 0.02, top0 = c.floor + 0.42, top1 = c.floor + 0.25;
  {
    const hw = Math.min(halfAt(tAt(c, cz1), top1), halfAt(tAt(c, cz0), top0)) - 0.08;
    const d = mesher(), P = [
      V(-hw, c.floor, cz0 + 0.25), V(hw, c.floor, cz0 + 0.25), V(hw, c.floor, cz1), V(-hw, c.floor, cz1),
      V(-hw, top0, cz0), V(hw, top0, cz0), V(hw, top1, cz1), V(-hw, top1, cz1),
    ], C = V(0, c.floor + 0.25, (cz0 + cz1) / 2);
    for (const [a, b, e, f] of [[0, 1, 2, 3], [4, 5, 6, 7], [0, 1, 5, 4], [1, 2, 6, 5], [2, 3, 7, 6], [3, 0, 4, 7]]) {
      const out = V(0, 0, 0).add(P[a]).add(P[e]).multiplyScalar(0.5).sub(C);
      d.tri(P[a], P[b], P[e], out); d.tri(P[a], P[e], P[f], out);
    }
    g.add(d.mesh(M.console, 'console'));
    const lip = box(hw * 2, 0.025, 0.03, M.glow, 0, top0 + 0.01, cz0 + 0.01);
    g.add(lip);
  }
  // the speed readout on the console, turned up at the driver's eye, and a second screen: one either side, so neither
  // stands in the way down the middle of the bill
  const [ex, ey, ez] = c.eye, onTop = (z) => top0 + (top1 - top0) * (z - cz0) / (cz1 - cz0) + 0.015;
  const facing = (o) => { g.add(o); o.lookAt(ex, ey, ez); return o; };
  const readout = speedReadout(300);
  if (readout.screen) {
    readout.screen.position.set(0.45, onTop(cz0 + 0.3) + 0.06, cz0 + 0.3);
    facing(readout.screen);
  }
  const side = new THREE.Mesh(new THREE.PlaneGeometry(0.4, 0.2), M.screen);
  side.position.set(-0.45, onTop(cz0 + 0.3) + 0.05, cz0 + 0.3);
  facing(side);
  // two small controllers, either side of the driver: power and brake
  for (const sx of [-1, 1]) {
    g.add(box(0.07, 0.12, 0.07, M.trim, sx * 0.2, top0 + 0.04, cz0 + 0.1));
    g.add(box(0.1, 0.03, 0.1, M.glow, sx * 0.2, top0 + 0.11, cz0 + 0.1));
  }

  // the driver's seat, behind the eye
  g.add(box(0.56, 0.1, 0.52, M.cushion, ex, c.floor + 0.5, ez - 0.25));
  g.add(box(0.56, 0.75, 0.1, M.cushion, ex, c.floor + 0.95, ez - 0.55).rotateX(-0.12));
  g.add(box(0.12, 0.45, 0.12, M.seat, ex, c.floor + 0.22, ez - 0.25));
  g.add(box(0.6, 0.04, 0.6, M.seat, ex, c.floor + 0.02, ez - 0.25));

  g.userData.speed = readout.set;
  g.userData.speed(0);

  const seat = new THREE.Vector3(ex, ey, ez);
  // under all that glass the light floods in: nothing in here casts a shadow (the low sun would lay the seat's across
  // the console), though everything takes the shell's
  g.traverse((o) => { if (o.isMesh) { o.castShadow = false; o.receiveShadow = o.material !== M.glass; } });
  return { group: g, seat, box: { zBack: c.zBack, zFront: c.zFront, floor: c.floor, roof: c.roof, half: c.half } };
}

// the digits a readout shows for a speed, as cells of its atlas, hundreds first: blank (null) before the first figure
function readoutDigits(kmh) {
  const n = Math.max(0, Math.min(999, Math.round(kmh)));
  return [Math.floor(n / 100), Math.floor(n / 10) % 10, n % 10].map((d, k, all) => (k < 2 && all.slice(0, k + 1).every((x) => x === 0) ? null : d));
}

// a speed readout (a screen showing whole km/h and a bar to `top`): { screen (null without a document), set(kmh) }. Its
// figures are drawn once into an atlas and picked out by each digit's texture coordinates, and the bar is a scaled
// quad, so a new figure uploads no texture: uploading a canvas waits for the GPU to finish what it's drawing (15-35 ms
// a figure on the Metro Glide's busy run through the suburbs, once a km/h as it pulls away)
const PX = 0.44 / 256;   // the screen is 256 x 128 pixels of 0.44 x 0.22 m
const CELL_W = 38, CELL_H = 80, BASE = 64, KMH = { x: 380, w: 60 };
let atlas = null;
function readoutAtlas() {
  if (atlas) return atlas;
  const canvas = document.createElement('canvas');
  canvas.width = 512; canvas.height = CELL_H;
  const x = canvas.getContext('2d');
  x.font = 'bold 64px system-ui, sans-serif'; x.textAlign = 'center'; x.fillStyle = '#e8f6ff';
  for (let d = 0; d < 10; d++) x.fillText(String(d), d * CELL_W + CELL_W / 2, BASE);
  x.font = '22px system-ui, sans-serif'; x.textAlign = 'left'; x.fillStyle = '#8fc7e8';
  x.fillText('km/h', KMH.x, BASE);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  atlas = { tex, mat: new THREE.MeshBasicMaterial({ map: tex, transparent: true, toneMapped: false, depthWrite: false }) };
  return atlas;
}
// a quad over canvas pixels [px0, px1] x [py0, py1] of the screen, showing atlas cell [ax0, ax0 + w] (its full height)
function cellQuad(px0, px1, py0, py1, ax0, w) {
  const geo = new THREE.PlaneGeometry((px1 - px0) * PX, (py1 - py0) * PX);
  geo.translate(((px0 + px1) / 2 - 128) * PX, (64 - (py0 + py1) / 2) * PX, 0.002);
  const show = (a) => { const uv = geo.attributes.uv, u0 = a / 512, u1 = (a + w) / 512; uv.setXY(0, u0, 1); uv.setXY(1, u1, 1); uv.setXY(2, u0, 0); uv.setXY(3, u1, 0); uv.needsUpdate = true; };
  show(ax0);
  return { mesh: new THREE.Mesh(geo, readoutAtlas().mat), show };
}
export function speedReadout(top) {
  if (typeof document === 'undefined') return { screen: null, set() {} };
  const screen = new THREE.Group();
  screen.name = 'speed readout';
  screen.add(new THREE.Mesh(new THREE.PlaneGeometry(0.44, 0.22), new THREE.MeshBasicMaterial({ color: '#0b1820', toneMapped: false })));
  // three figures right-aligned on x 176 px, their baseline at 80 px; 'km/h' after them; the bar along the foot
  const digits = [0, 1, 2].map((k) => cellQuad(176 - (3 - k) * CELL_W, 176 - (2 - k) * CELL_W, 80 - BASE, 80 - BASE + CELL_H, 0, CELL_W));
  const kmh = cellQuad(184, 184 + KMH.w, 80 - BASE, 80 - BASE + CELL_H, KMH.x, KMH.w);
  const barGeo = new THREE.PlaneGeometry(PX, 8 * PX).translate(PX / 2, 0, 0.001);
  const bar = new THREE.Mesh(barGeo, new THREE.MeshBasicMaterial({ color: '#7fe7da', toneMapped: false }));
  bar.position.set((16 - 128) * PX, (64 - 108) * PX, 0);
  for (const d of digits) screen.add(d.mesh);
  screen.add(kmh.mesh, bar);
  let shown = null;
  return {
    screen,
    set(speed) {
      const n = Math.round(speed);
      if (n === shown) return;
      shown = n;
      readoutDigits(n).forEach((d, k) => { digits[k].mesh.visible = d !== null; if (d !== null) digits[k].show(d * CELL_W); });
      bar.visible = n > 0;
      bar.scale.x = Math.max(1, Math.min(224, 224 * n / top));
    },
  };
}
