// You, on foot: the Countryside Railway's engine driver, walking with Polyfork's humanoid clips, seen from above and
// behind (foot-view.js): A / D turn you, W / S walk; standing still, drag the mouse to look round.
import * as THREE from 'three';
import { KITS } from './config.js';
import { kitModule, part } from './parts.js';
import { stepWalker, RUN } from './walk.js';
import { footControls, stepFootView, footCamera, FOOT_VIEW } from './foot-view.js';

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
  // teleporting (T), the figure dissolves from its feet up: everything of it below a level plane is cut away. Its own
  // materials (the kit's may be shared with other parts), each with the plane from the start, so its programs are the
  // ones compiled at boot; the plane sits far below until it's wanted. (Local clipping must be on, as it is: the cabs'
  // fitting, cameras.js fitCab, turns on renderer.localClippingEnabled before you're made)
  const cut = new THREE.Plane(new THREE.Vector3(0, 1, 0), 1e6);
  const meshes = [], casts = [];
  figure.traverse((o) => {
    if (!o.isMesh) return;
    o.material = Array.isArray(o.material) ? o.material.map((m) => m.clone()) : o.material.clone();
    for (const m of [].concat(o.material)) m.clippingPlanes = [cut];
    meshes.push(o); casts.push(o.castShadow);
  });
  const FIGURE_HEIGHT = 1.9;   // m, feet to the top of his cap, and a little over

  // state.yaw is the way you face (and walk); view is where the camera looks from, relative to that
  const state = { x: 0, z: 0, yaw: 0, y: 0, on: false };
  let view = { yaw: 0, pitch: FOOT_VIEW.pitch };
  const drag = { on: false, dx: 0, dy: 0 };
  let px = 0, py = 0;
  dom.addEventListener('pointerdown', (e) => { if (state.on) { drag.on = true; px = e.clientX; py = e.clientY; } });
  addEventListener('pointerup', () => { drag.on = false; });
  addEventListener('pointermove', (e) => {
    if (!state.on || !drag.on) return;
    drag.dx += (e.clientX - px) / innerHeight; drag.dy += (e.clientY - py) / innerHeight;
    px = e.clientX; py = e.clientY;
  });

  const camPos = new THREE.Vector3(), target = new THREE.Vector3();
  const place = (world) => {
    const c = footCamera(state, view, world ? world.heightAt : undefined);
    return { pos: camPos.set(c.pos.x, c.pos.y, c.pos.z), target: target.set(c.target.x, c.target.y, c.target.z) };
  };
  return {
    state,
    // (pitch: the view's to begin with; it swings back to the usual one as soon as you move)
    enter(x, z, yaw, y, pitch = FOOT_VIEW.pitch) {
      Object.assign(state, { x, z, yaw, y, on: true });
      view = { yaw: 0, pitch };
      Object.assign(drag, { dx: 0, dy: 0 });
      figure.visible = true;
      figure.position.set(x, y, z);
      figure.rotation.y = yaw;
      place(null);
    },
    exit() { state.on = false; figure.visible = false; },
    // gone: 0 (whole) .. 1 (none of him left), dissolved from his feet up; his shadow goes while any of him is gone
    dissolve(gone) {
      cut.constant = gone <= 0 ? 1e6 : -(figure.position.y + gone * (FIGURE_HEIGHT + 0.05) - 0.02);
      for (let k = 0; k < meshes.length; k++) meshes[k].castShadow = casts[k] && gone <= 0;
    },
    height: FIGURE_HEIGHT,   // m, how tall he is
    figure,   // (the page draws him once at boot: a compile alone leaves his clipped variant to his first frame)
    // input { fwd, right, run } (the keys); world { blocked, heightAt, inBounds }
    update(dt, input, world) {
      if (!state.on) return;
      const before = { x: state.x, z: state.z };
      const steer = footControls(input, dt);
      const next = stepWalker(state, steer, dt, world);
      state.x = next.x; state.z = next.z; state.yaw = next.yaw;
      const moved = Math.hypot(state.x - before.x, state.z - before.z) / Math.max(dt, 1e-3);
      const ground = world.heightAt(state.x, state.z);
      state.y += (ground - state.y) * Math.min(1, dt * 14);
      figure.position.set(state.x, state.y, state.z);
      // you face your heading (walking back too, as you step backwards)
      figure.rotation.y += Math.atan2(Math.sin(state.yaw - figure.rotation.y), Math.cos(state.yaw - figure.rotation.y)) * Math.min(1, dt * 12);
      anim.locomotion(Math.min(moved, RUN));
      anim.update(dt);
      // the camera: above and behind you while you walk, run or turn; standing still, where the mouse looks
      const moving = steer.fwd !== 0 || steer.yawDelta !== 0;
      view = stepFootView(view, { moving, drag: drag.dx || drag.dy ? drag : null }, dt);
      drag.dx = 0; drag.dy = 0;
      const want = footCamera(state, view, world.heightAt);
      camPos.lerp(new THREE.Vector3(want.pos.x, want.pos.y, want.pos.z), 1 - Math.exp(-dt * 12));
      camera.position.copy(camPos);
      camera.lookAt(target.set(want.target.x, want.target.y, want.target.z));
    },
  };
}
