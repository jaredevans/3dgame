// A place: its kit built with buildKit(), put where world-data says, with walking and ground queries in world space.
import * as THREE from 'three';
import { kitModule, part } from './parts.js';
import { kitUrl, KIT_BASE } from './config.js';
import { PLACES } from './world-data.js';

const LAND_MIN = -2;   // kit ground below this (local metres) is off its island: its underside, not land
const REACH = 50, CELL = 1;

// For a kit with its own (island) ground: on a 1 m grid round its origin, each cell's height at the nearest land and
// its distance from the land. Computed once when the place is built.
function landSampler(kitPlace) {
  const n = (2 * REACH) / CELL + 1, H = new Float32Array(n * n), D = new Float32Array(n * n), landCells = [];
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
    const g = kitPlace.groundAt(-REACH + i * CELL, -REACH + j * CELL);
    if (g != null && g >= LAND_MIN) { landCells.push(j * n + i); H[j * n + i] = g; D[j * n + i] = 0; } else D[j * n + i] = Infinity;
  }
  for (let k = 0; k < n * n; k++) {
    if (D[k] === 0) continue;
    const i = k % n, j = (k - i) / n;
    let best = Infinity, bh = 0;
    for (const c of landCells) {
      const ci = c % n, cj = (c - ci) / n, d = (ci - i) ** 2 + (cj - j) ** 2;
      if (d < best) { best = d; bh = H[c]; }
    }
    D[k] = Math.sqrt(best) * CELL; H[k] = bh;
  }
  const edge = landCells.filter((c) => { const i = c % n; return [c - 1, c + 1, c - n, c + n].some((k) => k >= 0 && k < n * n && D[k] > 0) && i > 0 && i < n - 1; })
    .map((c) => [-REACH + (c % n) * CELL, -REACH + Math.floor(c / n) * CELL]);
  return {
    edge,
    sample(lx, lz) {
      const i = Math.round((lx + REACH) / CELL), j = Math.round((lz + REACH) / CELL);
      if (i < 0 || j < 0 || i >= n || j >= n) return null;
      const k = j * n + i;
      return D[k] === 0 ? { h: kitPlace.groundAt(lx, lz) ?? H[k], d: 0 } : { h: H[k], d: D[k] };
    },
  };
}

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
  const land = kitPlace.terrain ? landSampler(kitPlace) : null;
  // the kit's own ground as a terrain patch, blended out from the edge of its land
  const patch = land ? { x: def.centre.x, y: def.y, z: def.centre.z, rot: def.rot, drop: 0.15, sample: land.sample } : null;

  const extras = [], extraBoxes = [];
  return {
    id, def, group, kitPlace, patch, land, toLocal, toWorld, extras,
    blocked(x, z, r) {
      const [lx, lz] = toLocal(x, z);
      const hit = kitPlace.blocked(lx, lz, r);
      if (hit) return hit;
      for (const e of extraBoxes) if (x > e.box.min.x - r && x < e.box.max.x + r && z > e.box.min.z - r && z < e.box.max.z + r) return e.key;
      return null;
    },
    // the extra parts round the composed place, stood on the finished terrain
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
    groundAt(x, z) { const [lx, lz] = toLocal(x, z); return def.y + (kitPlace.groundAt(lx, lz) ?? 0); },
    // standing on the kit's own ground: its island's land if it has one, else its footprint
    onLand(x, z) {
      const [lx, lz] = toLocal(x, z);
      if (land) { const r = land.sample(lx, lz); return !!r && r.d === 0 && (kitPlace.groundAt(lx, lz) ?? -Infinity) >= LAND_MIN; }
      return lx >= b.min.x && lx <= b.max.x && lz >= b.min.z && lz <= b.max.z;
    },
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
