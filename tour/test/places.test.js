// The places against the lines, from the data alone (no kits in Node): each kit's footprint keeps clear of every line
// and its platforms, and you can walk from one of a place's stations to the other.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { LEGS, PLACES, BUILT, SEA_LEVEL, EXTRA_REACH, legRoute, laneOf, platformWindow, worldTerrain, legBuilt } from '../world-data.js';
import { stationWalk } from '../station-walk.js';
import { STATION_STYLES } from '../station-style.js';
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

// Walking through the town, in the page's own walk world (makeWalkWorld and each station's stationWalk, as main.js
// builds them), with the stations the page builds: those on its built legs (world-data legBuilt), none stood in for.
// Without kits in Node, the town's land is the place's footprint rectangle, no margin; a station's building stands in it
// where buildTerminus puts it. From the middle of one town-side platform to the other there must be a way on foot, and
// every such way must cross the town's land: none goes round it, past the buffer ends or along the lines.
const stubPlace = (def, terrain) => {
  const f = footprint(def), spots = (def.extras ?? []).map((e) => f.toWorld(e.x, e.z));
  const onLand = (x, z) => f.outside(x, z) === 0;
  // the town: its land, and the ground round its extra parts (Oceanside's seafront), as places.js has it
  const inTown = (x, z) => onLand(x, z) || spots.some(([ex, ez]) => Math.hypot(x - ex, z - ez) <= EXTRA_REACH);
  return { def, blocked: () => null, onLand, inTown, groundAt: (x, z) => terrain.heightAt(x, z) };
};
// the middle of a station's platform on its town side
function platformMiddle(st) {
  const r = legRoute(st.leg), w = platformWindow(r.length, st.end, st.platformLength), lane = laneOf(st.leg);
  return r.offsetAt((w.sFrom + w.sTo) / 2, Math.sign(lane) * 5.75);
}
export const ROUND_THE_TOWN = 'a way between the stations goes round the town', NO_WAY = 'no way between the stations through the town';
export const ONE_STATION = 'only one of its stations is built';
// def: the place's data (PLACES[id], or a variant of it)
export function walkThroughTown(def) {
  const terrain = worldTerrain(), place = stubPlace(def, terrain);
  // the station building stood in from the place's station style (its footprint)
  const building = STATION_STYLES[def.station ?? 'countryside'].building;
  const built = def.stations.filter((st) => legBuilt(st.leg));
  if (built.length < 2) return { ok: false, why: ONE_STATION };
  const termini = built.map((st) => ({ walk: stationWalk(st.leg, st.end, { platformLength: st.platformLength, building }) }));
  const world = makeWalkWorld({ place, termini, terrain, seaLevel: SEA_LEVEL });
  const ok = (x, z) => world.inBounds(x, z) && !world.blocked(x, z, BODY);
  const [a, b] = def.stations.map(platformMiddle);
  if (!ok(a.x, a.z) || !ok(b.x, b.z)) return { ok: false, why: 'a platform middle is not walkable' };
  // breadth first on a 2 m grid from a to b, stepping only where `may` allows (and through the half step between)
  const reaches = (may) => {
    const STEP = 2, seen = new Set(['0,0']), queue = [[0, 0]];
    for (let q = 0; q < queue.length && queue.length < 400000; q++) {
      const [i, j] = queue[q], x = a.x + i * STEP, z = a.z + j * STEP;
      if (Math.hypot(x - b.x, z - b.z) <= STEP) return true;
      for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = x + di * STEP, nz = z + dj * STEP, k = `${i + di},${j + dj}`;
        if (seen.has(k) || !may(nx, nz) || !may(x + di * STEP / 2, z + dj * STEP / 2)) continue;
        seen.add(k); queue.push([i + di, j + dj]);
      }
    }
    return false;
  };
  if (reaches((x, z) => ok(x, z) && !place.inTown(x, z))) return { ok: false, why: ROUND_THE_TOWN };
  if (!reaches(ok)) return { ok: false, why: NO_WAY };
  return { ok: true };
}

for (const id of ['city', 'ocean', 'mountain', 'west', 'future']) {
  test(`a walk exists between the two stations, through the town: ${PLACES[id].name}`, () => {
    assert.ok(PLACES[id].size, `${PLACES[id].name} has no footprint to walk through`);
    const r = walkThroughTown(PLACES[id]);
    assert.ok(r.ok, `no way on foot through ${PLACES[id].name} between its stations: ${r.why}`);
  });
}

test("a station's approach runs from its town-side platform to the town's land, and no further", () => {
  const def = PLACES.mountain, place = stubPlace(def, worldTerrain()), st = def.stations[0];   // the climb's arrival
  const walk = stationWalk(st.leg, st.end, { platformLength: st.platformLength }), r = legRoute(st.leg);
  const w = platformWindow(r.length, st.end, st.platformLength), town = Math.sign(laneOf(st.leg)), mid = (w.sFrom + w.sTo) / 2;
  const reach = walk.rays(place.inTown), at = (s, across) => { const q = r.offsetAt(s, town * across); return walk.townSide(q.x, q.z, reach); };
  // out from the platform's middle to the land, which begins within the approach's reach
  let land = null;
  for (let a = 3.5; a <= 100 && land === null; a += 0.5) { const q = r.offsetAt(mid, town * a); if (place.onLand(q.x, q.z)) land = a; }
  assert.ok(land !== null, 'the land is not out from the platform');
  assert.ok(at(mid, 5.75) && at(mid, land - 1), 'the platform and the ground between it and the land');
  assert.equal(at(mid, -5.75), false, 'the far platform');
  assert.equal(at(w.sTo + 3, 10), false, 'past the buffer end of the platform');
  assert.equal(at(w.sFrom - 3, 10), false, 'past the other end of the platform');
  assert.equal(at(mid, land + 30), false, 'beyond the land, out from the platform');
});

test("a town set back in the corner between its two platforms is still crossed, not gone round", () => {
  // Oceanside turned 10°: its land's corner stands back from both lines, where the lines out from the two platforms
  // to the land would meet off it, round the town
  for (const deg of [190, 200]) {
    const r = walkThroughTown({ ...PLACES.ocean, rot: deg * Math.PI / 180 });
    assert.ok(r.ok, `Oceanside turned to ${deg}°: ${r.why}`);
  }
});

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
  // Mountain 120 m further from both lines: no line out from either platform meets its land
  assert.equal(walkThroughTown(moved('mountain', { x: 2420, z: 760 })).ok, false);
});
// the Wild West: its town where the walk from the Canyon Express's platform to the bullet train's would not pass through it
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
    assert.ok([ROUND_THE_TOWN, NO_WAY].includes(r.why), `${what}: ${r.why}`);
  }
});
// the Futuristic place: its town where the walk from the bullet's platform to the Metro Glide's would not pass through it
test('no walk through the Futuristic place put across a line, past the buffers or back from its stations', () => {
  assert.ok(PLACES.future.size, 'the Futuristic place has no footprint to move');
  for (const [what, centre] of [
    ['north of the bullet\'s line, its arrival platform\'s far side', { x: -1050, z: 1420 }],
    ['west of the Metro Glide\'s line, its departure platform\'s far side', { x: -1250, z: 1085 }],
    ['past the end of both lines, beyond the buffers', { x: -1260, z: 1330 }],
    ['set back some 100 m further from both lines, to the south-east', { x: -932, z: 1145 }],
  ]) {
    const r = walkThroughTown(moved('future', centre));
    assert.equal(r.ok, false, `a walk was found through the Futuristic place ${what}`);
    assert.ok([ROUND_THE_TOWN, NO_WAY].includes(r.why), `${what}: ${r.why}`);
  }
});
// Downtown City: its streets where the walk from the Metro Glide's platform (north) to the Seaside Excursion's (south)
// would not pass through them
test('no walk through Downtown City put across a line, past the buffers or back from its stations', () => {
  for (const [what, centre] of [
    ['south of the Seaside Excursion\'s line, its departure platform\'s far side', { x: 128, z: 80 }],
    ['north of the Metro Glide\'s line, its arrival platform\'s far side', { x: 128, z: -230 }],
    ['west, past the Seaside Excursion\'s buffers and the Metro Glide\'s platform\'s open end', { x: -60, z: -74 }],
    ['east, past the Metro Glide\'s buffers and the Seaside Excursion\'s platform\'s open end', { x: 330, z: -74 }],
  ]) {
    const r = walkThroughTown(moved('city', centre));
    assert.equal(r.ok, false, `a walk was found through Downtown City ${what}`);
    assert.ok([ROUND_THE_TOWN, NO_WAY].includes(r.why), `${what}: ${r.why}`);
  }
});
