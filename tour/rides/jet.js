// The starfighter (west-future; the ride's id is 'jet'): Polyfork's agile starfighter (7 m long, its X-foils 6.4 m
// across, at its real size; owner's ruling R18), the rocket's ride. It has no wheels: it hovers up off its pad and down
// onto its apron, its nose held up a little and its nozzles turned down as it does. Its X-foils spread into attack
// position for the fight with the UFO (rides/jet-plan.js foilsAt: the model's own rig); it swings to point at the
// saucer and fires a missile from its belly's bay (aimAt: its holder turned so, so the cockpit's view turns with it;
// ufo.js flies the missile). Its nozzles burn cyan (its -params.json night map's `thruster` zone: brighter after dark,
// and with its thrust) with a code plume behind each, and its nose lamp lights after dark; white strobes flash at its
// foils' tips in flight. You sit in its single seat: the model's canopy panes (painted glass) made see-through, its
// cockpit lined inside, a bulkhead behind you and a low panel ahead. Its two pads are drawn on the level ground the land
// holds for them (world-data.js JET_PADS): concrete with a landing ring, lit at their edges after dark. The UFO is its
// set piece (ufo.js).
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { lightZones, partJson } from '../actors/coast.js';
import { ridePads } from '../world-data.js';
import { FOIL_RIG, foilsAt, noseUp, aimAt } from './jet-plan.js';
import { buildUfo } from './ufo.js';
import { dotTexture } from './spray.js';
import { conductorFigure, sitOn } from './crew.js';

const CRAFT = 'agile-starfighter-89805f';
const PARAMS = { colorway: 'coalition-blue' };
// the cockpit, in the model's frame (measured in the page): the canopy's panes (the `glass` colour) over z -0.85 to
// 1.95, 0.92-1.6 m up, 0.84 m across; the hull lined inside over LINING (the cockpit's tub), closed behind you by a
// bulkhead at BULKHEAD
const GLASS = '#20242f', LINING = { z: [-1.05, 2.4], x: 1.0, y: 0.45 }, BULKHEAD = { z: -1.0, y: 1.12, w: 0.62, h: 0.5 };
// your eyes in the seat, under the canopy's crown, so its panes are all round you
const EYE = { x: 0, y: 1.34, z: 0.15 };
// you (the conductor) in the seat, seen through the canopy from outside: the seat's top under you, your hips over it
const SEATED = { top: 0.56, z: 0.02 };   // (his cap clear of the canopy frame over him, at 1.48 m)
const DEG = Math.PI / 180;
const STROBE = { every: 1.4, on: 0.06, gap: 0.12 };   // s
const PAD_LIGHT = { every: 8, blue: '#5ab0ff', white: '#fff4dc' };
const NOZZLE = { exit: -0.62, plume: 2.6, r: 0.36, down: 26 };   // a nozzle's exit along its node (m), its plume, its vectoring (deg)
const HOVER_V = 45;   // m/s: below this its nozzles turn down to hold it up

const mat = (color, more = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.85, ...more });

// the cockpit made: under `root`, each hull mesh's canopy panes (the glass colour) taken out of it into a see-through
// glass mesh (glowing faintly cyan after dark, as its night map's glass does: its instruments), and its triangles over
// the cockpit's tub (bar the glass) copied into a dark lining drawn on their inner face; -> { found, glass: its material }
function cockpit(root) {
  const target = new THREE.Color(GLASS), toRoot = new THREE.Matrix4(), v = new THREE.Vector3(), c = new THREE.Vector3();
  const glassMat = new THREE.MeshStandardMaterial({ color: '#1b2a3c', transparent: true, opacity: 0.22, roughness: 0.05, metalness: 0.3, side: THREE.DoubleSide, depthWrite: false, emissive: new THREE.Color('#7ff0ff'), emissiveIntensity: 0 });
  const liningMat = mat('#24272c', { side: THREE.BackSide, roughness: 0.9 });
  let found = 0;
  root.updateMatrixWorld(true);
  const meshes = [];
  root.traverse((o) => { if (o.isMesh && o.geometry.attributes.color && !Array.isArray(o.material)) meshes.push(o); });
  for (const mesh of meshes) {
    const src = mesh.geometry.index ? mesh.geometry.toNonIndexed() : mesh.geometry;
    const pos = src.attributes.position, col = src.attributes.color, tris = pos.count / 3;
    toRoot.copy(root.matrixWorld).invert().multiply(mesh.matrixWorld);
    const keep = [], glass = [], lining = [];
    for (let t = 0; t < tris; t++) {
      let isGlass = true;
      c.set(0, 0, 0);
      for (let k = 0; k < 3; k++) {
        const i = t * 3 + k;
        c.add(v.fromBufferAttribute(pos, i).applyMatrix4(toRoot));
        if (Math.abs(col.getX(i) - target.r) > 0.004 || Math.abs(col.getY(i) - target.g) > 0.004 || Math.abs(col.getZ(i) - target.b) > 0.004) isGlass = false;
      }
      c.multiplyScalar(1 / 3);
      if (isGlass) glass.push(t);
      else {
        keep.push(t);
        if (c.z > LINING.z[0] && c.z < LINING.z[1] && Math.abs(c.x) < LINING.x && c.y > LINING.y) lining.push(t);
      }
    }
    if (!glass.length && !lining.length) { if (src !== mesh.geometry) src.dispose(); continue; }
    const pick = (list) => {
      const g = new THREE.BufferGeometry();
      for (const [name, a] of Object.entries(src.attributes)) {
        const n = a.itemSize, out = new a.array.constructor(list.length * 3 * n);
        list.forEach((t, j) => out.set(a.array.subarray(t * 3 * n, (t + 1) * 3 * n), j * 3 * n));
        g.setAttribute(name, new THREE.BufferAttribute(out, n, a.normalized));
      }
      return g;
    };
    if (lining.length) {
      const inside = new THREE.Mesh(pick(lining), liningMat);
      inside.name = 'cockpit lining';
      inside.castShadow = false;
      mesh.add(inside);
    }
    if (glass.length) {
      found += glass.length;
      const pane = new THREE.Mesh(pick(glass), glassMat);
      pane.name = 'cockpit glass';
      pane.castShadow = false;
      pane.renderOrder = 2;
      mesh.add(pane);
      const rest = pick(keep);
      mesh.geometry.dispose();
      mesh.geometry = rest;
    }
    if (src !== mesh.geometry) src.dispose();   // (every part of it now read into its own)
  }
  return { found, glass: glassMat };
}

// what's inside the cockpit (in the model's frame): the bulkhead behind the seat, the seat's back and headrest, and a
// low panel ahead with three screens (lit a little at night)
function fittings(screenMat) {
  const g = new THREE.Group();
  g.name = 'cockpit fittings';
  const B = BULKHEAD, ell = new THREE.Shape();
  ell.absellipse(0, B.y, B.w, B.h, 0, Math.PI * 2);
  const wall = new THREE.Mesh(new THREE.ShapeGeometry(ell, 24).translate(0, 0, B.z), mat('#33363c', { side: THREE.DoubleSide }));
  wall.name = 'cockpit bulkhead';
  const seatGeo = [new THREE.BoxGeometry(0.5, 0.62, 0.1).translate(0, 1.05, EYE.z - 0.3), new THREE.BoxGeometry(0.28, 0.2, 0.08).translate(0, 1.42, EYE.z - 0.3)];
  const seat = new THREE.Mesh(mergeGeometries(seatGeo), mat('#3a3f47', { roughness: 0.7 }));
  seat.name = 'cockpit seat';
  for (const s of seatGeo) s.dispose();
  const panel = new THREE.Mesh(new THREE.BoxGeometry(0.56, 0.14, 0.06).translate(0, 0.8, 1.05), mat('#1d1f23'));
  panel.name = 'instrument panel';
  const screens = new THREE.Mesh(mergeGeometries([-0.18, 0, 0.18].map((x) => new THREE.PlaneGeometry(0.14, 0.09).rotateY(Math.PI).translate(x, 0.8, 1.015))), screenMat);
  screens.name = 'cockpit screens';
  for (const o of [wall, seat, panel, screens]) { o.castShadow = false; g.add(o); }
  return g;
}

// a pad drawn on the level ground the land holds for it (world-data.js ridePads: { x, z, w, d, rot, y }): concrete, a
// metre in from its edges (where the drawn land starts to blend back to the land round it), a yellow ring where the
// craft stands (`at`: its offset across and along the pad from its middle), and lights along its edges every
// PAD_LIGHT.every metres, lit after dark (-> the pad's group)
function pad(name, p, at, colour, lightMat) {
  const g = new THREE.Group();
  g.name = name;
  const w = p.w - 2, d = p.d - 2;
  const slab = new THREE.Mesh(new THREE.PlaneGeometry(w, d).rotateX(-Math.PI / 2), mat(colour, { roughness: 0.95 }));
  slab.position.y = 0.03;
  slab.receiveShadow = true;
  const ring = new THREE.Mesh(new THREE.RingGeometry(4.2, 4.5, 40).rotateX(-Math.PI / 2).translate(at[0], 0.045, at[1]), mat('#e8c33a', { roughness: 0.8 }));
  ring.receiveShadow = true;
  const lamps = [];
  for (let z = -d / 2 + 1; z <= d / 2 - 1; z += PAD_LIGHT.every) for (const x of [-w / 2 + 0.3, w / 2 - 0.3]) lamps.push(new THREE.BoxGeometry(0.22, 0.22, 0.22).translate(x, 0.14, z));
  const lights = new THREE.Mesh(mergeGeometries(lamps), lightMat);
  for (const l of lamps) l.dispose();
  lights.name = `${name} lights`;
  g.add(slab, ring, lights);
  g.position.set(p.x, p.y, p.z);
  g.rotation.y = p.rot;
  return g;
}
// where (x, z) is on pad p, across and along it from its middle
function onPad(p, x, z) {
  const dx = x - p.x, dz = z - p.z, c = Math.cos(p.rot), s = Math.sin(p.rot);
  return [dx * c - dz * s, dx * s + dz * c];
}

// ctx: the registry's (rides/index.js)
export async function buildJet({ ride, slicer, still, cdnPart, kit, warn }) {
  await slicer.frame();
  await still();   // (the starfighter made, its lights cut out and its cockpit glazed and lined: only where it may land)
  const model = await cdnPart(CRAFT, PARAMS);   // (a vehicle that can't be loaded fails the build)
  model.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  await slicer.frame();
  await still();
  // its nozzles and nose lamp from its night map (its glass is the cockpit's, below); left dark, warned, if it can't be read
  let thrusters = [], lamp = [];
  try {
    const night = { ...(await partJson(CRAFT)).night };
    delete night.glass;
    lightZones(model, night);
    model.traverse((o) => {
      if (!o.isMesh || !o.name.endsWith(' lit')) return;
      (o.name.endsWith(':thruster lit') ? thrusters : lamp).push(o.material);
    });
    if (!thrusters.length) warn('nozzles\' glow', new Error('its thruster zone was not found'));
  } catch (err) { if (err?.dropped) throw err; warn('lights', err); }
  await slicer.frame();
  await still();
  const pit = cockpit(model);
  if (!pit.found) warn('cockpit glass', new Error('none of its canopy panes were found'));
  const screenMat = new THREE.MeshBasicMaterial({ color: '#0b1622' });
  model.add(fittings(screenMat));
  // its rig: the X-foils, and the nozzles (turned down to hover)
  const foils = FOIL_RIG.map((r) => ({ ...r, o: model.getObjectByName(r.node) })).filter((r) => r.o);
  const nozzles = ['nozzle-r', 'nozzle-l'].map((n) => model.getObjectByName(n)).filter(Boolean);
  if (foils.length < FOIL_RIG.length) warn('foils', new Error(`only ${foils.length} of its foils' ${FOIL_RIG.length} hinges were found`));
  // a plume from each nozzle's exit (riding the nozzle as it turns): additive cones, cyan, as long as its thrust
  const plumeMat = new THREE.MeshBasicMaterial({ color: '#4ad4d4', transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false });
  const plumes = nozzles.map((n) => {
    const p = new THREE.Mesh(new THREE.ConeGeometry(NOZZLE.r, NOZZLE.plume, 12, 1, true).rotateX(-Math.PI / 2).translate(0, 0, NOZZLE.exit - NOZZLE.plume / 2), plumeMat);
    p.name = 'nozzle plume';
    p.castShadow = false; p.frustumCulled = false;
    n.add(p);
    return p;
  });
  // white strobes at its lower foils' tips
  const glowTex = dotTexture();
  const strobeMat = new THREE.SpriteMaterial({ map: glowTex, color: '#ffffff', blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity: 0, fog: false });
  const strobes = ['wing-fold-lr', 'wing-fold-ll'].map((n, i) => {
    const s = new THREE.Sprite(strobeMat), o = model.getObjectByName(n);
    s.position.set(i ? -2.42 : 2.42, -0.15, -1.25);
    s.scale.setScalar(1.6);
    (o ?? model).add(s);
    return s;
  });
  const holder = new THREE.Group();
  holder.name = 'starfighter';
  model.position.y = -ride.rest;
  holder.add(model);
  holder.updateMatrixWorld(true);
  const box = new THREE.Box3();
  model.traverse((o) => { if (o.isMesh && !o.name.startsWith('cockpit') && o.name !== 'nozzle plume') box.expandByObject(o); });   // (in the holder's frame)
  // you, the conductor, in its seat (seen from outside: ride-run.js)
  await slicer.frame();
  await still();
  const rider = await conductorFigure({ kit, warn });
  if (rider) sitOn(rider.figure, model, SEATED.top, SEATED.z);

  // its pads, drawn on their level ground
  await slicer.frame();
  await still();
  const [stand, apron] = ridePads();
  const padLight = new THREE.MeshBasicMaterial({ color: PAD_LIGHT.white, toneMapped: false });
  const blueLight = new THREE.MeshBasicMaterial({ color: PAD_LIGHT.blue, toneMapped: false });
  const boardMarker = pad('starfighter pad', stand, onPad(stand, ride.board.x, ride.board.z), '#a39d92', blueLight);
  const landPad = pad('starfighter apron', apron, onPad(apron, ride.land.x, ride.land.z), '#8f8a83', padLight);
  const padLights = [padLight, blueLight], dayLight = [new THREE.Color(PAD_LIGHT.white).multiplyScalar(0.35), new THREE.Color(PAD_LIGHT.blue).multiplyScalar(0.35)];
  const nightLight = [new THREE.Color(PAD_LIGHT.white), new THREE.Color(PAD_LIGHT.blue)];

  // the UFO: left out, the ride going on, if it can't be made
  const actors = new Map();
  try { actors.set('ufo', await buildUfo({ ride, slicer, still, cdnPart, warn })); } catch (err) { if (err?.dropped) throw err; warn('UFO', err); }

  const aim = { yaw: 0, pitch: 0 }, L = ride.path.length;
  let t = 0, night = -1;
  return {
    vehicle: {
      holder, box, seat: new THREE.Vector3(EYE.x, EYE.y - ride.rest, EYE.z), rider: rider?.figure ?? null,
      // it climbs and comes down with its path, banks into its turns (round the rocket some 40 degrees), and comes level
      // as it slows to hover
      attitude: { pitch: 1, bank: 0.7, level: 30 },
    },
    crew: [],
    actors,
    boardMarker, landPad,
    update(f) {
      const dt = f.dt, riding = f.rideS !== null, s = riding ? f.rideS : 0, v = riding ? f.rideV : 0;
      t += dt;
      // turned to point at the saucer, and its nose held up as it hovers: its holder turned on from where the runner put
      // it this frame (so the cockpit's view turns with it)
      if (riding) {
        aimAt(s, aim);
        holder.rotation.y += aim.yaw;
        holder.rotation.x -= aim.pitch + noseUp(s, L);
      }
      const spread = riding ? foilsAt(s) : 0;
      for (let i = 0; i < foils.length; i++) { const r = foils[i]; r.o.rotation[r.axis] = r.deg * DEG * spread; }
      const hover = riding ? 1 - Math.min(1, v / HOVER_V) : 0;
      for (let i = 0; i < nozzles.length; i++) nozzles[i].rotation.x = NOZZLE.down * DEG * hover;
      // its lights: its nozzles burning with its thrust, brighter after dark; its nose lamp, screens and canopy glow
      // after dark; its strobes once it's flying
      const k = Math.min(1, Math.max(0, f.night)), thrust = riding ? Math.max(0.35, Math.min(1, v / ride.profile.v), hover) : 0;
      for (let i = 0; i < thrusters.length; i++) thrusters[i].emissiveIntensity = thrust * (0.45 + 0.55 * k);
      plumeMat.opacity = thrust * (0.2 + 0.45 * k);
      for (let i = 0; i < plumes.length; i++) plumes[i].visible = plumeMat.opacity > 0.01;
      if (k !== night) {
        night = k;
        for (const m of lamp) m.emissiveIntensity = k;
        pit.glass.emissiveIntensity = 0.45 * k * 0.4;
        screenMat.color.setRGB(0.04 + 0.12 * k, 0.09 + 0.25 * k, 0.13 + 0.35 * k);
        for (let i = 0; i < padLights.length; i++) padLights[i].color.copy(dayLight[i]).lerp(nightLight[i], k);
      }
      const st = t % STROBE.every, flash = st < STROBE.on || (st > STROBE.gap && st < STROBE.gap + STROBE.on);
      strobeMat.opacity = riding && v > HOVER_V && flash ? 0.35 + 0.65 * k : 0;
      for (const sp of strobes) sp.visible = strobeMat.opacity > 0;
    },
    dispose() {},
  };
}
