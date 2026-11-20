// Building trains from Countryside Railway parts and posing them on a route.
import * as THREE from 'three';
import { KITS } from './config.js';
import { part } from './parts.js';
import { placeCars } from './consist.js';

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

// def: { name, cars: [[kitKey, params, flip?]] } -> { name, group, cars }
export async function buildTrain(def) {
  const group = new THREE.Group();
  group.name = def.name;
  const cars = [];
  for (const [key, params, flip] of def.cars) {
    const v = measureVehicle(await part(KITS.railway, key, params), !!flip);
    v.key = key;
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
