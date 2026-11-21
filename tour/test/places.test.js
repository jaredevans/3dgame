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

// Walking through the town. Without kits in Node, the town is the place's footprint (and its extra parts), each with a
// few metres round it; a station is its platforms and its forecourt beside them on the town's side, with its building
// standing in it. A walk from one platform to the other may go only there, and must pass through the town: a town
// behind its stations, or across a line from one of them, has no such walk.
const TOWN_MARGIN = 6, EXTRA_REACH = 6;
const stubPlace = (def, terrain) => {
  const f = footprint(def);
  return { def, blocked: () => null, onLand: (x, z) => f.outside(x, z) === 0, groundAt: (x, z) => terrain.heightAt(x, z) };
};
// the middle of a station's platform on its town side
function platformMiddle(st) {
  const r = legRoute(st.leg), w = platformWindow(r.length, st.end, st.platformLength), lane = laneOf(st.leg);
  return r.offsetAt((w.sFrom + w.sTo) / 2, Math.sign(lane) * 5.75);
}

// breadth first on a 2 m grid, from the middle of one platform to the middle of the other, through the town.
// def: the place's data (PLACES[id], or a variant of it)
export function walkThroughTown(def) {
  const terrain = worldTerrain(), f = footprint(def);
  const stations = def.stations.map((st) => stationWalk(st.leg, st.end, { platformLength: st.platformLength, building: true }));
  const world = makeWalkWorld({ place: stubPlace(def, terrain), termini: stations.map((walk) => ({ walk })), terrain, seaLevel: SEA_LEVEL, radius: def.walkRadius ?? 75 });
  const extras = (def.extras ?? []).map((e) => f.toWorld(e.x, e.z));
  const town = (x, z) => f.outside(x, z) <= TOWN_MARGIN || extras.some(([ex, ez]) => Math.hypot(x - ex, z - ez) <= EXTRA_REACH);
  const station = (x, z) => stations.some((w) => w.platformY(x, z) !== null || w.forecourt(x, z));
  const ok = (x, z) => (town(x, z) || station(x, z)) && world.inBounds(x, z) && !world.blocked(x, z, BODY);
  const [a, b] = def.stations.map(platformMiddle);
  if (!ok(a.x, a.z) || !ok(b.x, b.z)) return { ok: false, why: 'a platform middle is not walkable' };
  const STEP = 2, key = (i, j, t) => `${i},${j},${t}`, seen = new Set([key(0, 0, 0)]), queue = [[0, 0, 0]];
  let reachedTown = false, reachedOther = false;
  for (let q = 0; q < queue.length && queue.length < 400000; q++) {
    const [i, j, t] = queue[q], x = a.x + i * STEP, z = a.z + j * STEP;
    if (Math.hypot(x - b.x, z - b.z) <= STEP) { reachedOther = true; if (t) return { ok: true, cells: queue.length }; }
    for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = x + di * STEP, nz = z + dj * STEP;
      if (!ok(nx, nz) || !ok(x + di * STEP / 2, z + dj * STEP / 2)) continue;
      const nt = t || (town(nx, nz) ? 1 : 0), k = key(i + di, j + dj, nt);
      if (seen.has(k)) continue;
      reachedTown ||= nt === 1;
      seen.add(k); queue.push([i + di, j + dj, nt]);
    }
  }
  return { ok: false, why: reachedTown ? 'the town does not lead on to the other platform' : reachedOther ? 'the platforms meet without passing the town' : 'the town is not reached from the platform' };
}

for (const id of ['ocean', 'mountain', 'west']) {
  test(`a walk exists between the two stations, through the town: ${PLACES[id].name}`, () => {
    assert.ok(PLACES[id].size, `${PLACES[id].name} has no footprint to walk through`);
    const r = walkThroughTown(PLACES[id]);
    assert.ok(r.ok, `no way on foot through ${PLACES[id].name} between its stations: ${r.why}`);
  });
}

// the check fails where it should: towns put where travelling on would not take you through them
const moved = (id, centre) => ({ ...PLACES[id], centre });
test('no walk through a town that stands past one station\'s buffers', () => {
  // Mountain beyond the end of the climb, east of its buffers and north of the Canyon Express's
  assert.equal(walkThroughTown(moved('mountain', { x: 2690, z: 560 })).ok, false);
});
test('no walk through a town across a line from one of its stations', () => {
  // Mountain north of the climb's last stretch, its arrival platform's far side
  assert.equal(walkThroughTown(moved('mountain', { x: 2470, z: 470 })).ok, false);
  // Mountain east of the Canyon Express's line, its departure platform's far side
  assert.equal(walkThroughTown(moved('mountain', { x: 2700, z: 720 })).ok, false);
  // Oceanside east of the line to the Mountain, its departure platform's far side
  assert.equal(walkThroughTown(moved('ocean', { x: 2060, z: -150 })).ok, false);
});
test('no walk through a town that stands back from both its stations', () => {
  // Mountain 120 m further from both lines: its footprint no longer meets either forecourt
  assert.equal(walkThroughTown(moved('mountain', { x: 2420, z: 760 })).ok, false);
});
// the Wild West: its town where the walk from the Canyon Express's platform to the bullet train's would not pass through it
const NOT_REACHED = 'the town is not reached from the platform';
test('no walk through the Wild West put across a line, past the buffers or back from its stations', () => {
  assert.ok(PLACES.west.size, 'the Wild West has no footprint to move');
  for (const [what, centre] of [
    ['east of the Canyon Express\'s line, its arrival platform\'s far side', { x: 3090, z: 1900 }],
    ['south of the bullet\'s line, its departure platform\'s far side', { x: 2900, z: 2110 }],
    ['past the end of both lines, beyond the buffers', { x: 3060, z: 2060 }],
    ['set back 170 m from both lines, in the hills to the north-west', { x: 2830, z: 1830 }],
  ]) {
    const r = walkThroughTown(moved('west', centre));
    assert.equal(r.ok, false, `a walk was found through the Wild West ${what}`);
    assert.equal(r.why, NOT_REACHED, what);
  }
});
