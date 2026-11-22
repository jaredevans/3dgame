// Building trains from Countryside Railway parts and posing them on a route.
import * as THREE from 'three';
import { KITS } from './config.js';
import { part, urlPart } from './parts.js';
import { placeCars } from './consist.js';
import { hdUrlFor, hdCar, hdFailed, hdLight } from './hd.js';

// The basement's measureVehicle (index.html), unchanged: finds a vehicle's pivots, bogies and spinnable wheels.
export function measureVehicle(obj, flip) {
  const holder = new THREE.Group();
  holder.add(obj);
  if (flip) obj.rotation.y = Math.PI;
  holder.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(holder);
  const wp = new THREE.Vector3(), nodes = [];
  holder.traverse((o) => { if (o !== obj && o.name) nodes.push(o); });
  const zOf = (o) => holder.worldToLocal(o.getWorldPosition(wp)).z;
  const bogies = nodes.filter((o) => /^bogie(-[fr])?$/.test(o.name)).map((o) => ({ node: o, z: zOf(o) }));
  const wheels = [];
  for (const o of nodes.filter((n) => /wheel/.test(n.name))) {
    const wb = new THREE.Box3().setFromObject(o), centre = wb.getCenter(new THREE.Vector3());
    const pivot = o.getWorldPosition(new THREE.Vector3());
    const r = (wb.max.y - wb.min.y) / 2;
    if (r > 0.1 && Math.hypot(centre.y - pivot.y, centre.z - pivot.z) < 0.06) wheels.push({ node: o, r, z: zOf(o) });
  }
  let pf, pr;
  if (bogies.length >= 2) { pf = Math.max(...bogies.map((b) => b.z)); pr = Math.min(...bogies.map((b) => b.z)); }
  else {
    const zs = [...bogies.map((b) => b.z), ...wheels.map((w) => w.z)];
    if (zs.length >= 2) { pf = Math.max(...zs); pr = Math.min(...zs); }
    else { const mid = (box.max.z + box.min.z) / 2, half = (box.max.z - box.min.z) * 0.3; pf = mid + half; pr = mid - half; }
  }
  return { holder, obj, box, front: box.max.z, length: box.max.z - box.min.z, pf, pr, bogies, bogieZ: bogies.map((b) => b.z), wheels, spin: flip ? -1 : 1 };
}

// the wheels that turn, as the flat parts have them: a wheelset's group and its set inside it (each turned by ds/r, as
// measureVehicle finds them). An HD edition nests its set's zones as meshes inside the set as well, five 'wheel' nodes to
// the flat one's two; turning those too would compound, so they're left to turn with their set
function asFlatWheels(wheels) {
  const nodes = new Set(wheels.map((w) => w.node));
  const depth = (o) => { let n = 0; for (let p = o.parent; p; p = p.parent) if (nodes.has(p)) n++; return n; };
  return wheels.filter((w) => depth(w.node) <= 1);
}

// one car: its HD edition when HD is on and it has one (lit for its materials: hd.js), else, or if that fails to load or
// doesn't come in time (said once), its flat kit part -> { obj, hd }
async function carPart(kit, key, params) {
  const url = hdUrlFor(key);
  if (url) {
    try { return { obj: hdLight(await hdCar(key, () => urlPart(url, key, params))), hd: true }; } catch (err) { hdFailed(key, err); }
  }
  return { obj: await part(kit, key, params), hd: false };
}

// trains made in code, by builder name (loaded when wanted: they measure their cars with measureVehicle, above)
const BUILDERS = {
  bullet: async (def) => (await import('./trains/bullet.js')).buildBullet({ cars: def.carCount, name: def.name }),
};

// def: { name, kit?, ride?, cars: [[kitKey, params, flip?]] } (parts from `kit`, the Countryside Railway unless named,
// or their HD editions (hd.js), standing `ride` up off the formation), or
// { name, builder, carCount } for a train made in code -> { name, group, cars }
export async function buildTrain(def) {
  if (def.builder) {
    if (!BUILDERS[def.builder]) throw new Error(`no train builder '${def.builder}'`);
    return BUILDERS[def.builder](def);
  }
  const group = new THREE.Group();
  group.name = def.name;
  const cars = [];
  for (const [key, params, flip] of def.cars) {
    const { obj, hd } = await carPart(def.kit ?? KITS.railway, key, params);
    obj.position.y = def.ride ?? 0;   // a car that stands up off the formation (the Metro Glide's, over the deck)
    const v = measureVehicle(obj, !!flip);
    v.key = key;   // the kit part's key, HD or not (the cabs are found by it)
    v.hd = hd;
    if (hd) v.wheels = asFlatWheels(v.wheels);
    group.add(v.holder);
    cars.push(v);
  }
  return { name: def.name, group, cars };
}

// put every vehicle where placeCars says; ds (metres moved this frame) spins the wheels
export function poseTrain(train, route, s, ds = 0, lateral = 0) {
  const poses = placeCars(route, s, train.cars, { lateral });
  train.cars.forEach((car, i) => {
    const p = poses[i];
    car.holder.position.set(p.x, p.y, p.z);
    car.holder.rotation.set(-p.pitch, p.yaw, 0, 'YXZ');
    car.bogies.forEach((b, j) => { b.node.rotation.y = p.bogieYaw[j]; });
    for (const w of car.wheels) w.node.rotation.x += car.spin * ds / w.r;
  });
  return poses;
}
