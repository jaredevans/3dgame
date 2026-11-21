// How a place's stations look: the parts of each style and the footprint of its station building, in metres. Pure data,
// no three.js: stations.js builds a terminus in its place's style, and station-walk.js stands the building's footprint in
// for it where nothing has been built (the walk tests).
// A building's footprint is in the station's frame: `end`/`start` the stretch along the line it covers, measured from the
// platform's buffer end towards the buffers (at a leg's end, and at its start), `near`..`far` how far out on the town
// side of the line's centre it stands.
import { KITS } from './config.js';
import { PLACES } from './world-data.js';

export const STATION_STYLES = {
  // the Countryside Railway's red-brick terminus, as every place had (City, Oceanside, Mountain, the Wild West)
  countryside: {
    kit: KITS.railway,
    parts: {
      platform: 'platform-run', building: 'station-building', canopy: 'platform-canopy-run', lamp: 'station-lamp-post',
      bench: 'station-bench', buffer: 'buffer-stop', sign: 'running-in-board',
    },
    // measured from the built termini: the building and its house, 24 m long, 7.6..16 m out
    building: { end: [-18, 6], start: [-26, -2], near: 7.6, far: 16 },
  },
  // the Chrome Arcology's transit station: an enclosed concourse on piers (a side-platform transit-station-module of 4
  // bays, 16 x 8 m, its deck 4 m up) with a plaza stair (8 m, rising 4 m) up to it from the town, shelters, arc lamps and
  // capsule benches along a clean white platform, and a lit end block for buffers (the platform and the end blocks are
  // made in code, in the kit's palette: the kit has neither)
  future: {
    kit: KITS.future,
    parts: {
      platform: null, building: 'transit-station-module', stair: 'plaza-stair-block', canopy: 'transit-shelter-canopy',
      lamp: 'arc-street-lamp', bench: 'floating-capsule-bench', buffer: null, sign: 'neon-sign-pylon',
    },
    // the concourse and its stair, 24 m beside the platform's buffer end, 8 m deep behind the platform's back edge
    building: { end: [-24, 0], start: [-24, 0], near: 8.05, far: 16.15 },
    module: { length: 16, depth: 8, deck: 4 },
    stairRun: 8,
  },
};

// the style of a place's stations (a place says `station: 'future'`; the Countryside one otherwise)
export const styleName = (placeId) => PLACES[placeId]?.station ?? 'countryside';
export const stationStyle = (placeId) => STATION_STYLES[styleName(placeId)];
