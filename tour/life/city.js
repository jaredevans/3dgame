// Downtown City's living things (owner, 2026-11-23): its hot dog carts kept off the street. The kit's city generator
// stands them in the road; each is moved to the nearest spot where it stands wholly on the pavement (its sidewalks and
// plazas), clear of everything else, its vendor (one stood within VENDOR m of it) moved with it. (The kit keeps them
// out of its merged meshes for this: world-data.js `keep`.)
import * as THREE from 'three';

const PAVED = new Set(['tile-sidewalk', 'tile-plaza']);
const CART = { r: 1.1, reach: 14, step: 0.5 }, VENDOR = 3;

// the nearest spot to (x, z), out to CART.reach, where a cart (CART.r round) stands wholly on the pavement and clear of
// everything: -> [x, z] or null
export function pavedSpot(kp, x, z) {
  const ok = (px, pz) => [[0, 0], [CART.r, 0], [-CART.r, 0], [0, CART.r], [0, -CART.r]].every(([dx, dz]) => PAVED.has(kp.surfaceAt(px + dx, pz + dz)))
    && !kp.blocked(px, pz, CART.r * 0.8);
  for (let r = CART.step; r <= CART.reach; r += CART.step) {
    const n = Math.max(8, Math.round((2 * Math.PI * r) / CART.step));
    for (let k = 0; k < n; k++) {
      const a = (k / n) * Math.PI * 2, px = x + Math.cos(a) * r, pz = z + Math.sin(a) * r;
      if (ok(px, pz)) return [px, pz];
    }
  }
  return null;
}

export async function buildCityLife({ place }) {
  const group = new THREE.Group();
  group.name = 'Downtown City life';
  const kp = place.kitPlace, carts = kp.of?.('prop-hotdog-cart') ?? [], vendors = [...(kp.of?.('char-vendor') ?? [])];
  if (!kp.surfaceAt) return { group, update() {} };
  for (const cart of carts) {
    const { x, z } = cart.position;
    if (PAVED.has(kp.surfaceAt(x, z))) continue;
    const spot = pavedSpot(kp, x, z);
    if (!spot) continue;
    const dx = spot[0] - x, dz = spot[1] - z;
    cart.position.x += dx; cart.position.z += dz;
    cart.position.y = kp.groundAt?.(cart.position.x, cart.position.z) ?? cart.position.y;
    const i = vendors.findIndex((v) => Math.hypot(v.position.x - x, v.position.z - z) <= VENDOR);
    if (i >= 0) {
      const v = vendors.splice(i, 1)[0];
      v.position.x += dx; v.position.z += dz;
      v.position.y = kp.groundAt?.(v.position.x, v.position.z) ?? v.position.y;
    }
  }
  return { group, update() {} };
}
