// The Seaside Excursion's leg (city-ocean): a lighthouse on the cliff top, its lamp lit and its beam turning after dark;
// sailboats, a fishing boat and a container ship out at sea; gulls flying with the train, a pod of dolphins leaping
// along the cliffs and a freight coming the other way on the other line.
//
// The line runs east along the cliff tops (s 600-1500) and down to Oceanside. The sea is on its left heading out (the
// -z side: + lateral, as herdPath's `side` and the shots' `lateral`), its waterline 65-110 m out along the cliffs
// (paths.js shoreTable finds it from the land): "offshore" here is measured from there. Your line is the left-hand,
// seaward one (laneOf +2) both ways, the other line the right-hand one: the freight runs on that.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { cdnPart, firstOf, fellBack, partBases } from '../parts.js';
import { laneOf, SEA_LEVEL } from '../world-data.js';
import { reverseRoute } from '../route.js';
import { COUPLING_GAP } from '../consist.js';
import { buildTrain, poseTrain } from '../vehicles.js';
import { sound } from '../audio.js';
import { loadAnimal, clipFor } from './animals.js';
import {
  herdPath, paceStep, bulletStep, FREIGHT, lighthouseSpot, shoreTable, paceBounds, leapAt, loopAt, zoneOfTriangles,
} from './paths.js';

const sideOf = (def, fallback) => Math.sign(def.shot?.lateral ?? fallback) || fallback;
const sgnOf = (dir) => (dir === 'back' ? -1 : 1);
const warnOut = (what, def, leg, err) =>
  console.warn(`The ${what} at the ${def.id} along ${leg} was left out: ${err?.url ? `could not load ${err.url}` : err?.message ?? err}`);
const PLATFORM = 122;   // a platform window's length: nothing that moves comes into one
const SEA = 1;          // the sea's side of the line (+ left of the leg's out direction)

// a soft round glow: a radial fade drawn once (the lantern's glow, the splashes)
function glowTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d'), grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(0.3, 'rgba(255,255,255,0.65)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 64, 64);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// a part's JSON beside its module (its -params.json), from the same bases as cdnPart, each given `wait` seconds (fetch
// doesn't throw on a 404: an answer that isn't ok counts as a failure, and the next base is tried)
const JSON_WAIT = 8;
function partJson(id, suffix = '-params.json') {
  return firstOf(partBases(), `${id}${suffix}`, async (url) => {
    const r = await fetch(url, { signal: AbortSignal.timeout(JSON_WAIT * 1000) });
    if (!r.ok) { const e = new Error(`${r.status} from ${url}`); e.url = url; throw e; }
    return r.json();
  }, fellBack);
}

// ---- the lighthouse ----
// Polyfork's old lighthouse (13.9 m, its jetty left off on a cliff top) on the cliff top nearest the brief's spot (paths.js
// lighthouseSpot: that spot itself is over the sea), its door to the line. After dark its lantern glass and windows glow
// as its -params.json `night` says: each zone (found by its albedo in the vertex colours, as Polyfork matches them) cut
// out into a mesh of its own, emissive in its colour x intensity, scaled by f.night. A beam (two additive cones back to
// back, fading along their length) turns slowly from the lantern once night > 0.2. If the night map can't be read, it
// stands unlit, with no beam (warned once)
const LIGHTHOUSE_ID = 'old-lighthouse-48ca6c';
const LAMP = { y: 11.6, beam: 160, radius: 6, spin: 0.55, from: 0.2, full: 0.5, opacity: 0.26, glow: 7, colour: '#ffe2a0' };

// carve each night zone's triangles out of the meshes under root into a lit twin of its own (as Polyfork's kits light
// theirs); -> { mats: the twins' materials, counts and names: triangles found per zone, lamp: the glass zone's middle
// in world space (the actors' groups stand at the origin), or null }
function lightZones(root, night) {
  const zones = Object.entries(night ?? {}).filter(([, z]) => z?.albedo && z.findable !== false);
  const targets = zones.map(([, z]) => new THREE.Color(z.albedo));   // (in the working colour space, as the vertex colours are)
  const counts = zones.map(() => 0), mats = [], meshes = [];
  const lamp = new THREE.Vector3(), v = new THREE.Vector3();
  let lampN = 0;
  root.updateMatrixWorld(true);
  root.traverse((o) => { if (o.isMesh && !Array.isArray(o.material) && o.material?.emissive && o.geometry?.attributes?.color) meshes.push(o); });
  for (const mesh of meshes) {
    const src = mesh.geometry.index ? mesh.geometry.toNonIndexed() : mesh.geometry;
    const col = src.attributes.color, plain = col.array instanceof Float32Array && !col.normalized;
    const colours = plain ? col.array : Float32Array.from({ length: col.count * col.itemSize }, (_, i) => col.getComponent(Math.floor(i / col.itemSize), i % col.itemSize));
    const which = zoneOfTriangles(colours, col.itemSize, targets);
    if (!which.some((z) => z >= 0)) continue;
    const carve = (zone) => {
      const pick = [];
      for (let t = 0; t < which.length; t++) if (which[t] === zone) pick.push(t);
      if (!pick.length) return null;
      const g = new THREE.BufferGeometry();
      for (const [name, a] of Object.entries(src.attributes)) {
        const n = a.itemSize, out = new a.array.constructor(pick.length * 3 * n);
        pick.forEach((t, j) => out.set(a.array.subarray(t * 3 * n, (t + 1) * 3 * n), j * 3 * n));
        g.setAttribute(name, new THREE.BufferAttribute(out, n, a.normalized));
      }
      return { g, n: pick.length };
    };
    const rest = carve(-1);
    zones.forEach(([name, z], k) => {
      const cut = carve(k);
      if (!cut) return;
      counts[k] += cut.n;
      const mat = mesh.material.clone();
      mat.emissive = new THREE.Color(z.color).multiplyScalar(z.intensity ?? 1);
      mat.emissiveIntensity = 0;
      mats.push(mat);
      const twin = new THREE.Mesh(cut.g, mat);
      twin.name = `${mesh.name || 'lighthouse'}:${name} lit`;
      twin.castShadow = false; twin.receiveShadow = mesh.receiveShadow;
      mesh.add(twin);
      if (name === 'glass') {
        const p = cut.g.attributes.position;
        for (let i = 0; i < p.count; i++) { lamp.add(v.fromBufferAttribute(p, i).applyMatrix4(mesh.matrixWorld)); lampN++; }
      }
    });
    if (rest) mesh.geometry = rest.g;
    else mesh.visible = false;   // (all of it lit: its twins draw it)
  }
  return { mats, counts, names: zones.map(([n]) => n), lamp: lampN ? lamp.divideScalar(lampN) : null };
}

// the beam: two cones from the lantern, along +x and -x, bright at the lamp and fading to nothing at their mouths
function beamGeometry() {
  const cones = [0, Math.PI].map((turn) => {
    const g = new THREE.ConeGeometry(LAMP.radius, LAMP.beam, 24, 6, true).translate(0, -LAMP.beam / 2, 0).rotateZ(Math.PI / 2).rotateY(turn);
    const p = g.attributes.position, c = new Float32Array(p.count * 3);
    for (let i = 0; i < p.count; i++) {
      const k = (1 - Math.min(1, Math.abs(p.getX(i)) / LAMP.beam)) ** 1.6;
      c[i * 3] = c[i * 3 + 1] = c[i * 3 + 2] = k;
    }
    g.setAttribute('color', new THREE.BufferAttribute(c, 3));
    return g;
  });
  const g = mergeGeometries(cones);
  for (const c of cones) c.dispose();
  return g;
}

async function buildLighthouse({ leg, terrain, slicer }) {
  const group = new THREE.Group();
  group.name = `lighthouse ${leg}`;
  const spot = lighthouseSpot(terrain.heightAt, SEA_LEVEL);
  if (!spot) throw new Error('no cliff top near its spot to stand the lighthouse on');
  await slicer.frame();
  const tower = await cdnPart(LIGHTHOUSE_ID, { jetty: false });
  tower.position.set(spot.x, terrain.heightAt(spot.x, spot.z) - 0.4, spot.z);   // its islet's foot a little into the land
  tower.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  group.add(tower);

  // its night map: optional, it stands unlit without it
  await slicer.frame();
  let lit = { mats: [], lamp: null };
  try {
    const params = await partJson(LIGHTHOUSE_ID);
    lit = lightZones(tower, params.night);
    lit.names.forEach((n, k) => { if (!lit.counts[k]) console.warn(`The lighthouse along ${leg}: no ${n} to light (its albedo isn't in the model)`); });
    if (!lit.mats.length) console.warn(`The lighthouse along ${leg} stands unlit: none of its night zones were found`);
  } catch (err) {
    console.warn(`The lighthouse along ${leg} stands unlit: could not read its night map${err?.url ? ` (${err.url})` : `: ${err?.message ?? err}`}`);
  }
  const lamp = lit.mats.length > 0;   // (unlit: no beam either)
  const lampAt = lit.lamp ?? new THREE.Vector3(spot.x, tower.position.y + LAMP.y, spot.z);

  const beamMat = new THREE.MeshBasicMaterial({
    color: LAMP.colour, vertexColors: true, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false,
    side: THREE.DoubleSide, fog: false,
  });
  const beam = new THREE.Mesh(beamGeometry(), beamMat);
  beam.name = 'lighthouse beam';
  beam.position.copy(lampAt);
  beam.visible = false;
  beam.renderOrder = 2;   // over the sea
  beam.userData.own = true;
  const glowMat = new THREE.SpriteMaterial({ map: glowTexture(), color: LAMP.colour, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity: 0 });
  const glow = new THREE.Sprite(glowMat);
  glow.position.copy(lampAt);
  glow.scale.setScalar(LAMP.glow);
  glow.visible = false;
  glow.renderOrder = 2;
  glow.userData.own = true;
  group.add(beam, glow);

  let night = -1;
  return {
    group,
    // always: the tower stands whatever; the lamp follows the dark and the beam turns
    update(f) {
      const k = Math.min(1, Math.max(0, f.night));
      if (k !== night) {
        night = k;
        for (const m of lit.mats) m.emissiveIntensity = k;
        const b = Math.min(1, Math.max(0, (k - LAMP.from) / (LAMP.full - LAMP.from)));
        beam.visible = glow.visible = lamp && k > LAMP.from;
        beamMat.opacity = LAMP.opacity * b;
        glowMat.opacity = b;
      }
      if (beam.visible) beam.rotation.y = (beam.rotation.y + LAMP.spin * f.dt) % (2 * Math.PI);
    },
  };
}

// ---- the boats ----
// four sailboats (8 m, white sails) on slow loops 300-900 m offshore, a fishing boat puttering round 150 m out, and a
// container ship (180 m) on the horizon 2.5 km out, going east at 4 m/s (round again from 2.2 km west once it's 2.2 km
// east of the cliffs' middle; it sets off 500 m west of it). All bob on the swell. Each is placed off the waterline at a
// leg-s (paths.js shoreTable), along the line's way there and out to sea across it
const SAILS = [   // s: where its loop's middle is off; out: how far offshore; a, b: the loop's half-length and half-width
  { s: 700, out: 380, a: 220, b: 60, speed: 1.6, phase: 0.0, hull: '#f2f0ea' },
  { s: 1050, out: 620, a: 260, b: 90, speed: 1.3, phase: 2.1, hull: '#23405f' },
  { s: 1350, out: 480, a: 200, b: 70, speed: 1.8, phase: 4.0, hull: '#8c2f2a' },
  { s: 1600, out: 780, a: 240, b: 80, speed: 1.4, phase: 1.2, hull: '#f2f0ea' },
];
const FISHING = { s: 1500, out: 150, a: 120, b: 22, speed: 3, phase: 0.5, sink: 0.45 };   // sink: its keel's depth (its origin is its keel)
const SHIP = { s: 1100, out: 2500, speed: 4, reach: 2200, start: 1700, length: 180, beam: 28 };   // start: metres along its run at time 0 (500 m west of the middle)
const SWELL = { rise: 0.15, period: 5.5, roll: 0.06, pitch: 0.03 };

const mat = (color, extra = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.8, flatShading: true, ...extra });
const sailMat = mat('#f7f5ee', { side: THREE.DoubleSide, roughness: 0.9 });
const spar = mat('#8f9396', { metalness: 0.2 });
const deckMat = mat('#b89b74');

// a hull `len` long (along +z, its bow forward), `w` wide and `h` deep, its waterline `draft` up from its keel: a box
// tapered to a bow ahead and narrowed under the waterline
function hullGeometry(len, w, h, draft, bow = 0.95) {
  const g = new THREE.BoxGeometry(w, h, len, 2, 2, 10), p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const t = p.getZ(i) / (len / 2), y = p.getY(i) / (h / 2);
    let k = t > 0 ? 1 - bow * t * t : 1 - 0.12 * t * t;
    if (y < 0) k *= 0.55;
    p.setX(i, p.getX(i) * k);
    if (t > 0.6 && y < 0) p.setY(i, p.getY(i) + (t - 0.6) * h * 0.6);   // the forefoot rising to the bow
  }
  g.translate(0, h / 2 - draft, 0);
  g.computeVertexNormals();
  return g;
}

const tri = (pts) => {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pts.flat(), 3));
  g.computeVertexNormals();
  return g;
};
// one sailboat's shared geometries: its hull, cabin, mast and boom, and its sails (main and jib); faces +z, waterline y 0
function sailboatGeometry() {
  const cabin = new THREE.BoxGeometry(1.5, 0.6, 2.4).translate(0, 1.05, -0.7);
  const mast = new THREE.CylinderGeometry(0.06, 0.08, 10.2, 6).translate(0, 0.75 + 5.1, 0.6);
  const boom = new THREE.CylinderGeometry(0.05, 0.05, 3.4, 6).rotateX(Math.PI / 2).translate(0, 1.9, 0.6 - 1.7);
  const spars = mergeGeometries([mast, boom]);
  const sails = mergeGeometries([
    tri([[0, 2.0, 0.55], [0, 10.4, 0.55], [0, 2.0, -2.7]]),   // the main
    tri([[0, 9.4, 0.7], [0, 1.1, 3.8], [0, 1.4, 0.75]]),      // the jib
  ]);
  for (const g of [mast, boom]) g.dispose();
  return { hull: hullGeometry(8, 2.6, 1.3, 0.5), cabin, spars, sails };
}

// the container ship: a dark hull, a white superstructure and funnel aft, and its boxes stacked two to four high in
// eleven bays of ten rows, coloured (one InstancedMesh). Faces +z, waterline y 0
const BOX_COLOURS = ['#b8412f', '#2f5d8a', '#d9a33a', '#3f7a4b', '#7a7f86', '#c46a2a', '#e2ddd2', '#5b3d7a', '#1f6f78'];
function makeShip() {
  const ship = new THREE.Group();
  ship.name = 'container ship';
  const L = SHIP.length, W = SHIP.beam;
  const add = (geo, m) => { const o = new THREE.Mesh(geo, m); o.userData.own = true; ship.add(o); return o; };
  add(hullGeometry(L, W, 15, 9, 0.8), mat('#262b33'));
  add(new THREE.BoxGeometry(W - 2, 0.6, L - 30).translate(0, 6.2, -5), mat('#6d4a3a'));          // the deck
  add(new THREE.BoxGeometry(W - 4, 16, 14).translate(0, 6 + 8, -L / 2 + 16), mat('#e9e9e4'));   // the superstructure aft
  add(new THREE.BoxGeometry(W - 2, 1, 16).translate(0, 22.5, -L / 2 + 16), mat('#e9e9e4'));      // its bridge wings
  add(new THREE.BoxGeometry(5, 7, 5).translate(0, 25, -L / 2 + 8), mat('#a8302a'));              // the funnel
  const box = new THREE.BoxGeometry(2.4, 2.5, 12);
  const spots = [];
  let seed = 7;
  const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
  for (let bay = 0; bay < 11; bay++) {
    const z = -L / 2 + 34 + bay * 12.4;
    for (let row = 0; row < 10; row++) {
      const tiers = 2 + Math.floor(rnd() * 3);
      for (let k = 0; k < tiers; k++) spots.push([(row - 4.5) * 2.5, 6.5 + 1.25 + k * 2.55, z]);
    }
  }
  const boxes = new THREE.InstancedMesh(box, mat('#ffffff'), spots.length);
  const m = new THREE.Matrix4(), c = new THREE.Color();
  spots.forEach(([x, y, z], i) => {
    boxes.setMatrixAt(i, m.makeTranslation(x, y, z));
    boxes.setColorAt(i, c.set(BOX_COLOURS[Math.floor(rnd() * BOX_COLOURS.length)]));
  });
  boxes.computeBoundingSphere();
  boxes.name = 'containers';
  boxes.userData.own = true;
  ship.add(boxes);
  ship.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  return ship;
}

// the frame off the waterline at leg-s s, `out` offshore: -> { x, z, fx, fz (along the line's way), lx, lz (out to sea) }
function seaFrame(route, shore, s, out) {
  const P = {};
  herdPath(route, s, SEA, shore(s) + out, P);
  return { x: P.x, z: P.z, fx: Math.sin(P.yaw), fz: Math.cos(P.yaw), lx: SEA * Math.cos(P.yaw), lz: -SEA * Math.sin(P.yaw) };
}

async function buildBoats({ leg, route, def, terrain, slicer, kit }) {
  const group = new THREE.Group();
  group.name = `boats ${leg}`;
  const at = (s) => shoreTable(route, terrain.heightAt, SEA, s, s, { step: 1 });   // (a table of one place)
  const wet = (x, z) => terrain.heightAt(x, z) < SEA_LEVEL - 1;
  const o = {};
  // a boat on a loop: placed by its frame, kept only if its whole loop is over the sea
  const onLoop = (obj, loop, frame) => {
    for (let k = 0; k < 16; k++) {
      loopAt((k / 16) * 2 * Math.PI * ((loop.a + loop.b) / 2) / loop.speed, loop, o);
      if (!wet(frame.x + frame.fx * o.along + frame.lx * o.across, frame.z + frame.fz * o.along + frame.lz * o.across)) return null;
    }
    obj.rotation.order = 'YXZ';   // (turned to its way, then pitched and rolled on the swell)
    return { obj, loop, frame, phase: Math.random() * 6.3, sink: 0 };
  };
  const boats = [];

  // the sailboats
  const geo = sailboatGeometry();
  for (const [i, b] of SAILS.entries()) {
    const boat = new THREE.Group();
    boat.name = `sailboat ${i + 1}`;
    for (const [g, m] of [[geo.hull, mat(b.hull)], [geo.cabin, deckMat], [geo.spars, spar], [geo.sails, sailMat]]) {
      const mesh = new THREE.Mesh(g, m);
      mesh.castShadow = true; mesh.receiveShadow = true;
      mesh.userData.own = true;
      boat.add(mesh);
    }
    const placed = onLoop(boat, b, seaFrame(route, at(b.s), b.s, b.out));
    if (!placed) { console.warn(`A sailboat along ${leg} was left out: its loop off s ${b.s} runs aground`); continue; }
    placed.heel = 0.09;   // leaning off the wind a little
    group.add(boat);
    boats.push(placed);
  }

  // the fishing boat: optional
  await slicer.frame();
  let prop = null;
  try {
    const fb = await kit('ocean', 'fishing-boat', { parked: false, colorway: 'harbour-blue' });
    fb.traverse((m) => { if (m.isMesh) { m.castShadow = true; m.receiveShadow = true; } });
    const placed = onLoop(fb, FISHING, seaFrame(route, at(FISHING.s), FISHING.s, FISHING.out));
    if (!placed) throw new Error(`its loop off s ${FISHING.s} runs aground`);
    placed.heel = 0;
    placed.sink = FISHING.sink;
    prop = fb.getObjectByName('propeller');
    group.add(fb);
    boats.push(placed);
  } catch (err) { warnOut('fishing boat', def, leg, err); }

  // the container ship
  await slicer.frame();
  const ship = makeShip(), lane = seaFrame(route, at(SHIP.s), SHIP.s, SHIP.out);
  ship.rotation.order = 'YXZ';
  group.add(ship);

  // a boat to its place on its loop at t, facing the way it's sailing
  const sail = (b, t) => {
    loopAt(t, b.loop, o);
    const F = b.frame, vx = F.fx * Math.sin(o.heading) + F.lx * Math.cos(o.heading), vz = F.fz * Math.sin(o.heading) + F.lz * Math.cos(o.heading);
    b.obj.position.x = F.x + F.fx * o.along + F.lx * o.across;
    b.obj.position.z = F.z + F.fz * o.along + F.lz * o.across;
    b.obj.rotation.y = Math.atan2(vx, vz);
  };
  const swell = (obj, t, phase, k = 1, heel = 0) => {
    const w = 2 * Math.PI / SWELL.period;
    obj.position.y = SEA_LEVEL + SWELL.rise * k * Math.sin(w * t + phase);
    obj.rotation.z = heel + SWELL.roll * k * Math.sin(w * 0.8 * t + phase * 1.7);
    obj.rotation.x = SWELL.pitch * k * Math.sin(w * 1.1 * t + phase * 0.6);
  };
  return {
    group,
    // always: they sail and bob whatever the train's doing (by the clock, so each is where it would be)
    update(f) {
      const t = f.time;
      for (const b of boats) {
        sail(b, t);
        swell(b.obj, t, b.phase, 1, b.heel);
        b.obj.position.y -= b.sink;
      }
      if (prop) prop.rotation.z += 25 * f.dt;
      const span = 2 * SHIP.reach, along = (((t * SHIP.speed + SHIP.start) % span) + span) % span - SHIP.reach;
      ship.position.x = lane.x + lane.fx * along; ship.position.z = lane.z + lane.fz * along;
      ship.rotation.y = Math.atan2(lane.fx, lane.fz);
      swell(ship, t, 0.3, 0.12);
      ship.position.y = SEA_LEVEL + 0.25 * Math.sin(t * 0.6);
    },
  };
}

// ---- the gulls ----
// six herring gulls flying with the train (Fly) 10-25 m off its seaward side and 8-15 m up, each weaving on its own; they
// keep its pace through their window (paths.js paceStep), never into a platform window, and once it slows below 3 m/s
// they wheel off out to sea, climbing, and are gone a few seconds later
const GULLS = { count: 6, lateral: [10, 25], up: [8, 15], spread: 14, weave: 3, ahead: 6, offFor: 10, climb: 1.2, bank: 0.35 };

async function buildGulls({ leg, route, def, terrain, slicer }) {
  const group = new THREE.Group();
  group.name = `gulls ${leg}`;
  const side = sideOf(def, SEA);
  const { lo, hi } = paceBounds(def, route.length, GULLS.spread + GULLS.weave);
  const kind = await loadAnimal('herring-gull-base');
  const flock = [];
  for (let i = 0; i < GULLS.count; i++) {
    if (i % 2 === 0) await slicer.frame();
    const a = kind.make();
    a.object.visible = false;
    group.add(a.object);
    const [l0, l1] = GULLS.lateral, [u0, u1] = GULLS.up, w = GULLS.weave;
    flock.push({
      a, ds: (i / (GULLS.count - 1) * 2 - 1) * GULLS.spread, lateral: l0 + w + Math.random() * (l1 - l0 - 2 * w),
      up: u0 + 1.5 + Math.random() * (u1 - u0 - 3), phase: Math.random() * 6.3, w: 0.35 + Math.random() * 0.3,
    });
  }
  const P = {};
  let st = null;
  const hide = () => { st = null; for (const g of flock) g.a.object.visible = false; };
  return {
    group,
    update(f) {
      if (!f.on || f.legS === null) { hide(); return; }
      const sgn = sgnOf(f.dir);
      st = paceStep(st, { legS: f.legS, dir: f.dir, v: f.train.v, dt: f.dt, ahead: GULLS.ahead, lo, hi });
      const shown = st.mode === 'pace' || (st.mode === 'off' && st.t < GULLS.offFor);
      const clip = clipFor(st.speed, flock[0].a.clips);
      for (const g of flock) {
        g.a.object.visible = shown;
        if (!shown) continue;
        const ph = f.time * g.w + g.phase, sway = Math.cos(ph * 1.3);
        herdPath(route, st.s + sgn * (g.ds + GULLS.weave * Math.sin(ph)), side, g.lateral + GULLS.weave * Math.sin(ph * 1.3) + st.away, P);
        const ground = Math.max(P.y, terrain.heightAt(P.x, P.z), SEA_LEVEL);
        g.a.object.position.set(P.x, ground + g.up + 1.2 * Math.sin(ph * 0.8) + (st.mode === 'off' ? GULLS.climb * st.t : 0), P.z);
        // facing the way it's going, turned off the line as it wheels away, banking into its weave
        g.a.object.rotation.set(0, P.yaw + (sgn < 0 ? Math.PI : 0) + sgn * side * st.heading, -GULLS.bank * sway * sgn * side, 'YXZ');
        g.a.play(clip.name, { timeScale: clip.timeScale });
        g.a.update(f.dt);
      }
    },
    dispose: hide,
  };
}

// ---- the dolphins ----
// a pod of four, 80-150 m offshore along the cliffs, swimming fast with the train (at its pace, up to a dolphin's 11 m/s:
// faster than that the train draws ahead of them, so they join far enough ahead that it draws level about the window's
// middle), leaping in arcs in turn, each leap 1.2 s and pitched along its arc
// (paths.js leapAt), each ending in a splash: a short burst of white spray. Below 3 m/s they turn away out to sea
const POD = [{ ds: 0, out: 95 }, { ds: -7, out: 112 }, { ds: 5, out: 128 }, { ds: -3, out: 143 }];
const DOLPHIN = { top: 11, ahead: 40, weave: 2, offFor: 10, swim: 8 };
const SPLASH = { per: 28, life: 0.9, up: [2.2, 4.6], out: [0.4, 2.0], g: 9.8, size: 0.6 };

async function buildDolphins({ leg, route, def, terrain, slicer }) {
  const group = new THREE.Group();
  group.name = `dolphins ${leg}`;
  const side = sideOf(def, SEA);
  const { lo, hi } = paceBounds(def, route.length, 10), mid = (lo + hi) / 2;
  const shore = shoreTable(route, terrain.heightAt, side, lo - 20, hi + 20);
  await slicer.frame();
  const kind = await loadAnimal('dolphin-base');
  const pod = [];
  for (const [i, d] of POD.entries()) {
    if (i % 2 === 0) await slicer.frame();
    const a = kind.make();
    a.object.visible = false;
    group.add(a.object);
    pod.push({ ...d, a, air: false, phase: Math.random() * 6.3 });
  }

  // the spray: one Points of a burst per dolphin, each particle flung up and out, falling and fading
  const N = POD.length * SPLASH.per;
  const sPos = new Float32Array(N * 3), sVel = new Float32Array(N * 3), sAge = new Float32Array(N).fill(SPLASH.life), sCol = new Float32Array(N * 4);
  for (let i = 0; i < N; i++) sCol.set([1, 1, 1, 0], i * 4);
  const sGeo = new THREE.BufferGeometry();
  sGeo.setAttribute('position', new THREE.BufferAttribute(sPos, 3).setUsage(THREE.DynamicDrawUsage));
  sGeo.setAttribute('color', new THREE.BufferAttribute(sCol, 4).setUsage(THREE.DynamicDrawUsage));
  const spray = new THREE.Points(sGeo, new THREE.PointsMaterial({
    size: SPLASH.size, map: glowTexture(), vertexColors: true, transparent: true, depthWrite: false,
  }));
  spray.frustumCulled = false;   // moved by hand
  spray.renderOrder = 2;         // over the sea (transparent too, and sorted by its far-off middle)
  spray.visible = false;
  spray.userData.own = true;
  group.add(spray);
  let live = 0;   // particles still in the air
  const splash = (k, x, z) => {
    for (let j = 0; j < SPLASH.per; j++) {
      const i = k * SPLASH.per + j, a = Math.random() * 2 * Math.PI, r = SPLASH.out[0] + Math.random() * (SPLASH.out[1] - SPLASH.out[0]);
      sPos[i * 3] = x + Math.cos(a) * 0.4; sPos[i * 3 + 1] = SEA_LEVEL + 0.1; sPos[i * 3 + 2] = z + Math.sin(a) * 0.4;
      sVel[i * 3] = Math.cos(a) * r; sVel[i * 3 + 1] = SPLASH.up[0] + Math.random() * (SPLASH.up[1] - SPLASH.up[0]); sVel[i * 3 + 2] = Math.sin(a) * r;
      sAge[i] = Math.random() * 0.1;
    }
    live = N;
  };
  const fly = (dt) => {
    let any = false;
    for (let i = 0; i < N; i++) {
      if (sAge[i] >= SPLASH.life) { sCol[i * 4 + 3] = 0; continue; }
      any = true;
      sAge[i] += dt;
      sVel[i * 3 + 1] -= SPLASH.g * dt;
      sPos[i * 3] += sVel[i * 3] * dt; sPos[i * 3 + 1] += sVel[i * 3 + 1] * dt; sPos[i * 3 + 2] += sVel[i * 3 + 2] * dt;
      sCol[i * 4 + 3] = sPos[i * 3 + 1] < SEA_LEVEL - 0.2 ? 0 : Math.min(1, 1.6 * (1 - sAge[i] / SPLASH.life));
    }
    sGeo.attributes.position.needsUpdate = true;
    sGeo.attributes.color.needsUpdate = true;
    if (!any) live = 0;
    spray.visible = live > 0;
  };

  const P = {}, L = {};
  let st = null, t = 0;
  const hide = () => {
    st = null; t = 0; live = 0; spray.visible = false; sAge.fill(SPLASH.life);
    for (const d of pod) { d.a.object.visible = false; d.air = false; }
  };
  return {
    group,
    update(f) {
      if (!f.on || f.legS === null) { hide(); return; }
      const sgn = sgnOf(f.dir), v = Math.max(0, f.train.v);
      const lag = Math.max(0, v - DOLPHIN.top), ahead = Math.max(DOLPHIN.ahead, lag * Math.max(0, (mid - f.legS) * sgn) / Math.max(v, 1));
      st = paceStep(st, { legS: f.legS, dir: f.dir, v, dt: f.dt, lag, ahead, lo, hi });
      const shown = st.mode === 'pace' || (st.mode === 'off' && st.t < DOLPHIN.offFor);
      if (st.mode !== 'wait') t += f.dt;
      const scale = Math.min(1.5, Math.max(0.7, st.speed / DOLPHIN.swim));
      for (let k = 0; k < pod.length; k++) {
        const d = pod[k];
        d.a.object.visible = shown;
        if (!shown) { d.air = false; continue; }
        const s = st.s + sgn * d.ds;
        herdPath(route, s, side, shore(s) + d.out + DOLPHIN.weave * Math.sin(f.time * 0.5 + d.phase) + st.away, P);
        leapAt(t, k, pod.length, st.speed, L);
        if (d.air && !L.air) splash(k, P.x, P.z);   // back in the water
        d.air = L.air;
        d.a.object.position.set(P.x, SEA_LEVEL + L.y, P.z);
        d.a.object.rotation.set(-L.pitch, P.yaw + (sgn < 0 ? Math.PI : 0) + sgn * side * st.heading, 0, 'YXZ');
        d.a.play('Swim fast', { timeScale: scale });
        d.a.update(f.dt);
      }
      if (live) fly(f.dt);
    },
    dispose: hide,
  };
}

// ---- the freight ----
// a mainline diesel in deep green with eight tank and hopper wagons, on the other line the other way at 60 km/h, set off
// when its window starts so the two fronts pass at the window's middle (paths.js bulletStep, as the desert's passing
// bullet: it waits, unseen, at the line's end if you're slow); it rumbles as it passes and hides once more than 400 m
// behind you. Its whole length keeps out of the platform windows
const FREIGHT_CARS = [
  ['mainline-diesel', { colorway: 'deep-green', livery: 'deep-green', bogies: 'co-co', wear: 0.45 }],
  ['tank-wagon', { colorway: 'oil-black', wear: 0.55 }],
  ['hopper-wagon', { colorway: 'oxide', load: 'full', wear: 0.5 }],
  ['tank-wagon', { colorway: 'spirit-grey', wear: 0.4 }],
  ['hopper-wagon', { colorway: 'wagon-grey', load: 'full', wear: 0.6 }],
  ['tank-wagon', { colorway: 'oil-black', wear: 0.6 }],
  ['hopper-wagon', { colorway: 'oxide', load: 'full', wear: 0.45 }],
  ['tank-wagon', { colorway: 'milk-cream', wear: 0.35 }],
  ['hopper-wagon', { colorway: 'coal-black', load: 'full', wear: 0.55 }],
];

async function buildFreight({ leg, route, def, slicer }) {
  const group = new THREE.Group();
  group.name = `freight ${leg}`;
  // built a car a frame (each is a kit part made whole, ~0.15 s), into one train as buildTrain makes it
  const train = { name: 'passing freight', group: new THREE.Group(), cars: [] };
  train.group.name = train.name;
  for (const car of FREIGHT_CARS) {
    await slicer.frame();
    const one = await buildTrain({ name: train.name, cars: [car] });
    train.group.add(one.cars[0].holder);
    train.cars.push(one.cars[0]);
  }
  train.group.visible = false;
  group.add(train.group);
  const length = train.cars.reduce((a, c) => a + c.length, 0) + COUPLING_GAP * (train.cars.length - 1);
  const L = route.length, rev = reverseRoute(route), lane = laneOf(leg), meet = (def.s0 + def.s1) / 2;
  // its front's leg-s bounds: on an out run it heads down the leg (its wagons behind it, up the leg), on a back run up it
  const bounds = { out: { lo: PLATFORM, hi: L - PLATFORM - length }, back: { lo: PLATFORM + length, hi: L - PLATFORM } };
  const how = { speed: FREIGHT.speed, near: FREIGHT.near, behind: FREIGHT.behind };
  let st = null;
  const hide = () => { st = null; train.group.visible = false; };
  return {
    group,
    update(f) {
      if (!f.on || f.legS === null) { hide(); return; }
      const { lo, hi } = bounds[f.dir];
      st = bulletStep(st, { legS: f.legS, v: f.train.v, dir: f.dir, dt: f.dt, meet, lo, hi, ...how });
      if (st.whoosh) sound('rumble');
      train.group.visible = st.shown;
      if (!st.shown) return;
      // the other line is the leg's right-hand one (-lane): on an out run it runs the reversed route, where that's +lane
      const ds = FREIGHT.speed * f.dt;
      if (f.dir === 'out') poseTrain(train, rev, L - st.s, ds, lane);
      else poseTrain(train, route, st.s, ds, -lane);
    },
    dispose: hide,
  };
}

export const coast = { lighthouse: buildLighthouse, boats: buildBoats, gulls: buildGulls, dolphins: buildDolphins, freight: buildFreight };
