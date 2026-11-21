// The places against the lines, from the data alone (no kits in Node): each kit's footprint keeps clear of every line
// and its platforms, and you can walk from one of a place's stations to the other.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { LEGS, PLACES, BUILT, SEA_LEVEL, legRoute, laneOf, platformWindow, worldTerrain } from '../world-data.js';
import { stationWalk } from '../station-walk.js';
import { makeWalkWorld } from '../walk-world.js';
import { BODY } from '../walk.js';

// a place's footprint: its `size` rectangle, centred `offset` (kit metres) from the kit's origin, turned by `rot`
// (as places.js turns the kit: local (lx, lz) is world (x + lx cos + lz sin, z - lx sin + lz cos))
function footprint(p) {
  const c = Math.cos(p.rot), s = Math.sin(p.rot), [ox, oz] = p.offset ?? [0, 0];
  const toWorld = (lx, lz) => [p.centre.x + lx * c + lz * s, p.centre.z - lx * s + lz * c];
  const toLocal = (x, z) => { const dx = x - p.centre.x, dz = z - p.centre.z; return [dx * c - dz * s, dx * s + dz * c]; };
  const hx = p.size[0] / 2, hz = p.size[1] / 2;
  return {
    toWorld,
    // how far a world point lies outside the rectangle (0 inside it)
    outside(x, z) { const [lx, lz] = toLocal(x, z); return Math.hypot(Math.max(0, Math.abs(lx - ox) - hx), Math.max(0, Math.abs(lz - oz) - hz)); },
  };
}

const CLEAR = 10;   // from a line's centre: its swept path (lanes ±2, trains 3.2 m wide) and its platforms (out to 8 m), and 2 m

test('every built place has a footprint', () => {
  for (const id of BUILT) assert.ok(PLACES[id].size, `${id} has no size`);
});

test("no place's footprint, nor any of its extra parts, comes onto a line or its platforms", () => {
  for (const [id, p] of Object.entries(PLACES)) {
    if (!p.size) continue;
    const f = footprint(p);
    for (const leg of Object.keys(LEGS)) {
      const r = legRoute(leg);
      let worst = Infinity, at = null;
      for (let s = 0; s <= r.length; s += 2) {
        const q = r.at(s), d = f.outside(q.x, q.z);
        if (d < worst) { worst = d; at = s; }
        for (const e of p.extras ?? []) {
          const [x, z] = f.toWorld(e.x, e.z), de = Math.hypot(x - q.x, z - q.z);
          assert.ok(de >= CLEAR, `${id}'s ${e.key} is ${de.toFixed(1)} m from ${leg} at s=${s}`);
        }
      }
      assert.ok(worst >= CLEAR, `${id}'s footprint comes ${worst.toFixed(1)} m from ${leg}'s centre at s=${at}`);
    }
  }
});

// a place as the walker sees it, without its kit: its footprint is its land, at the land's height, nothing solid
const stubPlace = (id, terrain) => {
  const p = PLACES[id], f = footprint(p);
  return { def: p, blocked: () => null, onLand: (x, z) => f.outside(x, z) === 0, groundAt: (x, z) => terrain.heightAt(x, z) };
};
// the middle of a station's platform on its town side
function platformMiddle(st) {
  const r = legRoute(st.leg), w = platformWindow(r.length, st.end, st.platformLength), lane = laneOf(st.leg);
  return r.offsetAt((w.sFrom + w.sTo) / 2, Math.sign(lane) * 5.75);
}

// breadth first on a 2 m grid, from the middle of one platform to the middle of the other
function walkBetween(id) {
  const terrain = worldTerrain(), p = PLACES[id];
  const termini = p.stations.map((st) => ({ walk: stationWalk(st.leg, st.end, { platformLength: st.platformLength }) }));
  const world = makeWalkWorld({ place: stubPlace(id, terrain), termini, terrain, seaLevel: SEA_LEVEL, radius: p.walkRadius ?? 75 });
  const [a, b] = p.stations.map(platformMiddle);
  const ok = (x, z) => world.inBounds(x, z) && !world.blocked(x, z, BODY);
  assert.ok(ok(a.x, a.z), `${id}: the ${p.stations[0].role} platform's middle is not walkable`);
  assert.ok(ok(b.x, b.z), `${id}: the ${p.stations[1].role} platform's middle is not walkable`);
  const STEP = 2, key = (i, j) => `${i},${j}`, seen = new Set([key(0, 0)]), queue = [[0, 0]];
  for (let q = 0; q < queue.length && queue.length < 200000; q++) {
    const [i, j] = queue[q], x = a.x + i * STEP, z = a.z + j * STEP;
    if (Math.hypot(x - b.x, z - b.z) <= STEP) return { steps: queue.length };
    for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const k = key(i + di, j + dj), nx = x + di * STEP, nz = z + dj * STEP;
      if (seen.has(k) || !ok(nx, nz) || !ok(x + di * STEP / 2, z + dj * STEP / 2)) continue;
      seen.add(k); queue.push([i + di, j + dj]);
    }
  }
  return null;
}

for (const id of ['ocean', 'mountain']) {
  test(`a walk exists between the two stations: ${PLACES[id].name}`, () => {
    assert.ok(walkBetween(id), `no way on foot between ${PLACES[id].name}'s stations`);
  });
}
