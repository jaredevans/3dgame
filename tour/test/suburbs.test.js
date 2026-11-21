// The Metro Glide's suburbs (suburbs.js), laid out on the world's own terrain: streets of houses either side of the line
// on both stretches, every piece clear of every line's swept path and track bed, of the river and of the places, on land,
// and standing on its ground (never floating, never sunk more than a little); the same layout every time.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { LEGS, PLACES, FEATURES, SEA_LEVEL, legRoute, worldTerrain } from '../world-data.js';
import { suburbLayout, corners, groundUnder, LAYOUT, CLEAR_LINE, CLEAR_RIVER, PLINTH } from '../suburbs.js';

const terrain = worldTerrain();
const layout = suburbLayout('future-city', terrain);
const route = legRoute('future-city');

// which stretch and side of the line a piece is on
function where(q) {
  let best = { d: Infinity, s: 0 };
  for (let s = 0; s <= route.length; s += 2) { const p = route.at(s), d = Math.hypot(q.x - p.x, q.z - p.z); if (d < best.d) best = { d, s }; }
  const p = route.at(best.s), left = (q.x - p.x) * Math.cos(p.yaw) - (q.z - p.z) * Math.sin(p.yaw);
  return { s: best.s, side: Math.sign(left), d: best.d };
}

test('the suburbs line both sides of the Metro Glide on both stretches', () => {
  assert.deepEqual(LEGS['future-city'].suburbs, [[200, 430], [780, 1800]]);
  const kinds = new Set(layout.map((q) => q.kind));
  for (const k of ['house', 'street', 'fence', 'tree', 'mailbox', 'car']) assert.ok(kinds.has(k), `no ${k}`);
  for (const [s0, s1] of LEGS['future-city'].suburbs) for (const side of [1, -1]) {
    const houses = layout.filter((q) => q.kind === 'house').map(where).filter((w) => w.s >= s0 - 20 && w.s <= s1 + 20 && w.side === side);
    const want = Math.floor((s1 - s0) / LAYOUT.lot);   // at least one row's worth, of the two rows' lots
    assert.ok(houses.length >= want, `${s0}..${s1}, side ${side}: ${houses.length} houses (want ${want})`);
  }
});

test('the same suburbs every time', () => {
  assert.deepEqual(suburbLayout('future-city', terrain), layout);
});

test("every piece keeps clear of every line, the river and the places, on land", () => {
  const lines = Object.keys(LEGS).map((id) => { const r = legRoute(id), pts = []; for (let s = 0; s <= r.length; s += 2) pts.push(r.at(s)); return { id, pts }; });
  const valleys = FEATURES.filter((f) => f.kind === 'valley' && f.water);
  for (const q of layout) {
    for (const [x, z] of [...corners(q), [q.x, q.z]]) {
      for (const l of lines) for (const p of l.pts) assert.ok(Math.hypot(x - p.x, z - p.z) >= CLEAR_LINE - 0.01, `a ${q.kind} ${Math.hypot(x - p.x, z - p.z).toFixed(1)} m from ${l.id}`);
      for (const v of valleys) {
        const dx = v.x1 - v.x0, dz = v.z1 - v.z0, u = Math.max(0, Math.min(1, ((x - v.x0) * dx + (z - v.z0) * dz) / (dx * dx + dz * dz)));
        assert.ok(Math.hypot(x - v.x0 - u * dx, z - v.z0 - u * dz) >= CLEAR_RIVER, `a ${q.kind} in the river's valley`);
      }
      assert.ok(terrain.heightAt(x, z) >= SEA_LEVEL + 1, `a ${q.kind} at the sea`);
      for (const [id, p] of Object.entries(PLACES)) {
        const d = Math.hypot(x - p.centre.x, z - p.centre.z), r = Math.hypot(...p.size) / 2;
        assert.ok(d >= r + 20, `a ${q.kind} ${(d - r).toFixed(0)} m from ${id}'s footprint`);
      }
    }
  }
});

test('every piece stands on its ground', () => {
  for (const q of layout) {
    if (q.kind === 'street' || q.kind === 'car') {
      // a tile or a car lies on the ground's slope: its corners within 15 cm of the ground (its local (u, v) rises
      // v sin pitch + u sin roll, as suburbs-mesh.js turns it)
      const sn = Math.sin(q.yaw), cs = Math.cos(q.yaw), a = q.along / 2, b = q.across / 2;
      for (const [u, v] of [[-a, -b], [a, -b], [a, b], [-a, b]]) {
        const y = q.y + 0.02 + v * Math.sin(q.pitch) + u * Math.sin(q.roll);
        const h = terrain.heightAt(q.x + u * cs + v * sn, q.z - u * sn + v * cs);
        assert.ok(Math.abs(y - h) <= 0.15, `a ${q.kind} ${(y - h).toFixed(2)} m off its ground`);
      }
      continue;
    }
    const g = groundUnder(q, terrain);
    if (q.kind === 'house') {
      // level on its plinth: its floor over all its ground, the plinth down below the lowest, no taller than PLINTH
      assert.ok(q.y >= g.hi, `a house sunk ${(g.hi - q.y).toFixed(2)} m`);
      assert.ok(q.plinth <= g.lo, `a house's plinth floats ${(q.plinth - g.lo).toFixed(2)} m`);
      assert.ok(q.y - q.plinth <= PLINTH + 0.2, `a ${(q.y - q.plinth).toFixed(2)} m plinth`);
      continue;
    }
    assert.ok(q.y <= g.lo + 1e-9, `a ${q.kind} floats ${(q.y - g.lo).toFixed(2)} m`);
    assert.ok(g.hi - q.y <= 0.6, `a ${q.kind} sunk ${(g.hi - q.y).toFixed(2)} m on its high side`);
  }
});

// two footprints overlap (separating axes of two rectangles)
function overlap(a, b) {
  const A = corners(a), B = corners(b);
  for (const poly of [A, B]) for (let i = 0; i < 4; i++) {
    const [x0, z0] = poly[i], [x1, z1] = poly[(i + 1) % 4], nx = z1 - z0, nz = x0 - x1;
    const proj = (P) => P.map(([x, z]) => x * nx + z * nz);
    const pa = proj(A), pb = proj(B);
    if (Math.max(...pa) <= Math.min(...pb) + 1e-6 || Math.max(...pb) <= Math.min(...pa) + 1e-6) return false;
  }
  return true;
}
test('no house stands on another, on the street, on a fence or on a car', () => {
  const houses = layout.filter((q) => q.kind === 'house'), solid = layout.filter((q) => ['street', 'fence', 'car', 'mailbox'].includes(q.kind));
  for (let i = 0; i < houses.length; i++) {
    for (let j = i + 1; j < houses.length; j++) assert.ok(!overlap(houses[i], houses[j]), 'two houses overlap');
    for (const o of solid) assert.ok(!overlap(houses[i], o), `a house on a ${o.kind}`);
  }
});

// the level crossing's road (actors/crossing.js) runs straight out from the line at the crossing, square to it: no
// house, fence, tree, mailbox or car on it (the street it meets runs on across it)
test('nothing but the street stands on the level crossing\'s road', async () => {
  const { EVENTS } = await import('../events.js');
  const { ROAD } = await import('../suburbs.js');
  const at = EVENTS['future-city'].find((e) => e.react?.kind === 'crossing').react.at.out;
  const p = route.at(at), fx = Math.sin(p.yaw), fz = Math.cos(p.yaw);
  for (const q of layout) {
    if (q.kind === 'street') continue;
    for (const [x, z] of [...corners(q), [q.x, q.z]]) {
      const along = (x - p.x) * fx + (z - p.z) * fz, across = (x - p.x) * fz - (z - p.z) * fx;
      assert.ok(Math.abs(along) >= ROAD.half || Math.abs(across) > ROAD.length, `a ${q.kind} on the crossing's road (${along.toFixed(1)}, ${across.toFixed(1)})`);
    }
  }
});
