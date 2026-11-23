// The Canyon Express's leg (mountain-west): snow at the pass, boulders tumbling down the slope behind the train, riders
// racing it and a herd of wild horses galloping alongside, cattle on the line at the canyon's mouth, tumbleweeds blowing
// across and a stagecoach on its dirt road into the Wild West.
//
// The land: the line tops the pass at s 520, then runs down a canyon (FEATURES, s 620-1150) whose walls stand 20 m and
// more high 25 m out until about s 1120. Beside the line the land is open only from the canyon's mouth (about 1135) to
// the Wild West's platform window (the leg's last 122 m), so everything that runs beside the line (the riders, the
// horses, the tumbleweeds, the stagecoach) keeps to the stretch of its window where the ground along its track lies
// near the line's level: found from the land when it's built (openStretch), never in a platform window.
//
// Sides (+ left of the leg's out direction, as the shots' `lateral`): the riders and the tumbleweeds' upwind side are
// the left, the horses and the stagecoach the right; the cattle amble off to the right, your own line's side (it's the
// right-hand one), the lower, open side at the canyon's mouth.
import * as THREE from 'three';
import { laneOf, drawnGround } from '../world-data.js';
import { sound } from '../audio.js';
import { loadAnimal, clipFor } from './animals.js';
import { HORSE } from './clips.js';
import { herdPath, paceStep, openStretch, CANYON_COACH, standOnGround } from './paths.js';
import { crewFigure, seatOnHorse } from '../rides/crew.js';
import { hdAsset } from '../hd.js';

// Polyfork's tumbleweed (0.5-1.1 m across by its `diameter`), the Wild West's own (life/west.js) and the canyon's
export const TUMBLEWEED = 'tumbleweed-077954';

// 1 over u 0..a, falling to 0 over b..1 (a and b the ends of the fades in and out)
const fade = (u, a, b) => Math.max(0, Math.min(1, u / a, (1 - u) / (1 - b)));
const sideOf = (def, fallback) => Math.sign(def.shot?.lateral ?? fallback) || fallback;
const sgnOf = (dir) => (dir === 'back' ? -1 : 1);
const warnOut = (what, def, leg, err) =>
  console.warn(`The ${what} at the ${def.id} along ${leg} was left out: ${err?.url ? `could not load ${err.url}` : err?.message ?? err}`);

// an animal's pose beside the line: on its track (herdPath) at leg-s s, `lateral` out on `side`, on the land, facing
// along the run (sgn) turned `heading` away from the line
function placeBeside(obj, { route, terrain, P }, s, side, lateral, sgn, heading = 0) {
  herdPath(route, s, side, lateral, P);
  obj.position.set(P.x, terrain.heightAt(P.x, P.z), P.z);
  obj.rotation.y = P.yaw + (sgn < 0 ? Math.PI : 0) + sgn * side * heading;
}

// ---- the snow ----
const SNOW = { count: 2500, box: 70, fall: 1.2, drift: 0.5, wind: 0.3, size: 0.2, opacity: 0.9, haze: 0.1 };

// a soft round flake: a small radial fade drawn once
function flakeTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 32;
  const g = c.getContext('2d'), grad = g.createRadialGradient(16, 16, 0, 16, 16, 16);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(0.5, 'rgba(255,255,255,0.8)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 32, 32);
  return new THREE.CanvasTexture(c);
}

function buildSnow({ leg }) {
  const group = new THREE.Group();
  group.name = `snow ${leg}`;
  const half = SNOW.box / 2;
  const pos = new Float32Array(SNOW.count * 3), phase = new Float32Array(SNOW.count);
  for (let i = 0; i < SNOW.count * 3; i++) pos[i] = (Math.random() - 0.5) * SNOW.box;   // round the first camera it sees
  for (let i = 0; i < SNOW.count; i++) phase[i] = Math.random() * Math.PI * 2;
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3).setUsage(THREE.DynamicDrawUsage));
  const mat = new THREE.PointsMaterial({
    color: '#f4f7fb', size: SNOW.size, sizeAttenuation: true, map: flakeTexture(), transparent: true, opacity: 0, depthWrite: false,
  });
  const flakes = new THREE.Points(geo, mat);
  flakes.frustumCulled = false;   // the buffer's moved by hand, round the camera
  flakes.visible = false;
  flakes.userData.own = true;
  group.add(flakes);
  let placed = false;
  const wrap = (v, c) => c - half + ((((v - c + half) % SNOW.box) + SNOW.box) % SNOW.box);
  const strength = (f) => (f.on ? fade(f.on.u, 0.1, 0.9) : 0);
  return {
    group,
    update(f) {
      const k = strength(f);
      flakes.visible = k > 0;
      if (!flakes.visible) return;
      mat.opacity = SNOW.opacity * k;
      const cam = f.camera.position, t = f.time, dt = f.dt;
      if (!placed) { for (let i = 0; i < SNOW.count; i++) { pos[i * 3] += cam.x; pos[i * 3 + 1] += cam.y; pos[i * 3 + 2] += cam.z; } placed = true; }
      for (let i = 0; i < SNOW.count; i++) {
        const j = i * 3, p = phase[i];
        // each flake falls, swaying on its own, a light wind behind it; put back in the box round the camera on the far
        // side once it leaves it
        pos[j] = wrap(pos[j] + (SNOW.wind + SNOW.drift * Math.sin(t * 0.9 + p)) * dt, cam.x);
        pos[j + 1] = wrap(pos[j + 1] - SNOW.fall * dt, cam.y);
        pos[j + 2] = wrap(pos[j + 2] + SNOW.drift * Math.cos(t * 0.7 + p * 1.3) * dt, cam.z);
      }
      geo.attributes.position.needsUpdate = true;
    },
    weather(f) {
      const k = strength(f);
      return k > 0 ? { haze: SNOW.haze * k } : null;
    },
  };
}

// ---- the rockfall ----
// six boulders; when the event starts they set off (a moment apart) from 40-60 m up the slope on the uphill side, 30-60 m
// behind the last car, and roll down it with gravity, slowed by the ground, coming to rest 12 m or more from the line
const ROCKS = {
  count: 6, behind: [30, 60], up: [40, 60], reach: 320, step: 4, rest: 12,
  g: 9.8, grip: 0.45, top: 16, stagger: 1.2,
};

async function buildRockfall({ leg, route, def, terrain, slicer, kit }) {
  const group = new THREE.Group();
  group.name = `rockfall ${leg}`;
  const rocks = [], box = new THREE.Box3(), c = new THREE.Vector3();
  for (let i = 0; i < ROCKS.count; i++) {
    await slicer.frame();
    let rock;
    try { rock = await kit('nature', 'rock-medium', { colorway: 'granite-grey', length: 0.8 + 0.3 * (i / (ROCKS.count - 1)), pebbles: 0, mossCover: 0.1 }); } catch (err) {
      warnOut('rock-medium', def, leg, err);
      continue;
    }
    // turned about its own middle: held in a pivot at its centre
    box.setFromObject(rock).getCenter(c);
    const radius = Math.max(0.3, (box.max.y - box.min.y) / 2);
    rock.position.sub(c);
    const pivot = new THREE.Group();
    pivot.add(rock);
    pivot.visible = false;
    group.add(pivot);
    rocks.push({ pivot, radius, cy: c.y, x: 0, z: 0, vx: 0, vz: 0, wait: 0, still: false, lx: 0, lz: 0, ox: 0, oz: 0 });
  }
  if (!rocks.length) throw new Error('no boulders could be made');

  const P = {}, Q = {};
  const axis = new THREE.Vector3(), spin = new THREE.Quaternion();
  // the line's left there, and where it is: a rock's distance from the line is measured across its start's frame
  const rise = (x, z, lineY) => terrain.heightAt(x, z) - lineY;
  // where on `side` at leg-s s the land first stands `want` metres above the line, out to `reach` (found between two
  // steps, so a steep wall isn't overshot): -> lateral or null
  const climbTo = (s, side, want) => {
    let before = -Infinity;
    for (let l = 15; l <= ROCKS.reach; l += ROCKS.step) {
      herdPath(route, s, side, l, Q);
      const h = rise(Q.x, Q.z, Q.y);
      if (h >= want) return before === -Infinity ? l : l - ROCKS.step * (h - want) / (h - before);
      before = h;
    }
    return null;
  };
  let started = false;
  const hide = () => { started = false; for (const r of rocks) r.pivot.visible = false; };
  const place = (r) => {
    const y = terrain.heightAt(r.x, r.z);
    r.pivot.position.set(r.x, y + r.cy, r.z);
  };
  function start(f) {
    const sgn = sgnOf(f.dir), tail = f.legS - sgn * f.train.length;
    // the uphill side: the one whose 40 m rise comes nearest the line behind the train
    const sMid = tail - sgn * (ROCKS.behind[0] + ROCKS.behind[1]) / 2;
    const near = [1, -1].map((side) => ({ side, l: climbTo(sMid, side, ROCKS.up[0]) ?? Infinity }));
    const side = near[0].l <= near[1].l ? near[0].side : near[1].side;
    for (const [i, r] of rocks.entries()) {
      const s = Math.min(route.length, Math.max(0, tail - sgn * (ROCKS.behind[0] + Math.random() * (ROCKS.behind[1] - ROCKS.behind[0]))));
      const l = climbTo(s, side, ROCKS.up[0] + Math.random() * (ROCKS.up[1] - ROCKS.up[0])) ?? ROCKS.reach;
      herdPath(route, s, side, l, P);
      Object.assign(r, { x: P.x, z: P.z, vx: 0, vz: 0, still: false, wait: i * ROCKS.stagger / rocks.length + Math.random() * 0.3 });
      // the line's frame there: its centre, and its left (for the rock's distance out)
      route.at(s, Q);
      Object.assign(r, { ox: Q.x, oz: Q.z, lx: Math.cos(Q.yaw), lz: -Math.sin(Q.yaw) });
      r.pivot.quaternion.setFromAxisAngle(THREE.Object3D.DEFAULT_UP, Math.random() * Math.PI * 2);
      r.pivot.visible = true;
      place(r);
    }
    sound('rumble');
    started = true;
  }
  function roll(r, dt) {
    if (r.still) return;
    if (r.wait > 0) { r.wait -= dt; return; }
    // the slope under it (the land's gradient), and gravity's pull down it less the ground's grip
    const e = 1, h = terrain.heightAt;
    const gx = (h(r.x + e, r.z) - h(r.x - e, r.z)) / (2 * e), gz = (h(r.x, r.z + e) - h(r.x, r.z - e)) / (2 * e);
    const slope = Math.hypot(gx, gz), cos = 1 / Math.sqrt(1 + slope * slope), sin = slope * cos;
    if (slope > 1e-6) { r.vx -= (gx / slope) * ROCKS.g * sin * dt; r.vz -= (gz / slope) * ROCKS.g * sin * dt; }
    let v = Math.hypot(r.vx, r.vz);
    const grip = ROCKS.grip * ROCKS.g * cos * dt;
    if (v <= grip) {
      r.vx = 0; r.vz = 0; v = 0;
      if (slope <= ROCKS.grip) { r.still = true; return; }
    } else {
      const k = Math.min(ROCKS.top, v - grip) / v;
      r.vx *= k; r.vz *= k; v *= k;
    }
    let x = r.x + r.vx * dt, z = r.z + r.vz * dt;
    // never nearer the line than `rest`: it stops there
    const out = (x - r.ox) * r.lx + (z - r.oz) * r.lz;
    if (Math.abs(out) < ROCKS.rest) {
      const push = (Math.sign(out) || 1) * ROCKS.rest - out;
      x += r.lx * push; z += r.lz * push;
      r.still = true;
    }
    // it turns as it rolls: about the level line square to its way, by its travel over its radius
    const dx = x - r.x, dz = z - r.z, d = Math.hypot(dx, dz);
    if (d > 1e-6) {
      spin.setFromAxisAngle(axis.set(dz / d, 0, -dx / d), d / r.radius);
      r.pivot.quaternion.premultiply(spin);
    }
    r.x = x; r.z = z;
    place(r);
  }
  return {
    group,
    update(f) {
      if (!f.on || f.legS === null) { hide(); return; }
      if (!started) start(f);
      // in steps of at most 1/30 s, so a long frame doesn't fling them
      const n = Math.max(1, Math.ceil(f.dt * 30)), dt = f.dt / n;
      for (const r of rocks) for (let k = 0; k < n; k++) roll(r, dt);
    },
    dispose: hide,
  };
}

// ---- the riders ----
// three outlaws on saddled horses (each seated with the humanoid clips' Sitting, parented to its horse's spine), racing
// the train on a track 25-35 m out at its speed less 1 m/s, so they slowly fall behind
const RIDERS = [
  { ds: 4, lateral: 27, colorway: 'canvas' },
  { ds: -2, lateral: 31, colorway: 'oilskin' },
  { ds: -7, lateral: 34, colorway: 'linen' },
];
const RIDE = { lag: 1, ahead: 6, tol: 6, offFor: 14 };
// an outlaw seated on a horse, riding its gallop (rides/crew.js); -> its clips (null: none), or null if it couldn't be had
async function seatRider(horse, kit, colorway, warn) {
  const rider = await crewFigure({ kit, warn }, { kitKey: 'west', key: 'outlaw-character', params: { colorway }, clip: 'Sitting', what: 'rider' });
  if (!rider) return null;
  seatOnHorse(rider.figure, horse);
  return rider.anim;
}

async function buildRiders({ leg, route, def, terrain, slicer, kit }) {
  const group = new THREE.Group();
  group.name = `riders ${leg}`;
  const side = sideOf(def, 1);
  const stretch = openStretch(route, terrain, side, [25, 35], def.s0, def.s1, RIDE.tol);
  if (!stretch) throw new Error('no open land beside the line for the riders');
  const lo = stretch.lo + Math.max(...RIDERS.map((r) => Math.abs(r.ds))), hi = stretch.hi - Math.max(...RIDERS.map((r) => Math.abs(r.ds)));
  const kind = await loadAnimal('saddled-horse-da86d3');
  const riders = [];
  for (const r of RIDERS) {
    await slicer.frame();
    const horse = kind.make();
    const anim = await seatRider(horse, kit, r.colorway, (what, err) => warnOut(what, def, leg, err));
    horse.object.visible = false;
    group.add(horse.object);
    riders.push({ ...r, horse, anim });
  }
  const ctx = { route, terrain, P: {} };
  let st = null;
  const hide = () => { st = null; for (const r of riders) r.horse.object.visible = false; };
  return {
    group,
    update(f) {
      if (!f.on || f.legS === null) { hide(); return; }
      const sgn = sgnOf(f.dir);
      st = paceStep(st, { legS: f.legS, dir: f.dir, v: f.train.v, dt: f.dt, lag: RIDE.lag, ahead: RIDE.ahead, lo, hi });
      const shown = st.mode === 'pace' || (st.mode === 'off' && st.t < RIDE.offFor);
      const clip = clipFor(st.speed, riders[0].horse.clips, HORSE);
      for (const r of riders) {
        r.horse.object.visible = shown;
        if (!shown) continue;
        placeBeside(r.horse.object, ctx, st.s + sgn * r.ds, side, r.lateral + st.away, sgn, st.heading);
        r.horse.play(clip.name, { timeScale: clip.timeScale });
        r.horse.update(f.dt);
        r.anim?.update(f.dt);
      }
    },
    dispose: hide,
  };
}

// ---- the wild horses ----
// eight, a loose herd 40-70 m out on the other side, galloping alongside at the train's speed, each weaving a little
const HERD = { count: 8, lateral: [40, 70], spread: 24, weave: 3, tol: 8, offFor: 14 };

async function buildHorses({ leg, route, def, terrain, slicer }) {
  const group = new THREE.Group();
  group.name = `horses ${leg}`;
  const side = sideOf(def, -1);
  const stretch = openStretch(route, terrain, side, HERD.lateral, def.s0, def.s1, HERD.tol);
  if (!stretch) throw new Error('no open land beside the line for the horses');
  const lo = stretch.lo + HERD.spread + HERD.weave, hi = stretch.hi - HERD.spread - HERD.weave;
  const kind = await loadAnimal('wild-horse-047e93');
  const herd = [];
  for (let i = 0; i < HERD.count; i++) {
    if (i % 2 === 0) await slicer.frame();
    const a = kind.make();
    a.object.visible = false;
    group.add(a.object);
    const [l0, l1] = HERD.lateral;
    herd.push({ a, ds: (Math.random() * 2 - 1) * HERD.spread, lateral: l0 + 4 + Math.random() * (l1 - l0 - 8), phase: Math.random() * 6.3, w: 0.3 + Math.random() * 0.3 });
  }
  const ctx = { route, terrain, P: {} };
  let st = null;
  const hide = () => { st = null; for (const h of herd) h.a.object.visible = false; };
  return {
    group,
    update(f) {
      if (!f.on || f.legS === null) { hide(); return; }
      const sgn = sgnOf(f.dir);
      st = paceStep(st, { legS: f.legS, dir: f.dir, v: f.train.v, dt: f.dt, lo, hi });
      const shown = st.mode === 'pace' || (st.mode === 'off' && st.t < HERD.offFor);
      const clip = clipFor(st.speed, herd[0].a.clips, HORSE);
      for (const h of herd) {
        h.a.object.visible = shown;
        if (!shown) continue;
        const wob = Math.sin(f.time * h.w + h.phase);
        placeBeside(h.a.object, ctx, st.s + sgn * (h.ds + HERD.weave * wob), side, h.lateral + HERD.weave * Math.cos(f.time * h.w * 0.7 + h.phase) + st.away, sgn, st.heading);
        h.a.play(clip.name, { timeScale: clip.timeScale });
        h.a.update(f.dt);
      }
    },
    dispose: hide,
  };
}

// ---- the cattle ----
// five cows standing about on your line at the reaction's `at` (within 4 m of its centre), idling; once it lets them go
// they amble off to the land side, 25 m out, walking. They're clear of the train before the guard lets it on (react.js:
// `leaving` 0.6), and then amble on at their own pace; one first seen already let go (the horn sounded before they came
// into view, or the place passed) is seen there already
const COWS = [
  { ds: -3.5, dl: -1.2, yaw: 0.4 }, { ds: -1, dl: 1.6, yaw: 2.2 }, { ds: 1.5, dl: -2.6, yaw: -1.1 },
  { ds: 3.5, dl: 0.4, yaw: 3.0 }, { ds: 0.5, dl: -0.2, yaw: -2.4 },
];
const HERD_OFF = { side: -1, out: 25, amble: 1.6, clearBy: 0.55, clear: 3.5, walk: 1.2 };

async function buildCattle({ leg, route, def, terrain, slicer }) {
  const group = new THREE.Group();
  group.name = `cattle ${leg}`;
  const lane = laneOf(leg), at = def.react.at.out;
  const kind = await loadAnimal('cow-base');
  const P = {}, cows = [];
  for (const [i, c] of COWS.entries()) {
    if (i % 2 === 0) await slicer.frame();
    const a = kind.make();
    a.object.visible = false;
    group.add(a.object);
    // where it stands on the line, and the spot it ambles off to
    const s = at + c.ds, l0 = lane + c.dl, l1 = HERD_OFF.side * (HERD_OFF.out + c.dl * 2);
    herdPath(route, s, 1, l0, P);
    const from = new THREE.Vector3(P.x, 0, P.z);
    herdPath(route, s + c.ds, 1, l1, P);
    const to = new THREE.Vector3(P.x, 0, P.z);
    const span = from.distanceTo(to);
    // how far along its way it must be to stand `clear` metres off your line's centre, clear of the train
    const need = span * Math.min(1, Math.max(0, (lane + HERD_OFF.side * HERD_OFF.clear - l0) / (l1 - l0)));
    cows.push({ a, from, to, span, need, yaw: c.yaw, p: 0, walking: false });
  }
  let seen = false, leaving = 0;
  const pos = new THREE.Vector3();
  const hide = () => { seen = false; leaving = 0; for (const c of cows) { c.a.object.visible = false; c.p = 0; } };
  return {
    group,
    update(f) {
      if (!f.on) { hide(); return; }
      // on the line until the reaction lets them go (a jump passing them: already off); no word yet, as they were
      if (f.react) leaving = f.react.on ? 0 : f.react.leaving;
      for (const c of cows) {
        const before = c.p;
        if (leaving === 0) c.p = 0;
        else {
          c.p = Math.min(c.span, Math.max(c.p + HERD_OFF.amble * f.dt, c.need * Math.min(1, leaving / HERD_OFF.clearBy), seen ? 0 : c.span * leaving));
        }
        const moved = (c.p - before) / Math.max(f.dt, 1e-3);
        pos.lerpVectors(c.from, c.to, c.span > 0 ? c.p / c.span : 1);
        c.a.object.position.set(pos.x, terrain.heightAt(pos.x, pos.z), pos.z);
        c.a.object.rotation.y = leaving > 0 && c.p < c.span ? Math.atan2(c.to.x - c.from.x, c.to.z - c.from.z) : c.yaw;
        c.a.object.visible = true;
        const walking = leaving > 0 && c.p < c.span && seen;
        c.a.play(walking ? 'Walk' : 'Idle', { timeScale: walking ? Math.min(2, Math.max(0.6, moved / HERD_OFF.walk)) : 1 });
        c.a.update(f.dt);
      }
      seen = true;
    },
    dispose: hide,
  };
}

// ---- the tumbleweeds ----
// six, blown across the line ahead of the train by a steady wind from the left, rolling as they go with a hop now and
// then; each one that's crossed (or that the train has passed) is sent back upwind ahead of it, while there's open land
const WEEDS = {
  count: 6, wind: 5, gust: 1.2, along: 0.8, from: 32, to: -38, ahead: [50, 170], hop: 0.35, tol: 8,
};

async function buildTumbleweeds({ leg, route, def, terrain, slicer, kit }) {
  const group = new THREE.Group();
  group.name = `tumbleweeds ${leg}`;
  const up = sideOf(def, 1);   // the side the wind comes from
  const stretch = openStretch(route, terrain, up, [WEEDS.from], def.s0, def.s1, WEEDS.tol);
  if (!stretch) throw new Error('no open land beside the line for the tumbleweeds');
  const weeds = [], box = new THREE.Box3(), c = new THREE.Vector3();
  for (let i = 0; i < WEEDS.count; i++) {
    await slicer.frame();
    let obj;
    // (Polyfork's tumbleweed in its HD edition when HD is on: owner, 2026-11-22)
    try { obj = await hdAsset(TUMBLEWEED, { diameter: 0.5 + 0.6 * (i / (WEEDS.count - 1)), arrangement: 1 + (i % 8), colorway: i % 2 ? 'desert-straw' : 'sun-bleached' }); } catch (err) {
      warnOut('tumbleweed', def, leg, err);
      continue;
    }
    box.setFromObject(obj).getCenter(c);
    const radius = Math.max(0.2, (box.max.y - box.min.y) / 2);
    obj.position.sub(c);
    const pivot = new THREE.Group();
    pivot.add(obj);
    pivot.visible = false;
    group.add(pivot);
    weeds.push({ pivot, radius, s: 0, l: 0, v: 0, phase: Math.random() * 6.3, live: false });
  }
  if (!weeds.length) throw new Error('no tumbleweeds could be made');
  const P = {}, axis = new THREE.Vector3(), spin = new THREE.Quaternion();
  // sent back upwind, ahead of the front (on the way it's going), if that's still on open land
  const respawn = (w, f) => {
    const sgn = sgnOf(f.dir), [a, b] = WEEDS.ahead;
    const s = f.legS + sgn * (a + Math.random() * (b - a));
    w.live = s >= stretch.lo && s <= stretch.hi;
    w.pivot.visible = w.live;
    Object.assign(w, { s, l: WEEDS.from + Math.random() * 10, v: WEEDS.wind * (0.8 + Math.random() * 0.4) });
  };
  let started = false;
  const hide = () => { started = false; for (const w of weeds) { w.pivot.visible = false; w.live = false; } };
  return {
    group,
    update(f) {
      if (!f.on || f.legS === null) { hide(); return; }
      const sgn = sgnOf(f.dir);
      if (!started) {
        // the first lot spread across their way already
        for (const w of weeds) { respawn(w, f); w.l = WEEDS.to + Math.random() * (WEEDS.from - WEEDS.to); }
        started = true;
      }
      for (const w of weeds) {
        // blown across (and a little along, gusting); back upwind once across, or once the train has gone by it
        const behind = (w.s - f.legS) * sgn < -20;
        if (!w.live || w.l < WEEDS.to || behind) { respawn(w, f); if (!w.live) continue; }
        const gust = 1 + WEEDS.gust * 0.25 * Math.sin(f.time * 1.3 + w.phase);
        const dl = -w.v * gust * f.dt, ds = WEEDS.along * Math.sin(f.time * 0.4 + w.phase) * f.dt;
        w.l += dl; w.s += ds;
        herdPath(route, w.s, up, w.l, P);
        const hop = WEEDS.hop * Math.abs(Math.sin(f.time * 2.2 + w.phase)) * w.radius;
        w.pivot.position.set(P.x, terrain.heightAt(P.x, P.z) + w.radius + hop, P.z);
        // rolling across the line: about the line's own direction (up x its way), by its travel over its radius
        axis.set(Math.sin(P.yaw), 0, Math.cos(P.yaw)).multiplyScalar(up);
        spin.setFromAxisAngle(axis, -dl / w.radius);
        w.pivot.quaternion.premultiply(spin);
      }
    },
    dispose: hide,
  };
}

// ---- the stagecoach ----
// a frontier stagecoach drawn by two saddled horses on a dirt road 30 m out, at 9 m/s the way the train is going: set off
// when the event starts so the train draws level with it about the road's middle; it pulls up at the road's end
const COACH = { ...CANYON_COACH, speed: 9, road: 4, colour: '#9c7d57' };
const dirtMat = new THREE.MeshStandardMaterial({ color: COACH.colour, roughness: 1, flatShading: true, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 });

async function buildStagecoach({ leg, route, def, terrain, slicer, kit }) {
  const group = new THREE.Group();
  group.name = `stagecoach ${leg}`;
  const side = sideOf(def, -1);
  const road = openStretch(route, terrain, side, [COACH.lateral], def.s0, def.s1, COACH.tol);
  if (!road) throw new Error('no open land beside the line for the stagecoach road');
  const P = {};

  // the road: a strip on the land along its stretch, laid on the land as it's drawn (it crosses the stagecoach ride's
  // road near its end, where the land is cut for that road's bench: a strip sampled only at its edges sank into the
  // bench's cut), under the ride's road where they cross
  {
    const pos = [], idx = [], n = Math.ceil(road.hi - road.lo), ACROSS = [-COACH.road / 2, -COACH.road / 4, 0, COACH.road / 4, COACH.road / 2], m = ACROSS.length;
    herdPath(route, road.lo, side, COACH.lateral, P);
    const o = { x: P.x, z: P.z };
    for (let k = 0; k <= n; k++) {
      const s = road.lo + (road.hi - road.lo) * k / n;
      for (const d of ACROSS) {
        herdPath(route, s, side, COACH.lateral + d, P);
        pos.push(P.x - o.x, Math.max(terrain.heightAt(P.x, P.z), drawnGround(terrain, P.x, P.z)) + 0.04, P.z - o.z);
      }
      if (k) for (let j = 0; j < m - 1; j++) { const a = (k - 1) * m + j; idx.push(a, a + 1, a + m, a + 1, a + m + 1, a + m); }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setIndex(idx);
    geo.computeVertexNormals();
    // wound face-up whichever side it's on
    if (geo.attributes.normal.getY(0) < 0) { for (let i = 0; i < idx.length; i += 3) [idx[i + 1], idx[i + 2]] = [idx[i + 2], idx[i + 1]]; geo.setIndex(idx); geo.computeVertexNormals(); }
    const strip = new THREE.Mesh(geo, dirtMat);
    strip.position.set(o.x, 0, o.z);
    strip.name = 'stagecoach road';
    strip.receiveShadow = true;
    strip.userData.own = true;
    group.add(strip);
  }

  await slicer.frame();
  const coach = await kit('west', 'stagecoach', { colorway: 'saloon-red', load: 'baggage' });
  const rig = new THREE.Group();   // the coach, facing its +z (its pair stand on their own, ahead of it)
  rig.add(coach);
  const wheels = ['wheel-fl', 'wheel-fr', 'wheel-rl', 'wheel-rr'].map((n) => coach.getObjectByName(n)).filter(Boolean).map((w) => {
    const b = new THREE.Box3().setFromObject(w);
    return { w, r: Math.max(0.2, (b.max.y - b.min.y) / 2) };
  });
  // its pair, abreast ahead of it (CANYON_COACH.pair), standing on the land under their own hooves
  const team = new THREE.Group(), PAIR = COACH.pair;
  team.rotation.order = 'YXZ';
  let pair = [];
  await slicer.frame();
  try {
    const kind = await loadAnimal('saddled-horse-da86d3');
    pair = [-1, 1].map((x) => {
      const h = kind.make();
      h.object.position.set(x * PAIR.x, 0, 0);
      team.add(h.object);
      return h;
    });
  } catch (err) { warnOut('coach horses', def, leg, err); }
  rig.visible = false; team.visible = false;
  rig.rotation.order = 'YXZ';   // (turned to its way, then pitched and rolled to the land)
  group.add(rig, team);

  const mid = (road.lo + road.hi) / 2, ctx = { route, terrain, P }, stand = { y: 0, pitch: 0, roll: 0 }, standPair = { y: 0, pitch: 0, roll: 0 };
  let s = null;
  const hide = () => { s = null; rig.visible = false; team.visible = false; };
  return {
    group,
    update(f) {
      if (!f.on || f.legS === null) { hide(); return; }
      const sgn = sgnOf(f.dir), start = sgn > 0 ? road.lo : road.hi, end = sgn > 0 ? road.hi : road.lo;
      if (s === null) {
        // set off so the train, at its speed now, comes level with it about the road's middle (from the road's start if
        // the train is slow or already past the middle)
        const v = Math.max(0, f.train.v), gap = (mid - f.legS) * sgn;
        s = v > COACH.speed && gap > 0 ? mid - sgn * COACH.speed * gap / v : start;
        s = Math.min(road.hi, Math.max(road.lo, s));
      }
      const before = s;
      s = sgn > 0 ? Math.min(end, s + COACH.speed * f.dt) : Math.max(end, s - COACH.speed * f.dt);
      const v = Math.abs(s - before) / Math.max(f.dt, 1e-3);
      rig.visible = true;
      placeBeside(rig, ctx, s, side, COACH.lateral, sgn);
      // (stood on the land under its wheels, pitched and rolled to it: its lane crosses the stagecoach ride's road near
      // the Wild West, down one bank of the bench cut for it and up the other)
      standOnGround(terrain.heightAt, rig.position.x, rig.position.z, rig.rotation.y, COACH.wheels, stand);
      rig.position.y = stand.y;
      rig.rotation.x = -stand.pitch;
      rig.rotation.z = stand.roll;
      // and its pair ahead of it on its way, on the land under their hooves
      const yaw = rig.rotation.y, tx = rig.position.x + Math.sin(yaw) * PAIR.z, tz = rig.position.z + Math.cos(yaw) * PAIR.z;
      standOnGround(terrain.heightAt, tx, tz, yaw, PAIR.feet, standPair);
      team.visible = true;
      team.position.set(tx, standPair.y, tz);
      team.rotation.set(-standPair.pitch, yaw, standPair.roll);
      for (const { w, r } of wheels) w.rotation.x += v * f.dt / r;
      const clip = clipFor(v, pair[0]?.clips ?? [], HORSE);
      for (const h of pair) { h.play(clip.name, { timeScale: clip.timeScale }); h.update(f.dt); }
    },
    dispose: hide,
  };
}

export const canyon = {
  snow: buildSnow, rockfall: buildRockfall, riders: buildRiders, horses: buildHorses, cattle: buildCattle,
  tumbleweeds: buildTumbleweeds, stagecoach: buildStagecoach,
};
