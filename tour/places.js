// A place: its kit built with buildKit(), put where world-data says, with walking and ground queries in world space.
import * as THREE from 'three';
import { kitModule, part } from './parts.js';
import { kitUrl, KIT_BASE } from './config.js';
import { PLACES, EXTRA_REACH } from './world-data.js';
import { landSampler, LAND_MIN } from './land.js';

export async function buildPlace(id) {
  const def = PLACES[id];
  const { buildKit } = await kitModule(def.kit, 'kit.mjs');
  const folder = new URL(kitUrl(def.kit, '', KIT_BASE), location.href).href;
  const kitPlace = await buildKit({ folder, ...def.build });
  const group = new THREE.Group();
  group.name = `place ${id}`;
  group.add(kitPlace.group);
  group.position.set(def.centre.x, def.y, def.centre.z);
  group.rotation.y = def.rot;
  group.updateMatrixWorld(true);

  const c = Math.cos(def.rot), s = Math.sin(def.rot);
  const toLocal = (x, z) => { const dx = x - def.centre.x, dz = z - def.centre.z; return [dx * c - dz * s, dx * s + dz * c]; };
  const toWorld = (lx, lz) => [def.centre.x + lx * c + lz * s, def.centre.z - lx * s + lz * c];

  const b = kitPlace.bounds;
  const landMin = def.landMin ?? LAND_MIN;
  // the kit's ground at a point: a ray cast, so the last answer is kept (the walker asks about the same point several
  // times a step: is it land, is it in bounds, how high is it)
  let lastX = NaN, lastZ = NaN, lastG = null;
  const ground = (lx, lz) => {
    if (lx !== lastX || lz !== lastZ) { lastX = lx; lastZ = lz; lastG = kitPlace.groundAt(lx, lz); }
    return lastG;
  };
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
  // in the town: on its land, or on the ground round one of its extra parts (Oceanside's seafront)
  const inTown = (x, z) => onLand(x, z) || extraSpots.some(([ex, ez]) => Math.hypot(x - ex, z - ez) <= EXTRA_REACH);
  return {
    id, def, group, kitPlace, patch, land, toLocal, toWorld, extras,
    blocked(x, z, r) {
      const [lx, lz] = toLocal(x, z);
      const hit = kitPlace.blocked(lx, lz, r);
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
      return extras;
    },
    groundAt(x, z) { const [lx, lz] = toLocal(x, z); return def.y + (ground(lx, lz) ?? 0); },
    onLand, inTown,
    contains(x, z, margin = 0) {
      const [lx, lz] = toLocal(x, z);
      return lx >= b.min.x - margin && lx <= b.max.x + margin && lz >= b.min.z - margin && lz <= b.max.z + margin;
    },
    tick(t) { kitPlace.tick?.(t); },
    dispose() {
      for (const e of extras) e.removeFromParent();
      group.removeFromParent();
      group.traverse((o) => { o.geometry?.dispose(); [].concat(o.material ?? []).forEach((m) => m.dispose()); });
    },
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
    worst = Math.max(worst, Math.abs(place.groundAt(x, z) - terrain.heightAt(x, z)));
  }
  return worst;
}
