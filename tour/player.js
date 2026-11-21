// You, on foot: the Countryside Railway's engine driver, walking with Polyfork's humanoid clips, seen over the shoulder.
import * as THREE from 'three';
import { KITS } from './config.js';
import { kitModule, part } from './parts.js';
import { stepWalker, RUN } from './walk.js';

export async function makePlayer(scene, camera, dom, look) {
  const figure = await part(KITS.railway, 'engine-driver', { colorway: 'driver', oilCan: false });
  // the clips come from Polyfork's CDN; without them (or without clips.mjs itself) the figure glides in its rest pose
  // rather than stopping the tour
  let anim = { locomotion() {}, update() {} };
  try {
    const { animate } = await kitModule(KITS.railway, 'clips.mjs');
    anim = await animate(figure);
  } catch (err) { console.warn('walking clips unavailable', err); }
  figure.visible = false;
  scene.add(figure);
  look?.shadows(figure);

  const state = { x: 0, z: 0, yaw: 0, y: 0, on: false };
  const cam = { pitch: -0.12, dragging: false, yawDelta: 0 };
  let px = 0, py = 0;
  dom.addEventListener('pointerdown', (e) => { if (state.on) { cam.dragging = true; px = e.clientX; py = e.clientY; } });
  addEventListener('pointerup', () => { cam.dragging = false; });
  addEventListener('pointermove', (e) => {
    if (!state.on || !cam.dragging) return;
    cam.yawDelta -= ((e.clientX - px) / innerHeight) * 3;
    cam.pitch = THREE.MathUtils.clamp(cam.pitch - ((e.clientY - py) / innerHeight) * 2, -0.9, 0.5);
    px = e.clientX; py = e.clientY;
  });

  const camPos = new THREE.Vector3(), target = new THREE.Vector3();
  return {
    state,
    enter(x, z, yaw, y) {
      Object.assign(state, { x, z, yaw, y, on: true });
      figure.visible = true;
      figure.position.set(x, y, z);
      camPos.set(x - Math.sin(yaw) * 3, y + 2.2, z - Math.cos(yaw) * 3);
    },
    exit() { state.on = false; figure.visible = false; },
    // input { fwd, right, run }; world { blocked, heightAt, inBounds }
    update(dt, input, world) {
      if (!state.on) return;
      const before = { x: state.x, z: state.z };
      const next = stepWalker(state, { ...input, yawDelta: cam.yawDelta }, dt, world);
      cam.yawDelta = 0;
      state.x = next.x; state.z = next.z; state.yaw = next.yaw;
      const moved = Math.hypot(state.x - before.x, state.z - before.z) / Math.max(dt, 1e-3);
      const ground = world.heightAt(state.x, state.z);
      state.y += (ground - state.y) * Math.min(1, dt * 14);
      figure.position.set(state.x, state.y, state.z);
      // face the way you're moving (or the way the camera looks when standing)
      const f = input.fwd ?? 0, r = input.right ?? 0;
      const faceYaw = (f || r) ? state.yaw + Math.atan2(-r, f) : figure.rotation.y;
      figure.rotation.y += Math.atan2(Math.sin(faceYaw - figure.rotation.y), Math.cos(faceYaw - figure.rotation.y)) * Math.min(1, dt * 10);
      anim.locomotion(Math.min(moved, RUN));
      anim.update(dt);
      // over the shoulder: behind, a little to the right, above; looking past the head
      const back = 3.2, side = 0.7, up = 1.9;
      const sx = Math.sin(state.yaw), cz = Math.cos(state.yaw);
      const want = new THREE.Vector3(
        state.x - sx * back * Math.cos(cam.pitch) - cz * side,
        state.y + up - Math.sin(cam.pitch) * back,
        state.z - cz * back * Math.cos(cam.pitch) + sx * side,
      );
      want.y = Math.max(want.y, world.heightAt(want.x, want.z) + 0.4);
      camPos.lerp(want, 1 - Math.exp(-dt * 12));
      camera.position.copy(camPos);
      target.set(state.x + sx * 4 - cz * side, state.y + 1.5 + Math.sin(cam.pitch) * 3, state.z + cz * 4 + sx * side);
      camera.lookAt(target);
    },
  };
}
