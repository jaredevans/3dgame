// The tour's world: places, legs and the land between them, in metres. Pure data (plus a terrain factory), no three.js.
// Ring order: city -> ocean -> mountain -> west -> future -> city. Phase 1 builds city and ocean and the leg between.
// The sea lies to the -z side of the coast; heading +x along the coast, the sea is on your left.
import { makeRoute } from './route.js';
import { makeTerrain } from './terrain.js';
import { KITS } from './config.js';

export const TRACK_CENTRES = 4;
export const laneFor = (dir) => (dir === 'out' ? -TRACK_CENTRES / 2 : TRACK_CENTRES / 2);
export const SEA_LEVEL = 0;

export const RING = {
  places: ['city', 'ocean', 'mountain', 'west', 'future'],
  legs: ['city-ocean', 'ocean-mountain', 'mountain-west', 'west-future', 'future-city'],
};

// centre: where the place's kit is put (its own origin), turned by rot; ground: the station's level (= its line end)
export const PLACES = {
  city: { name: 'Downtown City', kit: KITS.city, centre: { x: -50, z: 0 }, y: 8, rot: 0, ground: 8, size: [172, 140],
    build: { city: { seed: 11, blocks: [2, 2] } },
    stations: [{ leg: 'city-ocean', end: 'start', role: 'departure', platformLength: 120 }] },
  // the coast kit's beach is at its own y = 0 and its sea lies to its +z: turned half round so the sea faces -z, and
  // raised 1.2 m so its shoreline meets our sea level. The station is behind its dunes at 3 m.
  ocean: { name: 'Oceanside', kit: KITS.ocean, centre: { x: 2012, z: -176 }, y: 1.2, rot: Math.PI, ground: 3, size: [44, 50],
    build: {},
    // more of the seafront east of the composed place, in the kit's own frame (world east is its -x, the sea its +z)
    extras: [
      ...[-24, -28, -32, -36, -40].map((x, i) => ({ key: 'beach-hut', params: { colorway: ['coral', 'sky', 'mint', 'buttermilk', 'coral'][i] }, x, z: -5.6 })),
      ...[-24, -34, -44, -54, -64].map((x) => ({ key: 'lamp-post', x, z: -10.5 })),
      { key: 'bandstand', x: -54, z: -2, rot: 0 },
      { key: 'cafe-kiosk', x: -46, z: 4 }, { key: 'ice-cream-kiosk', x: -62, z: 5 },
      ...[-28, -38, -58].map((x) => ({ key: 'parasol', x, z: 9 })),
      ...[-29.5, -39.5].map((x) => ({ key: 'deck-chair', x, z: 10, rot: Math.PI })),
      ...[-30, -50].map((x) => ({ key: 'promenade-bench', x, z: -12 })),
      { key: 'litter-bin', x: -42, z: -12.5 },
    ],
    stations: [{ leg: 'city-ocean', end: 'end', role: 'arrival', platformLength: 120 }] },
};

export const LEGS = {
  'city-ocean': {
    from: 'city', to: 'ocean', train: 'cityOcean',
    // out of the city's east side, up onto the cliff tops above the sea, and down into Oceanside.
    // The first and last 120 m are straight and level: the platforms.
    points: [
      { x: 70, y: 8, z: 0 }, { x: 190, y: 8, z: 0 }, { x: 330, y: 8.5, z: -15 }, { x: 520, y: 10.5, z: -70 },
      { x: 720, y: 14.5, z: -150 }, { x: 920, y: 18, z: -200 }, { x: 1120, y: 18.6, z: -215 }, { x: 1320, y: 14.4, z: -205 },
      { x: 1500, y: 10.4, z: -175 }, { x: 1640, y: 7.3, z: -152 }, { x: 1760, y: 4.6, z: -140 }, { x: 1840, y: 3, z: -138 },
      { x: 1960, y: 3, z: -138 },
    ],
  },
};

// the coast: sea on the left of travel; top = land height at the edge; kind 1 = cliff, 0 = beach
export const COAST = {
  points: [
    { x: -900, z: -420, top: 9, kind: 0.4 }, { x: 100, z: -330, top: 10, kind: 0.5 }, { x: 500, z: -210, top: 14, kind: 0.7 },
    { x: 720, z: -215, top: 12.5, kind: 1 }, { x: 920, z: -262, top: 16.5, kind: 1 }, { x: 1120, z: -278, top: 16.5, kind: 1 },
    { x: 1320, z: -268, top: 12.5, kind: 1 }, { x: 1500, z: -238, top: 9, kind: 1 }, { x: 1660, z: -215, top: 6, kind: 0.8 },
    { x: 1820, z: -200, top: 3.5, kind: 0.3 }, { x: 1960, z: -192, top: 1.5, kind: 0 }, { x: 2160, z: -192, top: 1.5, kind: 0 },
    { x: 2360, z: -265, top: 11, kind: 0.6 }, { x: 3200, z: -380, top: 16, kind: 0.9 },
  ],
};

export function legRoute(id) { return makeRoute(LEGS[id].points); }

// the flat ground a terminus needs: the platform side of its line end, out to the station building
export function stationPads() {
  const pads = [];
  for (const place of Object.values(PLACES)) for (const st of place.stations) {
    const r = legRoute(st.leg), s0 = st.end === 'start' ? 0 : r.length, dir = st.end === 'start' ? 1 : -1;
    const mid = r.offsetAt(s0 + dir * 60, laneFor('out') - 12);
    pads.push({ x: mid.x, z: mid.z, w: 20, d: 130, rot: mid.yaw, y: place.ground - 0.05, kind: 'station' });
  }
  return pads;
}

// every place's flat footprint; a kit with its own ground (the coast) is a patch instead, added once it's built
export function placePads() {
  return Object.values(PLACES).filter((p) => p.kit === KITS.city).map((p) => ({
    x: p.centre.x, z: p.centre.z, w: p.size[0], d: p.size[1], rot: p.rot, y: p.y - 0.05, kind: 'paving',
  }));
}

let cached = null;
export function worldTerrain({ patches = [] } = {}) {
  if (cached && !patches.length) return cached;
  const routes = Object.keys(LEGS).map(legRoute);
  const t = makeTerrain({ routes, pads: [...placePads(), ...stationPads()], patches, coast: COAST, base: 9, seaLevel: SEA_LEVEL, seed: 7 });
  if (!patches.length) cached = t;
  return t;
}
