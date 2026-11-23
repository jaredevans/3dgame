// The hot-air balloon (ocean-mountain), built here in the tour's low-poly style (Polyfork's only hot-air balloon is a
// 2.6 m miniature): an envelope 20 m tall and 17 m across in bright panels (rides.js BALLOON and envelopeRadius give its
// shape, which the crows' clearance test measures from), a wicker basket with its leather rim, two fuel cylinders, the
// burners on their frame over it, and two jet engines on the basket's sides that push it along, their exhausts glowing
// with their thrust. You stand in the basket's front right corner; its pilot (the Alpine kit's mountaineer) at the back
// left. The burners fire as rides.js burnAt says (long burns lifting off, bursts cruising), their flame showing by day,
// and after dark lighting the envelope from inside and the jets' exhausts glowing brighter. Its basket hangs level, and
// it turns slowly to its way (a balloon swings round as it lifts off, not on the spot). Pads at both ends: a gravel
// circle beside Oceanside's departure platform, where it waits inflated, and another beside the Mountain's arrival
// platform where it sets down. The crows are its set piece (crows.js).
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { crewFigure, conductorFigure } from './crew.js';
import { BALLOON, envelopeRadius, burnAt } from '../rides.js';
import { buildCrows } from './crows.js';

const E = BALLOON.envelope;
const GORES = 16, ROWS = 18;
// its panels round the envelope, a band of them shifted round the belly, its skirt (the scoop over the burners) dark
// and its crown pale
const PANELS = ['#e4402e', '#f6c324', '#2b63c6', '#f3eee2'];
const SKIRT = '#30343f', CROWN = '#f3eee2', BELT = [12.2, 17.2];
const BASKET = { half: 0.85, wall: 1.1, rim: 0.12 };
const FRAME = { y: 1.45, half: 0.5 };            // the burners' frame, over the basket on four uprights
const BURNER = { r: 0.14, y0: 1.45, y1: 1.85, x: 0.16 };
const FLAME = { len: 1.7, r: 0.26 };
const JET = { x: 1.43, y: -0.55, r: 0.32, len: 1.7 };
// your eyes, standing in the right of the basket, back from its front wall so its rim is in view ahead (nearer, it was
// under the view, and you seemed to float); the pilot in the back left
const SEAT = { x: -0.36, y: BALLOON.floor + 1.62, z: -0.28 };
const PILOT = { x: 0.42, z: -0.4 };
const PAD = { r: 4.4, ring: 0.22 };
const TURN = 0.22;   // radians a second at most it swings round to its way
const NIGHT_RING = '#ffd9a0';

const mat = (color, more = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.85, flatShading: true, ...more });
const at = (g, x, y, z) => g.translate(x, y, z);
// a round bar from a to b
function rod(a, b, r = 0.025, sides = 6) {
  const len = a.distanceTo(b), g = new THREE.CylinderGeometry(r, r, len, sides), o = new THREE.Object3D();
  o.position.copy(a).add(b).multiplyScalar(0.5);
  o.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), new THREE.Vector3().subVectors(b, a).normalize());
  o.updateMatrix();
  return g.applyMatrix4(o.matrix);
}
// geometries merged into one mesh, each one's own (non-indexed, so any mix merges) freed
function merged(name, geos, material, shadow = true) {
  const flat = geos.map((g) => (g.index ? g.toNonIndexed() : g));
  const m = new THREE.Mesh(mergeGeometries(flat), material);
  for (const g of new Set([...geos, ...flat])) g.dispose();
  m.name = name;
  m.castShadow = shadow;
  m.receiveShadow = true;
  return m;
}

// the envelope: a lathe of its profile in GORES faceted panels, coloured panel by panel. Its material glows from
// inside (its emissive taken through each panel's own colour, so a lit balloon at night shows its panels)
function envelope() {
  const pts = [];
  for (let k = 0; k <= ROWS; k++) {
    // (rows closer together over the dome, where it turns most)
    const u = k / ROWS, y = E.throat + (E.crown - E.throat) * (1 - (1 - u) ** 1.35);
    pts.push(new THREE.Vector2(k === ROWS ? 0 : envelopeRadius(y), y));
  }
  const g = new THREE.LatheGeometry(pts, GORES).toNonIndexed();
  const pos = g.attributes.position, n = pos.count, col = new Float32Array(n * 3), c = new THREE.Color();
  for (let i = 0; i < n; i += 3) {
    // each triangle by its middle: which panel round, how high
    let x = 0, y = 0, z = 0;
    for (let j = 0; j < 3; j++) { x += pos.getX(i + j); y += pos.getY(i + j); z += pos.getZ(i + j); }
    x /= 3; y /= 3; z /= 3;
    const gore = Math.floor(((Math.atan2(x, z) + 2 * Math.PI) % (2 * Math.PI)) / (2 * Math.PI / GORES)) % GORES;
    const belt = y > BELT[0] && y < BELT[1];
    c.set(y < E.throat + 2.2 ? SKIRT : y > E.crown - 1.6 ? CROWN : PANELS[(gore + (belt ? 2 : 0)) % PANELS.length]);
    for (let j = 0; j < 3; j++) col.set([c.r, c.g, c.b], (i + j) * 3);
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  g.computeVertexNormals();
  const m = mat('#ffffff', { vertexColors: true, roughness: 0.8, side: THREE.DoubleSide, emissive: new THREE.Color('#ffa860'), emissiveIntensity: 0 });
  m.onBeforeCompile = (sh) => {
    sh.fragmentShader = sh.fragmentShader.replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\n\ttotalEmissiveRadiance *= vColor;');
  };
  const mesh = new THREE.Mesh(g, m);
  mesh.name = 'envelope';
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  // the load ring round its throat, and the cables from it down to the burners' frame
  const cables = [new THREE.TorusGeometry(E.throatR, 0.045, 5, 24).rotateX(Math.PI / 2).translate(0, E.throat, 0)];
  for (let k = 0; k < 4; k++) {
    const a = Math.PI / 4 + (k * Math.PI) / 2, fx = Math.sign(Math.sin(a)) * FRAME.half, fz = Math.sign(Math.cos(a)) * FRAME.half;
    for (const d of [-0.39, 0.39]) {
      const b = a + d;
      cables.push(rod(new THREE.Vector3(fx, FRAME.y, fz), new THREE.Vector3(Math.sin(b) * E.throatR, E.throat, Math.cos(b) * E.throatR), 0.014, 4));
    }
  }
  return { mesh, glow: m, cables: merged('load cables', cables, mat('#26272b')) };
}

// the basket: wicker walls woven in bands, darker posts at its corners, a leather-padded rim, skids under it, two fuel
// cylinders inside (front left, back right); the burners' uprights and frame over it, and the twin burners on it
function basket() {
  const B = BASKET, F = BALLOON.floor, h = B.half, top = F + B.wall;
  const wicker = [], weave = [], leather = [], metal = [], dark = [], tanks = [];
  wicker.push(at(new THREE.BoxGeometry(2 * h, 0.06, 2 * h), 0, F + 0.05, 0));
  for (const [sx, sz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
    const along = sz ? 2 * h : 0.05, across = sz ? 0.05 : 2 * h;
    wicker.push(at(new THREE.BoxGeometry(along, B.wall, across), sx * (h - 0.025), F + B.wall / 2, sz * (h - 0.025)));
    for (const y of [0.22, 0.5, 0.78]) weave.push(at(new THREE.BoxGeometry(sz ? 2 * h + 0.01 : 0.02, 0.07, sz ? 0.02 : 2 * h + 0.01), sx * (h + 0.005), F + y, sz * (h + 0.005)));
    leather.push(at(new THREE.BoxGeometry(sz ? 2 * h + 0.1 : B.rim, 0.11, sz ? B.rim : 2 * h + 0.1), sx * h, top, sz * h));
  }
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) weave.push(at(new THREE.BoxGeometry(0.08, B.wall, 0.08), sx * h, F + B.wall / 2, sz * h));
  for (const sx of [-1, 1]) dark.push(at(new THREE.BoxGeometry(0.1, 0.07, 2 * h + 0.1), sx * (h - 0.25), F + 0.0, 0));
  for (const [sx, sz] of [[1, 1], [-1, -1]]) {
    tanks.push(at(new THREE.CylinderGeometry(0.16, 0.16, 0.72, 10), sx * (h - 0.24), F + 0.44, sz * (h - 0.24)));
    metal.push(at(new THREE.CylinderGeometry(0.05, 0.05, 0.1, 6), sx * (h - 0.24), F + 0.85, sz * (h - 0.24)));
  }
  // the uprights (in their padded sleeves) from the rim's corners to the frame, the frame, the burners and their coils
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    dark.push(rod(new THREE.Vector3(sx * (h - 0.06), top, sz * (h - 0.06)), new THREE.Vector3(sx * FRAME.half, FRAME.y, sz * FRAME.half), 0.03));
  }
  const c = (x, z) => new THREE.Vector3(x * FRAME.half, FRAME.y, z * FRAME.half);
  for (const [a, b] of [[c(1, 1), c(1, -1)], [c(1, -1), c(-1, -1)], [c(-1, -1), c(-1, 1)], [c(-1, 1), c(1, 1)], [c(1, 0), c(-1, 0)]]) metal.push(rod(a, b, 0.025));
  for (const sx of [-1, 1]) {
    const x = sx * BURNER.x, mid = (BURNER.y0 + BURNER.y1) / 2;
    metal.push(at(new THREE.CylinderGeometry(BURNER.r, BURNER.r * 0.85, BURNER.y1 - BURNER.y0, 10), x, mid, 0));
    for (const y of [mid - 0.08, mid + 0.06]) dark.push(at(new THREE.TorusGeometry(BURNER.r + 0.03, 0.025, 4, 12).rotateX(Math.PI / 2), x, y, 0));
  }
  const g = new THREE.Group();
  g.name = 'basket';
  g.add(
    merged('basket wicker', wicker, mat('#b88b52')),
    merged('basket weave', weave, mat('#8a6236')),
    merged('basket rim', leather, mat('#4a2f1f', { roughness: 0.6 })),
    merged('burners', metal, mat('#b9bec6', { metalness: 0.6, roughness: 0.35 })),
    merged('basket frame', dark, mat('#2e2f35')),
    merged('fuel cylinders', tanks, mat('#9fb4c9', { metalness: 0.4, roughness: 0.4 })),
  );
  return g;
}

// the burners' flames: a long yellow one from each burner up into the throat, a blue core in it, and the pilot lights;
// all see-through, adding light, casting no shadow
function flames() {
  const g = new THREE.Group();
  g.name = 'burner flames';
  const flame = new THREE.MeshBasicMaterial({ color: '#ffc861', transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false });
  const core = new THREE.MeshBasicMaterial({ color: '#7fb4ff', transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false });
  const pilot = new THREE.MeshBasicMaterial({ color: '#8fc0ff', transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false });
  const parts = [];
  for (const sx of [-1, 1]) {
    // (each grows up from its burner's mouth: its base at the burner's top, scaled from there)
    const f = new THREE.Mesh(new THREE.ConeGeometry(FLAME.r, FLAME.len, 10, 1, true).translate(0, FLAME.len / 2, 0), flame);
    const k = new THREE.Mesh(new THREE.ConeGeometry(FLAME.r * 0.45, FLAME.len * 0.45, 8, 1, true).translate(0, FLAME.len * 0.225, 0), core);
    const p = new THREE.Mesh(new THREE.SphereGeometry(0.05, 6, 4), pilot);
    for (const m of [f, k, p]) { m.position.set(sx * BURNER.x, BURNER.y1, 0); m.castShadow = false; m.frustumCulled = false; g.add(m); }
    parts.push(f, k);
  }
  return { group: g, parts, flame, core, pilot };
}

// a jet engine on the basket's side (sx: +1 its left), on two struts: a polished nacelle, its intake and spinner at the
// front, its nozzle at the back with the glow of its exhaust in it, and a plume behind; -> { group, spinner, plume }
function jet(sx, glowMat, plumeMat) {
  const J = JET, L = J.len / 2, g = new THREE.Group();
  g.name = 'jet engine';
  g.position.set(sx * J.x, J.y, 0);
  const prof = [[0.27, L], [0.31, L - 0.08], [J.r, L - 0.35], [J.r, -L + 0.45], [0.25, -L + 0.08], [0.22, -L]].map(([r, y]) => new THREE.Vector2(r, y));
  const shell = new THREE.Mesh(new THREE.LatheGeometry(prof, 14).rotateX(Math.PI / 2), mat('#c7ccd3', { metalness: 0.6, roughness: 0.32, side: THREE.DoubleSide }));
  shell.castShadow = true;
  const darkMat = mat('#1f2226');
  const intake = new THREE.Mesh(new THREE.CircleGeometry(0.27, 14).translate(0, 0, L - 0.12), darkMat);
  const spinner = new THREE.Mesh(new THREE.ConeGeometry(0.09, 0.22, 8).rotateX(Math.PI / 2).translate(0, 0, L - 0.02), mat('#8d939b', { metalness: 0.6, roughness: 0.4 }));
  const nozzle = new THREE.Mesh(new THREE.CircleGeometry(0.21, 14).rotateY(Math.PI).translate(0, 0, -L + 0.06), glowMat);
  const plume = new THREE.Mesh(new THREE.ConeGeometry(0.2, 2.2, 10, 1, true).rotateX(-Math.PI / 2).translate(0, 0, -L - 1.1), plumeMat);
  plume.castShadow = false; plume.frustumCulled = false;
  // (the struts from the nacelle's side, a little into it, to the basket's wall)
  const len = J.x - BASKET.half - J.r + 0.04, struts = [];
  for (const z of [-0.4, 0.4]) struts.push(at(new THREE.BoxGeometry(len, 0.08, 0.1), -sx * (J.r - 0.04 + len / 2), 0, z));
  g.add(shell, intake, spinner, nozzle, plume, merged('jet struts', struts, mat('#2e2f35')));
  return { group: g, spinner, plume };
}

// a pad on the ground at (x, z): a gravel circle draped on the land, a pale ring round it lit after dark
function pad(name, x, z, terrain, ringMat) {
  const g = new THREE.Group();
  g.name = name;
  const y0 = terrain.heightAt(x, z);
  const drape = (geo, up) => {
    geo.rotateX(-Math.PI / 2);
    const p = geo.attributes.position;
    for (let i = 0; i < p.count; i++) p.setY(i, terrain.heightAt(x + p.getX(i), z + p.getZ(i)) - y0 + up);
    geo.computeVertexNormals();
    return geo;
  };
  const disc = new THREE.Mesh(drape(new THREE.RingGeometry(0.01, PAD.r, 48, 8), 0.1), mat('#a7a091', { roughness: 0.95 }));
  disc.receiveShadow = true;
  const ring = new THREE.Mesh(drape(new THREE.RingGeometry(PAD.r - PAD.ring, PAD.r, 96, 1), 0.14), ringMat);
  ring.receiveShadow = true;
  g.add(disc, ring);
  g.position.set(x, y0, z);
  return g;
}

// ctx: the registry's (rides/index.js)
export async function buildBalloon({ ride, slicer, still, kit, terrain, loadAnimal, warn }) {
  await slicer.frame();
  await still();   // (the envelope and basket made and merged: only where it may land)
  const holder = new THREE.Group();
  holder.name = 'hot-air balloon';
  const env = envelope();
  holder.add(env.mesh, env.cables, basket());
  await slicer.frame();
  await still();
  const fl = flames();
  holder.add(fl.group);
  const glowMat = mat('#2a1a10', { emissive: new THREE.Color('#ff8a3a'), emissiveIntensity: 0, roughness: 0.6 });
  const plumeMat = new THREE.MeshBasicMaterial({ color: '#ff9f55', transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false });
  const jets = [jet(1, glowMat, plumeMat), jet(-1, glowMat, plumeMat)];
  for (const j of jets) holder.add(j.group);
  // its pilot, at the back left, facing ahead (Polyfork's humanoid clips: Idle); left out, the balloon going on, if
  // they can't be had
  let anim = null;
  await slicer.frame();
  await still();
  const pilot = await crewFigure({ kit, warn }, { kitKey: 'mountain', key: 'mountaineer', name: 'balloon pilot', what: 'pilot' });
  if (pilot) {
    pilot.figure.position.set(PILOT.x, BALLOON.floor + 0.08, PILOT.z);
    holder.add(pilot.figure);
    anim = pilot.anim;
  }
  holder.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(holder);   // (at the origin, unturned: in the holder's own frame)
  // you, the conductor, standing where your seat is, in the basket's front right (seen from outside: ride-run.js)
  await slicer.frame();
  await still();
  const rider = await conductorFigure({ kit, warn }, 'Idle');
  if (rider) {
    rider.figure.position.set(SEAT.x, BALLOON.floor + 0.08, SEAT.z);
    holder.add(rider.figure);
  }

  await slicer.frame();
  await still();   // (the pads draped on the land: some 1,300 heights looked up, only where it may land)
  const ringMat = mat('#e9e3d2', { roughness: 0.7, emissive: new THREE.Color(NIGHT_RING), emissiveIntensity: 0 });
  const boardMarker = pad('balloon pad', ride.board.x, ride.board.z, terrain, ringMat);
  const landPad = pad('balloon landing pad', ride.land.x, ride.land.z, terrain, ringMat);

  // its crows: left out, the ride going on, if they can't be had
  const actors = new Map();
  try { actors.set('crows', await buildCrows({ ride, slicer, still, loadAnimal })); } catch (err) { if (err?.dropped) throw err; warn('crows', err); }

  let t = 0, riding = false, rideT = 0, heading = null, night = -1, spin = 0;
  const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));
  return {
    vehicle: {
      holder, box, seat: new THREE.Vector3(SEAT.x, SEAT.y, SEAT.z), rider: rider?.figure ?? null,
      // what you walk into on its pad: the basket and the jets on its sides (the envelope is far over your head, and
      // its 17 m would shut you out of the pad)
      foot: { min: { x: -(JET.x + JET.r), z: -Math.max(BASKET.half, JET.len / 2) }, max: { x: JET.x + JET.r, z: Math.max(BASKET.half, JET.len / 2) } },
      // its basket hangs level, however it climbs or turns
      attitude: { pitch: 0, bank: 0 },
    },
    crew: [],
    actors,
    boardMarker, landPad,
    update(f) {
      const dt = f.dt;
      t += dt;
      anim?.update(dt);
      if (rider?.figure.visible) rider.anim?.update(dt);
      let burn, thrust;
      if (f.rideS === null) {
        // waiting on its pad (or on the one it set down on): a short blast every so often to keep it full, jets idle
        riding = false;
        const c = t % 14;
        burn = c < 1.2 ? Math.min(1, c / 0.15, (1.2 - c) / 0.3) : 0;
        thrust = 0;
      } else {
        // riding: the ride's own seconds (its frame's dt is clamped as the ride's clock is, so they keep together; the
        // runner gives the engine the burners' roar from that same clock)
        if (!riding) { riding = true; rideT = 0; heading = holder.rotation.y; } else rideT += dt;
        burn = burnAt(rideT);
        thrust = Math.min(1, Math.max(0, f.rideV / ride.profile.v));
        // swung round to the path's way slowly, not spun on the spot as the path turns under a near-upright climb
        const d = wrap(holder.rotation.y - heading), most = TURN * dt;
        heading = wrap(heading + Math.max(-most, Math.min(most, d * (1 - Math.exp(-dt * 1.2)))));
        holder.rotation.y = heading;
      }
      const k = Math.min(1, Math.max(0, f.night));
      // the flames: by day a bright tongue while they burn, brighter after dark; the envelope lit from inside at night
      const flick = 0.9 + 0.1 * Math.sin(t * 37) * Math.sin(t * 23);
      fl.flame.opacity = burn * (0.55 + 0.4 * k) * flick;
      fl.core.opacity = burn * 0.6;
      fl.pilot.opacity = 0.25 + 0.6 * k;
      for (let i = 0; i < fl.parts.length; i++) { const p = fl.parts[i]; p.visible = burn > 0.01; p.scale.set(1, (0.35 + 0.65 * burn) * flick, 1); }
      env.glow.emissiveIntensity = k * (0.04 + 0.5 * burn);
      // the jets: their exhaust glowing with their thrust, far brighter after dark; their fans turning
      glowMat.emissiveIntensity = thrust * (0.5 + 2.5 * k) + 0.1 * k;
      plumeMat.opacity = thrust * (0.12 + 0.45 * k);
      spin += dt * (2 + 40 * thrust);
      for (let i = 0; i < jets.length; i++) { jets[i].spinner.rotation.z = spin; jets[i].plume.visible = plumeMat.opacity > 0.005; }
      if (k !== night) { night = k; ringMat.emissiveIntensity = 0.6 * k; }
    },
    dispose() {},
  };
}
