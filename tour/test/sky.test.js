import { test } from 'node:test';
import assert from 'node:assert/strict';
import { skyAt, SKY_KEYS, ringPosition } from '../sky.js';
import { PLACES, legRoute } from '../world-data.js';

const near = (a, b, tol, msg) => assert.ok(Math.abs(a - b) <= tol, `${msg ?? ''} expected ${b} ± ${tol}, got ${a}`);
const same = (a, b) => { for (const k of Object.keys(a)) if (Array.isArray(a[k])) a[k].forEach((v, i) => near(v, b[k][i], 1e-9, k)); else near(a[k], b[k], 1e-9, k); };

test('keys run round the ring in order', () => {
  for (let i = 1; i < SKY_KEYS.length; i++) assert.ok(SKY_KEYS[i].at > SKY_KEYS[i - 1].at);
  assert.equal(SKY_KEYS[0].at, 0);
  assert.ok(SKY_KEYS[SKY_KEYS.length - 1].at < 5);
});

test('skyAt wraps', () => {
  same(skyAt(5), skyAt(0));
  same(skyAt(-0.5), skyAt(4.5));
});

test('skyAt blends', () => {
  const a = SKY_KEYS.find((k) => k.at === 0), b = SKY_KEYS.find((k) => k.at > 0);
  const mid = skyAt(b.at / 2);
  near(mid.stage, (a.stage + b.stage) / 2, 1e-9);
  near(mid.zenith[0], (a.zenith[0] + b.zenith[0]) / 2, 1e-9);
});

test('mornings are bright and night is dark', () => {
  assert.ok(skyAt(0.5).stage < 0.2, 'City to Oceanside is morning');
  assert.ok(skyAt(1.5).stage < 0.2, 'Oceanside to Mountain is midday');
  assert.ok(skyAt(3.8).stage > 0.7, 'into the Futuristic place is night');
  assert.ok(skyAt(4.0).stars > 0.8, 'stars at night');
  assert.equal(skyAt(0.5).stars, 0);
});

test('the sun sets over the Wild West', () => {
  assert.ok(skyAt(2.9).sunElevationDeg < 10 && skyAt(2.9).sunElevationDeg > -2);
});

test('ring position from where you are', () => {
  assert.equal(ringPosition({ place: 'city' }), 0);
  assert.equal(ringPosition({ place: 'ocean' }), 1);
  near(ringPosition({ leg: 'city-ocean', fraction: 0.25 }), 0.25, 1e-9);
  near(ringPosition({ leg: 'future-city', fraction: 0.5 }), 4.5, 1e-9);
});

// the ring is closed: from the end of the Metro Glide's leg (5) into City (0), and back out of City onto it, the sky eases
// the short way round, across sunrise, never back through the whole day
test('the sky eases the short way round the ring', async () => {
  const { towards } = await import('../sky.js');
  assert.equal(typeof towards, 'function', 'sky.js has no towards');
  near(towards(4.9, 0, 0.5) % 5, 4.95, 1e-9, 'into City from the end of the Metro Glide\'s leg');
  near(((towards(0, 4.9, 0.5) % 5) + 5) % 5, 4.95, 1e-9, 'out of City onto the Metro Glide\'s leg, back towards it');
  near(towards(1, 2, 0.25), 1.25, 1e-9, 'along an open stretch, as before');
  near(towards(3.2, 3.2, 1), 3.2, 1e-9);
  // eased all the way it lands on the same sky as where it was going
  same(skyAt(towards(4.6, 0.2, 1)), skyAt(0.2));
  // stepped frame by frame from the end of the leg into City, it never passes through the afternoon or the night
  let p = 5;
  for (let i = 0; i < 200; i++) {
    p = towards(p, 0, 0.05);
    const at = ((p % 5) + 5) % 5;
    assert.ok(at >= 4.99 || at <= 0.01, `the sky went round to ${at.toFixed(2)}`);
  }
});

// the Metro Glide's leg runs from pre-dawn blue into sunrise behind the skyline: the sun comes up over Downtown City as
// the train comes in, and while it is low (up to 9 degrees) it stands behind the City's towers as seen from the cab (within
// the footprint's width as it looks from there, and the City in the cab's view ahead), then City's morning is bright
test("the sun comes up behind Downtown City's skyline as the Metro Glide comes in", () => {
  const r = legRoute('future-city'), L = r.length, city = PLACES.city, half = Math.hypot(...city.size) / 2;
  const deg = (a) => a * 180 / Math.PI, turn = (a) => ((a % 360) + 540) % 360 - 180;
  let rose = null, low = 0;
  for (let s = 0; s <= L - 100; s += 5) {
    const k = skyAt(4 + s / L);
    if (k.sunElevationDeg < 0) { assert.equal(rose, null, `the sun set again at s=${s}`); continue; }
    rose ??= s;
    if (s <= L - 200) assert.ok(k.sunElevationDeg <= 12, `the sun is ${k.sunElevationDeg.toFixed(1)} degrees up at s=${s}, not low over the skyline`);
    if (k.sunElevationDeg > 9) continue;
    low++;
    const p = r.at(s), bearing = deg(Math.atan2(city.centre.x - p.x, city.centre.z - p.z));
    const width = deg(Math.atan(half / Math.hypot(city.centre.x - p.x, city.centre.z - p.z)));
    assert.ok(Math.abs(turn(bearing - deg(p.yaw))) <= 35, `s=${s}: the City is ${turn(bearing - deg(p.yaw)).toFixed(0)} degrees off ahead`);
    assert.ok(Math.abs(turn(k.sunAzimuthDeg - bearing)) <= width + 3, `s=${s}: the sun ${turn(k.sunAzimuthDeg - bearing).toFixed(1)} degrees off the City (its towers span ${width.toFixed(1)})`);
  }
  assert.ok(rose !== null && rose >= 0.6 * L && rose <= 0.8 * L, `the sun rises at s=${rose}, of ${L.toFixed(0)}`);
  assert.ok(low >= 40, `the sun low over the skyline for ${low * 5} m`);
  // and City's morning stays bright
  assert.ok(skyAt(0).stage < 0.1 && skyAt(0).sunElevationDeg >= 25 && skyAt(0).stars === 0, 'City at bright morning');
});
