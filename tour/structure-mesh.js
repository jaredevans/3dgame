// A line's structures (structures.js sections) as meshes: stone viaducts on piers and arches, tunnels (a dark tube round
// both lines, the Countryside Railway's portal at each end, a headwall over it), timber trestles on bents, and the
// Chrome Arcology's maglev guideway on piers; plus a leg's river water and waterfall. Generated pieces follow the
// curve and keep to the kits' look: flat colours, few faces. route.y is the formation; rails top it by 0.30 m.
import * as THREE from 'three';
import { part } from './parts.js';
import { KITS } from './config.js';
import { paint } from './terrain-mesh.js';

const DECK = -0.07;            // a deck's top, under the ballast's foot (-0.06), relative to the formation
const EMBED = 1;               // piers, bents and abutments run this far into the ground below its lowest point
const STONES = {
  taupe: { walling: '#968d84', ring: '#7c766b', dressings: '#ae9f8a' },
  limestone: { walling: '#c4bdae', ring: '#a39c8d', dressings: '#d9d2c3' },
};
const TIMBER = { post: '#a57c5a', brace: '#86634a', deck: '#7a5c45', footing: '#a8a39a' };
const GUIDE = { pier: '#ebf1f5', trim: '#9aa8b8' };

const solid = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.92, metalness: 0, flatShading: true, side: THREE.DoubleSide });

// ---- a bag of flat-coloured triangles ----
function mesher() {
  const pos = [], col = [], c = new THREE.Color();
  const put = (p, k) => { pos.push(p.x, p.y, p.z); col.push(k.r, k.g, k.b); };
  const m = {
    tri(a, b, d, colour) { c.set(colour); put(a, c); put(b, c); put(d, c); },
    quad(a, b, d, e, colour) { m.tri(a, b, d, colour); m.tri(a, d, e, colour); },
    // a hexahedron from its four bottom and four top corners (each in order round it)
    hexa(bot, top, colour, ends = true) {
      for (let i = 0; i < 4; i++) { const j = (i + 1) % 4; m.quad(bot[i], bot[j], top[j], top[i], colour); }
      if (ends) { m.quad(bot[0], bot[1], bot[2], bot[3], colour); m.quad(top[0], top[1], top[2], top[3], colour); }
    },
    // a squared timber or bar from a to b, `t` thick
    beam(a, b, t, colour) {
      const ax = new THREE.Vector3().subVectors(b, a).normalize();
      const u = Math.abs(ax.y) > 0.9 ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 1, 0);
      const p = new THREE.Vector3().crossVectors(ax, u).normalize().multiplyScalar(t / 2);
      const q = new THREE.Vector3().crossVectors(ax, p).normalize().multiplyScalar(t / 2);
      const ring = (o) => [o.clone().add(p).add(q), o.clone().add(p).sub(q), o.clone().sub(p).sub(q), o.clone().sub(p).add(q)];
      m.hexa(ring(a), ring(b), colour);
    },
    geometry() {
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
      g.computeVertexNormals();
      return g;
    },
    get empty() { return pos.length === 0; },
  };
  return m;
}

// the route's frame at s: a point d metres to the left of it, h above its formation
function framer(route) {
  const p = {};
  return (s, d, h = 0) => { route.offsetAt(s, d, p); return new THREE.Vector3(p.x, p.y + h, p.z); };
}
// the lowest ground under a footprint: s0..s1 along, d0..d1 across
function lowest(route, ground, s0, s1, d0, d1) {
  let lo = Infinity;
  const p = {};
  for (let i = 0; i <= 2; i++) for (let j = 0; j <= 2; j++) {
    route.offsetAt(s0 + (s1 - s0) * i / 2, d0 + (d1 - d0) * j / 2, p);
    lo = Math.min(lo, ground(p.x, p.z));
  }
  return lo;
}
// distances from s0 to s1 about every `step` metres, ends included
function steps(s0, s1, step) {
  const n = Math.max(1, Math.ceil((s1 - s0) / step)), out = [];
  for (let i = 0; i <= n; i++) out.push(s0 + (s1 - s0) * i / n);
  return out;
}
// a strip along the route: at each s a polyline of [d, h] (h above the formation, or absolute if `abs`), joined up
function sweep(m, route, ss, section, colours, abs = false) {
  const at = framer(route);
  let prev = null;
  for (const s of ss) {
    const y0 = route.at(s).y;
    const ring = section(s).map(([d, h]) => { const v = at(s, d, 0); v.y = abs ? h : y0 + h; return v; });
    if (prev) for (let k = 0; k < ring.length - 1; k++) m.quad(prev[k], prev[k + 1], ring[k + 1], ring[k], colours[k] ?? colours[0]);
    prev = ring;
  }
}
// a block standing on the line: along s0..s1, across d0..d1 (to the left), from absolute height y0 up to y1
function block(m, route, s0, s1, d0, d1, y0, y1, colour) {
  const at = framer(route);
  const corners = (y) => [at(s0, d0), at(s1, d0), at(s1, d1), at(s0, d1)].map((v) => { v.y = y; return v; });
  m.hexa(corners(y0), corners(y1), colour);
}

// ---- viaduct: a stone deck with parapets on piers every ~20 m, arched between them, an abutment at each end ----
const V = { parapet: 1.1, wall: 0.45, under: -1.3, ring: 0.9, pier: 2.6, abut: 6, bay: 20 };
function viaduct(route, half, sec, ground) {
  const m = mesher(), st = STONES[sec.stone] ?? STONES.taupe, hw = half;
  // the deck and parapets
  sweep(m, route, steps(sec.s0, sec.s1, 2), () => [
    [hw, V.under], [hw, V.parapet], [hw - V.wall, V.parapet], [hw - V.wall, DECK], [-hw + V.wall, DECK],
    [-hw + V.wall, V.parapet], [-hw, V.parapet], [-hw, V.under],
  ], [st.walling, st.dressings, st.walling, st.walling, st.walling, st.dressings, st.walling]);
  // abutments, and piers between them
  const a0 = sec.s0 + V.abut, a1 = sec.s1 - V.abut, n = Math.max(1, Math.round((a1 - a0) / V.bay)), bay = (a1 - a0) / n;
  for (const [s0, s1] of [[sec.s0, a0], [a1, sec.s1]]) {
    const foot = lowest(route, ground, s0, s1, -hw - 0.3, hw + 0.3) - EMBED;
    const top = route.at((s0 + s1) / 2).y + V.under;
    block(m, route, s0, s1, -hw - 0.3, hw + 0.3, foot, top + 0.01, st.walling);
  }
  const supports = [a0];
  for (let i = 1; i < n; i++) {
    const s = a0 + i * bay, foot = lowest(route, ground, s - V.pier / 2 - 0.6, s + V.pier / 2 + 0.6, -hw - 0.8, hw + 0.8) - EMBED;
    const top = route.at(s).y + V.under, batter = Math.max(0, (top - foot) / 30);
    const at = framer(route);
    const ring = (y, grow) => [at(s - V.pier / 2 - grow, -hw - 0.2 - grow), at(s + V.pier / 2 + grow, -hw - 0.2 - grow),
      at(s + V.pier / 2 + grow, hw + 0.2 + grow), at(s - V.pier / 2 - grow, hw + 0.2 + grow)].map((v) => { v.y = y; return v; });
    m.hexa(ring(foot, batter), ring(top + 0.01, 0), st.walling);
    // a dressed band where the arches spring
    supports.push(s);
  }
  supports.push(a1);
  // the arches: from each support's face to the next one's, the soffit an ellipse rising to the crown under the deck
  for (let i = 0; i < supports.length - 1; i++) {
    const sa = supports[i] + (i === 0 ? 0 : V.pier / 2), sb = supports[i + 1] - (i === supports.length - 2 ? 0 : V.pier / 2);
    const span = sb - sa, mid = (sa + sb) / 2, crown = route.at(mid).y + V.under - V.ring;
    const low = lowest(route, ground, sa, sb, -hw, hw);
    const rise = Math.max(0.8, Math.min(span / 2, crown - low - 1.5));
    const soffit = (s) => { const t = (s - sa) / span; return crown - rise + rise * Math.sqrt(Math.max(0, 1 - (2 * t - 1) ** 2)); };
    const ss = steps(sa, sb, span / 16);
    sweep(m, route, ss, (s) => [[hw, route.at(s).y + V.under + 0.01], [hw, soffit(s)], [-hw, soffit(s)], [-hw, route.at(s).y + V.under + 0.01]],
      [st.walling, st.ring, st.walling], true);
    // the arch rings, proud of both faces
    for (const side of [1, -1]) {
      const d = side * (hw + 0.06);
      sweep(m, route, ss, (s) => [[d, soffit(s)], [d, Math.min(soffit(s) + V.ring, route.at(s).y + V.under)]], [st.ring], true);
    }
  }
  return m;
}

// ---- trestle: timber bents every ~6 m under a plank deck, braced, on stone footings ----
const T = { bent: 6, cap: 0.4, post: 0.34, tier: 6, batter: 0.16 };
function trestle(route, half, sec, ground) {
  const m = mesher(), hw = half - 0.3, at = framer(route);
  // the deck, its edge timbers and a kerb each side
  sweep(m, route, steps(sec.s0, sec.s1, 2), () => [
    [hw, -0.75], [hw, 0.35], [hw - 0.25, 0.35], [hw - 0.25, DECK], [-hw + 0.25, DECK], [-hw + 0.25, 0.35], [-hw, 0.35], [-hw, -0.75],
  ], [TIMBER.deck]);
  // stringers under each line
  for (const d of [-2, 2]) sweep(m, route, steps(sec.s0, sec.s1, 2), () => [[d + 0.6, -0.75], [d + 0.6, -1.3], [d - 0.6, -1.3], [d - 0.6, -0.75]], [TIMBER.brace]);
  const n = Math.max(1, Math.round((sec.s1 - sec.s0) / T.bent));
  for (let i = 0; i <= n; i++) {
    const s = sec.s0 + (sec.s1 - sec.s0) * i / n, top = route.at(s).y - 1.3;
    const foot = lowest(route, ground, s - 0.6, s + 0.6, -hw - 3, hw + 3) - 0.3;
    const tall = top - foot;
    // the cap across the posts' tops
    block(m, route, s - T.cap / 2, s + T.cap / 2, -hw - 0.2, hw + 0.2, top - 0.45, top, TIMBER.post);
    if (tall < 0.2) continue;
    // posts: three plumb, the outer two battered out
    const spread = hw + T.batter * tall;
    const posts = [[-hw, -spread], [-2, -2], [0, 0], [2, 2], [hw, spread]];
    // each post down into the ground under its own foot
    const footAt = (d) => { const v = at(s, d); v.y = ground(v.x, v.z) - 0.3; return v; };
    const topAt = (d) => { const v = at(s, d); v.y = top - 0.45; return v; };
    for (const [dt, db] of posts) {
      m.beam(topAt(dt), footAt(db), T.post, TIMBER.post);
      // its footing, a stone block round its foot
      const f = footAt(db), sq = (y) => [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([a, b]) => new THREE.Vector3(f.x + a * 0.5, y, f.z + b * 0.5));
      m.hexa(sq(f.y - 0.2), sq(f.y + 0.6), TIMBER.footing);
    }
    // sway bracing in tiers: a girt across at each tier, and an X of braces within it
    const tiers = Math.max(1, Math.round(tall / T.tier));
    for (let k = 0; k < tiers; k++) {
      const yA = top - 0.45 - (tall - 0.45) * k / tiers, yB = top - 0.45 - (tall - 0.45) * (k + 1) / tiers;
      const w = (y) => hw + T.batter * (top - 0.45 - y);
      const P = (d, y) => { const v = at(s, d); v.y = y; return v; };
      m.beam(P(-w(yA), yA), P(w(yB), yB + 0.3), 0.18, TIMBER.brace);
      m.beam(P(w(yA), yA), P(-w(yB), yB + 0.3), 0.18, TIMBER.brace);
      if (k) m.beam(P(-w(yA) - 0.1, yA), P(w(yA) + 0.1, yA), 0.22, TIMBER.brace);
    }
  }
  return m;
}

// ---- tunnel: a dark tube round both lines, brightest at the mouths, a floor out under each portal's mouth ----
const TUBE = { half: 4.4, wall: 4.2, top: 6.3 };
function tube(route, sec) {
  const pos = [], col = [];
  const at = framer(route), c = new THREE.Color(), lit = new THREE.Color('#4a4642'), dark = new THREE.Color('#0b0a09');
  const arch = [];
  for (let k = 0; k <= 10; k++) { const a = Math.PI * k / 10; arch.push([TUBE.half * Math.cos(a), TUBE.wall + (TUBE.top - TUBE.wall) * Math.sin(a)]); }
  const section = [[-TUBE.half, -0.12], [TUBE.half, -0.12], ...arch, [-TUBE.half, -0.12]];
  const ss = steps(sec.s0 + 0.2, sec.s1 - 0.2, 2);
  let prev = null;
  for (const s of ss) {
    const u = Math.min(s - sec.s0, sec.s1 - s);
    c.copy(lit).lerp(dark, Math.min(1, u / 30) ** 0.7);
    const y0 = route.at(s).y;
    const ring = section.map(([d, h]) => { const v = at(s, d); v.y = y0 + h; return v; });
    if (prev) for (let k = 0; k < ring.length - 1; k++) {
      for (const v of [prev.v[k], prev.v[k + 1], ring[k + 1], prev.v[k], ring[k + 1], ring[k]]) pos.push(v.x, v.y, v.z);
      for (const cc of [prev.c, prev.c, c, prev.c, c, c]) col.push(cc.r, cc.g, cc.b);
    }
    prev = { v: ring, c: c.clone() };
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  const mesh = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.DoubleSide }));
  mesh.castShadow = true;
  mesh.name = 'tunnel tube';
  return mesh;
}
// the stone round a portal: a headwall above and beside it, up past the ground over the bore
const HEAD = { half: 12.5, top: 11, back: 0.1, depth: 1.2 };
function headwall(m, route, s, inward, stone) {
  const st = STONES[stone] ?? STONES.taupe, y = route.at(s).y;
  const a = s + inward * HEAD.back, b = s + inward * (HEAD.back + HEAD.depth);
  const [s0, s1] = inward > 0 ? [a, b] : [b, a];
  block(m, route, s0, s1, -HEAD.half, HEAD.half, y + 8, y + HEAD.top, st.walling);
  block(m, route, s0, s1, -HEAD.half - 0.2, HEAD.half + 0.2, y + HEAD.top, y + HEAD.top + 0.4, st.dressings);
  for (const side of [-1, 1]) block(m, route, s0, s1, side * 5.5, side * HEAD.half, y - 1, y + 8.01, st.walling);
}
// the ground's cells across a portal are left out of the land's mesh (terrain.holeCell): their part out in front of the
// portal is laid again here, finely, so the cutting's ground runs up to the portal and stops there
const CELL = 4, SUB = 8;
function mouthGround(route, s, inward, terrain) {
  const pos = [], col = [], p = route.at(s);
  const ix = Math.sin(p.yaw) * inward, iz = Math.cos(p.yaw) * inward;
  const outside = (x, z) => (x - p.x) * ix + (z - p.z) * iz <= 0;
  const x0 = Math.floor((p.x - 20) / CELL) * CELL, z0 = Math.floor((p.z - 20) / CELL) * CELL, k = CELL / SUB;
  const vert = (x, z) => {
    const h = terrain.heightAt(x, z);
    pos.push(x, h - 0.02, z);
    paint(col, col.length, terrain.regionAt(x, z, h), x, z);
  };
  for (let cx = x0; cx <= p.x + 20; cx += CELL) for (let cz = z0; cz <= p.z + 20; cz += CELL) {
    if (!terrain.holeCell(cx, cz, CELL)) continue;
    for (let a = 0; a < SUB; a++) for (let b = 0; b < SUB; b++) {
      const xa = cx + a * k, za = cz + b * k, xb = xa + k, zb = za + k;
      // the same split as the land's cells: (a, b) (a, b+1) (a+1, b), then (a+1, b) (a, b+1) (a+1, b+1)
      for (const tri of [[[xa, za], [xa, zb], [xb, za]], [[xb, za], [xa, zb], [xb, zb]]]) {
        if (tri.every(([x, z]) => outside(x, z))) for (const [x, z] of tri) vert(x, z);
      }
    }
  }
  if (!pos.length) return null;
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.computeVertexNormals();
  const mesh = new THREE.Mesh(g, groundMat);
  mesh.receiveShadow = true;
  mesh.name = 'portal ground';
  mesh.userData.ownGeometry = true;
  return mesh;
}
const groundMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, metalness: 0 });
async function portal(route, s, inward, stone) {
  const p = route.at(s), obj = await part(KITS.railway, 'tunnel-portal', { tracks: 'double', colorway: stone === 'limestone' ? 'limestone' : 'gritstone' });
  // its face is at local z 8.25 looking +z, its bore centred on local x 2: face it out of the hill, its face on the portal
  const yaw = inward > 0 ? p.yaw + Math.PI : p.yaw;
  obj.rotation.y = yaw;
  const face = new THREE.Vector3(2, 0, 8.25).applyAxisAngle(new THREE.Vector3(0, 1, 0), yaw);
  const out = route.at(s - inward * 0.25);
  obj.position.set(out.x - face.x, p.y - 0.06, out.z - face.z);
  obj.traverse((o) => { if (o.isMesh) o.userData.own = true; });   // made for us alone: freed with the structures
  return obj;
}

// ---- guideway: the Chrome Arcology's maglev beam (support 'none'), one under each line, on piers every 24 m ----
const G = { piece: 8, top: 3.22, depth: 3.34, every: 3 };
async function guideway(route, lanes, sec, ground) {
  const group = new THREE.Group();
  const src = await part(KITS.future, 'maglev-guideway-run', { support: 'none' });
  src.updateMatrixWorld(true);
  let mesh = null;
  src.traverse((o) => { if (o.isMesh && !mesh) mesh = o; });
  const geo = mesh.geometry.applyMatrix4(mesh.matrixWorld);   // this piece was made for us alone (as is its material)
  const n = Math.max(1, Math.round((sec.s1 - sec.s0) / G.piece)), len = (sec.s1 - sec.s0) / n;
  const beams = new THREE.InstancedMesh(geo, mesh.material, n * lanes.length);
  const q = new THREE.Quaternion(), e = new THREE.Euler(0, 0, 0, 'YZX'), v = new THREE.Vector3(), sc = new THREE.Vector3(len / G.piece, 1, 1), mat = new THREE.Matrix4();
  const p = {};
  let k = 0;
  for (let i = 0; i < n; i++) for (const lane of lanes) {
    const s = sec.s0 + (i + 0.5) * len;
    route.offsetAt(s, lane, p);
    e.set(0, p.yaw - Math.PI / 2, p.pitch);
    v.set(p.x, p.y + DECK - G.top, p.z);
    beams.setMatrixAt(k++, mat.compose(v, q.setFromEuler(e), sc));
  }
  beams.castShadow = true; beams.receiveShadow = true;
  beams.name = 'guideway beams';
  beams.userData.own = true;
  group.add(beams);
  // piers, and a block at each end where the beams come down to the embankment
  const m = mesher();
  for (let i = G.every; i < n; i += G.every) for (const lane of lanes) {
    const s = sec.s0 + i * len, under = route.at(s).y + DECK - G.depth;
    const foot = lowest(route, ground, s - 1, s + 1, lane - 1.2, lane + 1.2) - EMBED;
    if (under - foot < 0.2) continue;
    block(m, route, s - 0.75, s + 0.75, lane - 0.9, lane + 0.9, foot, under, GUIDE.pier);
    block(m, route, s - 1.1, s + 1.1, lane - 1.6, lane + 1.6, under - 0.6, under + 0.01, GUIDE.trim);
    block(m, route, s - 0.8, s + 0.8, lane - 0.95, lane + 0.95, foot + EMBED, foot + EMBED + 0.4, GUIDE.trim);
  }
  const lo = Math.min(...lanes) - 2, hi = Math.max(...lanes) + 2;
  for (const [s0, s1] of [[sec.s0, sec.s0 + 3], [sec.s1 - 3, sec.s1]]) {
    const foot = lowest(route, ground, s0, s1, lo, hi) - EMBED, top = route.at((s0 + s1) / 2).y + DECK - G.depth;
    block(m, route, s0, s1, lo, hi, foot, top + 0.02, GUIDE.pier);
  }
  group.add(meshOf(m, 'guideway piers'));
  return group;
}

function meshOf(m, name) {
  const mesh = new THREE.Mesh(m.geometry(), solid);
  mesh.name = name;
  mesh.castShadow = true; mesh.receiveShadow = true;
  mesh.userData.ownGeometry = true;
  return mesh;
}

// ---- a valley's river, and the waterfall at its head ----
const waterMat = new THREE.MeshStandardMaterial({ color: '#4f97a8', roughness: 0.2, metalness: 0.05, transparent: true, opacity: 0.88 });
const fallMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.4, transparent: true, opacity: 0.9, side: THREE.DoubleSide });
export function buildWater(v, ground) {
  const group = new THREE.Group();
  group.name = 'river';
  const len = Math.hypot(v.x1 - v.x0, v.z1 - v.z0), dir = new THREE.Vector2((v.x1 - v.x0) / len, (v.z1 - v.z0) / len);
  const level = v.floor + 0.7, wide = 2 * ((v.half ?? 20) + (v.fade ?? 60));
  const geo = new THREE.PlaneGeometry(len, wide, 1, 1).rotateX(-Math.PI / 2);
  const water = new THREE.Mesh(geo, waterMat);
  water.position.set((v.x0 + v.x1) / 2, level, (v.z0 + v.z1) / 2);
  water.rotation.y = Math.atan2(-dir.y, dir.x);
  water.receiveShadow = true;
  water.userData.ownGeometry = true;
  group.add(water);
  if (v.fall) {
    // down the steep head: a sheet of water just off the ground, white where it breaks, and foam where it lands
    const head = v.easeHead ?? v.ease ?? 80, across = new THREE.Vector2(-dir.y, dir.x), pos = [], col = [];
    const c = new THREE.Color(), white = new THREE.Color('#f4fbfc'), blue = new THREE.Color('#a9dbe6');
    let prev = null;
    for (let a = -6; a <= head + 4; a += 2) {
      const x = v.x0 + dir.x * a, z = v.z0 + dir.y * a, y = Math.max(level, ground(x, z) + 0.6), w = 5 + a * 0.06;
      const ring = [-1, -0.33, 0.33, 1].map((t) => new THREE.Vector3(x + across.x * w * t, y, z + across.y * w * t));
      const shade = (k) => c.copy(blue).lerp(white, (Math.sin(a * 0.9 + k * 2.1) + 1) / 2 * 0.8).clone();
      if (prev) for (let k = 0; k < 3; k++) {
        for (const p of [prev[k], prev[k + 1], ring[k + 1], prev[k], ring[k + 1], ring[k]]) pos.push(p.x, p.y, p.z);
        for (let j = 0; j < 6; j++) { const cc = shade(k + (j % 2)); col.push(cc.r, cc.g, cc.b); }
      }
      prev = ring;
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    g.computeVertexNormals();
    const fall = new THREE.Mesh(g, fallMat);
    fall.name = 'waterfall';
    fall.userData.ownGeometry = true;
    const foam = new THREE.Mesh(new THREE.CircleGeometry(11, 10).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ color: '#eef7f8', roughness: 0.6, transparent: true, opacity: 0.85 }));
    foam.position.set(v.x0 + dir.x * (head + 4), level + 0.05, v.z0 + dir.y * (head + 4));
    foam.userData.own = true;
    group.add(fall, foam);
  }
  return group;
}

// every structure along a route, for lines at these lateral offsets (route.offsetAt), on this terrain (terrain.js). Resolves to a group; group.userData.dispose() frees what was generated for it (the kits' own parts are left).
export async function buildStructures(route, lanes, sections = [], { terrain, waters = [] } = {}) {
  const ground = terrain.heightAt;
  const group = new THREE.Group();
  group.name = 'structures';
  const half = Math.max(...lanes.map(Math.abs)) + 2.9;
  const stone = mesher();
  for (const sec of sections) {
    if (sec.kind === 'viaduct') group.add(meshOf(viaduct(route, half, sec, ground), `viaduct ${sec.s0.toFixed(0)}`));
    else if (sec.kind === 'trestle') group.add(meshOf(trestle(route, half, sec, ground), `trestle ${sec.s0.toFixed(0)}`));
    else if (sec.kind === 'guideway') group.add(await guideway(route, lanes, sec, ground));
    else if (sec.kind === 'tunnel') {
      const t = tube(route, sec);
      t.userData.ownGeometry = true;
      group.add(t, await portal(route, sec.s0, 1, sec.stone), await portal(route, sec.s1, -1, sec.stone));
      headwall(stone, route, sec.s0, 1, sec.stone);
      headwall(stone, route, sec.s1, -1, sec.stone);
      for (const [s, inward] of [[sec.s0, 1], [sec.s1, -1]]) { const g = mouthGround(route, s, inward, terrain); if (g) group.add(g); }
    }
  }
  if (!stone.empty) group.add(meshOf(stone, 'portal headwalls'));
  for (const v of waters) group.add(buildWater(v, ground));
  // generated geometry (its materials are shared, module-wide) and the kit parts made for this group alone
  group.userData.dispose = () => {
    group.removeFromParent();
    group.traverse((o) => {
      if (o.userData.ownGeometry || o.userData.own) o.geometry.dispose();
      if (o.userData.own) o.material.dispose();
    });
  };
  return group;
}
