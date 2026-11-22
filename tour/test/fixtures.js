// What the tests share of the world measured or stood in for outside Node: the towns' towers (measured in the page)
// and a place's footprint (its kit's land, stood in for without kits). One copy, so a re-measure reaches every test.
// Defines no tests of its own.

// the towers and the kit's own parked fliers in each town, in its kit's frame (measured in the page): x, z, r (how far
// out from its middle it reaches), from and top (metres over the town's ground)
export const TOWERS = {
  future: [
    { x: -2, z: -52, r: 11.3, from: 0, top: 41 },                                            // the monolith tower
    { x: -56, z: -8, r: 5.7, from: 0, top: 31 }, { x: -48, z: -8, r: 5.7, from: 0, top: 31 },   // the capsule towers
    { x: -40, z: -30, r: 8.5, from: 0, top: 25 }, { x: -40, z: -18, r: 8.5, from: 0, top: 25 }, // the slab blocks
    { x: 0, z: 46, r: 5.7, from: 0, top: 21 }, { x: -23, z: 45, r: 5.7, from: 0, top: 21 },    // the vertical farms
    { x: -12, z: 46, r: 9, from: 25, top: 29 },                                               // the sky bridges
    { x: 40, z: -24, r: 11.3, from: 0, top: 14 },                                             // the depot
    { x: 26, z: -40, r: 2.7, from: 53, top: 55 }, { x: -24, z: -30, r: 3.4, from: 47, top: 49 }, // parked up high
    { x: -24, z: 38, r: 2.7, from: 40, top: 41 }, { x: 14, z: 44, r: 6, from: 44, top: 45 },
    { x: -24, z: 0, r: 2.7, from: 16, top: 17 }, { x: -24, z: 26, r: 2.7, from: 16, top: 18 },
    { x: 38, z: 50, r: 2.7, from: 13, top: 15 }, { x: 38, z: 32, r: 2.7, from: 15, top: 17 },
  ],
  city: [-36, -20, 12].map((z) => ({ x: -52, z, r: 5.7, from: 0, top: 32 })).concat(
    [[-12, 12], [-28, 36], [24, -36], [44, -36], [44, 36]].map(([x, z]) => ({ x, z, r: 5.7, from: 0, top: 32 }))),
};

// a place's footprint: its `size` rectangle, centred `offset` (kit metres) from the kit's origin, turned by `rot`
// (as places.js turns the kit: local (lx, lz) is world (x + lx cos + lz sin, z - lx sin + lz cos))
export function footprint(p) {
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
