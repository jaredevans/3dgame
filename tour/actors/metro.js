// The Metro Glide's leg (future-city): hover pods and cargo skiffs flying their lanes among the towers of the Futuristic
// place, and helicopters and drones over Downtown City (no flying cars there), all lit after dark; cars, taxis and trucks
// going both ways along the suburbs' streets, their headlights on in the dark; and an airliner coming in low over the
// line to land, gear down, lit after dark. (The level crossing at the city end is crossing.js's; the bridge and the
// skyline are showpieces: shots, no actor.)
//
// The leg runs from the Futuristic place (s 0) north-north-east and round to the right into Downtown City (s 2083), from
// night towards sunrise. Its suburbs (suburbs.js) line it on both sides over s 200-430 and 780-1800: a street 54 m out
// either side of the line. The traffic drives only where that street was laid: where its suburbs were built (they're
// optional scenery, left out if their parts can't be had), and only on the stretches of it that stand on clear ground.
import * as THREE from 'three';
import { KITS } from '../config.js';
import { kitModule, cdnPart } from '../parts.js';
import { PLACES, LEGS } from '../world-data.js';
import { LAYOUT, clearGround } from '../suburbs.js';
import { shapes } from '../suburbs-mesh.js';
import { TRAIN_SPECS } from '../trains/specs.js';
import { sound } from '../audio.js';
import { lightZones, partJson } from './coast.js';
import {
  LANES, CITY_AIR, laneAt, TRAFFIC, laneLateral, streetRuns, streetPath, laneCars, carAlong, PLANE, planeAt, planeStep,
} from './paths.js';

const warnOut = (what, def, leg, err) =>
  console.warn(`The ${what} at the ${def.id} along ${leg} was left out: ${err?.url ? `could not load ${err.url}` : err?.message ?? err}`);
const clamp01 = (v) => Math.min(1, Math.max(0, v));
const xyz = (p) => [p.x, p.y, p.z];

// a seeded 0..1, so the traffic and the fliers' colours come out the same every time
function seeded(seed) {
  let s = seed;
  return () => { s = (s * 16807) % 2147483647; return s / 2147483647; };
}

// ---- lighting a kit part after dark ----

// a kit part's night map (its module's `night`), each zone with the albedo it's painted in with `params` (its own colour
// knob, its colourway's, or the part's default), as the kit's own buildKit finds them: -> { zone: { albedo, color,
// intensity } } for coast.js lightZones
async function kitNight(kitKey, key, params) {
  const m = await kitModule(KITS[kitKey], `${key}.mjs`);
  const knob = Object.keys(m.params ?? {}).find((n) => /^colou?rway$/i.test(n));
  const way = m.presets?.[params[knob] ?? m.params?.[knob]?.default];
  const night = {};
  for (const [zone, z] of Object.entries(m.night ?? {})) {
    const albedo = params[zone] ?? way?.[zone] ?? m.params?.[zone]?.default;
    if (albedo != null) night[zone] = { ...z, albedo };
  }
  return night;
}

// a geometry with the same attributes as g and nothing in it
function emptyLike(g) {
  const e = new THREE.BufferGeometry();
  for (const [n, a] of Object.entries(g.attributes)) e.setAttribute(n, new THREE.BufferAttribute(new a.array.constructor(0), a.itemSize, a.normalized));
  return e;
}

// a part lit as its night map says (lightZones: each zone's triangles cut out into a lit twin), the twins of a zone sharing
// one material, then merged into as few shapes as it has materials (suburbs-mesh.js shapes): -> { shapes: [{ geometry,
// material }], lit: the lit materials (their emissiveIntensity the dark, 0..1) }
function litShapes(obj, night) {
  const { mats } = lightZones(obj, night);
  const byZone = new Map(), lit = [];
  obj.traverse((o) => {
    if (!o.isMesh) return;
    if (!o.visible) { const g = o.geometry; o.geometry = emptyLike(g); g.dispose(); return; }   // (all of it lit: its twins draw it)
    if (!o.name.endsWith(' lit')) return;
    // (one a zone, and a kind of surface: a part's glass may be drawn see-through)
    const zone = `${o.name.slice(o.name.lastIndexOf(':') + 1, -' lit'.length)}|${o.material.transparent}|${o.material.opacity}|${o.material.side}`;
    if (!byZone.has(zone)) { byZone.set(zone, o.material); lit.push(o.material); return; }
    o.material = byZone.get(zone);
  });
  for (const m of mats) if (!lit.includes(m)) m.dispose();
  obj.updateMatrixWorld(true);
  // (a mesh carved all into lit twins leaves an empty shape: not drawn)
  const made = [];
  for (const sh of shapes(obj)) {
    if (sh.geometry.attributes.position.count > 0) made.push(sh);
    else sh.geometry.dispose();
  }
  return { shapes: made, lit };
}

// ---- the fliers ----
// six over the Futuristic place (not Downtown City: owner, 2026-11-21; it has helicopters and drones instead, below), on
// the lanes paths.js LANES lays out (round its towers, gliding at 15 m/s and banked into their turns), four commuter pods
// and two cargo skiffs, from the Chrome Arcology kit; lit after dark (their headlights, tail lamps and light strips, a
// skiff's lift slots). Always shown, wherever you are: by the clock, so each is where it would be
export const FLIER_TOWNS = ['future'];
const FLIERS = [
  ['commuter-hover-pod', { colorway: 'arcology-white' }], ['commuter-hover-pod', { colorway: 'lilac-line' }],
  ['hover-cargo-skiff', { colorway: 'arc-white', bays: '2' }], ['commuter-hover-pod', { colorway: 'butter-cab' }],
  ['hover-cargo-skiff', { colorway: 'dock-blue', bays: '3' }], ['commuter-hover-pod', { colorway: 'graphite-night' }],
];

// ---- the helicopters and drones over Downtown City ----
// (owner, 2026-11-21: "use helicopters and drones instead" of flying cars there) on the lanes paths.js CITY_AIR lays out:
// two helicopters on slow, wide loops high over the towers, and four survey drones darting round short ones lower down,
// two of them down the streets among the towers. Each a Polyfork part, kept whole so its rotors (its rig's nodes) turn
// every frame about their rig axes, at `rev` turns a second (a drone's front left and back right the other way): kept
// under half a turn of their blades' symmetry a frame at 60 fps, so none seems to stand or run backwards (the 8-bladed
// fan, 45 degrees, at 3.5). Lit after dark from its -params.json night map (coast.js lightZones: the helicopters' nav
// lights and beacons, the ambulance's cabin, chin lamp and beacons, a drone's camera lens and status lights); one whose
// map can't be read flies unlit. A part that can't be loaded is left out (warned); the rest fly. Nose down a little
// (`tilt`), as they fly forward
const COPTERS = [
  { id: 'helicopter-9d1986', params: { colorway: 'charter-blue', rotor: 'running' }, tilt: 0.05,
    rotors: [['rotor-main', 'y', 3], ['rotor-tail', 'x', 7]] },
  { id: 'air-ambulance-helicopter-ed9acc', params: { colorway: 'ems-white' }, tilt: 0.05,
    rotors: [['rotor', 'y', 2.5], ['tail-fan', 'x', 3.5]] },
];
const DRONE = {
  id: 'survey-drone-7c71f9', tilt: 0.12,
  rotors: [['rotor-fr', 'y', 12], ['rotor-bl', 'y', 12], ['rotor-fl', 'y', -12], ['rotor-br', 'y', -12]],
};
const DRONE_WAYS = ['ceramic-white', 'rescue-orange', 'deep-space', 'regolith-tan'];

// one helicopter or drone: -> { obj, lit: its lit materials, rotors: [{ node, axis, base, turn: radians a second }] }
async function aircraft({ id, rotors }, params, leg) {
  const obj = await cdnPart(id, params);
  obj.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  obj.rotation.order = 'YXZ';
  let lit = [];
  try {
    const zones = lightZones(obj, (await partJson(id)).night);   // (its lit twins cast no shadow)
    lit = zones.mats;
    zones.names.forEach((n, k) => { if (!zones.counts[k]) console.warn(`The ${id} over Downtown City along ${leg}: no ${n} to light (its albedo isn't in the model)`); });
  } catch (err) {
    console.warn(`The ${id} over Downtown City along ${leg} flies unlit: could not read its night map${err?.url ? ` (${err.url})` : `: ${err?.message ?? err}`}`);
  }
  const spin = [];
  for (const [name, axis, rev] of rotors) {
    const node = obj.getObjectByName(name);
    if (node) spin.push({ node, axis, base: node.rotation[axis], turn: 2 * Math.PI * rev });
    else console.warn(`The ${id} over Downtown City along ${leg}: no ${name} to turn`);
  }
  return { obj, lit, rotors: spin };
}

// -> { craft: [{ obj, lane, tilt, rotors }], lit } (nothing in it if none of them could be made)
async function buildCityAir({ leg, def, slicer, group }) {
  const want = [
    ...COPTERS.map((c, i) => ({ part: c, params: c.params, lane: CITY_AIR.copters[i], name: `helicopter ${i + 1}` })),
    ...CITY_AIR.drones.map((lane, i) => ({ part: DRONE, params: { colorway: DRONE_WAYS[i % DRONE_WAYS.length] }, lane, name: `drone ${i + 1}` })),
  ];
  const craft = [], lit = [];
  for (const { part: p, params, lane, name } of want) {
    await slicer.frame();   // (one a frame)
    try {
      const a = await aircraft(p, params, leg);
      a.obj.name = `${name} city`;
      group.add(a.obj);
      craft.push({ obj: a.obj, lane, tilt: p.tilt, rotors: a.rotors });
      lit.push(...a.lit);
    } catch (err) { warnOut(`${name} over Downtown City (${p.id})`, def, leg, err); }
  }
  return { craft, lit };
}

async function buildFliers({ leg, def, slicer, kit }) {
  const group = new THREE.Group();
  group.name = `fliers ${leg}`;
  // each kind made once (lit and merged), and drawn for each of its fliers
  const kinds = [], lit = [];
  for (const [key, params] of FLIERS) {
    await slicer.frame();   // a kit part can't be sliced: one a frame
    try {
      const obj = await kit('future', key, params);
      let night = {};
      try { night = await kitNight('future', key, params); } catch (err) { warnOut(`${key}'s lights`, def, leg, err); }
      const k = litShapes(obj, night);
      obj.traverse((o) => { if (o.isMesh) o.geometry.dispose(); });   // (its shapes were copied)
      kinds.push(k);
      lit.push(...k.lit);
    } catch (err) { warnOut(key, def, leg, err); kinds.push(null); }
  }
  const fliers = [];
  // over the Futuristic place only: Downtown City is an older city with no flying cars (owner, 2026-11-21)
  if (!kinds.some(Boolean)) console.warn(`The ${def.id} along ${leg}: none of its hover pods could be made`);
  else for (const town of FLIER_TOWNS) {
    for (const [i, lane] of LANES[town].entries()) {
      const k = kinds[i] ?? kinds.find(Boolean);   // (a kind that couldn't be made: another flies its lane)
      const f = new THREE.Group();
      f.name = `flier ${town} ${i + 1}`;
      f.rotation.order = 'YXZ';
      for (const { geometry, material } of k.shapes) {
        const m = new THREE.Mesh(geometry, material);
        m.castShadow = !k.lit.includes(material); m.receiveShadow = true;
        f.add(m);
      }
      group.add(f);
      fliers.push({ f, lane, place: PLACES[town] });
    }
  }
  // and over Downtown City, its helicopters and drones
  const air = await buildCityAir({ leg, def, slicer, group });
  lit.push(...air.lit);
  if (!fliers.length && !air.craft.length) throw new Error('none of its fliers could be made');
  const P = {}, city = PLACES.city;
  let night = -1;
  return {
    group,
    // always: they fly their lanes whatever the train's doing
    update(f) {
      for (const x of fliers) {
        laneAt(f.time, x.lane, x.place, P);
        x.f.position.set(P.x, P.y, P.z);
        x.f.rotation.set(0, P.yaw, P.roll);
      }
      for (const c of air.craft) {
        laneAt(f.time, c.lane, city, P);
        c.obj.position.set(P.x, P.y, P.z);
        c.obj.rotation.set(c.tilt, P.yaw, P.roll);
        for (const r of c.rotors) r.node.rotation[r.axis] = r.base + r.turn * f.time;
      }
      const k = clamp01(f.night);
      if (k !== night) { night = k; for (const m of lit) m.emissiveIntensity = k; }
    },
  };
}

// ---- the traffic ----
// cars, taxis and box trucks from the NYC kit and the Chrome Arcology's city coupes on the suburbs' street either side of
// the line, going both ways (keeping right) at 10-14 m/s a lane, 40-80 m apart, within the event's window: only where
// the suburbs stand (their group is in the scene) and where their street was laid (on clear ground, up to their last
// whole lot). Each kind of car is one InstancedMesh a shape, moved by the clock; after dark each shows its headlights,
// two small glowing quads on its nose
const CARS = [   // kit, part, params, how often (of the whole), headlights' height over the road
  ['city', 'veh-compact-car', { colorway: 'steel-blue' }, 2, 0.74],
  ['city', 'veh-compact-car', { colorway: 'dark-red' }, 2, 0.74],
  ['city', 'veh-compact-car', { colorway: 'off-white' }, 1, 0.74],
  ['city', 'veh-taxi', { colorway: 'nyc-yellow' }, 3, 0.67],
  ['city', 'veh-box-truck', { colorway: 'cream-grey' }, 1, 1.08],
  ['city', 'veh-box-truck', { colorway: 'express-red' }, 1, 1.08],
  ['future', 'wheeled-city-coupe', { colorway: 'mint-frost' }, 1.5, 0.5],
  ['future', 'wheeled-city-coupe', { colorway: 'sky-pearl' }, 1.5, 0.5],
];
const LAMP = { w: 0.3, h: 0.16, inset: 0.32, colour: '#fff3d6', on: 0.05 };
const ROAD_UP = 0.06;   // a car's wheels on the street tiles' top
const lampMat = new THREE.MeshBasicMaterial({ color: LAMP.colour, transparent: true, opacity: 0, depthWrite: false, toneMapped: false });

// a car's two headlights: quads facing ahead (+z) on its nose, from its bounding box
function lampGeometry(box, height) {
  const half = (box.max.x - box.min.x) / 2 - LAMP.inset, z = box.max.z + 0.02;
  const g = [-1, 1].map((sx) => new THREE.PlaneGeometry(LAMP.w, LAMP.h).translate(sx * half, height, z));
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.Float32BufferAttribute([...g[0].attributes.position.array, ...g[1].attributes.position.array], 3));
  out.setIndex([...g[0].index.array, ...[...g[1].index.array].map((i) => i + 4)]);
  for (const x of g) x.dispose();
  return out;
}

async function buildTraffic({ leg, route, def, terrain, slicer, kit }) {
  const group = new THREE.Group();
  group.name = `traffic ${leg}`;
  const rnd = seeded(8191);
  // the street's stretches in the event's window: each suburbs stretch up to its last whole lot (suburbs.js lays its
  // street so), then where it stands on clear ground
  const ok = (x, z) => clearGround(x, z, terrain);
  const lanes = [];
  for (const [a0, b0] of LEGS[leg].suburbs ?? []) {
    const a = Math.max(a0, def.s0), b = Math.min(a0 + Math.floor((b0 - a0) / LAYOUT.lot) * LAYOUT.lot, def.s1);
    if (!(b > a)) continue;
    for (const side of [1, -1]) {
      await slicer.frame();
      for (const [s0, s1] of streetRuns(route, ok, side * LAYOUT.street, a, b)) {
        for (const way of [1, -1]) {
          const path = streetPath(route, terrain.heightAt, laneLateral(side, way, LAYOUT.street), s0, s1);
          const speed = TRAFFIC.speeds[0] + rnd() * (TRAFFIC.speeds[1] - TRAFFIC.speeds[0]);
          lanes.push({ path, way, speed, ...laneCars(path.length, rnd) });
        }
      }
    }
  }
  // no street (no suburbs set out along this leg, or none of their street on clear ground): nothing to drive, and no cars
  // made for it
  if (!lanes.length) {
    if (LEGS[leg].suburbs?.length) console.warn(`The ${def.id} along ${leg} has no street to drive on`);
    return { group, update() {} };
  }

  // the kinds of car (optional: one that can't be made is left out, the others take its place)
  const kinds = [];
  for (const [kitKey, key, params, often, height] of CARS) {
    await slicer.frame();   // a kit part can't be sliced: one a frame
    try {
      const obj = await kit(kitKey, key, params);
      obj.updateMatrixWorld(true);
      const box = new THREE.Box3().setFromObject(obj);
      kinds.push({ shapes: shapes(obj), lamp: lampGeometry(box, height), often, cars: [] });
      obj.traverse((o) => { if (o.isMesh) o.geometry.dispose(); });   // (its shapes were copied)
    } catch (err) { warnOut(key, def, leg, err); }
  }
  if (!kinds.length) throw new Error('none of its cars could be made');

  // each car a kind (by how often each comes), and its slot among that kind's instances
  const all = kinds.reduce((n, k) => n + k.often, 0), cars = [];
  for (const lane of lanes) for (const at0 of lane.at) {
    let r = rnd() * all, kind = kinds[0];
    for (const k of kinds) { if ((r -= k.often) < 0) { kind = k; break; } }
    cars.push({ lane, at0, kind, slot: kind.cars.length });
    kind.cars.push(cars[cars.length - 1]);
  }
  // their bounds: the whole street, for the camera's culling (they move about it)
  const bounds = new THREE.Box3(), P = {}, v = new THREE.Vector3();
  for (const lane of lanes) for (let u = 0; u <= lane.path.length; u += 20) bounds.expandByPoint(v.set(...xyz(lane.path.at(u, P))));
  bounds.expandByScalar(6);
  const sphere = bounds.isEmpty() ? null : bounds.getBoundingSphere(new THREE.Sphere());
  const meshes = [], lamps = [];
  for (const k of kinds) {
    if (!k.cars.length) continue;
    k.meshes = k.shapes.map(({ geometry, material }) => {
      const im = new THREE.InstancedMesh(geometry, material, k.cars.length);
      im.castShadow = true; im.receiveShadow = true;
      return im;
    });
    k.lamps = new THREE.InstancedMesh(k.lamp, lampMat, k.cars.length);
    k.lamps.castShadow = false;
    k.lamps.visible = false;
    lamps.push(k.lamps);
    for (const im of [...k.meshes, k.lamps]) {
      im.name = `traffic ${im === k.lamps ? 'headlights' : 'car'}`;
      im.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      im.boundingSphere = sphere?.clone() ?? null;
      im.userData.own = true;
      meshes.push(im);
      group.add(im);
    }
  }
  group.visible = false;

  // the suburbs: in the scene beside the leg's actors (main.js adds each leg's suburbs to it as `suburbs <leg>`, and lets
  // them go from it if they're left out). Looked for at most once a second until found, then kept while it stays there
  const suburbsName = `suburbs ${leg}`;
  let suburbs = null, looked = -Infinity;
  const built = (time) => {
    if (suburbs?.parent) return true;
    suburbs = null;
    if (time - looked < 1) return false;
    looked = time;
    let root = group;
    while (root.parent) root = root.parent;
    for (const c of root.children) if (c.name === suburbsName) { suburbs = c; return true; }
    return false;
  };

  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(0, 0, 0, 'YXZ'), at = new THREE.Vector3();
  const one = new THREE.Vector3(1, 1, 1), none = new THREE.Matrix4().makeScale(0, 0, 0);
  let night = -1;
  const hide = () => { group.visible = false; };
  return {
    group,
    update(f) {
      if (!f.on || !built(f.time)) { hide(); return; }
      group.visible = true;
      for (const c of cars) {
        const L = c.lane, u = carAlong(c.at0, L.period, L.speed, f.time, L.path.length);
        let place = none;
        if (u >= 0) {
          L.path.at(L.way > 0 ? u : L.path.length - u, P);
          // facing its way: back down the street the other way, its pitch turned with it
          e.set(-(L.way > 0 ? P.pitch : -P.pitch), P.yaw + (L.way > 0 ? 0 : Math.PI), 0);
          place = m.compose(at.set(P.x, P.y + ROAD_UP, P.z), q.setFromEuler(e), one);
        }
        for (const im of c.kind.meshes) im.setMatrixAt(c.slot, place);
        c.kind.lamps.setMatrixAt(c.slot, place);
      }
      for (const im of meshes) im.instanceMatrix.needsUpdate = true;
      const k = clamp01(f.night);
      if (k !== night) {
        night = k;
        lampMat.opacity = k;
        for (const l of lamps) l.visible = k > LAMP.on;
      }
    },
    dispose: hide,
  };
}
// ---- the plane ----
// the narrow-body airliner (36 m) coming in to land, gear down and flaps out, on its approach steeply across the line:
// about 90 m over it at the event's middle and coming down at 3 degrees (paths.js planeAt), timed to cross as your front
// is 350 m short of it, so the cab sees it go low across the view ahead (planeStep). Its event is `always`, so it comes
// in from far out before the window and flies on past it until it's gone, out of the cab's view. It roars as it comes
// over. After dark its navigation lights and beacons show, as its -params.json `night` says (coast.js lightZones; unlit
// if that can't be read). Once a run
const AIRLINER = 'narrow-body-airliner-619183';

async function buildPlane({ leg, route, def, slicer }) {
  const group = new THREE.Group();
  group.name = `plane ${leg}`;
  await slicer.frame();
  const plane = await cdnPart(AIRLINER, { gear: 0, flaps: 'landing', colorway: 'blue' });
  plane.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  plane.rotation.order = 'YXZ';
  plane.visible = false;
  group.add(plane);
  // its lights: optional, it flies unlit without them
  await slicer.frame();
  let lit = [];
  try {
    const params = await partJson(AIRLINER);
    lit = lightZones(plane, params.night).mats;
    if (!lit.length) console.warn(`The airliner along ${leg} flies unlit: none of its night zones were found`);
  } catch (err) {
    console.warn(`The airliner along ${leg} flies unlit: could not read its night map${err?.url ? ` (${err.url})` : `: ${err?.message ?? err}`}`);
  }
  const meet = (def.s0 + def.s1) / 2, line = route.at(meet), over = { x: line.x, y: line.y, z: line.z, heading: line.yaw + PLANE.cross };
  const spec = TRAIN_SPECS[LEGS[leg].train];
  const P = {};
  let st = null, night = -1;
  const hide = () => { st = null; plane.visible = false; };
  return {
    group,
    update(f) {
      // (an `always` event's plane comes in from before its window and flies on past it; otherwise only inside it)
      if (!f.here || f.legS === null || (!def.always && !f.on)) { hide(); return; }
      st = planeStep(st, { here: true, legS: f.legS, v: f.train.v, top: spec.top, accel: spec.accel, dir: f.dir, dt: f.dt, meet, s0: def.s0, s1: def.s1 });
      if (st.roar) sound('roar');
      plane.visible = st.shown;
      if (!st.shown) return;
      planeAt(over, st.d, P);
      plane.position.set(P.x, P.y, P.z);
      plane.rotation.set(-P.pitch, P.yaw, 0);
      const k = clamp01(f.night);
      if (k !== night) { night = k; for (const m of lit) m.emissiveIntensity = k; }
    },
    dispose: hide,
  };
}

export const metro = { fliers: buildFliers, traffic: buildTraffic, plane: buildPlane };
