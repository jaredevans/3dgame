// The tour's world: places, legs and the land between them, in metres. Pure data (plus a terrain factory), no three.js.
// Ring order: city -> ocean -> mountain -> west -> future -> city. Every place and leg is laid out here; the page builds
// only the places in BUILT (and the legs between them) until their kits are wired in.
// The sea lies to the -z side of the coast; heading +x along the coast, the sea is on your left.
import { makeRoute } from './route.js';
import { makeTerrain } from './terrain.js';
import { structuresFor } from './structures.js';
import { KITS } from './config.js';

export const TRACK_CENTRES = 4;
export const BUFFER_GAP = 1.5;   // metres from a line's end to its buffer face; a platform starts there
export const STOP_SHORT = 12;    // a train's stopping point is this far short of the buffers
// each leg's town side (side: +1 left of its direction, -1 right): its trains run both ways on the line on that side
export const laneOf = (legId) => LEGS[legId].side * TRACK_CENTRES / 2;
// Phase 1's lanes on city-ocean: left-hand running (a British railway), the outbound line on the left (+lateral)
export const laneFor = (dir) => (dir === 'out' ? laneOf('city-ocean') : -laneOf('city-ocean'));
export const SEA_LEVEL = 0;
// a place's extra parts (Oceanside's seafront) are its town too: the ground this far round each one
export const EXTRA_REACH = 6;

// the places whose kits the page builds; a leg (its track, its train and its stations at both ends) is built once both
// its places are: with all five, the whole ring
export const BUILT = ['city', 'ocean', 'mountain', 'west', 'future'];
export const legBuilt = (id) => BUILT.includes(LEGS[id].from) && BUILT.includes(LEGS[id].to);

export const RING = {
  places: ['city', 'ocean', 'mountain', 'west', 'future'],
  legs: ['city-ocean', 'ocean-mountain', 'mountain-west', 'west-future', 'future-city'],
};

// centre: where the place's kit is put (its own origin), turned by rot; station: its stations' style (station-style.js;
// the Countryside Railway's if not given); y: the level its kit's ground 0 goes at;
// ground: its stations' formation level (= its lines' ends); size: its footprint [x, z] in its kit's own frame, centred
// `offset` from its origin; landMin: an island kit's ground below this (kit metres) is its underside, not land (-2 if
// not given). Each place has two stations on two sides of its town: the arrival of the leg from the previous place and
// the departure of the leg to the next, each with its town beside it. On foot you keep to the town's land and its
// stations' approaches (station-walk.js), so going on always means walking through the town.
export const PLACES = {
  city: { name: 'Downtown City', kit: KITS.city, centre: { x: 128, z: -74 }, y: 8, rot: 0, ground: 8, size: [150, 118],
    build: { city: { seed: 11, blocks: [2, 2], boundary: false } },
    // departures along the south edge, arrivals from the Futuristic place along the north edge
    stations: [
      { leg: 'city-ocean', end: 'start', role: 'departure', platformLength: 120 },
      { leg: 'future-city', end: 'end', role: 'arrival', platformLength: 120 },
    ] },
  // the coast kit's beach is at its own y = 0 and its sea lies to its +z: turned half round so the sea faces -z, and
  // raised 1.2 m so its shoreline meets our sea level. The station is behind its dunes at 3 m.
  ocean: { name: 'Oceanside', kit: KITS.ocean, centre: { x: 1902, z: -198 }, y: 1.2, rot: Math.PI, ground: 3, size: [44, 50],
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
    // arrivals from the City along the south edge; the climb to the Mountain leaves from the east edge, heading south
    // from the shore past the end of the City line's buffers
    stations: [
      { leg: 'city-ocean', end: 'end', role: 'arrival', platformLength: 120 },
      { leg: 'ocean-mountain', end: 'start', role: 'departure', platformLength: 120 },
    ] },
  // the Alpine kit's composed mountainside on its own island ground: land from -18 to +18 m in its own frame (its skirt,
  // below landMin, is the island's underside), 112 x 112 m about (-4.5, -1.5). Turned 130 degrees so its low end, the
  // chalet and the lift's base station, faces the corner between the two lines and its summit rises behind; raised
  // 32.5 m so the rim of its land facing both platforms meets the hillside there (about 21 m, the shoulder below) and the
  // village stands just below the platforms, its far side falling to the land round it over the patch's blend. Its
  // footprint keeps 20 m from both lines.
  mountain: { name: 'Mountain', kit: KITS.mountain, centre: { x: 2500, z: 680 }, y: 32.5, rot: 130 * Math.PI / 180, ground: 22,
    size: [112, 112], offset: [-4.5, -1.5], landMin: -21,
    build: {},
    // the climb from Oceanside arrives along the north side; the Canyon Express leaves down the east side
    stations: [
      { leg: 'ocean-mountain', end: 'end', role: 'arrival', platformLength: 120 },
      { leg: 'mountain-west', end: 'start', role: 'departure', platformLength: 120 },
    ] },
  // Frontier Town's composed crossroads on its own island ground: land from -3.3 to +13 m in its own frame (its skirt, at
  // -6, is the island's underside), 94 x 102 m about (-2, 0.5). Its main street runs along its z, the cross street along
  // its x; the mine's bluffs (9..13 m) close its -z end and a lower bluff (4..7 m) the -z half of its +x side. Left the
  // way it is composed: Main Street's open end faces the bullet's station to the south, the cross street's the Canyon
  // Express's to the east, and the bluffs back onto the hills to the north (about 22..25 m), each street ending at its
  // station's building. 10 m west of where it was first put, so its east rim (the low bluff, 4..6 m) stands past the
  // reach of the Canyon Express's track bed (36 m), which would otherwise pull the land under it 1.5 m below the kit's
  // ground there. Raised 16.3 m, the level of the rim within 50 m of either platform, so the street is level with the
  // platform tops.
  west: { name: 'Wild West', kit: KITS.west, centre: { x: 2940, z: 1950 }, y: 16.3, rot: 0, ground: 15,
    size: [94, 102], offset: [-2, 0.5], landMin: -4.5,
    build: {},
    // the Canyon Express comes down the east side; the bullet train leaves along the south side, heading west
    stations: [
      { leg: 'mountain-west', end: 'end', role: 'arrival', platformLength: 120 },
      { leg: 'west-future', end: 'start', role: 'departure', platformLength: 120 },
    ] },
  // the Chrome Arcology's composed plazas and towers on its own island ground: land from -2 to +2.8 m in its own frame
  // (its skirt, at -8.3, is the island's underside), 140 x 156 m about (-2, 2), its corners well rounded; flat at 0 but
  // for a raised garden (+1..2.8) round its vertical farms in its -x, +z quarter, and a narrow, uneven tip at its -z end.
  // Turned half round less 15 degrees: the garden is in the south-east, away from both lines; the monolith tower and the
  // arcade (its -z side) face the bullet's platform to the north, its tip turned off the line's end; the vehicle depot
  // and its street (its +x side) face the Metro Glide's to the west; its main street (its z = 8) runs across the middle.
  // 15 m west of where it was first put, into the corner between the two lines, so the walk from one platform to the
  // other crosses some 60 m of its plaza rather than clipping its rounded corner (6 m), while its tip stays past the
  // reach of the bullet's track bed (which pulled the ground under it up to 0.8 m off the kit's, nearer the line). Its
  // footprint keeps 15 m from both lines. At y 10 its ground 0 is the stations' ground.
  future: { name: 'Futuristic', kit: KITS.future, centre: { x: -1065, z: 1200 }, y: 10, rot: 165 * Math.PI / 180, ground: 10,
    size: [140, 156], offset: [-2, 2], landMin: -4.5,
    station: 'future',   // its stations in its own style (station-style.js): the Chrome Arcology's
    build: {},
    // the bullet train arrives along the south side; the Metro Glide leaves from the north-west side, heading north-north-east
    stations: [
      { leg: 'west-future', end: 'end', role: 'arrival', platformLength: 120 },
      { leg: 'future-city', end: 'start', role: 'departure', platformLength: 120 },
    ] },
};

export const LEGS = {
  'city-ocean': {
    from: 'city', to: 'ocean', train: 'cityOcean', side: +1,
    // out of the city's east side, up onto the cliff tops above the sea, and down into Oceanside.
    // The first and last 120 m are straight and level: the platforms.
    points: [
      { x: 70, y: 8, z: 0 }, { x: 110, y: 8, z: 0 }, { x: 150, y: 8, z: 0 }, { x: 250, y: 8.2, z: -4 }, { x: 370, y: 8.8, z: -22 }, { x: 520, y: 10.5, z: -70 },
      { x: 720, y: 14.5, z: -150 }, { x: 920, y: 18, z: -200 }, { x: 1120, y: 18.6, z: -215 }, { x: 1320, y: 14.4, z: -205 },
      { x: 1500, y: 10.4, z: -175 }, { x: 1640, y: 7.3, z: -152 }, { x: 1760, y: 4.6, z: -140 }, { x: 1840, y: 3, z: -138 },
      { x: 1880, y: 3, z: -138 }, { x: 1920, y: 3, z: -138 }, { x: 1960, y: 3, z: -138 },
    ],
  },
  // Every leg begins and ends with 120 m of straight, level line: its platforms. Points every ~40 m (150 m on the
  // bullet's), sampled from straights and eased curves, so the curves come out true.
  'ocean-mountain': {
    from: 'ocean', to: 'mountain', train: 'oceanMountain', side: -1,
    // its tunnel and viaduct are found from the land (a spur of hill, then the waterfall's valley: see FEATURES)
    // south off Oceanside's shore, then one long left-hand curve climbing steadily (2.2%) through the forest from
    // the coast at 3 m to the Mountain at 22 m, arriving heading east-south-east along the north side of the village
    points: [
      { x: 1995, y: 3, z: -208 }, { x: 1995, y: 3, z: -168.5 }, { x: 1995, y: 3, z: -129 }, { x: 1995, y: 3, z: -89.6 },
      { x: 1995, y: 3.73, z: -50.1 }, { x: 1995.3, y: 4.61, z: -10.6 }, { x: 1996.4, y: 5.49, z: 28.9 }, { x: 1998.9, y: 6.36, z: 68.3 },
      { x: 2003.2, y: 7.24, z: 107.5 }, { x: 2009.8, y: 8.12, z: 146.4 }, { x: 2019.3, y: 8.99, z: 184.7 }, { x: 2031.9, y: 9.87, z: 222.1 },
      { x: 2047.5, y: 10.75, z: 258.4 }, { x: 2066, y: 11.62, z: 293.2 }, { x: 2087.4, y: 12.5, z: 326.4 }, { x: 2111.4, y: 13.38, z: 357.8 },
      { x: 2137.9, y: 14.25, z: 387 }, { x: 2166.7, y: 15.13, z: 414 }, { x: 2197.6, y: 16.01, z: 438.6 }, { x: 2230.4, y: 16.88, z: 460.6 },
      { x: 2264.6, y: 17.76, z: 480.3 }, { x: 2299.8, y: 18.64, z: 498.2 }, { x: 2335.7, y: 19.51, z: 514.6 }, { x: 2372, y: 20.39, z: 530 },
      { x: 2408.6, y: 21.27, z: 544.9 }, { x: 2445.2, y: 22, z: 559.7 }, { x: 2481.8, y: 22, z: 574.5 }, { x: 2518.4, y: 22, z: 589.3 },
      { x: 2555, y: 22, z: 604 },
    ],
  },
  'mountain-west': {
    from: 'mountain', to: 'west', train: 'mountainWest', side: -1,
    // a timber trestle across the gulch in the canyon's upper reach
    structures: [{ kind: 'trestle', s0: 690, s1: 870 }],
    // south from the Mountain, up over the snowy pass (29 m, 520 m out), then a long reverse curve down to the plains
    // and the Wild West at 15 m, arriving heading south along the town's east side
    points: [
      { x: 2600, y: 22, z: 653.5 }, { x: 2600, y: 22, z: 693.1 }, { x: 2600, y: 22, z: 732.8 }, { x: 2600, y: 22, z: 772.4 },
      { x: 2600, y: 22.6, z: 812.1 }, { x: 2600.2, y: 23.3, z: 851.7 }, { x: 2601.3, y: 24, z: 891.4 }, { x: 2604.1, y: 24.7, z: 930.9 },
      { x: 2609.3, y: 25.41, z: 970.2 }, { x: 2617.4, y: 26.11, z: 1009 }, { x: 2628.4, y: 26.81, z: 1047.1 }, { x: 2642.3, y: 27.51, z: 1084.2 },
      { x: 2659, y: 28.22, z: 1120.1 }, { x: 2678.4, y: 28.92, z: 1154.7 }, { x: 2700.2, y: 28.37, z: 1187.8 }, { x: 2723.9, y: 27.66, z: 1219.6 },
      { x: 2748.8, y: 26.95, z: 1250.4 }, { x: 2774.2, y: 26.24, z: 1280.9 }, { x: 2799.7, y: 25.53, z: 1311.2 }, { x: 2825.2, y: 24.83, z: 1341.6 },
      { x: 2850.7, y: 24.12, z: 1372 }, { x: 2876, y: 23.41, z: 1402.5 }, { x: 2900.7, y: 22.7, z: 1433.5 }, { x: 2924.1, y: 21.99, z: 1465.5 },
      { x: 2945.5, y: 21.28, z: 1498.8 }, { x: 2964.4, y: 20.57, z: 1533.7 }, { x: 2980.6, y: 19.86, z: 1569.9 }, { x: 2993.9, y: 19.15, z: 1607.2 },
      { x: 3004.4, y: 18.44, z: 1645.4 }, { x: 3012, y: 17.73, z: 1684.3 }, { x: 3016.6, y: 17.02, z: 1723.7 }, { x: 3019, y: 16.31, z: 1763.3 },
      { x: 3019.9, y: 15.6, z: 1802.9 }, { x: 3020, y: 15, z: 1842.6 }, { x: 3020, y: 15, z: 1882.2 }, { x: 3020, y: 15, z: 1921.9 },
      { x: 3020, y: 15, z: 1961.5 },
    ],
  },
  'west-future': {
    from: 'west', to: 'future', train: 'westFuture', side: -1,
    // up on the guideway for all but the ends, along the dry wash below it (see FEATURES); coming down to the embankment
    // short of the Futuristic place, it runs on at grade through its platforms to the buffers (s1 Infinity: the line's end)
    structures: [{ kind: 'guideway', s0: 190, s1: 3950 }, { kind: 'guideway', s0: 3950, s1: Infinity, grade: true }],
    // the bullet's run: 4.1 km west-north-west across the desert, all but straight, weaving through long 4 km curves
    // (4 degrees out, 8 back, 4 out again), gently down from 15 m to 10 m
    points: [
      { x: 2960.5, y: 15, z: 2041 }, { x: 2814.9, y: 14.97, z: 2014.5 }, { x: 2669.3, y: 14.78, z: 1988 }, { x: 2523.3, y: 14.59, z: 1963.2 },
      { x: 2376.7, y: 14.4, z: 1943.3 }, { x: 2229.6, y: 14.21, z: 1926.7 }, { x: 2082.5, y: 14.02, z: 1910.3 }, { x: 1935.4, y: 13.83, z: 1894 },
      { x: 1788.2, y: 13.64, z: 1877.7 }, { x: 1641.1, y: 13.45, z: 1861.4 }, { x: 1494, y: 13.26, z: 1845.1 }, { x: 1346.9, y: 13.07, z: 1828.7 },
      { x: 1199.8, y: 12.88, z: 1811.9 }, { x: 1053.1, y: 12.69, z: 1792.5 }, { x: 907, y: 12.5, z: 1768.7 }, { x: 761.9, y: 12.31, z: 1739.5 },
      { x: 617.8, y: 12.12, z: 1705.8 }, { x: 474.2, y: 11.93, z: 1669.7 }, { x: 330.8, y: 11.74, z: 1633 }, { x: 187.4, y: 11.55, z: 1596.4 },
      { x: 44, y: 11.36, z: 1559.8 }, { x: -99.4, y: 11.17, z: 1523.1 }, { x: -242.8, y: 10.98, z: 1486.5 }, { x: -386.2, y: 10.79, z: 1449.9 },
      { x: -529.7, y: 10.6, z: 1413.5 }, { x: -674, y: 10.41, z: 1380.4 }, { x: -819.3, y: 10.22, z: 1352.1 }, { x: -964.9, y: 10.03, z: 1325.5 },
      { x: -1110.5, y: 10, z: 1299 },
    ],
  },
  'future-city': {
    from: 'future', to: 'city', train: 'futureCity', side: -1,
    // out of the Futuristic place on its guideway, at grade from the buffers through the platforms, ending on an abutment
    // past the town's edge (s 120) where ordinary track runs on into the suburbs; then the long bridge over the river
    // (see FEATURES), in pale stone
    structures: [{ kind: 'guideway', s0: 0, s1: 160, grade: true }, { kind: 'viaduct', s0: 495, s1: 705, stone: 'limestone' }],
    // its suburbs (suburbs.js): streets of houses either side, from past the guideway's end to the river's valley, and
    // from beyond it to where the downtown towers begin
    suburbs: [[200, 430], [780, 1800]],
    // north-north-east out of the Futuristic place through the suburbs, a long right-hand curve, and in heading
    // east along the north edge of Downtown City
    points: [
      { x: -1180.3, y: 10, z: 1195.8 }, { x: -1160.3, y: 10, z: 1161.1 }, { x: -1140.3, y: 10, z: 1126.4 }, { x: -1120.2, y: 10, z: 1091.7 },
      { x: -1100.2, y: 9.96, z: 1057 }, { x: -1080.2, y: 9.92, z: 1022.3 }, { x: -1060.2, y: 9.87, z: 987.6 }, { x: -1040.1, y: 9.83, z: 952.9 },
      { x: -1020.1, y: 9.79, z: 918.2 }, { x: -1000.1, y: 9.74, z: 883.5 }, { x: -980, y: 9.7, z: 848.8 }, { x: -960, y: 9.66, z: 814.1 },
      { x: -940, y: 9.61, z: 779.4 }, { x: -919.9, y: 9.57, z: 744.7 }, { x: -899.9, y: 9.52, z: 710 }, { x: -879.9, y: 9.48, z: 675.3 },
      { x: -859.8, y: 9.44, z: 640.6 }, { x: -839.8, y: 9.39, z: 605.9 }, { x: -819.8, y: 9.35, z: 571.2 }, { x: -799.7, y: 9.31, z: 536.5 },
      { x: -779.7, y: 9.26, z: 501.8 }, { x: -759.7, y: 9.22, z: 467.1 }, { x: -739.6, y: 9.17, z: 432.5 }, { x: -719.6, y: 9.13, z: 397.8 },
      { x: -699.6, y: 9.09, z: 363.1 }, { x: -679.6, y: 9.04, z: 328.4 }, { x: -659.5, y: 9, z: 293.7 }, { x: -639.5, y: 8.96, z: 259 },
      { x: -619.5, y: 8.91, z: 224.3 }, { x: -599.3, y: 8.87, z: 189.6 }, { x: -578.7, y: 8.83, z: 155.3 }, { x: -557.2, y: 8.78, z: 121.5 },
      { x: -534.4, y: 8.74, z: 88.5 }, { x: -510, y: 8.69, z: 56.8 }, { x: -483.6, y: 8.65, z: 26.7 }, { x: -455.1, y: 8.61, z: -1.5 },
      { x: -424.6, y: 8.56, z: -27.4 }, { x: -392.2, y: 8.52, z: -51.1 }, { x: -358.2, y: 8.48, z: -72.2 }, { x: -322.8, y: 8.43, z: -90.8 },
      { x: -286, y: 8.39, z: -106.7 }, { x: -248.1, y: 8.34, z: -119.8 }, { x: -209.4, y: 8.3, z: -130.1 }, { x: -170.1, y: 8.26, z: -137.6 },
      { x: -130.3, y: 8.21, z: -142.7 }, { x: -90.4, y: 8.17, z: -145.7 }, { x: -50.4, y: 8.13, z: -147.3 }, { x: -10.3, y: 8.08, z: -147.9 },
      { x: 29.7, y: 8.04, z: -148 }, { x: 69.8, y: 8, z: -148 }, { x: 109.9, y: 8, z: -148 }, { x: 149.9, y: 8, z: -148 },
      { x: 190, y: 8, z: -148 },
    ],
  },
};

// the coast: sea on the left of travel; top = land height at the edge; kind 1 = cliff, 0 = beach
export const COAST = {
  points: [
    { x: -900, z: -420, top: 9, kind: 0.4 }, { x: 100, z: -330, top: 10, kind: 0.5 }, { x: 500, z: -210, top: 14, kind: 0.7 },
    { x: 720, z: -215, top: 12.5, kind: 1 }, { x: 920, z: -262, top: 16.5, kind: 1 }, { x: 1120, z: -278, top: 16.5, kind: 1 },
    { x: 1320, z: -268, top: 12.5, kind: 1 }, { x: 1500, z: -238, top: 9, kind: 1 }, { x: 1660, z: -215, top: 6, kind: 0.8 },
    { x: 1820, z: -214, top: 3.5, kind: 0.3 }, { x: 1960, z: -212, top: 1.5, kind: 0 }, { x: 2160, z: -209, top: 1.5, kind: 0 },
    { x: 2360, z: -265, top: 11, kind: 0.6 }, { x: 3200, z: -380, top: 16, kind: 0.9 },
  ],
};

// the land's shape beyond the rolling hills: a massif of snowy peaks around the Mountain (the climb and the pass run through
// its foothills), a canyon down the Canyon Express after the pass, red mesas round the Wild West and along the bullet's run.
// Massifs and mesas keep clear of every line and of each place (see `clearings`), so they never crowd a station.
export const FEATURES = [
  { kind: 'massif', x: 2900, z: 420, r: 800, h: 340 },
  { kind: 'massif', x: 2250, z: 1000, r: 700, h: 300 },
  { kind: 'massif', x: 2750, z: 150, r: 600, h: 260 },
  { kind: 'massif', x: 3300, z: 900, r: 650, h: 280 },
  // the climb from Oceanside: a spur of hill it tunnels through, bursting out onto a viaduct high over a valley whose
  // river falls into it from the mountains at its head
  { kind: 'ridge', leg: 'ocean-mountain', s0: 420, s1: 665, rise: 28, half: 35, fade: 110, ease: 50, only: 'up' },
  { kind: 'valley', leg: 'ocean-mountain', x0: 2048, z0: 734, x1: 2342, z1: 212, floor: 2, half: 22, fade: 105, ease: 80, easeHead: 60, water: true, fall: true },
  // the Mountain's own shoulder: past the gorge the land climbs back up to the line, so the village and both its
  // stations stand on the hillside at their level, not on a viaduct and an embankment above the plain (each runs on
  // past its line's end, so it holds full height there)
  { kind: 'ridge', leg: 'ocean-mountain', s0: 850, s1: 1300, rise: -1, half: 45, fade: 130, ease: 70, only: 'up' },
  { kind: 'ridge', leg: 'mountain-west', s0: -200, s1: 200, rise: -1, half: 45, fade: 130, ease: 70, only: 'up' },
  // the pass: foothills come up to just under the line; then the gulch the trestle crosses in the canyon, and the canyon
  // floor brought up to the line beyond it
  { kind: 'ridge', leg: 'mountain-west', s0: 80, s1: 745, rise: -2, half: 30, fade: 160, ease: 55, only: 'up' },
  { kind: 'ridge', leg: 'mountain-west', s0: 815, s1: 1200, rise: -2, half: 30, fade: 120, ease: 55, only: 'up' },
  { kind: 'canyon', leg: 'mountain-west', s0: 620, s1: 1150, depth: 70, width: 30 },
  // the bullet's dry wash: the desert held 9 m under its guideway
  { kind: 'ridge', leg: 'west-future', s0: 140, s1: 4000, rise: -9, half: 30, fade: 150, ease: 110, only: 'down' },
  // the river the Metro Glide crosses on its way into the city
  { kind: 'valley', leg: 'future-city', x0: -1315, z0: 426, x1: -445, z1: 926, floor: 1.5, half: 30, fade: 60, ease: 100, water: true },
  { kind: 'mesa', x: 3350, z: 1500, r: 90, h: 55 },
  { kind: 'mesa', x: 3500, z: 1760, r: 120, h: 70 },
  { kind: 'mesa', x: 3250, z: 2300, r: 100, h: 60 },
  { kind: 'mesa', x: 2500, z: 2350, r: 110, h: 60 },
  { kind: 'mesa', x: 2200, z: 1650, r: 100, h: 55 },
  { kind: 'mesa', x: 1700, z: 2250, r: 140, h: 65 },
  { kind: 'mesa', x: 1400, z: 1550, r: 120, h: 60 },
  { kind: 'mesa', x: 800, z: 2100, r: 110, h: 55 },
  { kind: 'mesa', x: 500, z: 1400, r: 100, h: 50 },
];
// snow on the massif above 60 m; red earth and sand in the desert; paving round the two cities; grass elsewhere
export const BIOMES = [
  { kind: 'snow', x: 2650, z: 650, r: 900 },
  // the snowy pass: the line tops out at 29 m on an embankment through low foothills, so snow here ignores altitude (line below the ground)
  { kind: 'snow', x: 2670, z: 1140, r: 170, line: -50 },
  // and the Mountain's own hillside, snowy all round its village (whose island ground is snow) and its two stations
  { kind: 'snow', x: 2500, z: 680, r: 120, line: -50 },
  { kind: 'desert', x: 3000, z: 1900, r: 900 },
  { kind: 'desert', x: 2000, z: 1950, r: 700 },
  { kind: 'desert', x: 1000, z: 1800, r: 700 },
  { kind: 'desert', x: 250, z: 1600, r: 600 },
  { kind: 'desert', x: 3050, z: 1550, r: 450 },
  { kind: 'urban', x: 128, z: -74, r: 30 },
  { kind: 'urban', x: -1065, z: 1200, r: 300 },
];

const routeCache = new Map();
export function legRoute(id) {
  if (!routeCache.has(id)) routeCache.set(id, makeRoute(LEGS[id].points));
  return routeCache.get(id);
}

// the middle of a station's platform: where it is, the route's heading there, and the side its town is on
export function stationFrame(placeId, role) {
  const st = PLACES[placeId].stations.find((s) => s.role === role);
  const r = legRoute(st.leg), half = BUFFER_GAP + st.platformLength / 2;
  const p = r.at(st.end === 'start' ? half : r.length - half);
  return { x: p.x, z: p.z, y: p.y, yaw: p.yaw, side: LEGS[st.leg].side, leg: st.leg, end: st.end };
}

// a terminus's platform window and stopping point at one end ('start' | 'end') of a route `length` long, in its s
export function platformWindow(length, end, platformLength = 120) {
  const atEnd = end === 'end';
  const sFrom = atEnd ? length - BUFFER_GAP - platformLength : BUFFER_GAP;
  return { sFrom, sTo: sFrom + platformLength, stopS: atEnd ? length - BUFFER_GAP - STOP_SHORT : BUFFER_GAP + STOP_SHORT };
}

// the flat ground a terminus needs: the platform side of its line end, out to the station building
export function stationPads() {
  const pads = [];
  for (const place of Object.values(PLACES)) for (const st of place.stations) {
    const r = legRoute(st.leg), s0 = st.end === 'start' ? 0 : r.length, dir = st.end === 'start' ? 1 : -1, lane = laneOf(st.leg);
    const mid = r.offsetAt(s0 + dir * 60, lane + Math.sign(lane) * 7);
    pads.push({ x: mid.x, z: mid.z, w: 10, d: 130, rot: mid.yaw, y: place.ground - 0.05, blend: 6, kind: 'station' });
  }
  return pads;
}

// every place's flat footprint; a kit with its own ground (the coast) is a patch instead, added once it's built
export function placePads() {
  return Object.values(PLACES).filter((p) => p.kit === KITS.city).map((p) => ({
    x: p.centre.x, z: p.centre.z, w: p.size[0], d: p.size[1], rot: p.rot, y: p.y - 0.05, kind: 'paving',
  }));
}

// a leg's structures (structures.js): found from the land, plus the ones it asks for (held to the line's length); none on
// its platforms bar a guideway laid at grade
export const STRUCTURE_ENDS = 125;
let sectioned = false;
function giveSections(t) {
  if (sectioned) return;
  for (const id of Object.keys(LEGS)) {
    const r = legRoute(id);
    const forced = (LEGS[id].structures ?? []).map((f) => ({ ...f, s0: Math.max(0, f.s0), s1: Math.min(r.length, f.s1) }));
    r.sections = structuresFor(r, t.natural, { forced, ends: STRUCTURE_ENDS });
  }
  sectioned = true;
}
export function legSections(id) {
  worldTerrain();
  return legRoute(id).sections;
}

let cached = null;
export function worldTerrain({ patches = [] } = {}) {
  if (cached && !patches.length) return cached;
  const routes = Object.keys(LEGS).map(legRoute);
  const legs = Object.fromEntries(Object.keys(LEGS).map((id) => [id, legRoute(id)]));
  const clearings = Object.values(PLACES).map((p) => ({ x: p.centre.x, z: p.centre.z, r: 130 }));
  const t = makeTerrain({ routes, legs, pads: [...placePads(), ...stationPads()], patches, coast: COAST, base: 9, seaLevel: SEA_LEVEL, seed: 7,
    features: FEATURES, biomes: BIOMES, clearings });
  giveSections(t);   // the land without beds decides them, and the beds (read as the ground is asked for) follow them
  if (!patches.length) cached = t;
  return t;
}
