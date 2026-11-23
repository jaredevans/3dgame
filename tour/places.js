// A place: its kit built with buildKit(), put where world-data says, with walking and ground queries in world space.
import * as THREE from 'three';
import { kitModule, kitModuleHref, urlModule, urlModuleHref, part } from './parts.js';
import { kitUrl, KIT_BASE, KIT_CDN } from './config.js';
import { PLACES, EXTRA_REACH } from './world-data.js';
import { landSampler, LAND_MIN } from './land.js';
import { groundIndex } from './kit-ground.js';
import { buildWalkway } from './walkways.js';

// the kit's ground as a lookup (kit-ground.js), in its own frame: the same heights its groundAt() casts a ray for, from
// its terrain's triangles, each wound as a ray from above would meet it. Off them all, the plain at its foot, as
// groundAt says.
function kitGround(kitPlace) {
  const root = kitPlace.group;
  root.updateWorldMatrix(true, true);
  const inv = new THREE.Matrix4().copy(root.matrixWorld).invert(), m = new THREE.Matrix4();
  const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3(), tris = [];
  kitPlace.terrain.traverse((o) => {
    if (!o.isMesh) return;
    const pos = o.geometry.attributes.position, idx = o.geometry.index, n = idx ? idx.count : pos.count;
    m.multiplyMatrices(inv, o.matrixWorld);
    // three.js tests a face's side in the mesh's own frame: a mirroring transform turns its winding over
    const side = [].concat(o.material)[0]?.side ?? THREE.FrontSide, flip = m.determinant() < 0;
    const at = (k, v) => v.fromBufferAttribute(pos, idx ? idx.getX(k) : k).applyMatrix4(m);
    for (let k = 0; k + 2 < n; k += 3) {
      at(k, a); at(k + 1, b); at(k + 2, c);
      if (side !== THREE.BackSide) tris.push(a.x, a.y, a.z, ...(flip ? [c.x, c.y, c.z, b.x, b.y, b.z] : [b.x, b.y, b.z, c.x, c.y, c.z]));
      if (side !== THREE.FrontSide) tris.push(a.x, a.y, a.z, ...(flip ? [b.x, b.y, b.z, c.x, c.y, c.z] : [c.x, c.y, c.z, b.x, b.y, b.z]));
    }
  });
  const index = groundIndex(tris), foot = kitPlace.groundAt(1e7, 1e7);   // far off the island: the plain at its foot
  return (lx, lz) => index.at(lx, lz) ?? foot;
}

// a place's download, apart from its build: every module its kit's buildKit() will import (its kit.mjs and helpers, its
// ground's terrain.mjs, and the part of each piece in its LAYOUT.json), at the URLs buildKit imports them by, so that
// when it's built (buildPlace, at a standstill) its kit is built from what's here, in one go, with nothing left to come
// in part-way through. onProgress() as each comes in. What doesn't load is left for buildKit to report (a folder kit
// goes on without a missing part).
export async function fetchPlace(id, { onProgress = () => {} } = {}) {
  const def = PLACES[id];
  if (KIT_CDN) return fetchCdnPlace(def, onProgress);
  const get = (file) => kitModule(def.kit, file).then(onProgress, onProgress);
  const helpers = ['kit.mjs', '_internal/merge.mjs', '_internal/stage.mjs', '_internal/clips.mjs', ...(def.build?.city ? ['_internal/city.mjs'] : [])];
  const res = await fetch(new URL(kitUrl(def.kit, 'LAYOUT.json'), location.href).href).catch(() => null);
  onProgress();
  const layout = res?.ok ? await res.json().catch(() => []) : [];
  const parts = new Set(layout.filter((r) => r?.part && r.part !== '_terrain').map((r) => r.part));
  const ground = layout.some((r) => r?.part === '_terrain') && !def.build?.city ? ['terrain.mjs'] : [];
  await Promise.all([...helpers, ...ground, ...[...parts].map((k) => `${k}.mjs`)].map(get));
}

// The same, for a kit built from the account CDN (config.js KIT_CDN): its layout there (each part's id and its ground's
// module with it), kept for its build, and each module by the URL buildKit({ base }) imports it by. A layout that can't be
// had is thrown (no folder to fall back on), naming the URL as a module's failure does
const cdnLayouts = new Map();   // kit id -> its CDN layout
const cdnHref = (file) => urlModuleHref(`${KIT_CDN}${file}`);
async function fetchCdnPlace(def, onProgress) {
  const url = kitUrl(def.kit, 'LAYOUT.json');
  const res = await fetch(url).catch((err) => ({ ok: false, statusText: err.message }));
  onProgress();
  if (!res.ok) throw Object.assign(new Error(`the kit's layout: ${res.status ?? ''} ${res.statusText ?? ''}`.trim()), { url });
  const data = await res.json();
  cdnLayouts.set(def.kit, data);
  const get = (load) => load.then(onProgress, onProgress);
  const ids = new Set(data.layout.filter((r) => r?.part && r.part !== '_terrain').map((r) => data.parts[r.part]?.id).filter(Boolean));
  const ground = data.terrain && !def.build?.city && data.layout.some((r) => r?.part === '_terrain') ? [data.terrain] : [];
  await Promise.all([
    get(kitModule(def.kit, 'kit.mjs')),
    ...(def.build?.city ? [get(kitModule(def.kit, 'city.mjs'))] : []),
    ...[...ground, ...[...ids].map((pid) => `${pid}.mjs`)].map((file) => get(urlModule(`${KIT_CDN}${file}`))),
  ]);
}

// what a walker runs into at the place, in the kit's frame: as the kit's own blocked() (its parts' convex outlines, those
// at least 0.45 m high, its loose props not), but for those of def.passable (low props he steps past or over) and
// def.decks (walked on: deckHeights) -> blocked(lx, lz, r) -> the part's key, or null
function solidParts(kitPlace, def) {
  const skip = new Set([...(def.passable ?? []), ...(def.decks ?? [])]);
  if (!skip.size || !kitPlace.boxes) return (lx, lz, r) => kitPlace.blocked(lx, lz, r);
  const solid = kitPlace.boxes({ minHeight: 0.45 }).filter((b) => b.low && !b.loose && !skip.has(b.key));
  return (x, z, radius) => {
    for (const b of solid) {
      if (x <= b.low.min.x - radius || x >= b.low.max.x + radius || z <= b.low.min.z - radius || z >= b.low.max.z + radius) continue;
      if (!b.hull) return b.key;
      let inside = true, near = Infinity;
      for (let i = 0; i < b.hull.length; i++) {
        const p = b.hull[i], q = b.hull[(i + 1) % b.hull.length], ex = q[0] - p[0], ez = q[1] - p[1], px = x - p[0], pz = z - p[1];
        if (ex * pz - ez * px < 0) inside = false;
        const t = Math.max(0, Math.min(1, (px * ex + pz * ez) / (ex * ex + ez * ez || 1)));
        near = Math.min(near, Math.hypot(px - ex * t, pz - ez * t));
      }
      if (inside || near < radius) return b.key;
    }
    return null;
  };
}

// the heights of the decks a walker walks on (def.decks: Oceanside's boardwalk and dune walkover), in the kit's frame,
// sampled once every DECK_STEP m over each by a ray straight down onto the kit (the place's group placed already; its
// parts are merged into a few meshes, so the first thing hit within the deck's own height, over its footprint) -> at(lx,
// lz) -> its deck's height there, or null off them
const DECK_STEP = 0.25;
function deckHeights(kitPlace, def, toWorld) {
  const keys = new Set(def.decks ?? []);
  if (!keys.size || !kitPlace.boxes) return () => null;
  const ray = new THREE.Raycaster(), down = new THREE.Vector3(0, -1, 0), from = new THREE.Vector3();
  const grids = [], objs = [kitPlace.group];
  for (const key of keys) {
    for (const b of kitPlace.boxes({ minHeight: 0 }).filter((x) => x.key === key)) {
      const lo = b.box.min.y + 0.3, hi = b.box.max.y + 0.05;
      const x0 = b.box.min.x, z0 = b.box.min.z, nx = Math.ceil((b.box.max.x - x0) / DECK_STEP) + 1, nz = Math.ceil((b.box.max.z - z0) / DECK_STEP) + 1;
      const h = new Float32Array(nx * nz).fill(NaN);
      for (let i = 0; i < nx; i++) {
        for (let j = 0; j < nz; j++) {
          const [wx, wz] = toWorld(x0 + i * DECK_STEP, z0 + j * DECK_STEP);
          ray.set(from.set(wx, def.y + b.box.max.y + 5, wz), down);
          for (const hit of ray.intersectObjects(objs, true)) {
            const y = hit.point.y - def.y;
            if (y <= hi && y >= lo) { h[j * nx + i] = y; break; }
          }
        }
      }
      grids.push({ x0, z0, nx, nz, h });
    }
  }
  return (lx, lz) => {
    let best = null;
    for (const g of grids) {
      const i = Math.round((lx - g.x0) / DECK_STEP), j = Math.round((lz - g.z0) / DECK_STEP);
      if (i < 0 || j < 0 || i >= g.nx || j >= g.nz) continue;
      const v = g.h[j * g.nx + i];
      if (!Number.isNaN(v) && (best === null || v > best)) best = v;
    }
    return best;
  };
}

// onProgress(): as each of its kit's parts comes in (most are in already, from fetchPlace), the last just before the kit
// is built in one go; one that throws stops the build before it begins
export async function buildPlace(id, { onProgress = null } = {}) {
  const def = PLACES[id];
  const { buildKit } = await kitModule(def.kit, 'kit.mjs');
  // where its kit is, and its parts by the URLs fetchPlace loaded them by (a fresh one for any given up on: parts.js
  // makeModules): its folder, by part key; or the account CDN, by part id, from the layout fetchPlace kept
  const from = KIT_CDN
    ? { base: KIT_CDN, kit: def.kit, data: cdnLayouts.get(def.kit), moduleUrl: (partId) => cdnHref(`${partId}.mjs`) }
    : { folder: new URL(kitUrl(def.kit, '', KIT_BASE), location.href).href, moduleUrl: (partId) => kitModuleHref(def.kit, `${partId}.mjs`) };
  if (KIT_CDN && !from.data) throw new Error(`${def.kit}: built before its layout was fetched`);
  const kitPlace = await buildKit({ ...from, ...def.build, onProgress: onProgress && (() => onProgress()) });
  const group = new THREE.Group();
  group.name = `place ${id}`;
  group.add(kitPlace.group);
  group.position.set(def.centre.x, def.y, def.centre.z);
  group.rotation.y = def.rot;
  group.updateMatrixWorld(true);
  // stage() lights the lamps of what stands directly in the scene (its userData.night), and the kit's own group is one
  // down, in ours: pass it on, so its windows, signs and lamps come on after dusk
  group.userData.night = (k) => kitPlace.night?.(k);

  const c = Math.cos(def.rot), s = Math.sin(def.rot);
  const toLocal = (x, z) => { const dx = x - def.centre.x, dz = z - def.centre.z; return [dx * c - dz * s, dx * s + dz * c]; };
  const toWorld = (lx, lz) => [def.centre.x + lx * c + lz * s, def.centre.z - lx * s + lz * c];

  const b = kitPlace.bounds;
  const landMin = def.landMin ?? LAND_MIN;
  // the kit's ground at a point, from its lookup; the last answer is kept (the walker asks about the same point several
  // times a step: is it land, is it in bounds, how high is it)
  let lastX = NaN, lastZ = NaN, lastG = null;
  const groundAt = kitPlace.terrain ? kitGround(kitPlace) : (lx, lz) => kitPlace.groundAt(lx, lz);
  const decks = deckHeights(kitPlace, def, toWorld);
  const ground = (lx, lz) => {
    if (lx !== lastX || lz !== lastZ) {
      lastX = lx; lastZ = lz; lastG = groundAt(lx, lz);
      const d = decks(lx, lz);
      if (d !== null && (lastG === null || d > lastG)) lastG = d;
    }
    return lastG;
  };
  const kitBlocked = solidParts(kitPlace, def);
  const land = kitPlace.terrain ? landSampler({ bounds: kitPlace.bounds, terrain: kitPlace.terrain, groundAt: ground }, landMin) : null;
  // the kit's own ground as a terrain patch, blended out from the edge of its land
  const patch = land ? { x: def.centre.x, y: def.y, z: def.centre.z, rot: def.rot, drop: 0.15, r: land.radius, sample: land.sample } : null;

  const extras = [], extraBoxes = [];
  const extraSpots = (def.extras ?? []).map((e) => toWorld(e.x, e.z));
  // standing on the kit's own ground: its island's land if it has one, else its footprint
  function onLand(x, z) {
    const [lx, lz] = toLocal(x, z);
    if (land) { const r = land.sample(lx, lz); return !!r && r.d === 0 && (ground(lx, lz) ?? -Infinity) >= landMin; }
    return lx >= b.min.x && lx <= b.max.x && lz >= b.min.z && lz <= b.max.z;
  }
  // in the town: on its land, or on the ground round one of its extra parts (Oceanside's seafront), or in its open
  // ground (def.roam: Oceanside's beach and seafront, in the kit's frame)
  const R = def.roam;
  const inRoam = (x, z) => { if (!R) return false; const [lx, lz] = toLocal(x, z); return lx >= R.x[0] && lx <= R.x[1] && lz >= R.z[0] && lz <= R.z[1]; };
  const inTown = (x, z) => onLand(x, z) || inRoam(x, z) || extraSpots.some(([ex, ez]) => Math.hypot(x - ex, z - ez) <= EXTRA_REACH);
  return {
    id, def, group, kitPlace, patch, land, toLocal, toWorld, extras,
    blocked(x, z, r) {
      const [lx, lz] = toLocal(x, z);
      const hit = kitBlocked(lx, lz, r);
      if (hit) return hit;
      for (const e of extraBoxes) if (x > e.box.min.x - r && x < e.box.max.x + r && z > e.box.min.z - r && z < e.box.max.z + r) return e.key;
      return null;
    },
    // the extra parts round the composed place, stood on the terrain (with this place's patch in it)
    async addExtras(terrain) {
      for (const e of def.extras ?? []) {
        const obj = await part(def.kit, e.key, e.params ?? {});
        const [x, z] = toWorld(e.x, e.z);
        obj.position.set(x, terrain.heightAt(x, z) + 0.15, z);
        obj.rotation.y = def.rot + (e.rot ?? 0);
        group.parent.add(obj);
        extras.push(obj);
        obj.updateMatrixWorld(true);
        const box = new THREE.Box3().setFromObject(obj);
        if (box.max.x - box.min.x > 0.6 || box.max.z - box.min.z > 0.6) extraBoxes.push({ key: e.key, box });
      }
      // its walkways (the City's path to the speedboat's jetty, Oceanside's jetty), on the land as it is now its patch is in
      for (const [i, w] of (def.walkways ?? []).entries()) {
        if (w.draw === false) continue;   // (Oceanside's dock: the pier is its deck)
        const obj = buildWalkway(w, terrain, `${def.name} walkway ${i + 1}`);
        group.parent.add(obj);
        extras.push(obj);
      }
      return extras;
    },
    groundAt(x, z) { const [lx, lz] = toLocal(x, z); return def.y + (ground(lx, lz) ?? 0); },
    onLand, inTown,
    contains(x, z, margin = 0) {
      const [lx, lz] = toLocal(x, z);
      return lx >= b.min.x - margin && lx <= b.max.x + margin && lz >= b.min.z - margin && lz <= b.max.z + margin;
    },
    tick(t) { kitPlace.tick?.(t); },
    // take it out of the scene, to be freed with whatever else is let go (dispose.js makeUnloader)
    dispose(unload) { unload.add(group, ...extras); },
  };
}

// the largest gap between a place's ground and the terrain, round the edge of its land (or its footprint)
export function seamCheck(place, terrain, n = 64) {
  let pts;
  if (place.land) {
    const e = place.land.edge, step = Math.max(1, Math.floor(e.length / n));
    pts = e.filter((_, i) => i % step === 0);
  } else {
    const b = place.kitPlace.bounds, hx = (b.max.x - b.min.x) / 2 * 0.98, hz = (b.max.z - b.min.z) / 2 * 0.98;
    pts = Array.from({ length: n }, (_, i) => {
      const t = (i / n) * 4, k = Math.floor(t), f = t - k;
      return [[-hx + 2 * hx * f, -hz], [hx, -hz + 2 * hz * f], [hx - 2 * hx * f, hz], [-hx, hz - 2 * hz * f]][k];
    });
  }
  let worst = 0;
  for (const [lx, lz] of pts) {
    const [x, z] = place.toWorld(lx, lz);
    // an island's ground at the rim point itself: turned out into the world and back (any turn but a right angle leaves
    // it a hair off), a point on the rim can read the island's underside instead
    const ground = place.land ? place.def.y + place.land.sample(lx, lz).h : place.groundAt(x, z);
    worst = Math.max(worst, Math.abs(ground - terrain.heightAt(x, z)));
  }
  return worst;
}
