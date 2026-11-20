// Where each vehicle of a train sits on a route. The basement's pivot maths (index.html poseTrain), in 3D:
// a vehicle stands on two pivots (bogie centres or outer axles), each on the path, and its body is the chord
// between them, so bodies swing out on curves and tilt on gradients. Pure maths, no three.js.

export const COUPLING_GAP = 0.15;   // metres between buffer faces, as the basement

const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));
const F = {}, R = {}, B = {};

// cars: [{ front, length, pf, pr, bogieZ: [] }] in vehicle-local z (the vehicle faces +z), front car first.
// frontS: route distance of the leading buffer face. lateral: metres left of the route centre line.
export function placeCars(route, frontS, cars, { gap = COUPLING_GAP, lateral = 0 } = {}) {
  const poses = [];
  let front = frontS;
  for (const car of cars) {
    const origin = front - car.front;   // route distance of the vehicle's own z = 0
    route.offsetAt(origin + car.pf, lateral, F);
    route.offsetAt(origin + car.pr, lateral, R);
    const dx = F.x - R.x, dy = F.y - R.y, dz = F.z - R.z;
    const len = Math.hypot(dx, dy, dz) || 1;
    const yaw = Math.atan2(dx, dz), pitch = Math.atan2(dy, Math.hypot(dx, dz));
    const back = -car.pr / len;   // from the rear pivot forward to z = 0
    poses.push({
      x: R.x + dx * back, y: R.y + dy * back, z: R.z + dz * back, yaw, pitch,
      bogieYaw: car.bogieZ.map((bz) => wrap(route.at(origin + bz, B).yaw - yaw)),
    });
    front -= car.length + gap;
  }
  return poses;
}
