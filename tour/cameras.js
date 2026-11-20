// Driving views: the cab (first person from the driver's seat) and the drone (orbiting the train).
// V cycles, 1 cab, 2 drone (3 is kept for the director, Phase 3).
import * as THREE from 'three';

const MODES = ['cab', 'drone'];
const CAB_YAW = THREE.MathUtils.degToRad(150), CAB_PITCH = THREE.MathUtils.degToRad(35);

export function makeCameras(camera, dom, { heightAt }) {
  let mode = 'cab', cab = null;   // cab: { holder, seat, clip(on), interior }
  const look = { yaw: 0, pitch: -0.04, dragging: false, idle: 0 };
  const drone = { az: 2.4, el: 0.42, dist: 60, target: new THREE.Vector3(), ready: false, pos: new THREE.Vector3() };
  let px = 0, py = 0;
  dom.addEventListener('pointerdown', (e) => { look.dragging = true; px = e.clientX; py = e.clientY; dom.setPointerCapture?.(e.pointerId); });
  addEventListener('pointerup', () => { look.dragging = false; look.idle = 0; });
  addEventListener('pointermove', (e) => {
    if (!look.dragging) return;
    const dx = (e.clientX - px) / innerHeight, dy = (e.clientY - py) / innerHeight;
    px = e.clientX; py = e.clientY;
    if (mode === 'cab') {
      look.yaw = THREE.MathUtils.clamp(look.yaw - dx * 2.4, -CAB_YAW, CAB_YAW);
      look.pitch = THREE.MathUtils.clamp(look.pitch - dy * 2.0, -CAB_PITCH, CAB_PITCH);
    } else {
      drone.az -= dx * 4; drone.el = THREE.MathUtils.clamp(drone.el + dy * 3, 0.05, 1.45);
    }
  });
  dom.addEventListener('wheel', (e) => {
    if (mode !== 'drone') return;
    drone.dist = THREE.MathUtils.clamp(drone.dist * Math.exp(e.deltaY * 0.001), 25, 200);
    e.preventDefault();
  }, { passive: false });

  function set(m) {
    if (!MODES.includes(m)) return;
    mode = m;
    cab?.clip(mode === 'cab');
    if (cab) cab.interior.visible = mode === 'cab';
    camera.near = mode === 'cab' ? 0.05 : 0.3;
    camera.updateProjectionMatrix();
  }

  const q = new THREE.Quaternion(), e = new THREE.Euler(0, 0, 0, 'YXZ'), v = new THREE.Vector3(), mid = new THREE.Vector3();
  function update(dt, train) {
    if (mode === 'cab' && cab) {
      if (!look.dragging) {
        look.idle += dt;
        if (look.idle > 0.4) { const k = 1 - Math.exp(-dt * 1.6); look.yaw += (0 - look.yaw) * k; look.pitch += (-0.04 - look.pitch) * k; }
      }
      cab.holder.updateMatrixWorld();
      camera.position.copy(cab.seat).applyMatrix4(cab.holder.matrixWorld);
      cab.holder.getWorldQuaternion(q);
      // the vehicle faces +z; a camera looks down -z, so turn it round first
      e.set(look.pitch, Math.PI + look.yaw, 0);
      camera.quaternion.copy(q).multiply(new THREE.Quaternion().setFromEuler(e));
      return;
    }
    // drone: orbit the middle of the train, following it smoothly
    const cars = train.cars;
    mid.copy(cars[0].holder.position).add(cars[cars.length - 1].holder.position).multiplyScalar(0.5);
    if (!drone.ready) { drone.target.copy(mid); drone.ready = true; }
    drone.target.lerp(mid, 1 - Math.exp(-dt * 6));
    const yawTrain = cars[0].holder.rotation.y;
    const az = yawTrain + drone.az;
    v.set(Math.sin(az) * Math.cos(drone.el), Math.sin(drone.el), Math.cos(az) * Math.cos(drone.el)).multiplyScalar(drone.dist);
    drone.pos.copy(drone.target).add(v);
    drone.pos.y = Math.max(drone.pos.y, heightAt(drone.pos.x, drone.pos.z) + 3);
    camera.position.copy(drone.pos);
    camera.lookAt(drone.target.x, drone.target.y + 2, drone.target.z);
  }

  return {
    get mode() { return mode; },
    set, cycle: () => set(MODES[(MODES.indexOf(mode) + 1) % MODES.length]),
    attachCab(c) { cab = c; set(mode); },
    update,
  };
}

// Fit a cab interior to a vehicle: add it to the vehicle's holder and cut the shell away inside the cab's box
// (three planes, clipped only where all three agree), leaving the nose ahead and the body behind.
export function fitCab(renderer, vehicle, interior) {
  renderer.localClippingEnabled = true;
  const shellMeshes = [];
  vehicle.obj.traverse((o) => { if (o.isMesh) shellMeshes.push(o); });
  const planes = [new THREE.Plane(), new THREE.Plane(), new THREE.Plane()];
  for (const m of shellMeshes) { m.material = m.material.clone(); m.material.clipIntersection = true; }
  vehicle.holder.add(interior.group);
  const c = interior.box, local = [
    new THREE.Plane(new THREE.Vector3(0, 0, 1), -(c.zFront + 0.02)),   // clipped where z < front
    new THREE.Plane(new THREE.Vector3(0, 0, -1), c.zBack - 0.02),      // and z > back
    new THREE.Plane(new THREE.Vector3(0, -1, 0), c.floor - 0.02),      // and y > floor
  ];
  let on = false;
  const update = () => {
    if (!on) return;
    vehicle.holder.updateMatrixWorld();
    local.forEach((p, i) => planes[i].copy(p).applyMatrix4(vehicle.holder.matrixWorld));
  };
  for (const m of shellMeshes) m.onBeforeRender = update;
  return {
    holder: vehicle.holder, seat: interior.seat, interior: interior.group,
    clip(v) { on = v; for (const m of shellMeshes) m.material.clippingPlanes = v ? planes : null; update(); },
  };
}
