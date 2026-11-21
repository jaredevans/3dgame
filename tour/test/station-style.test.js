// Each place's stations in its own style: the Futuristic place's from the Chrome Arcology kit, every other place's the
// Countryside Railway's red-brick terminus as before; and the walk's stand-in building follows the style's footprint.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { KITS } from '../config.js';
import { PLACES, legRoute, laneOf, platformWindow } from '../world-data.js';

const style = () => import('../station-style.js');

test("the Futuristic place's stations are the Chrome Arcology's", async () => {
  const { stationStyle, styleName } = await style();
  assert.equal(styleName('future'), 'future');
  const s = stationStyle('future');
  assert.equal(s.kit, KITS.future);
  assert.equal(s.parts.building, 'transit-station-module');
  assert.equal(s.parts.canopy, 'transit-shelter-canopy');
  assert.equal(s.parts.lamp, 'arc-street-lamp');
  assert.equal(s.parts.bench, 'floating-capsule-bench');
  assert.equal(s.parts.stair, 'plaza-stair-block');
  // no red brick, no Countryside parts
  for (const key of Object.values(s.parts)) assert.ok(!key || !/station-building|platform-run|buffer-stop|station-lamp-post/.test(key), key);
});

test('every other place keeps the Countryside Railway terminus', async () => {
  const { stationStyle, styleName, STATION_STYLES } = await style();
  for (const id of Object.keys(PLACES).filter((p) => p !== 'future')) {
    assert.equal(styleName(id), 'countryside', id);
    assert.equal(stationStyle(id), STATION_STYLES.countryside);
  }
  const c = STATION_STYLES.countryside;
  assert.equal(c.kit, KITS.railway);
  assert.deepEqual(c.parts, {
    platform: 'platform-run', building: 'station-building', canopy: 'platform-canopy-run', lamp: 'station-lamp-post',
    bench: 'station-bench', buffer: 'buffer-stop', sign: 'running-in-board',
  });
  // the footprint the walk has always used
  assert.deepEqual(c.building, { end: [-18, 6], start: [-26, -2], near: 7.6, far: 16 });
});

test("the walk's stand-in building is the style's footprint", async () => {
  const { STATION_STYLES } = await style();
  const { stationWalk, BUILDING } = await import('../station-walk.js');
  assert.deepEqual(BUILDING, STATION_STYLES.countryside.building);
  const f = STATION_STYLES.future.building, st = PLACES.future.stations.find((s) => s.role === 'arrival');
  const walk = stationWalk(st.leg, st.end, { platformLength: 120, building: f });
  const r = legRoute(st.leg), w = platformWindow(r.length, st.end, 120), town = Math.sign(laneOf(st.leg));
  const at = (s, across) => r.offsetAt(s, town * across);
  // inside the concourse's footprint 21 m from the platform's buffer end (outside the red-brick building's), and clear
  // of it further along and on the platform
  const inside = at(w.sTo - 21, (f.near + f.far) / 2), past = at(w.sTo - 30, 12), platform = at(w.sTo - 12, 5.75);
  assert.equal(walk.blocked(inside.x, inside.z, 0.35), 'station-building');
  assert.equal(walk.blocked(past.x, past.z, 0.35), null);
  assert.equal(walk.blocked(platform.x, platform.z, 0.35), null);
});

test('a built part standing square to the line blocks its own footprint, not the box round it turned', async () => {
  const { stationWalk } = await import('../station-walk.js');
  // the Metro Glide's line leaves the Futuristic place 30 degrees off the world's axes
  const r = legRoute('future-city'), town = Math.sign(laneOf('future-city'));
  const corner = (s, a) => { const q = r.offsetAt(s, town * a); return [q.x, q.z]; };
  // a 16 x 8 m block 8..16 m out, s 10..26: its four corners
  const solid = [{ key: 'transit-station-module', corners: [corner(10, 8.1), corner(26, 8.1), corner(26, 16.1), corner(10, 16.1)] }];
  const walk = stationWalk('future-city', 'start', { platformLength: 120, solid });
  const q = (s, a) => r.offsetAt(s, town * a);
  assert.equal(walk.blocked(q(18, 12).x, q(18, 12).z, 0.35), 'transit-station-module');
  // its world box would reach over the platform beside it; its own footprint doesn't
  assert.equal(walk.blocked(q(18, 5.75).x, q(18, 5.75).z, 0.35), null);
  assert.equal(walk.blocked(q(30, 12).x, q(30, 12).z, 0.35), null);
});
