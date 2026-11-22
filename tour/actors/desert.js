// The Silver Arrow's leg (west-future): a wind farm and a solar farm on the desert, the high-speed stretch's boards,
// another Silver Arrow flashing past the other way, a rocket launch on the horizon and a formation of drones flying
// alongside.
//
// The line runs west-north-west across the desert on its guideway (9 m over the dry wash) from s 190 to 3950. North is
// -z, so north of the line is its right (side -1, as herdPath's `side`), south its left (+1). Your line is the right-hand
// one (laneOf -2) both ways, the other line the left-hand one: the passing bullet runs on that.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { cdnPart } from '../parts.js';
import { laneOf, FEATURES } from '../world-data.js';
import { reverseRoute } from '../route.js';
import { COUPLING_GAP } from '../consist.js';
import { buildTrain, poseTrain } from '../vehicles.js';
import { sound } from '../audio.js';
import {
  herdPath, BULLET, bulletStep, clearOfMesas, turbineSpots, solarGrid, nearestFit, formationAt, ROCKET, rocketAt, rocketPad,
} from './paths.js';

// 1 over u 0..a, falling to 0 over b..1 (a and b the ends of the fades in and out)
const fade = (u, a, b) => Math.max(0, Math.min(1, u / a, (1 - u) / (1 - b)));
const sgnOf = (dir) => (dir === 'back' ? -1 : 1);
const warnOut = (what, def, leg, err) =>
  console.warn(`The ${what} at the ${def.id} along ${leg} was left out: ${err?.url ? `could not load ${err.url}` : err?.message ?? err}`);
const PLATFORM = 122;   // a platform window's length: nothing that moves comes into one

// a soft round glow: a radial fade drawn once (the rocket's and the drones' lights)
function glowTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d'), grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(0.25, 'rgba(255,255,255,0.6)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 64, 64);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// ---- the farm: wind turbines and solar racks ----
// twelve turbines (80 m to the hub, 40 m blades) in two rows north of the line between s 1000 and 2500, each off the
// mesas by more than a blade and no higher than `rise` over the line (the massif's foothills north of s 1000-1300 are
// left to the land), their rotors into a south-westerly; ~300 solar racks in rows 250-400 m south of the line about
// s 1500, moved along it as little as keeps them clear of the mesa there
const FARM = {
  s0: 1000, s1: 2500, rows: [550, 850], perRow: 6, side: -1, minGap: 150, clear: 60, rise: 40,
  hub: 80, blade: 40, nose: 5, wind: -Math.PI / 4, spin: [0.75, 1.0],
};
const SOLAR = { id: 'solar-array-rack-789c93', s: 1500, rows: 13, perRow: 23, pitch: 4.2, out: [250, 400], side: 1, clear: 20, step: 10, reach: 400 };
const turbineMat = new THREE.MeshStandardMaterial({ color: '#f1f3f4', roughness: 0.55, metalness: 0.05, flatShading: true });

// a turbine's tower and nacelle (its foot at y 0, buried 2 m; the rotor's nose towards its +z), and its rotor about
// its hub (its axis +z)
function turbineGeometry() {
  const tower = new THREE.CylinderGeometry(1.4, 2.4, FARM.hub - 1.5 + 2, 14).translate(0, (FARM.hub - 1.5 - 2) / 2, 0);
  const nacelle = new THREE.BoxGeometry(3.4, 3.4, 11).translate(0, FARM.hub, -1.5);
  const base = mergeGeometries([tower, nacelle]);
  const spinner = new THREE.ConeGeometry(1.9, 4, 12).rotateX(Math.PI / 2).translate(0, 0, 1);
  const parts = [spinner];
  for (let k = 0; k < 3; k++) {
    // a blade: a flat slab tapering from its root to its tip, turned a little to the wind
    const b = new THREE.BoxGeometry(2.8, FARM.blade, 0.45, 1, 4, 1), p = b.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const t = (p.getY(i) + FARM.blade / 2) / FARM.blade;
      p.setX(i, p.getX(i) * (1 - 0.72 * t) + 0.5 * t);
      p.setZ(i, p.getZ(i) * (1 - 0.6 * t));
    }
    b.translate(0, FARM.blade / 2 + 1.2, 0).rotateY(0.22).rotateZ(k * 2 * Math.PI / 3);
    parts.push(b);
  }
  const rotor = mergeGeometries(parts);
  for (const g of [tower, nacelle, ...parts]) g.dispose();
  return { base, rotor };
}

// the rack's meshes copied into one InstancedMesh per material, each rack at its matrix
function instanceRacks(rack, matrices) {
  rack.updateMatrixWorld(true);
  const byMat = new Map();
  rack.traverse((o) => {
    if (!o.isMesh) return;
    const key = Array.isArray(o.material) ? o : o.material;   // (a multi-material mesh keeps its own)
    if (!byMat.has(key)) byMat.set(key, { material: o.material, geos: [] });
    byMat.get(key).geos.push(o.geometry.clone().applyMatrix4(o.matrixWorld));
  });
  const meshes = [];
  for (const { material, geos } of byMat.values()) {
    // merged where they agree on their attributes, else one each
    const merged = geos.length > 1 ? mergeGeometries(geos) : geos[0];
    const lots = merged ? [merged] : geos;
    if (merged && geos.length > 1) for (const g of geos) g.dispose();
    for (const geo of lots) {
      const im = new THREE.InstancedMesh(geo, material, matrices.length);
      matrices.forEach((m, i) => im.setMatrixAt(i, m));
      im.computeBoundingSphere();
      im.castShadow = true; im.receiveShadow = true;
      im.name = 'solar racks';
      im.userData.own = true;
      meshes.push(im);
    }
  }
  return meshes;
}

async function buildFarm({ leg, route, def, terrain, slicer }) {
  const group = new THREE.Group();
  group.name = `farm ${leg}`;
  const P = {}, pos = new THREE.Vector3(), q = new THREE.Quaternion(), one = new THREE.Vector3(1, 1, 1), m = new THREE.Matrix4();

  // the turbines
  const lineY = route.at((FARM.s0 + FARM.s1) / 2).y;
  const spots = turbineSpots(route, {
    s0: FARM.s0, s1: FARM.s1, rows: FARM.rows, perRow: FARM.perRow, side: FARM.side, minGap: FARM.minGap,
    ok: (x, z) => clearOfMesas(x, z, FEATURES, FARM.clear) && terrain.heightAt(x, z) <= lineY + FARM.rise,
  });
  if (spots.length < FARM.rows.length * FARM.perRow) console.warn(`Only ${spots.length} wind turbines fit along ${leg}`);
  const { base, rotor } = turbineGeometry();
  const towers = new THREE.InstancedMesh(base, turbineMat, spots.length);
  const rotors = new THREE.InstancedMesh(rotor, turbineMat, spots.length);
  const turbines = spots.map((sp, i) => {
    const yaw = FARM.wind + 0.12 * Math.sin(i * 2.3);
    const foot = new THREE.Vector3(sp.x, terrain.heightAt(sp.x, sp.z), sp.z);
    const facing = new THREE.Quaternion().setFromAxisAngle(THREE.Object3D.DEFAULT_UP, yaw);
    towers.setMatrixAt(i, m.compose(foot, facing, one));
    const hub = new THREE.Vector3(0, FARM.hub, FARM.nose).applyQuaternion(facing).add(foot);
    return { hub, facing, angle: i * 0.7, spin: FARM.spin[0] + (FARM.spin[1] - FARM.spin[0]) * ((i * 0.618) % 1) };
  });
  const roll = new THREE.Quaternion(), axis = new THREE.Vector3(0, 0, 1);
  const turn = (dt) => {
    for (let i = 0; i < turbines.length; i++) {
      const t = turbines[i];
      t.angle = (t.angle + t.spin * dt) % (2 * Math.PI);
      rotors.setMatrixAt(i, m.compose(t.hub, q.copy(t.facing).multiply(roll.setFromAxisAngle(axis, t.angle)), one));
    }
    rotors.instanceMatrix.needsUpdate = true;
  };
  turn(0);
  for (const im of [towers, rotors]) {
    im.computeBoundingSphere();
    im.castShadow = true; im.receiveShadow = true;
    im.userData.own = true;
    group.add(im);
  }
  towers.name = 'wind turbines'; rotors.name = 'wind turbine rotors';

  // the solar racks: optional, the turbines stand without them
  await slicer.frame();
  try {
    const rack = await cdnPart(SOLAR.id, { colorway: 'astro-cyan' });
    const grid = (s) => solarGrid({ s, rows: SOLAR.rows, perRow: SOLAR.perRow, pitch: SOLAR.pitch, out: SOLAR.out });
    const clear = (s) => grid(s).every((g) => { herdPath(route, g.s, SOLAR.side, g.out, P); return clearOfMesas(P.x, P.z, FEATURES, SOLAR.clear); });
    const at = nearestFit(SOLAR.s, clear, SOLAR.step, SOLAR.reach);
    if (at === null) throw new Error('no room clear of the mesas for the solar farm');
    // each rack's length along the line, its panels facing away from it (south: the rack's own +z)
    const matrices = grid(at).map((g) => {
      herdPath(route, g.s, SOLAR.side, g.out, P);
      pos.set(P.x, terrain.heightAt(P.x, P.z), P.z);
      q.setFromAxisAngle(THREE.Object3D.DEFAULT_UP, P.yaw + SOLAR.side * Math.PI / 2);
      return new THREE.Matrix4().compose(pos, q, one);
    });
    for (const im of instanceRacks(rack, matrices)) group.add(im);
  } catch (err) { warnOut('solar farm', def, leg, err); }

  return {
    group,
    update(f) { turn(f.dt); },   // (always: the rotors turn whatever the train's doing)
  };
}

// ---- the speed boards ----
// a board at each end of the high-speed stretch (the reaction's s0 and s1), 3 m out from your line on its outside (the
// other line's side would stand it in that line's way), on a mast up from the land under the guideway, at about the
// driver's eye; two-faced, so the way in reads HIGH SPEED (white) and the way out END (red), either way you're going.
// After dark they glow a little, as if lit
const BOARD = { out: 3, w: 1.5, h: 0.75, up: 3.6, mast: 0.14, glow: 0.6 };
function boardTexture(text, bg, fg) {
  const c = document.createElement('canvas');
  c.width = 512; c.height = 256;
  const g = c.getContext('2d');
  g.fillStyle = bg; g.fillRect(0, 0, 512, 256);
  g.strokeStyle = fg; g.lineWidth = 18; g.strokeRect(14, 14, 484, 228);
  g.fillStyle = fg; g.font = 'bold 92px Helvetica, Arial, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText(text, 256, 132, 440);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

function buildSpeed({ leg, route, def, terrain }) {
  const group = new THREE.Group();
  group.name = `speed boards ${leg}`;
  const lane = laneOf(leg), out = lane + Math.sign(lane) * BOARD.out;
  const face = (text, bg, fg) => {
    const map = boardTexture(text, bg, fg);
    return new THREE.MeshStandardMaterial({ map, emissiveMap: map, emissive: '#ffffff', emissiveIntensity: 0, roughness: 0.6 });
  };
  const high = face('HIGH SPEED', '#f6f6f2', '#c8202a'), end = face('END', '#c8202a', '#f6f6f2');
  const mastMat = new THREE.MeshStandardMaterial({ color: '#8d949c', roughness: 0.6, metalness: 0.3, flatShading: true });
  const plane = new THREE.PlaneGeometry(BOARD.w, BOARD.h);
  // at s0 an out run comes in (HIGH SPEED facing it) and a back run goes out (END on the back); at s1 the other way round
  for (const [s, front, back] of [[def.react.s0, high, end], [def.react.s1, end, high]]) {
    const P = route.offsetAt(s, out), ground = terrain.heightAt(P.x, P.z), y = P.y + BOARD.up;
    const board = new THREE.Group();
    board.position.set(P.x, y, P.z);
    board.rotation.y = P.yaw;
    const a = new THREE.Mesh(plane, front), b = new THREE.Mesh(plane, back);
    a.rotation.y = Math.PI; a.position.z = -0.02;   // facing back down the line, at a driver coming up on an out run
    b.position.z = 0.02;                             // and the other way, at one on a back run
    const h = y - BOARD.h / 2 - ground + 0.5;
    const mast = new THREE.Mesh(new THREE.BoxGeometry(BOARD.mast, h, BOARD.mast), mastMat);
    mast.position.y = -BOARD.h / 2 - h / 2;
    const edge = new THREE.Mesh(new THREE.BoxGeometry(BOARD.w + 0.08, BOARD.h + 0.08, 0.03), mastMat);
    for (const o of [a, b, mast, edge]) { o.userData.own = true; board.add(o); }
    group.add(board);
  }
  let lit = -1;
  return {
    group,
    // static: nothing moves, and nothing hides; only the glow after dark follows the sky
    update(f) {
      const k = BOARD.glow * Math.min(1, Math.max(0, f.night));
      if (k === lit) return;
      lit = k;
      high.emissiveIntensity = k; end.emissiveIntensity = k;
    },
  };
}

// ---- the passing bullet ----
// another Silver Arrow (4 cars) on the other line the other way at 280 km/h, set off when the event starts so the two
// fronts pass at the window's middle (paths.js bulletStart: it waits, unseen, at the line's end if you're slow); a whoosh
// as they pass, and it hides once more than 600 m behind you. Its whole length keeps out of the platform windows
async function buildBullet({ leg, route, def, slicer }) {
  const group = new THREE.Group();
  group.name = `bullet ${leg}`;
  await slicer.frame();
  const train = await buildTrain({ name: 'passing Silver Arrow', builder: 'bullet', carCount: 4 });
  train.group.visible = false;
  group.add(train.group);
  const length = train.cars.reduce((a, c) => a + c.length, 0) + COUPLING_GAP * (train.cars.length - 1);
  const L = route.length, rev = reverseRoute(route), lane = laneOf(leg), meet = (def.s0 + def.s1) / 2;
  // its front's leg-s bounds: on an out run it heads down the leg (its cars behind it, up the leg), on a back run up it
  const bounds = { out: { lo: PLATFORM, hi: L - PLATFORM - length }, back: { lo: PLATFORM + length, hi: L - PLATFORM } };
  let st = null, night = -1;
  const hide = () => { st = null; train.group.visible = false; };
  return {
    group,
    update(f) {
      if (!f.on || f.legS === null) { hide(); return; }
      const { lo, hi } = bounds[f.dir];
      st = bulletStep(st, { legS: f.legS, v: f.train.v, dir: f.dir, dt: f.dt, meet, lo, hi });
      if (st.whoosh) sound('whoosh');
      train.group.visible = st.shown;
      if (!st.shown) return;
      if (f.night !== night) { night = f.night; train.night?.(night); }
      // the other line is the leg's left-hand one (-lane): on an out run it runs the reversed route, where that's +lane
      const ds = BULLET.speed * f.dt;
      if (f.dir === 'out') poseTrain(train, rev, L - st.s, ds, lane);
      else poseTrain(train, route, st.s, ds, -lane);
    },
    dispose: hide,
  };
}

// ---- the rocket ----
// built here: white, 40 m tall with a nose cone and four fins, on a pad 6 km south-west of the line at s 2400. When the
// event starts it lifts off (a roar, quiet at that distance) and climbs, pitching over east, for 60 s (paths.js
// rocketAt), its plume an additive cone and a glow, leaving a fading trail. Nothing of it takes the fog: it is seen from
// the cab against the sky, well past the fog's end. Flown once, it's gone from the pad until the event starts again
const RK = { radius: 1.85, body: 29, nose: 9, plume: 30, glow: 110, every: 0.1, fade: 40, trailAlpha: 0.85 };
const white = new THREE.MeshStandardMaterial({ color: '#f5f6f7', roughness: 0.5, flatShading: true, fog: false });
const dark = new THREE.MeshStandardMaterial({ color: '#2b3038', roughness: 0.7, flatShading: true, fog: false });
const concrete = new THREE.MeshStandardMaterial({ color: '#9b9690', roughness: 0.95, flatShading: true, fog: false });
const gantry = new THREE.MeshStandardMaterial({ color: '#8a3b2a', roughness: 0.8, flatShading: true, fog: false });

function makeRocket() {
  const rig = new THREE.Group();   // its origin at the engine's foot, up its +y
  rig.name = 'rocket';
  const add = (geo, mat, y) => { const o = new THREE.Mesh(geo.translate(0, y, 0), mat); o.userData.own = true; rig.add(o); return o; };
  add(new THREE.CylinderGeometry(0.9, 1.4, 2, 12), dark, 1);                                     // the engine bell
  add(new THREE.CylinderGeometry(RK.radius, RK.radius, RK.body, 16), white, 2 + RK.body / 2);    // the body
  add(new THREE.CylinderGeometry(RK.radius + 0.03, RK.radius + 0.03, 1.2, 16), dark, 21);        // a band round it
  add(new THREE.ConeGeometry(RK.radius, RK.nose, 16), white, 2 + RK.body + RK.nose / 2);          // the nose cone, 40 m up
  const fin = new THREE.Shape([new THREE.Vector2(0, 0), new THREE.Vector2(3.2, 0), new THREE.Vector2(0, 6.5)]);
  const fins = [];
  for (let k = 0; k < 4; k++) {
    fins.push(new THREE.ExtrudeGeometry(fin, { depth: 0.25, bevelEnabled: false })
      .translate(RK.radius - 0.2, 2, -0.125).rotateY(k * Math.PI / 2));
  }
  add(mergeGeometries(fins), dark, 0);
  for (const g of fins) g.dispose();
  return rig;
}

function buildRocket({ leg, route, terrain }) {
  const group = new THREE.Group();
  group.name = `rocket ${leg}`;
  const at = rocketPad(route), ground = terrain.heightAt(at.x, at.z);
  group.position.set(at.x, ground, at.z);   // everything here is local to the pad
  // the pad: a broad plinth (deep enough to stand on land drawn or not), and a gantry on its west side
  const pad = new THREE.Mesh(new THREE.CylinderGeometry(20, 30, 42, 24).translate(0, 1.5 - 21, 0), concrete);
  const tower = new THREE.Mesh(new THREE.BoxGeometry(4, 50, 4).translate(-9, 26.5, 0), gantry);
  const arm = new THREE.Mesh(new THREE.BoxGeometry(6, 1.2, 1.2).translate(-5, 34, 0), gantry);
  for (const o of [pad, tower, arm]) { o.userData.own = true; group.add(o); }

  const rig = makeRocket(), base = 1.5;   // standing on the pad's top
  const plume = new THREE.Mesh(
    new THREE.ConeGeometry(2.4, RK.plume, 16, 1, true).rotateX(Math.PI).translate(0, -RK.plume / 2, 0),
    new THREE.MeshBasicMaterial({ color: '#ffb35a', transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false, fog: false, side: THREE.DoubleSide }),
  );
  plume.userData.own = true;
  const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture(), color: '#ffd59a', blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, fog: false }));
  glow.position.y = -6;
  glow.scale.setScalar(RK.glow);
  rig.add(plume, glow);
  group.add(rig);

  // the trail: a Line whose buffer (sized for the whole flight) fills as it climbs, each point fading with its age
  const N = Math.ceil(ROCKET.secs / RK.every) + 2;
  const tPos = new Float32Array(N * 3), tCol = new Float32Array(N * 4), born = new Float32Array(N);
  const tGeo = new THREE.BufferGeometry();
  tGeo.setAttribute('position', new THREE.BufferAttribute(tPos, 3).setUsage(THREE.DynamicDrawUsage));
  tGeo.setAttribute('color', new THREE.BufferAttribute(tCol, 4).setUsage(THREE.DynamicDrawUsage));
  tGeo.setDrawRange(0, 0);
  const trail = new THREE.Line(tGeo, new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, depthWrite: false, fog: false }));
  trail.frustumCulled = false;   // its buffer grows by hand
  trail.userData.own = true;
  group.add(trail);
  const smoke = new THREE.Color('#efeae2');
  for (let i = 0; i < N; i++) tCol.set([smoke.r, smoke.g, smoke.b, 0], i * 4);

  let t = null, flown = false, laid = 0, drawn = 0;   // laid: points fixed so far; drawn: those and the head
  const R = {};
  const reset = () => {
    t = null; laid = 0; drawn = 0;
    rig.position.set(0, base, 0); rig.rotation.set(0, 0, 0);
    rig.visible = !flown;
    plume.visible = glow.visible = false;
    trail.visible = false;
    tGeo.setDrawRange(0, 0);
  };
  reset();
  return {
    group,
    update(f) {
      if (!f.on) { reset(); return; }
      if (t === null) { t = 0; flown = true; rig.visible = true; trail.visible = true; sound('roar'); } else t += f.dt;
      rocketAt(t, R);
      rig.position.set(R.east, base + R.up, 0);
      rig.rotation.z = -R.pitch;   // over towards +x, the east
      const burning = t < ROCKET.secs;
      rig.visible = burning;       // gone from sight once its climb is done
      plume.visible = glow.visible = burning;
      if (burning) {
        const flick = 0.9 + 0.1 * Math.sin(f.time * 31) * Math.sin(f.time * 17.3);
        plume.scale.set(1 + R.up / 4000, flick * (1 + R.up / 1500), 1 + R.up / 4000);   // spreading as the air thins
        glow.scale.setScalar(RK.glow * flick * Math.min(1, 0.4 + t / 4));
        // the trail's head follows the engine, and is left where it is every `every` seconds
        const k = Math.min(N - 1, laid);
        tPos[k * 3] = R.east; tPos[k * 3 + 1] = base + R.up; tPos[k * 3 + 2] = 0;
        born[k] = t;
        if (t >= laid * RK.every && laid < N - 1) laid++;
        drawn = k + 1;
        tGeo.setDrawRange(0, drawn);
        tGeo.attributes.position.needsUpdate = true;
      }
      for (let i = 0; i < drawn; i++) tCol[i * 4 + 3] = RK.trailAlpha * Math.max(0, 1 - (t - born[i]) / RK.fade);
      tGeo.attributes.color.needsUpdate = true;
    },
    dispose: reset,
  };
}

// ---- the drones ----
// 24 of the Chrome Arcology's service drones (hover), in formation 60-100 m up and 150 m out on the drone shot's side,
// flying alongside the front at the train's pace: ring, line, arrow, 6 s each (paths.js formationAt). They come in from
// far out and high as the window starts and go off the same way as it ends. Each carries a small light, shown after
// dusk: one glow each, drawn as points (no lights added to the scene)
const DRONES = { count: 24, out: 150, up: 80, far: 420, high: 60, lean: 0.12, bob: 0.6, weave: 2, light: '#a6f4ff', size: 1.6 };

async function buildDrones({ leg, route, def, slicer, kit }) {
  const group = new THREE.Group();
  group.name = `drones ${leg}`;
  const side = Math.sign(def.shot?.lateral ?? 1) || 1;
  await slicer.frame();
  const proto = await kit('future', 'service-drone-bot', { undercarriage: 'hover' });
  const drones = [];
  for (let i = 0; i < DRONES.count; i++) {
    const d = i ? proto.clone() : proto;
    d.visible = false;
    group.add(d);
    drones.push(d);
  }
  const lPos = new Float32Array(DRONES.count * 3), lGeo = new THREE.BufferGeometry();
  lGeo.setAttribute('position', new THREE.BufferAttribute(lPos, 3).setUsage(THREE.DynamicDrawUsage));
  const lMat = new THREE.PointsMaterial({
    color: DRONES.light, size: DRONES.size, map: glowTexture(), transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending,
  });
  const lights = new THREE.Points(lGeo, lMat);
  lights.frustumCulled = false;   // moved by hand
  lights.visible = false;
  lights.userData.own = true;
  group.add(lights);

  const L = route.length, lo = PLATFORM + 40, hi = L - PLATFORM - 40, P = {}, Q = {};
  let t = null;
  const hide = () => { t = null; lights.visible = false; for (const d of drones) d.visible = false; };
  return {
    group,
    update(f) {
      if (!f.on || f.legS === null) { hide(); return; }
      t = t === null ? 0 : t + f.dt;
      const sgn = sgnOf(f.dir), k = fade(f.on.u, 0.15, 0.85), ease = k * k * (3 - 2 * k);
      const out = DRONES.out + DRONES.far * (1 - ease);
      route.at(Math.min(hi, Math.max(lo, f.legS)), P);
      // the line's way (the way you're going) and its left there
      const fx = Math.sin(P.yaw) * sgn, fz = Math.cos(P.yaw) * sgn, lx = Math.cos(P.yaw), lz = -Math.sin(P.yaw);
      const y0 = P.y + DRONES.up + DRONES.high * (1 - ease), yaw = P.yaw + (sgn < 0 ? Math.PI : 0);
      const night = Math.min(1, Math.max(0, f.night));
      for (let i = 0; i < drones.length; i++) {
        const d = drones[i];
        formationAt(t, i, DRONES.count, Q);
        const across = side * (out + DRONES.weave * Math.sin(t * 0.7 + i * 1.7));
        const x = P.x + fx * Q.along + lx * across, z = P.z + fz * Q.along + lz * across;
        const y = y0 + Q.up + DRONES.bob * Math.sin(t * 1.3 + i * 0.9);
        d.position.set(x, y, z);
        d.rotation.set(DRONES.lean, yaw, 0, 'YXZ');   // nose down a little, flying forward
        d.visible = true;
        lPos[i * 3] = x; lPos[i * 3 + 1] = y - 0.15; lPos[i * 3 + 2] = z;
      }
      lights.visible = night > 0;
      if (lights.visible) {
        lMat.opacity = Math.min(1, night * 1.5);
        lGeo.attributes.position.needsUpdate = true;
      }
    },
    dispose: hide,
  };
}

export const desert = { farm: buildFarm, speed: buildSpeed, bullet: buildBullet, rocket: buildRocket, drones: buildDrones };
