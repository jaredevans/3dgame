// Off the cliffs on the Seaside Excursion's leg (owner, 2026-11-22): a pod of three humpbacks (whale-model.js) lying
// at the surface, blowing, arching and diving with their flukes up, and two of them breaching as the train comes up
// to their spot; nearer the director's shot of them (out at sea beyond them: events.js), three stingrays (Polyfork's)
// leaping out of the water in turn and somersaulting back in. Both swim slowly on along the coast while their event
// runs, and are hidden when it isn't. The sea is on the line's left heading out (+ lateral)
import * as THREE from 'three';
import { SEA_LEVEL } from '../world-data.js';
import { aheadOf } from '../events.js';
import { makeSpray } from '../rides/spray.js';
import { herdPath } from './paths.js';
import { loadAnimal } from './animals.js';
import { makeWhale } from './whale-model.js';
import { breachAt, breachSecs, swimAt, flipAt, FLIP } from './sea-moves.js';

const SEA = 1;
// each whale: how far along from the spot (m), how far out from the line, and how far into its round at the surface
const POD = [{ ds: -45, lateral: 272, phase: 9 }, { ds: 12, lateral: 300, phase: 0 }, { ds: 62, lateral: 322, phase: 5 }];
const SWIM = { speed: 1.2, stroke: 2.8, beat: 0.2, sway: 0.12 };   // m/s on along the coast; s a fluke stroke; radians
// the breaches: which whale, s after the first; cued as the train's front comes within CUE.near m of the spot, or
// CUE.secs s of it at its speed, whichever is further: the director's shot, cut 150 m out and held till the train's
// middle is past the spot (some 7 s at 100 km/h), sees both
const BREACHES = [{ k: 1, after: 0 }, { k: 0, after: 3.2 }];
const CUE = { near: 100, secs: 4.5 };
const SPOUT = { per: 70, up: [7, 11], out: [0.3, 1.1], hole: [0, 1.25, 3.6] };   // the blowhole, in the whale's frame
const SPLASH = { up: 160, down: 280, ray: 28 };
// the rays: how far out from the line (nearer the shot's camera than the whales), how far along each is from the spot
const RAYS = { lateral: 345, ds: [-14, 0, 13] };

async function buildWhales({ leg, route, def, slicer }) {
  const group = new THREE.Group();
  group.name = `whales ${leg}`;
  const at = def.spot.at;
  const pod = [];
  for (const w of POD) {
    await slicer.frame();
    const m = makeWhale();
    m.object.visible = false;
    group.add(m.object);
    pod.push({ ...w, m, lastT: null, lastY: -10, done: false });
  }
  await slicer.frame();
  const spray = makeSpray({ count: 1200, size: 1.1, life: 2, gravity: 6, name: 'whale spray', floor: SEA_LEVEL - 0.5 });
  spray.points.visible = false;
  group.add(spray.points);
  const P = {}, B = {}, S = {}, hole = new THREE.Vector3();
  let cueAt = null;
  const hide = () => {
    cueAt = null;
    for (const w of pod) { w.m.object.visible = false; w.lastT = null; w.lastY = -10; w.done = false; }
  };
  return {
    group,
    update(f) {
      if (!f.on || f.legS === null) { hide(); spray.update(f.dt ?? 0); return; }
      const t = f.on.t;
      if (cueAt === null && aheadOf(f.legS, at, f.dir) <= Math.max(CUE.near, Math.abs(f.train.v) * CUE.secs)) cueAt = t;
      for (let k = 0; k < pod.length; k++) {
        const w = pod[k], o = w.m.object;
        herdPath(route, at + w.ds + SWIM.speed * t, SEA, w.lateral, P);
        let breach = false;
        if (cueAt !== null && !w.done) {
          for (const b of BREACHES) {
            if (b.k !== k) continue;
            const tb = t - cueAt - b.after;
            if (tb >= 0) { breachAt(tb, B); breach = B.on; if (!B.on) w.done = true; }
          }
        }
        let y, pitch, roll = 0, along = 0, under;
        if (breach) {
          y = B.y; pitch = B.pitch; roll = B.roll; along = B.along; under = false;
          if (w.lastY < -1.5 && y >= -1.5) spray.burst(P.x, SEA_LEVEL, P.z, SPLASH.up, [3, 8], [1, 4], 2.5);
          if (B.u > 0.5 && w.lastY > 0 && y <= 0) spray.burst(P.x + Math.sin(P.yaw) * along, SEA_LEVEL, P.z + Math.cos(P.yaw) * along, SPLASH.down, [4, 11], [2, 7], 4);
        } else {
          swimAt(t, w.phase, w.lastT, S);
          y = S.y; pitch = S.pitch; under = S.under || w.done;   // (one that has breached has gone down)
        }
        o.visible = !under;
        o.position.set(P.x + Math.sin(P.yaw) * along, SEA_LEVEL + y, P.z + Math.cos(P.yaw) * along);
        o.rotation.set(-pitch, P.yaw, roll, 'YXZ');
        w.m.flukes.rotation.x = Math.sin((2 * Math.PI * t) / SWIM.stroke + w.phase) * SWIM.beat;
        for (const [i, fl] of w.m.flippers.entries()) fl.rotation.x = Math.sin(t * 0.9 + w.phase + i) * SWIM.sway;
        if (!breach && !under && S.blow) {
          o.updateMatrixWorld();
          hole.set(...SPOUT.hole).applyMatrix4(o.matrixWorld);
          spray.burst(hole.x, hole.y, hole.z, SPOUT.per, SPOUT.up, SPOUT.out, 0.3);
        }
        w.lastT = t; w.lastY = y;
      }
      spray.points.visible = true;
      spray.update(f.dt);
    },
    dispose() { hide(); spray.dispose(); },
  };
}

async function buildRays({ leg, route, def, slicer }) {
  const group = new THREE.Group();
  group.name = `rays ${leg}`;
  const at = def.spot.at;
  await slicer.frame();
  const kind = await loadAnimal('stingray-base');
  const rays = RAYS.ds.map((ds) => {
    const a = kind.make();
    a.object.visible = false;
    a.play('Swim fast', { fade: 0 });
    group.add(a.object);
    return { ds, a, air: false };
  });
  const spray = makeSpray({ count: 160, size: 0.5, life: 0.9, gravity: 9.8, name: 'ray spray' });
  spray.points.visible = false;
  group.add(spray.points);
  const P = {}, L = {};
  const hide = () => { for (const r of rays) { r.a.object.visible = false; r.air = false; } };
  return {
    group,
    update(f) {
      if (!f.on || f.legS === null) { hide(); spray.update(f.dt ?? 0); return; }
      const t = f.on.t;
      for (let i = 0; i < rays.length; i++) {
        const r = rays[i], o = r.a.object;
        herdPath(route, at + r.ds + FLIP.drift * t, SEA, RAYS.lateral, P);
        flipAt(t, i, rays.length, L);
        if (r.air && !L.air) spray.burst(P.x, SEA_LEVEL, P.z, SPLASH.ray, [2, 4.5], [0.4, 1.8], 0.5);
        if (!r.air && L.air) spray.burst(P.x, SEA_LEVEL, P.z, SPLASH.ray / 2, [1.5, 3], [0.3, 1.2], 0.4);
        r.air = L.air;
        o.visible = L.air;
        o.position.set(P.x, SEA_LEVEL + L.y, P.z);
        o.rotation.set(-L.pitch, P.yaw, 0, 'YXZ');
        r.a.update(f.dt);
      }
      spray.points.visible = true;
      spray.update(f.dt);
    },
    dispose() { hide(); spray.dispose(); },
  };
}

// the whales' event plays both: the pod, and the rays (left out, warned, if the stingray can't be had)
async function buildSeaLife(ctx) {
  const whales = await buildWhales(ctx);
  let rays = null;
  try { rays = await buildRays(ctx); } catch (err) { console.warn(`The stingrays off the cliffs were left out: ${err?.url ?? err?.message ?? err}`); }
  if (rays) whales.group.add(rays.group);
  return {
    group: whales.group,
    update(f) { whales.update(f); rays?.update(f); },
    dispose() { whales.dispose(); rays?.dispose(); },
  };
}

export const sea = { whales: buildSeaLife };
