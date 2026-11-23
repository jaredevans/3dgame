import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeWalkWorld, WALKWAY_DECK, vehicleBlocks, solidVehicles } from '../walk-world.js';
import { PLACES, SEA_LEVEL, legRoute, laneOf, platformWindow, worldTerrain } from '../world-data.js';
import { stationWalk } from '../station-walk.js';
import { findPath, PATH } from '../autopath.js';
import { footprint } from './fixtures.js';
import { rideSign, RIDE_SIGN } from '../wayfinding.js';
import { BODY } from '../walk.js';

// A place whose kit box (|x| < 20) is bigger than its land (|x| < 10): past its land, inside its box, the kit's
// ground is its island's underside at -10.5 — the Oceanside case.
const place = {
  def: { centre: { x: 0, z: 0 } },
  blocked: () => null,
  contains: (x, z, m = 0) => Math.abs(x) < 20 + m && Math.abs(z) < 20 + m,
  onLand: (x, z) => Math.abs(x) < 10 && Math.abs(z) < 10,
  groundAt: (x, z) => (Math.abs(x) < 10 && Math.abs(z) < 10 ? 1.2 : -10.5),
};
const terminus = { walk: { onTrack: () => false, rays: () => [], townSide: () => false, platformY: () => null, blocked: () => null } };
// land everywhere at +3, except the sea beyond x = 30
const terrain = { heightAt: (x) => (x > 30 ? -2 : 3) };
const world = makeWalkWorld({ place, termini: [terminus], terrain, seaLevel: 0 });

test('on the kit\'s land you stand on its ground', () => {
  assert.equal(world.heightAt(0, 0), 1.2);
});

test('inside the kit\'s box but off its land you stand on the terrain, not its underside', () => {
  assert.equal(world.heightAt(15, 0), 3);
});

test('off the town\'s land and away from its stations you may not walk', () => {
  assert.ok(world.inBounds(5, 5));
  assert.equal(world.inBounds(15, 0), false);
});

test('the sea is out of bounds, inside the box or out of it', () => {
  assert.equal(world.inBounds(35, 0), false);
  const seaInBox = makeWalkWorld({ place: { ...place, onLand: () => false }, termini: [{ walk: { ...terminus.walk, townSide: () => true } }], terrain: { heightAt: () => -0.3 }, seaLevel: 0 });
  assert.equal(seaInBox.inBounds(15, 0), false);
});

test('platforms and the track still rule near the station', () => {
  const station = { walk: { onTrack: (x) => x > 50, rays: () => [], townSide: () => true, platformY: (x) => (x > 40 && x <= 50 ? 4.2 : null), blocked: () => null } };
  const w = makeWalkWorld({ place, termini: [station], terrain, seaLevel: 0 });
  assert.equal(w.heightAt(45, 0), 4.2);
  assert.equal(w.inBounds(55, 0), false);
});

const land = { heightAt: () => 3 };
// a station along x = 100 (its track |z| < 3.6, platform 3.5 <= |z| <= 8 at 4.2 m) and another along z = 100
const stationAt = (axis, y) => {
  const along = (x, z) => (axis === 'x' ? x : z), across = (x, z) => Math.abs(axis === 'x' ? z : x);
  const near = (x, z) => Math.abs(along(x, z) - 100) <= 60;
  return { walk: {
    onTrack: (x, z) => near(x, z) && across(x, z) < 3.6,
    rays: () => [],
    townSide: (x, z) => near(x, z) && across(x, z) >= 3.5 && across(x, z) <= 30,
    platformY: (x, z) => (near(x, z) && across(x, z) >= 3.5 && across(x, z) <= 8 ? y : null),
    blocked: (x, z) => (Math.hypot(x - (axis === 'x' ? 100 : 12), z - (axis === 'x' ? 12 : 100)) < 2 ? `building ${axis}` : null),
  } };
};

test('a place\'s world merges both its stations', () => {
  const w = makeWalkWorld({ place, termini: [stationAt('x', 4.2), stationAt('z', 5.1)], terrain: land, seaLevel: 0, });
  assert.equal(w.heightAt(100, 5), 4.2, 'first station\'s platform');
  assert.equal(w.heightAt(5, 100), 5.1, 'second station\'s platform');
  assert.equal(w.inBounds(100, 0), false, 'first station\'s track');
  assert.equal(w.inBounds(0, 100), false, 'second station\'s track');
  assert.ok(w.inBounds(100, 20) && w.inBounds(20, 100), 'both stations\' approaches');
  assert.equal(w.blocked(100, 12, 0.35), 'building x');
  assert.equal(w.blocked(12, 100, 0.35), 'building z');
  assert.equal(w.inBounds(60, 60), false, 'between them, off the town\'s land');
});

test('a place with only one station built yet', () => {
  const w = makeWalkWorld({ place, termini: [stationAt('x', 4.2), undefined], terrain: land, seaLevel: 0, });
  assert.equal(w.heightAt(100, 5), 4.2);
  assert.equal(w.heightAt(5, 100), 3, 'no platform where the other station will be');
  assert.ok(w.inBounds(0, 100) === false && w.inBounds(100, 20));
  assert.equal(w.blocked(12, 100, 0.35), null);
});

// ---- a place's walkways (the City's path to the speedboat's jetty) ----

test('a walkway may have its own deck height (Oceanside\'s dock, 2.4 m over the sea), and one is in PLACES, not drawn', () => {
  const def = { centre: { x: 0, z: 0 }, walkways: [{ points: [{ x: 5, z: 0 }, { x: 40, z: 0 }], width: 3, deck: 2.4 }] };
  const w = makeWalkWorld({ place: { ...place, def }, termini: [terminus], terrain, seaLevel: 0 });
  assert.equal(w.heightAt(35, 0), 2.4);
  assert.equal(w.heightAt(20, 0), 3, 'the land, where it is higher');
  const dock = PLACES.ocean.walkways.find((x) => x.deck);
  assert.ok(dock && dock.draw === false && dock.deck === 2.4);
});

test('a walkway is in bounds along its strip, over the sea too (on its deck), and not 5 m off it', () => {
  // out from the town's land (|x| < 10) to x = 40, over the sea beyond x = 30
  const def = { centre: { x: 0, z: 0 }, walkways: [{ points: [{ x: 5, z: 0 }, { x: 40, z: 0 }], width: 3 }] };
  const w = makeWalkWorld({ place: { ...place, def }, termini: [terminus], terrain, seaLevel: 0 });
  for (const x of [12, 20, 29, 35, 39]) assert.ok(w.inBounds(x, 0) && w.inBounds(x, 1.4), `the walkway at x ${x}`);
  for (const x of [12, 20, 35]) assert.equal(w.inBounds(x, 5), false, `5 m off the walkway at x ${x}`);
  assert.equal(w.inBounds(43, 0), false, 'past its end');
  // its ground: the land's, and over the sea its deck, 1.2 m up
  assert.equal(w.heightAt(20, 0), 3);
  assert.equal(w.heightAt(35, 0), WALKWAY_DECK);
  assert.equal(w.heightAt(35, 5), -2, 'beside it, the sea');
  assert.equal(w.heightAt(0, 0), 1.2, 'in the town, its own ground');
});

// the City's stations as the page builds them for walking: each one's building, and the departure's board pointing the
// way to the speedboat (wayfinding.js rideSign), solid
const cityTermini = () => PLACES.city.stations.map((st) => ({ walk: stationWalk(st.leg, st.end, { platformLength: st.platformLength, building: true,
  solid: st.role === 'departure' ? [{ key: 'ride-sign', corners: rideSign('city').corners }] : [] }) }));
test('the City\'s arrival platform, and its departure across the town, to the speedboat\'s jetty are walks (the auto tour\'s planner, on its 0.5 m grid)', () => {
  const def = PLACES.city, f = footprint(def), terrainW = worldTerrain();
  const stub = { def, blocked: () => null, onLand: (x, z) => f.outside(x, z) === 0, groundAt: (x, z) => terrainW.heightAt(x, z) };
  const termini = cityTermini();
  const w = makeWalkWorld({ place: stub, termini, terrain: terrainW, seaLevel: SEA_LEVEL });
  const P = def.walkways[0].points, to = P[P.length - 1];
  for (const role of ['arrival', 'departure']) {
    const st = def.stations.find((s) => s.role === role), r = legRoute(st.leg), win = platformWindow(r.length, st.end, st.platformLength);
    const from = r.offsetAt((win.sFrom + win.sTo) / 2, Math.sign(laneOf(st.leg)) * 5.75);
    const it = findPath(w, from, to);
    let res;
    do res = it.next(); while (!res.done);
    assert.ok(res.value, `no way from the ${role} platform to the jetty`);
    const last = res.value.points[res.value.points.length - 1];
    assert.ok(Math.hypot(last.x - to.x, last.z - to.z) <= PATH.reach + 0.5);
    // and on every step of it, the walk world's ground: off the town, the walkway's level, never the sea
    for (const c of res.value.cells) assert.ok(w.heightAt(c.x, c.z) >= SEA_LEVEL + 1, `under the sea at ${c.x}, ${c.z}`);
  }
});

test('at Oceanside, from where the speedboat sets you down to the end of its jetty is a walk', () => {
  const def = PLACES.ocean, f = footprint(def), terrainW = worldTerrain();
  const stub = { def, blocked: () => null, onLand: (x, z) => f.outside(x, z) === 0, groundAt: (x, z) => terrainW.heightAt(x, z) };
  const termini = def.stations.map((st) => ({ walk: stationWalk(st.leg, st.end, { platformLength: st.platformLength, building: true }) }));
  const w = makeWalkWorld({ place: stub, termini, terrain: terrainW, seaLevel: SEA_LEVEL });
  const P = def.walkways[0].points, from = P[0], to = P[P.length - 1];
  const it = findPath(w, from, to);
  let res;
  do res = it.next(); while (!res.done);
  assert.ok(res.value, 'no way along the jetty');
  for (const c of res.value.cells) assert.ok(w.heightAt(c.x, c.z) >= SEA_LEVEL + 1, `under the sea at ${c.x}, ${c.z}`);
  assert.equal(w.heightAt(to.x, to.z), WALKWAY_DECK, 'its end is not on the deck');
});

test('the City\'s departure station signposts the speedboat: a board within 25 m of its platform\'s open end, on the approach off the platform, clear of the line and off the walk across the town', () => {
  const def = PLACES.city, sign = rideSign('city'), st = def.stations.find((x) => x.role === 'departure');
  assert.match(sign.text, /^Speedboat to Oceanside [↑↗→↘↓↙←↖]$/);
  for (const id of ['ocean', 'mountain', 'west', 'future']) assert.equal(rideSign(id), null, `${id} has a ride sign`);
  const r = legRoute(st.leg), win = platformWindow(r.length, st.end, st.platformLength), open = r.at(st.end === 'start' ? win.sTo : win.sFrom);
  assert.ok(Math.hypot(sign.x - open.x, sign.z - open.z) <= 25, 'the board is not by the platform\'s open end');
  // on the town-side approach, past the platform's edge (8 m out), and no nearer any line's centre than 9 m
  const f = footprint(def), inTown = (x, z) => f.outside(x, z) === 0;
  const walk = stationWalk(st.leg, st.end, { platformLength: st.platformLength });
  for (const [x, z] of sign.corners) {
    assert.ok(walk.townSide(x, z, walk.rays(inTown)), 'the board is off the approach');
    assert.equal(walk.platformY(x, z), null, 'the board is on the platform');
    for (const leg of ['city-ocean', 'future-city']) {
      const lr = legRoute(leg);
      let d = Infinity;
      for (let s = 0; s <= lr.length; s += 1) { const q = lr.at(s); d = Math.min(d, Math.hypot(q.x - x, q.z - z)); }
      assert.ok(d >= 9, `the board is ${d.toFixed(1)} m from ${leg}`);
    }
  }
  // the walk across the town (the auto tour's, arrival to departure) goes round it, and so does the way to the jetty
  const terrainW = worldTerrain();
  const stub = { def, blocked: () => null, onLand: inTown, groundAt: (x, z) => terrainW.heightAt(x, z) };
  const w = makeWalkWorld({ place: stub, termini: cityTermini(), terrain: terrainW, seaLevel: SEA_LEVEL });
  assert.ok(w.blocked(sign.x, sign.z, BODY), 'the board is not solid');
  const mid = (role) => { const s2 = def.stations.find((x) => x.role === role), r2 = legRoute(s2.leg), w2 = platformWindow(r2.length, s2.end, s2.platformLength);
    return r2.offsetAt((w2.sFrom + w2.sTo) / 2, Math.sign(laneOf(s2.leg)) * 5.75); };
  const it = findPath(w, mid('arrival'), mid('departure'));
  let res;
  do res = it.next(); while (!res.done);
  assert.ok(res.value, 'no way across the town past the board');
  assert.ok(RIDE_SIGN.out > 8.5);
});

// ---- the rides' vehicles (walk-world.js vehicleBlocks): solid over their footprints, turned as they stand ----
const standing = (x, z, yaw, foot) => ({ foot, holder: { position: { x, z }, rotation: { y: yaw } } });
const FOOT = { min: { x: -1, z: -2 }, max: { x: 1, z: 3 } };   // 2 m across, 5 m long, its origin 2 m from its tail

test('a vehicle is solid over its footprint, turned with its holder, and a body touches it within its radius', () => {
  const v = standing(10, 20, 0, FOOT);
  assert.ok(vehicleBlocks(v, 10, 20, 0.35), 'at its origin');
  assert.ok(vehicleBlocks(v, 10, 22.9, 0.35), 'by its nose');
  assert.ok(vehicleBlocks(v, 11.3, 20, 0.35), 'a body 0.3 m off its side');
  assert.equal(vehicleBlocks(v, 11.4, 20, 0.35), false, 'a body 0.4 m off its side');
  assert.equal(vehicleBlocks(v, 10, 23.4, 0.35), false, 'past its nose');
  // turned a quarter (yaw pi/2: its +z, its nose, along world +x; its +x, its left, along world -z)
  const q = standing(10, 20, Math.PI / 2, FOOT);
  assert.ok(vehicleBlocks(q, 12.9, 20, 0.35), 'its nose, turned');
  assert.equal(vehicleBlocks(q, 10, 22.9, 0.35), false, 'where its nose was');
  assert.ok(vehicleBlocks(q, 10, 18.8, 0.35), 'its left, turned');
});

test('the walk world takes the rides\' vehicles as solid, the ground round them still walkable', () => {
  const v = standing(0, 0, 0.7, FOOT);
  const w = makeWalkWorld({ place, termini: [terminus], terrain, seaLevel: 0, vehicles: [v] });
  assert.equal(w.blocked(0, 0, BODY), 'ride-vehicle');
  assert.equal(w.blocked(4, 4, BODY), null);
  assert.ok(w.inBounds(0, 0), 'its ground is still in bounds (a pad), only its body is solid');
  assert.equal(world.blocked(0, 0, BODY), null, 'none given, none solid');
});

test('a vehicle you already stand in lets you out (built round you), and is solid again once you\'re out of it', () => {
  const v = standing(0, 0, 0, FOOT), out = [];
  assert.deepEqual(solidVehicles([v], 0, 0, BODY, out), []);
  const same = solidVehicles([v], 5, 0, BODY, out);
  assert.equal(same, out, 'the same array each time');
  assert.deepEqual(same, [v]);
  // walking: from inside you may step out (nothing solid), from outside you can't step in
  const inside = makeWalkWorld({ place, termini: [terminus], terrain, seaLevel: 0, vehicles: solidVehicles([v], 0.5, 0, BODY, []) });
  assert.equal(inside.blocked(0.9, 0, BODY), null);
  const outside = makeWalkWorld({ place, termini: [terminus], terrain, seaLevel: 0, vehicles: solidVehicles([v], 1.5, 0, BODY, []) });
  assert.equal(outside.blocked(1.3, 0, BODY), 'ride-vehicle');
});
