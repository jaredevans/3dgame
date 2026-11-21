// Stopping at a platform (arrival.js): what lies beyond the place is kept while the train stays in that platform's
// window, built only at a standstill and behind a cover, and the cover and the hold never last for ever.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeArrival } from '../arrival.js';

const DT = 1 / 60;
// a frame at the Mountain's platform (the run's destination) unless said otherwise
const at = (o = {}) => ({ window: 'mountain', destination: 'mountain', stopped: true, missing: () => false, busy: false, ready: true, dt: DT, ...o });
const run = (a, frames, o) => { let r; for (let k = 0; k < frames; k++) r = a.step(at(o)); return r; };

test('arriving: the cover goes up at a standstill, the build starts once it is up, and it lifts once all is in', () => {
  const a = makeArrival({ coverUp: 0.3 });
  let r = a.step(at({ stopped: false, missing: () => true }));
  assert.equal(r.cover, null, 'still rolling along the platform: no cover');
  assert.equal(r.build, false, 'nor any build while moving');
  r = a.step(at({ missing: () => true }));
  assert.deepEqual(r.cover, { place: 'mountain', arriving: true });
  assert.equal(r.fresh, true, 'a fresh stop (failed builds may be tried again)');
  assert.equal(r.at, 'mountain');
  assert.equal(r.build, false, 'the cover is still fading in');
  assert.equal(r.getOut, false); assert.equal(r.hold, true);
  r = run(a, 20, { missing: () => true, busy: true });
  assert.equal(r.build, true, 'up: building behind it');
  assert.ok(r.cover && r.hold && !r.getOut);
  r = a.step(at());
  assert.equal(r.cover, null, 'all in: it lifts');
  assert.equal(r.getOut, true); assert.equal(r.hold, false);
  assert.equal(r.fresh, false);
});

test('nothing to build: no cover, and you can get out at once', () => {
  const r = makeArrival().step(at());
  assert.equal(r.cover, null); assert.equal(r.getOut, true); assert.equal(r.hold, false); assert.equal(r.at, 'mountain');
});

test('creeping along the platform keeps what lies beyond, and stopping again in it builds nothing again', () => {
  const a = makeArrival();
  a.step(at());
  let r = a.step(at({ stopped: false }));
  assert.equal(r.at, 'mountain', 'moving, but still in the platform window: kept');
  r = a.step(at());
  assert.equal(r.cover, null);
  assert.equal(r.fresh, false, 'the same stop');
  r = a.step(at({ window: null, stopped: false }));
  assert.equal(r.at, null, 'out of the window: let go');
});

test('setting off and coming back to the platform you left says so, not "arriving"', () => {
  const r = makeArrival().step(at({ window: 'ocean', missing: () => true }));
  assert.deepEqual(r.cover, { place: 'ocean', arriving: false });
});

test('a build that never ends: the cover lifts after its longest, and you can get out', () => {
  const a = makeArrival({ coverUp: 0.3, coverMax: 2 });
  a.step(at({ missing: () => true }));
  let r = run(a, 60, { missing: () => true, busy: true });
  assert.ok(r.cover, 'up a second in');
  r = run(a, 90, { missing: () => true, busy: true });
  assert.equal(r.cover, null, 'past its longest');
  assert.equal(r.getOut, true);
  r = a.step(at({ missing: () => true, busy: true }));
  assert.equal(r.cover, null, 'not put up again at the same stop');
});

test('a build that failed is not waited for: what failed is not "missing", so no cover goes up for it', () => {
  // the page's missing(place) asks the streamer what's still to be built, which leaves out what failed
  const r = makeArrival().step(at({ missing: () => false, ready: true }));
  assert.equal(r.cover, null); assert.equal(r.getOut, true);
});

test('held while not free to leave, but never for ever', () => {
  const a = makeArrival({ holdMax: 1 });
  let r = a.step(at({ ready: false }));
  assert.equal(r.hold, true);
  r = run(a, 70, { ready: false });
  assert.equal(r.hold, false, 'past the longest hold');
  r = a.step(at({ window: null, stopped: false, ready: false }));
  assert.equal(r.hold, false, 'between platforms: never held');
});

test('the longest hold counts from the standstill, cover and all: a cover that times out lets the train go too', () => {
  const a = makeArrival({ coverUp: 0.3, coverMax: 2, holdMax: 2 });
  a.step(at({ missing: () => true }));
  const r = run(a, 150, { missing: () => true, busy: true, ready: false });
  assert.equal(r.cover, null); assert.equal(r.getOut, true);
  assert.equal(r.hold, false, 'not held a second time over');
});

test('on foot: nothing kept for the train, no cover, no hold', () => {
  const a = makeArrival();
  a.step(at({ missing: () => true }));
  const r = a.step({ foot: true, dt: DT });
  assert.deepEqual([r.at, r.cover, r.hold], [null, null, false]);
});
