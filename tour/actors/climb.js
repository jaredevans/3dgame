// The Highland Climber's leg (ocean-mountain): the red signal before the tunnel while a work train clears the viaduct,
// deer on the slope that bound off, a passing shower that clears to a rainbow, and an eagle circling alongside.
//
// Sides: the deer and the eagle keep to their shots' sides (events.js gives each heli shot `lateral` on its subject's
// side, + left of the leg's out direction): the deer the land side, the eagle the valley side.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { laneOf } from '../world-data.js';
import { buildTrain, poseTrain } from '../vehicles.js';
import { loadAnimal, clipFor } from './animals.js';
import { rainbowArc, arcAboveHorizon } from './paths.js';

// 1 over u 0..a, falling to 0 over b..1 (a and b the ends of the fades in and out)
const fade = (u, a, b) => Math.max(0, Math.min(1, u / a, (1 - u) / (1 - b)));
// the leg's left (+ lateral) at a route point
const leftOf = (P) => new THREE.Vector3(Math.cos(P.yaw), 0, -Math.sin(P.yaw));
const sideOf = (def, fallback) => Math.sign(def.shot?.lateral ?? fallback) || fallback;
const warnOut = (what, def, leg, err) =>
  console.warn(`The ${what} at the ${def.id} along ${leg} was left out: ${err?.url ? `could not load ${err.url}` : err?.message ?? err}`);

// ---- the signal and the work train ----
// The post stands on the left of your line as the driver comes up to it, 2.6 m out from its centre, facing them. (Your
// line is this leg's right-hand one, so that's between the lines, 1.4 m from the other's centre: just inside its 1.5 m
// loading gauge, KIT.md, but no train runs on it here, both runs keeping to the town-side line, journey.js.) On a back
// run, on the same line, it shows green, facing away
const SIGNAL_OUT = 2.6;
const WORK = { at: 700, speed: 6, far: 320 };   // the work train: its front's leg-s while the signal is red, m/s once green, hidden this far ahead of you
const WORK_CARS = [
  ['diesel-shunter', { colorway: 'works-grey', livery: 'deep-green', wear: 0.5 }],
  ['hopper-wagon', { colorway: 'engineers-olive', load: 'full', wear: 0.5 }],
  ['hopper-wagon', { colorway: 'engineers-olive', load: 'full', wear: 0.6 }],
];

async function buildSignal({ leg, route, def, terrain, slicer, kit }) {
  const group = new THREE.Group();
  group.name = `signal ${leg}`;
  const lane = laneOf(leg), at = def.react.at.out;
  const P = route.at(at), q = route.offsetAt(at, lane + SIGNAL_OUT);
  const aspects = {};
  for (const aspect of ['red', 'green']) {
    await slicer.frame();
    const s = await kit('railway', 'colour-light-signal', { aspect, colorway: 'network-black' });
    s.position.set(q.x, terrain.heightAt(q.x, q.z), q.z);
    s.rotation.y = P.yaw + Math.PI;   // its lamps face its +z: back down the line, at the driver coming up
    s.visible = aspect === 'red';
    group.add(s);
    aspects[aspect] = s;
  }

  // the work train: optional, the signal works without it
  let work = null;
  await slicer.frame();
  try {
    work = await buildTrain({ name: 'work train', cars: WORK_CARS });
    work.group.visible = false;
    group.add(work.group);
  } catch (err) { warnOut('work train', def, leg, err); }
  let workS = WORK.at;

  return {
    group,
    update(f) {
      // the aspect the reaction says on your out run (red until its approach arms and you've stood by it); green on a
      // back run, the post's back to you
      const aspect = f.dir === 'back' ? 'green' : f.react?.aspect ?? 'red';
      aspects.red.visible = aspect === 'red';
      aspects.green.visible = aspect === 'green';
      if (!work) return;
      // stands on the viaduct while it's red, then runs on towards the Mountain; only on your out run, inside the event
      const out = f.on && f.dir === 'out';
      if (!out || aspect === 'red') workS = WORK.at;
      if (!out) { work.group.visible = false; return; }
      const before = workS;
      if (aspect === 'green') workS = Math.min(route.length, workS + WORK.speed * f.dt);
      work.group.visible = workS - f.legS <= WORK.far;
      if (work.group.visible) poseTrain(work, route, workS, workS - before, lane);
    },
    dispose() { if (work) work.group.visible = false; },
  };
}

// ---- the deer ----
const DEER = [   // leg-s and distance out from the line (the window's middle, the deer shot's `at`, is 285)
  { s: 262, out: 30, yaw: 0.6 }, { s: 284, out: 44, yaw: -1.9 }, { s: 305, out: 57, yaw: 2.6 },
];
const BOLT = { at: 0.3, speed: 7, secs: 4, look: 15 };   // they run off once the window's 30% through, 7 m/s for 4 s

async function buildDeer({ leg, route, def, terrain, slicer }) {
  const group = new THREE.Group();
  group.name = `deer ${leg}`;
  const side = sideOf(def, -1);
  const kind = await loadAnimal('deer-base');
  const herd = [];
  for (const d of DEER) {
    await slicer.frame();
    const a = kind.make();
    const P = route.at(d.s), out = leftOf(P).multiplyScalar(side);
    const home = new THREE.Vector3(P.x, 0, P.z).addScaledVector(out, d.out);
    // the way off: away from the line and up the slope, whichever of straight out or 45 degrees either side climbs most
    let run = null, best = -Infinity;
    for (const turn of [-Math.PI / 4, 0, Math.PI / 4]) {
      const dir = out.clone().applyAxisAngle(THREE.Object3D.DEFAULT_UP, turn);
      const rise = terrain.heightAt(home.x + dir.x * BOLT.look, home.z + dir.z * BOLT.look);
      if (rise > best) { best = rise; run = dir; }
    }
    a.object.visible = false;
    group.add(a.object);
    herd.push({ a, home, run, yaw: d.yaw });
  }
  let t = null;   // seconds since they bolted, or null while they graze
  const place = (deer, x, z, yaw) => {
    deer.a.object.position.set(x, terrain.heightAt(x, z), z);
    deer.a.object.rotation.y = yaw;
  };
  const reset = () => {
    t = null;
    for (const d of herd) { d.a.object.visible = false; place(d, d.home.x, d.home.z, d.yaw); d.a.play('Idle', { fade: 0 }); }
  };
  reset();
  return {
    group,
    update(f) {
      if (!f.on) { reset(); return; }
      // how far through the window the train is, the way it's going (on an out run, the event's own u)
      const u = f.dir === 'back' ? 1 - f.on.u : f.on.u;
      if (t === null && u > BOLT.at) t = 0;
      if (t !== null) t += f.dt;
      const running = t !== null && t < BOLT.secs;
      const gone = t === null ? 0 : Math.min(t, BOLT.secs) * BOLT.speed;
      for (const d of herd) {
        d.a.object.visible = true;
        const clip = clipFor(running ? BOLT.speed : 0, d.a.clips);
        d.a.play(clip.name, { timeScale: clip.timeScale });
        if (t !== null) place(d, d.home.x + d.run.x * gone, d.home.z + d.run.z * gone, Math.atan2(d.run.x, d.run.z));
        d.a.update(f.dt);
      }
    },
    dispose() { for (const d of herd) d.a.object.visible = false; },
  };
}

// ---- the rain ----
const RAIN = { count: 1500, box: 60, fall: 9, streak: 0.8, slant: 0.08, opacity: 0.75, cloud: 0.45, haze: 0.15 };

function buildRain({ leg, terrain }) {
  const group = new THREE.Group();
  group.name = `rain ${leg}`;
  const pos = new Float32Array(RAIN.count * 6), drops = new Float32Array(RAIN.count * 3);
  const half = RAIN.box / 2;
  for (let i = 0; i < RAIN.count * 3; i++) drops[i] = (Math.random() - 0.5) * RAIN.box;   // round the first camera it sees
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3).setUsage(THREE.DynamicDrawUsage));
  const mat = new THREE.LineBasicMaterial({ color: '#c8d2dc', transparent: true, opacity: 0, depthWrite: false });
  const lines = new THREE.LineSegments(geo, mat);
  lines.frustumCulled = false;   // the buffer's moved by hand, round the camera
  lines.visible = false;
  lines.userData.own = true;
  group.add(lines);
  let placed = false;
  // v put back in the box round c (however far the camera has gone since: a jump, another run)
  const wrap = (v, c) => c - half + ((((v - c + half) % RAIN.box) + RAIN.box) % RAIN.box);
  const strength = (f) => (f.on ? fade(f.on.u, 0.1, 0.9) : 0);
  return {
    group,
    update(f) {
      const cam = f.camera.position;
      // none under the land (the cab in the tunnel)
      const k = strength(f) * (terrain.heightAt(cam.x, cam.z) > cam.y + 1.5 ? 0 : 1);
      lines.visible = k > 0;
      if (!lines.visible) return;
      mat.opacity = RAIN.opacity * k;
      if (!placed) { for (let i = 0; i < RAIN.count; i++) { drops[i * 3] += cam.x; drops[i * 3 + 1] += cam.y; drops[i * 3 + 2] += cam.z; } placed = true; }
      for (let i = 0; i < RAIN.count; i++) {
        const j = i * 3;
        // each streak falls, and is put back in the box round the camera on the far side once it leaves it
        drops[j] = wrap(drops[j], cam.x);
        drops[j + 1] = wrap(drops[j + 1] - RAIN.fall * f.dt, cam.y);
        drops[j + 2] = wrap(drops[j + 2], cam.z);
        const o = i * 6;
        pos[o] = drops[j]; pos[o + 1] = drops[j + 1]; pos[o + 2] = drops[j + 2];
        pos[o + 3] = drops[j] + RAIN.slant; pos[o + 4] = drops[j + 1] - RAIN.streak; pos[o + 5] = drops[j + 2];
      }
      geo.attributes.position.needsUpdate = true;
    },
    // the shower's clouds and haze, on top of the sky's own, as it comes and goes
    weather(f) {
      const k = strength(f);
      return k > 0 ? { cloudCover: RAIN.cloud * k, haze: RAIN.haze * k } : null;
    },
  };
}

// ---- the rainbow ----
// seven bands, red outermost at 42 degrees from the antisolar point (radius 400 m), violet 2 degrees in: a thin, flat
// torus segment (an annulus facing you, each band one strip of it) cut where it meets the horizon; the whole stands
// round the camera, opposite the sun
const RAINBOW = {
  radius: 400, width: 2 * Math.PI / 180, opacity: 0.35,
  bands: ['#ff2a1a', '#ff8a1a', '#ffe81a', '#3ad13a', '#2a8cff', '#3a3aff', '#9a3aff'],
};

function buildRainbow({ leg }) {
  const group = new THREE.Group();
  group.name = `rainbow ${leg}`;
  const R = rainbowArc({ x: 0, y: 1, z: 0 }).radius;
  const D = RAINBOW.radius / Math.tan(R);   // how far off its centre stands, for the red band's 400 m to be 42 degrees round it
  const step = RAINBOW.width / (RAINBOW.bands.length - 1);
  const mat = new THREE.MeshBasicMaterial({
    vertexColors: true, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, fog: false,
  });
  const mesh = new THREE.Mesh(new THREE.BufferGeometry(), mat);
  mesh.frustumCulled = false;
  mesh.visible = false;
  mesh.userData.own = true;
  group.add(mesh);
  let builtFor = null;   // the sun's elevation the bands were cut for
  const cut = (el) => {
    const parts = RAINBOW.bands.map((hex, i) => {
      const a = R - i * step, arc = 2 * arcAboveHorizon(el, a);
      if (arc <= 0) return null;
      // centred on its top (the mesh's +y, kept up by lookAt), facing the camera (its +z)
      const g = new THREE.RingGeometry(D * Math.tan(a - step / 2), D * Math.tan(a + step / 2), Math.max(8, Math.ceil(arc * 40)), 1,
        Math.PI / 2 - arc / 2, arc);
      const c = new THREE.Color(hex), n = g.attributes.position.count, col = new Float32Array(n * 3);
      for (let k = 0; k < n; k++) col.set([c.r, c.g, c.b], k * 3);
      g.setAttribute('color', new THREE.BufferAttribute(col, 3));
      return g;
    }).filter(Boolean);
    mesh.geometry.dispose();
    mesh.geometry = parts.length ? mergeGeometries(parts) : new THREE.BufferGeometry();
    for (const g of parts) g.dispose();
    builtFor = el;
  };
  let told = false;
  const centre = new THREE.Vector3();
  return {
    group,
    update(f) {
      if (!f.on) { mesh.visible = false; return; }
      const el = Math.asin(Math.max(-1, Math.min(1, f.sunDir.y / (f.sunDir.length() || 1))));
      if (el < 0 || el > R) {   // no rainbow with the sun down, or higher than its arc: the event's a no-show
        mesh.visible = false;
        if (!told) {
          told = true;
          console.info(`No rainbow along ${leg}: the sun is ${Math.round(el * 180 / Math.PI)} degrees up, and a rainbow needs it between 0 and 42`);
        }
        return;
      }
      if (builtFor === null || Math.abs(el - builtFor) > 0.5 * Math.PI / 180) cut(el);
      const { centre: c } = rainbowArc(f.sunDir);
      const cam = f.camera.position;
      mesh.position.copy(cam).addScaledVector(centre.set(c.x, c.y, c.z), D);
      mesh.lookAt(cam);
      mat.opacity = RAINBOW.opacity * fade(f.on.u, 0.2, 0.8);
      mesh.visible = mat.opacity > 0;
    },
  };
}

// ---- the eagle ----
// built here (Polyfork has none): a dark-brown body 0.9 m long, a white head and tail, 2 m of wings that beat slowly a
// few times and then glide. It circles 25-40 m up, its circle's centre 40 m out on the valley side of the train's front
const EAGLE = {
  out: 40, up: [25, 40], circle: 18, airspeed: 9,
  flapEvery: 9, flapFor: 2.2, beatHz: 1.3, beat: 0.55, dihedral: 0.12, bank: 0.35,
};
const brown = new THREE.MeshStandardMaterial({ color: '#3b2a1c', roughness: 0.9 });
const white = new THREE.MeshStandardMaterial({ color: '#ece8de', roughness: 0.9 });
const yellow = new THREE.MeshStandardMaterial({ color: '#e0b020', roughness: 0.7 });

function makeEagle() {
  const bird = new THREE.Group();
  bird.name = 'eagle';
  const add = (geo, mat, x, y, z, parent = bird) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.castShadow = true; parent.add(m); return m; };
  add(new THREE.SphereGeometry(1, 12, 8).scale(0.13, 0.12, 0.38), brown, 0, 0, 0);          // the body, 0.76 m, with head and tail 0.9
  add(new THREE.SphereGeometry(0.085, 10, 8), white, 0, 0.03, 0.4);                           // the head
  add(new THREE.ConeGeometry(0.03, 0.09, 6).rotateX(Math.PI / 2), yellow, 0, 0.01, 0.5);      // the beak
  add(new THREE.BoxGeometry(0.2, 0.02, 0.16), white, 0, 0, -0.42);                            // the tail
  const wings = [];
  for (const s of [1, -1]) {
    const shoulder = new THREE.Group();
    shoulder.position.set(s * 0.08, 0.04, 0.04);
    bird.add(shoulder);
    // a wing, broad at the root and narrow at the tip: two slabs, 0.95 m out from the shoulder
    add(new THREE.BoxGeometry(0.5, 0.025, 0.4), brown, s * 0.25, 0, 0, shoulder);
    add(new THREE.BoxGeometry(0.45, 0.02, 0.28), brown, s * 0.72, 0, -0.04, shoulder);
    wings.push({ shoulder, s });
  }
  return { bird, wings };
}

function buildEagle({ leg, route, def }) {
  const group = new THREE.Group();
  group.name = `eagle ${leg}`;
  const side = sideOf(def, 1);
  const { bird, wings } = makeEagle();
  bird.visible = false;
  group.add(bird);
  const P = {}, centre = new THREE.Vector3(), prev = new THREE.Vector3(), vel = new THREE.Vector3();
  let fresh = true, flapT = 0, bank = 0;
  return {
    group,
    update(f) {
      if (!f.on) { bird.visible = false; fresh = true; return; }
      bird.visible = true;
      const front = f.train.front;
      route.at(f.legS, P);
      centre.copy(front).addScaledVector(leftOf(P), side * EAGLE.out);
      const t = f.time, w = EAGLE.airspeed / EAGLE.circle;
      const [lo, hi] = EAGLE.up;
      bird.position.set(
        centre.x + Math.cos(t * w) * EAGLE.circle,
        front.y + (lo + hi) / 2 + (hi - lo) / 2 * Math.sin(t * 0.13),
        centre.z + Math.sin(t * w) * EAGLE.circle,
      );
      // it faces the way it's going (round its circle, and along with the train), banked into the turn
      if (!fresh && f.dt > 0) vel.subVectors(bird.position, prev).divideScalar(f.dt);
      else vel.set(-Math.sin(t * w), 0, Math.cos(t * w));
      prev.copy(bird.position);
      fresh = false;
      const flat = Math.hypot(vel.x, vel.z);
      if (flat > 0.01) {
        bank += (EAGLE.bank - bank) * Math.min(1, f.dt * 2);   // (the centre of its circle on its right: right wing down)
        bird.rotation.set(-Math.atan2(vel.y, flat), Math.atan2(vel.x, vel.z), bank, 'YXZ');
      }
      // a few slow beats every so often, else a glide with the wings held a little up
      flapT = (flapT + f.dt) % EAGLE.flapEvery;
      const beating = flapT < EAGLE.flapFor ? Math.sin(Math.PI * flapT / EAGLE.flapFor) : 0;
      const lift = EAGLE.dihedral + beating * EAGLE.beat * Math.sin(2 * Math.PI * EAGLE.beatHz * flapT);
      for (const { shoulder, s } of wings) shoulder.rotation.z = s * lift;
    },
  };
}

export const climb = { signal: buildSignal, deer: buildDeer, rain: buildRain, rainbow: buildRainbow, eagle: buildEagle };
