// The Metro Glide's car, the Chrome Arcology's guideway-rail-shuttle, from its pure measurements (trains/shuttle-shape.js):
// its nose's profile as measured in the page, its ride over the guideway's deck and the rails, its fit beside the
// platforms, and the cab box fitCab clips out of it, with the driver's eye behind the windscreen.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PLATFORM_TOP } from '../station-walk.js';
import { GUIDE_DECK } from '../structures.js';
import { COUPLING_GAP } from '../consist.js';
import { STOP_SHORT, BUFFER_GAP } from '../world-data.js';
import { TRAIN_SPECS } from '../trains/specs.js';

const shape = () => import('../trains/shuttle-shape.js');
const near = (a, b, tol, msg) => assert.ok(Math.abs(a - b) <= tol, `${msg ?? ''} expected ${b} ± ${tol}, got ${a}`);
const RAIL_TOP = 0.30, PLATFORM_FACE = 1.6;   // track-mesh.js; both platforms' faces from their line's centre (measured)

test("the shuttle's shape is the one measured in the page", async () => {
  const { SHUTTLE, frontAt } = await shape();
  // the box (3.01 x 3.2 x 10.28 m, its origin on the ground at its middle), and the raked windscreen, cast at x = 0
  near(SHUTTLE.tip, 5.14, 0.01); near(SHUTTLE.roof, 3.2, 0.01); near(SHUTTLE.width / 2, 1.505, 0.01);
  for (const [y, z] of [[1.25, 5.0], [1.55, 4.85], [2.0, 4.62], [2.45, 4.24], [2.75, 4.0], [3.05, 3.41], [3.2, 3.06]]) {
    near(frontAt(y), z, 0.06, `the front at y=${y}`);
  }
});

test('it rides just over the guideway deck and the rails, and clears the platform faces', async () => {
  const { SHUTTLE, halfAt } = await shape();
  assert.ok(SHUTTLE.ride >= GUIDE_DECK + 0.01 && SHUTTLE.ride <= GUIDE_DECK + 0.06, `its pods ${SHUTTLE.ride} m up, the deck at ${GUIDE_DECK}`);
  assert.ok(SHUTTLE.ride >= RAIL_TOP, 'its pods clear the rail tops off the guideway');
  assert.equal(TRAIN_SPECS.futureCity.ride, SHUTTLE.ride, 'the Metro Glide is built at that ride');
  // the widest thing on it (its skirt pods) and its body at every height up to the platform top clear the face by 8 cm
  assert.ok(SHUTTLE.width / 2 <= PLATFORM_FACE - 0.08, `pods ${SHUTTLE.width / 2} m from the lane`);
  for (let y = 0.45; y <= 3.2; y += 0.05) assert.ok(halfAt(y) <= PLATFORM_FACE - 0.08, `body ${halfAt(y).toFixed(2)} at y=${y.toFixed(2)}`);
  assert.ok(SHUTTLE.ride + 0.58 <= PLATFORM_TOP, 'its floor a step up from the platform, not above it');
});

test('three cars fit a 120 m platform at the stop', async () => {
  const { SHUTTLE } = await shape();
  const cars = TRAIN_SPECS.futureCity.cars;
  assert.equal(cars.length, 3);
  const total = cars.length * 2 * SHUTTLE.tip + COUPLING_GAP * (cars.length - 1);
  assert.ok(total + STOP_SHORT + BUFFER_GAP <= 120 + BUFFER_GAP, `${total.toFixed(1)} m of train`);
});

test("the cab box takes in the whole windscreen and the driver's eye looks through it", async () => {
  const { SHUTTLE, SHUTTLE_CAB: c, frontAt, halfAt, GLASS } = await shape();
  assert.ok(c.zFront >= SHUTTLE.tip, 'the clip reaches past the nose, so the opaque windscreen is cut away');
  assert.ok(c.zBack >= SHUTTLE.door + 0.3, 'behind the cab is the saloon, its doors left whole');
  assert.ok(c.floor >= SHUTTLE.lamps + 0.01 && c.floor <= GLASS[0] - 0.3, `floor at ${c.floor}: the head lamps below it stay on the shell`);
  near(c.roof, SHUTTLE.roof, 1e-9);
  const [ex, ey, ez] = c.eye;
  assert.equal(ex, 0, 'the driver sits in the middle');
  assert.ok(ey > GLASS[0] + 0.5 && ey < GLASS[1] - 0.2, `eye at ${ey}, the glass ${GLASS}`);
  assert.ok(ey - c.floor >= 1.1 && ey - c.floor <= 1.35, 'seated eye height above the floor');
  assert.ok(ez > c.zBack + 0.6 && ez < frontAt(ey) - 0.7, `eye at z ${ez}, the windscreen at ${frontAt(ey).toFixed(2)}`);
  assert.ok(Math.abs(ex) < halfAt(ey) - 0.4 && ey < c.roof - 0.5, 'inside the body');
});
