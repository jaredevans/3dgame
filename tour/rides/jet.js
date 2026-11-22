// The jet (west-future): Polyfork's business jet (17 m, swept wings, rear engines, rigged), the rocket's ride. Its gear
// comes up after take-off and goes down for landing, its flaps out for both, its nose held up as it lands
// (rides/jet-plan.js gearAt, flapsAt, noseUp: the model's own rig pivots, set from them), its wheels turning as it rolls;
// its airstair down while it waits and once it's landed, folded up as it sets off. After dark its navigation lights show
// (its -params.json night map, as the airliner's: coast.js lightZones), its beacon flashes red and its wingtip strobes
// white once it's flying, and its landing lights shine with its gear down. You sit in the right-hand seat of its
// cockpit: the model's own cockpit windows made glass, its cockpit lined inside, a bulkhead behind you and a glare
// shield and panel under the windscreen (the model is a shell with no inside). Its two pads are drawn on the level
// ground the land holds for them (world-data.js JET_PADS): the hardstanding by the Wild West's departure platform and the
// apron by the Futuristic place's arrival platform, concrete with a line down the middle, lit at their edges after
// dark. The UFO is its set piece (ufo.js).
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { lightZones, partJson } from '../actors/coast.js';
import { ridePads } from '../world-data.js';
import { GEAR_RIG, FLAP_RIG, gearAt, flapsAt, gearClocks, noseUp } from './jet-plan.js';
import { buildUfo } from './ufo.js';
import { dotTexture } from './spray.js';

const JET = 'business-jet-684611';
const PARAMS = { colorway: 'blue', doors: 'open', wear: 0.15 };
const TYRES = 0.05;          // the model's tyres touch the ground this far over its origin
// the cockpit, in the model's frame (measured in the page): its windows' glass (the `glass` colour) forward of COCKPIT,
// a band 2.66-3.03 m up from 5.75 m back to the windscreen's foot at 7.9 m; the hull lined inside forward of BULKHEAD,
// which closes it behind you (the hull there 2.2 m across, 1.0-3.35 m up)
const GLASS = '#282f3f', COCKPIT = 5.5, BULKHEAD = 4.7;
const HOLD = { x: 1.04, y: 2.18, h: 1.1 };   // the bulkhead's half-width, middle and half-height
// your eyes in the right-hand seat, close behind the windscreen so its narrow band fills the view ahead
const EYE = { x: -0.4, y: 2.85, z: 6.85 };
const WHEEL_R = { 'wheel-nose': 0.22, 'wheel-l': 0.32, 'wheel-r': 0.32 };
const DEG = Math.PI / 180;
const BEACON = { every: 1.1, on: 0.12 }, STROBE = { every: 1.4, on: 0.06, gap: 0.12 };   // s
const PAD_LIGHT = { every: 15, blue: '#5ab0ff', white: '#fff4dc' };
const EASE = 1.2;            // 1/s: the flaps and airstair move this quickly towards where they're going

const mat = (color, more = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.85, ...more });

// the cockpit made: under `root` (the jet), each hull mesh's triangles of the glass colour forward of COCKPIT taken out
// of it into a see-through glass mesh, and those forward of BULKHEAD (bar the glass) copied into a dark lining drawn on
// their inner face; -> the number of glass triangles found
function cockpit(root) {
  const target = new THREE.Color(GLASS), toRoot = new THREE.Matrix4(), v = new THREE.Vector3();
  const glassMat = new THREE.MeshStandardMaterial({ color: '#203448', transparent: true, opacity: 0.25, roughness: 0.05, metalness: 0.3, side: THREE.DoubleSide, depthWrite: false });
  const liningMat = mat('#2b2e33', { side: THREE.BackSide, roughness: 0.9 });
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
      let z = 0, isGlass = true;
      for (let k = 0; k < 3; k++) {
        const i = t * 3 + k;
        z += v.fromBufferAttribute(pos, i).applyMatrix4(toRoot).z / 3;
        if (Math.abs(col.getX(i) - target.r) > 0.004 || Math.abs(col.getY(i) - target.g) > 0.004 || Math.abs(col.getZ(i) - target.b) > 0.004) isGlass = false;
      }
      if (isGlass && z > COCKPIT) glass.push(t);
      else { keep.push(t); if (z > BULKHEAD) lining.push(t); }
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
    if (glass.length) {
      found += glass.length;
      const pane = new THREE.Mesh(pick(glass), glassMat);
      pane.name = 'cockpit glass';
      pane.castShadow = false;
      pane.renderOrder = 2;
      mesh.add(pane);
      const rest = pick(keep);
      if (src !== mesh.geometry) src.dispose();
      mesh.geometry.dispose();
      mesh.geometry = rest;
    }
    if (lining.length) {
      const inside = new THREE.Mesh(pick(lining), liningMat);
      inside.name = 'cockpit lining';
      inside.castShadow = false;
      mesh.add(inside);
    }
  }
  return found;
}

// what's inside the cockpit (in the model's frame): the bulkhead behind the seats, the two seats' backs, and under the
// windscreen the glare shield over a panel of four screens (lit a little at night)
function fittings(screenMat) {
  const g = new THREE.Group();
  g.name = 'cockpit fittings';
  const ell = new THREE.Shape();
  ell.absellipse(0, HOLD.y, HOLD.x, HOLD.h, 0, Math.PI * 2);
  const wall = new THREE.Mesh(new THREE.ShapeGeometry(ell, 24).translate(0, 0, BULKHEAD), mat('#3a3d43', { side: THREE.DoubleSide }));
  wall.name = 'cockpit bulkhead';
  const seatGeo = [-0.4, 0.4].flatMap((x) => [
    new THREE.BoxGeometry(0.52, 0.75, 0.12).translate(x, 2.55, EYE.z - 0.42),
    new THREE.BoxGeometry(0.52, 0.12, 0.5).translate(x, 2.05, EYE.z - 0.2),
  ]);
  const seats = new THREE.Mesh(mergeGeometries(seatGeo), mat('#4a3b32', { roughness: 0.7 }));
  seats.name = 'cockpit seats';
  for (const s of seatGeo) s.dispose();
  const shield = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.05, 0.42).translate(0, 2.6, 7.18), mat('#1d1f23'));
  shield.name = 'glare shield';
  const panel = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.36, 0.08).translate(0, 2.4, 7.12), mat('#2a2d32'));
  panel.name = 'instrument panel';
  const screens = new THREE.Mesh(mergeGeometries([-0.42, -0.14, 0.14, 0.42].map((x) => new THREE.PlaneGeometry(0.22, 0.17).rotateY(Math.PI).translate(x, 2.42, 7.075))), screenMat);
  screens.name = 'cockpit screens';
  for (const o of [wall, seats, shield, panel, screens]) { o.castShadow = false; g.add(o); }
  return g;
}

// a pad drawn on the level ground the land holds for it (world-data.js ridePads: { x, z, w, d, rot, y }): concrete, a
// metre in from its edges (where the drawn land starts to blend back to the land round it), a line down the middle of
// the jet's way along it (`line`: its offset across the pad, metres to its left of the pad's middle), and lights along its
// two long edges every PAD_LIGHT.every metres, lit after dark (-> { group, lights: their material })
function pad(name, p, line, colour, lightMat) {
  const g = new THREE.Group();
  g.name = name;
  const w = p.w - 2, d = p.d - 2;
  const slab = new THREE.Mesh(new THREE.PlaneGeometry(w, d).rotateX(-Math.PI / 2), mat(colour, { roughness: 0.95 }));
  slab.position.y = 0.03;
  slab.receiveShadow = true;
  const paint = new THREE.Mesh(new THREE.PlaneGeometry(0.3, d - 6).rotateX(-Math.PI / 2).translate(line, 0.045, 0), mat('#e8c33a', { roughness: 0.8 }));
  paint.receiveShadow = true;
  const lamps = [];
  for (let z = -d / 2 + 2; z <= d / 2 - 2; z += PAD_LIGHT.every) for (const x of [-w / 2 + 0.3, w / 2 - 0.3]) lamps.push(new THREE.BoxGeometry(0.22, 0.22, 0.22).translate(x, 0.14, z));
  const lights = new THREE.Mesh(mergeGeometries(lamps), lightMat);
  for (const l of lamps) l.dispose();
  lights.name = `${name} lights`;
  g.add(slab, paint, lights);
  g.position.set(p.x, p.y, p.z);
  g.rotation.y = p.rot;
  return g;
}

// a pair of the model's rig nodes' turns, set outright from a knob (0..1) times each one's range
function rigOf(model, table) {
  return table.map((r) => ({ ...r, o: model.getObjectByName(r.node) })).filter((r) => r.o);
}

// ctx: the registry's (rides/index.js)
export async function buildJet({ ride, slicer, still, cdnPart, warn }) {
  await slicer.frame();
  await still();   // (the jet made, its lights cut out and its cockpit glazed and lined: some tens of ms, only where it may land)
  const model = await cdnPart(JET, PARAMS);   // (a vehicle that can't be loaded fails the build)
  model.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  await slicer.frame();
  await still();
  let lit = [], beacon = [];
  try {
    lightZones(model, (await partJson(JET)).night);
    model.traverse((o) => {
      if (!o.isMesh || !o.name.endsWith(' lit')) return;
      (o.name.endsWith(':beacon lit') ? beacon : lit).push(o.material);
    });
    if (!lit.length) warn('lights', new Error('none of its night zones were found'));
  } catch (err) { if (err?.dropped) throw err; warn('lights', err); }
  await slicer.frame();
  await still();
  if (!cockpit(model)) warn('cockpit glass', new Error('none of its cockpit windows were found'));
  const screenMat = new THREE.MeshBasicMaterial({ color: '#0b1622' });
  model.add(fittings(screenMat));
  // its rig: the gear and flaps, its wheels, and the airstair (built down: its open turn kept to fold it back to)
  const gear = rigOf(model, GEAR_RIG), flaps = rigOf(model, FLAP_RIG);
  const wheels = Object.keys(WHEEL_R).map((n) => ({ o: model.getObjectByName(n), r: WHEEL_R[n] })).filter((w) => w.o);
  const stair = model.getObjectByName('airstair'), stairOpen = stair?.rotation.z ?? 0;
  if (gear.length < GEAR_RIG.length) warn('gear', new Error(`only ${gear.length} of its gear's ${GEAR_RIG.length} pivots were found`));
  // its strobes (white, at the wingtips) and landing lights (at the nose), soft glows
  const glowTex = dotTexture();
  const strobeMat = new THREE.SpriteMaterial({ map: glowTex, color: '#ffffff', blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity: 0, fog: false });
  const landMat = new THREE.SpriteMaterial({ map: glowTex, color: '#fff3d6', blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity: 0, fog: false });
  const strobes = [8.2, -8.2].map((x) => { const s = new THREE.Sprite(strobeMat); s.position.set(x, 1.95, -1.1); s.scale.setScalar(3.2); return s; });
  const lamps = [0.35, -0.35].map((x) => { const s = new THREE.Sprite(landMat); s.position.set(x, 1.05, 7.35); s.scale.setScalar(2.4); return s; });
  model.add(...strobes, ...lamps);

  const holder = new THREE.Group();
  holder.name = 'jet';
  const tilt = new THREE.Group();   // its nose held up as it lands, turned about the holder (over its main wheels)
  tilt.name = 'jet attitude';
  model.position.y = -ride.rest - TYRES;
  tilt.add(model);
  holder.add(tilt);
  holder.updateMatrixWorld(true);
  const box = new THREE.Box3();
  model.traverse((o) => { if (o.isMesh && !o.name.startsWith('cockpit')) box.expandByObject(o); });   // (in the holder's frame)

  // its pads, drawn on their level ground
  await slicer.frame();
  await still();
  const [stand, apron] = ridePads();
  const padLight = new THREE.MeshBasicMaterial({ color: PAD_LIGHT.white, toneMapped: false });
  const blueLight = new THREE.MeshBasicMaterial({ color: PAD_LIGHT.blue, toneMapped: false });
  const boardMarker = pad('jet hardstanding', stand, 0.5, '#a39d92', blueLight);
  const landPad = pad('jet apron', apron, 0, '#8f8a83', padLight);
  const padLights = [padLight, blueLight], dayLight = [new THREE.Color(PAD_LIGHT.white).multiplyScalar(0.35), new THREE.Color(PAD_LIGHT.blue).multiplyScalar(0.35)];
  const nightLight = [new THREE.Color(PAD_LIGHT.white), new THREE.Color(PAD_LIGHT.blue)];

  // the UFO: left out, the ride going on, if it can't be made
  const actors = new Map();
  try { actors.set('ufo', await buildUfo({ ride, slicer, still })); } catch (err) { if (err?.dropped) throw err; warn('UFO', err); }

  const knobs = { leg: 0, door: 0, bay: 0 };
  // your eyes, in the holder's frame: turned with the model as its nose is held up (else the panel came up into them)
  const eye = new THREE.Vector3(EYE.x, EYE.y - ride.rest - TYRES, EYE.z), seat = eye.clone();
  let flap = flapsAt(0), open = 1, roll = 0, t = 0, night = -1;
  const setGear = (g) => {
    gearClocks(g, knobs);
    for (let i = 0; i < gear.length; i++) { const r = gear[i]; r.o.rotation[r.axis] = r.deg * DEG * knobs[r.clock]; }
  };
  setGear(0);
  for (const r of flaps) r.o.rotation[r.axis] = r.deg * DEG * flap;
  return {
    vehicle: {
      holder, box, seat,
      // it climbs and comes down with its path, and banks into its turns (round the rocket some 40 degrees: a 3 g turn
      // at its speed would want 72)
      attitude: { pitch: 1, bank: 0.7, level: 0 },
    },
    crew: [],
    actors,
    boardMarker, landPad,
    update(f) {
      const dt = f.dt, riding = f.rideS !== null, s = riding ? f.rideS : 0, v = riding ? f.rideV : 0;
      t += dt;
      const ease = 1 - Math.exp(-dt * EASE);
      // the gear and the nose from the ride's s (down, level, waiting or landed); the flaps and airstair moving to theirs
      setGear(riding ? gearAt(s) : 0);
      tilt.rotation.x = riding ? -noseUp(s) : 0;
      const c = Math.cos(tilt.rotation.x), sn = Math.sin(tilt.rotation.x);
      seat.set(eye.x, eye.y * c - eye.z * sn, eye.y * sn + eye.z * c);
      flap += ((riding ? flapsAt(s) : flap) - flap) * ease;
      for (let i = 0; i < flaps.length; i++) { const r = flaps[i]; r.o.rotation[r.axis] = r.deg * DEG * flap; }
      open += ((riding ? 0 : 1) - open) * ease * 1.5;
      if (stair) stair.rotation.z = stairOpen * open;
      // its wheels turning as it rolls (and on, slowing, as they come up)
      roll += v * dt * (knobs.leg < 0.5 ? 1 : 0);
      for (let i = 0; i < wheels.length; i++) wheels[i].o.rotation.x = roll / wheels[i].r;
      // its lights: navigation lights as night falls; the beacon flashing while it's under way; the strobes once it's off
      // the ground; the landing lights with the gear down, under way
      const k = Math.min(1, Math.max(0, f.night));
      if (k !== night) {
        night = k;
        for (const m of lit) m.emissiveIntensity = k;
        screenMat.color.setRGB(0.04 + 0.12 * k, 0.09 + 0.25 * k, 0.13 + 0.35 * k);
        for (let i = 0; i < padLights.length; i++) padLights[i].color.copy(dayLight[i]).lerp(nightLight[i], k);
      }
      const flying = riding && knobs.leg > 0.02;
      const b = riding && t % BEACON.every < BEACON.on ? 1 : 0;
      for (const m of beacon) m.emissiveIntensity = b * Math.max(0.5, k);
      const st = t % STROBE.every, flash = st < STROBE.on || (st > STROBE.gap && st < STROBE.gap + STROBE.on);
      strobeMat.opacity = flying && flash ? 0.35 + 0.65 * k : 0;
      for (const sp of strobes) sp.visible = strobeMat.opacity > 0;
      landMat.opacity = riding && knobs.leg < 0.5 ? 0.15 + 0.75 * k : 0;
      for (const sp of lamps) sp.visible = landMat.opacity > 0;
    },
    dispose() {},
  };
}
