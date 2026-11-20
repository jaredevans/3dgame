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

export const PLACES = {
  city: { name: 'Downtown City', kit: KITS.city, centre: { x: 0, z: 0 }, ground: 8, radius: 55,
    stations: [{ leg: 'city-ocean', end: 'start', role: 'departure' }] },
  ocean: { name: 'Oceanside', kit: KITS.ocean, centre: { x: 2050, z: -185 }, ground: 8, radius: 50,
    stations: [{ leg: 'city-ocean', end: 'end', role: 'arrival' }] },
};

export const LEGS = {
  'city-ocean': {
    from: 'city', to: 'ocean', train: 'cityOcean',
    // out of the city's east side, up onto the cliff tops above the sea, and down into Oceanside.
    // The first and last 120 m are straight and level: the platforms.
    points: [
      { x: 70, y: 8, z: 0 }, { x: 190, y: 8, z: 0 }, { x: 330, y: 8.5, z: -15 }, { x: 520, y: 10.5, z: -70 },
      { x: 720, y: 14, z: -150 }, { x: 920, y: 18.5, z: -200 }, { x: 1120, y: 19.5, z: -215 }, { x: 1320, y: 19, z: -205 },
      { x: 1500, y: 15.5, z: -175 }, { x: 1640, y: 12.5, z: -152 }, { x: 1760, y: 10, z: -140 }, { x: 1840, y: 8.5, z: -138 },
      { x: 1960, y: 8.5, z: -138 },
    ],
  },
};

// the coast: sea on the left of travel; top = land height at the edge; kind 1 = cliff, 0 = beach
export const COAST = {
  points: [
    { x: -900, z: -420, top: 9, kind: 0.4 }, { x: 100, z: -330, top: 10, kind: 0.5 }, { x: 500, z: -210, top: 14, kind: 0.7 },
    { x: 720, z: -245, top: 20, kind: 1 }, { x: 920, z: -295, top: 26, kind: 1 }, { x: 1120, z: -310, top: 28, kind: 1 },
    { x: 1320, z: -300, top: 26, kind: 1 }, { x: 1500, z: -275, top: 21, kind: 1 }, { x: 1660, z: -255, top: 15, kind: 0.8 },
    { x: 1820, z: -250, top: 9, kind: 0.3 }, { x: 1960, z: -250, top: 7, kind: 0 }, { x: 2160, z: -250, top: 7, kind: 0 },
    { x: 2360, z: -265, top: 11, kind: 0.6 }, { x: 3200, z: -380, top: 16, kind: 0.9 },
  ],
};

export function legRoute(id) { return makeRoute(LEGS[id].points); }

let cached = null;
export function worldTerrain() {
  if (cached) return cached;
  const routes = Object.keys(LEGS).map(legRoute);
  const pads = Object.values(PLACES).map((p) => ({ x: p.centre.x, z: p.centre.z, r: p.radius, y: p.ground, kind: 'place' }));
  cached = makeTerrain({ routes, pads, coast: COAST, base: 9, seaLevel: SEA_LEVEL, seed: 7 });
  return cached;
}
