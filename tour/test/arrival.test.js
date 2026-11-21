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

// The cover only hides a place's kit being built in one go (0.3–1.7 s), and the hold only keeps the train from leaving
// as that lands: neither waits on the long stall time that says a build couldn't be loaded. With a build that never
// ends, both lift within a few seconds, and you can get out or drive off.
test('with a build that never ends, the cover and the hold lift within a few seconds at the default caps', async () => {
  const { COVER_MAX, HOLD_MAX } = await import('../arrival.js');
  assert.ok(COVER_MAX >= 5 && COVER_MAX <= 10, `cover cap ${COVER_MAX} s`);
  assert.ok(HOLD_MAX >= 5 && HOLD_MAX <= 10, `hold cap ${HOLD_MAX} s`);
  const a = makeArrival();
  const hung = { missing: () => true, busy: true, ready: false };
  let r = a.step(at(hung)), t = 0;
  for (; r.cover || r.hold; t += DT) r = a.step(at(hung));
  assert.ok(t <= 10 + DT, `lifted after ${t.toFixed(1)} s`);
  assert.equal(r.getOut, true, 'E gets you out');
  assert.equal(r.hold, false, 'and the train may go');
  r = run(a, 600, hung);
  assert.deepEqual([r.cover, r.hold, r.getOut], [null, false, true], 'and stays that way at this stop');
});

test('the hold is only ever at a standstill: never while moving in a platform window', () => {
  const a = makeArrival();
  let r = a.step(at({ ready: false }));
  assert.equal(r.hold, true, 'stopped, not free to leave: held');
  r = a.step(at({ ready: false, stopped: false }));
  assert.equal(r.hold, false, 'moving in the window: never held');
});

test('creeping and stopping again in the window does not start the longest hold over', () => {
  const a = makeArrival({ holdMax: 1 });
  let r = run(a, 70, { ready: false });
  assert.equal(r.hold, false, 'held its longest');
  a.step(at({ ready: false, stopped: false }));   // creep
  r = a.step(at({ ready: false }));                // and stop again
  assert.equal(r.hold, false, 'not held again at the same stop');
});

// arriving at the run's destination tries again what failed, before deciding on the cover: a retried build is then
// "missing", so the cover goes up for it on that very frame rather than it being built uncovered
test('arriving, what failed is tried again before the cover is decided, so a retried build is covered', () => {
  const a = makeArrival();
  let retried = 0;
  const r = a.step(at({ retry: () => { retried++; }, missing: () => retried > 0 }));
  assert.equal(retried, 1);
  assert.deepEqual(r.cover, { place: 'mountain', arriving: true }, 'covered on the arrival frame');
  assert.equal(r.build, false, 'nothing built until the cover is up');
  a.step(at({ retry: () => { retried++; }, missing: () => true }));
  assert.equal(retried, 1, 'once per arrival');
  makeArrival().step(at({ window: 'ocean', retry: () => { retried++; } }));
  assert.equal(retried, 1, 'not at the platform you set off from');
});

// on foot, what you can board waits on what's still being built only for a few seconds (waited); once you've waited
// that long and board, the train isn't held, nor a cover put up, at the platform you leave from
test('on foot, how long you have waited on what is still building; boarding after that, no hold or cover', async () => {
  const { WAIT_MAX } = await import('../streaming.js');
  const a = makeArrival();
  let r = a.step({ foot: true, busy: true, dt: 1 });
  assert.equal(r.waited, 1);
  r = a.step({ foot: true, busy: false, dt: 1 });
  assert.equal(r.waited, 0, 'nothing building: no wait');
  for (let k = 0; k < WAIT_MAX + 1; k++) r = a.step({ foot: true, busy: true, dt: 1 });
  assert.ok(r.waited >= WAIT_MAX);
  // boarded: in the cab at the departure platform, something still building
  r = a.step(at({ window: 'ocean', missing: () => true, busy: true, ready: false }));
  assert.deepEqual([r.cover, r.hold, r.getOut], [null, false, true], 'not kept waiting a second time');
  // boarding with nothing building is as before
  const b = makeArrival();
  b.step({ foot: true, busy: false, dt: 1 });
  r = b.step(at({ window: 'ocean', ready: false }));
  assert.equal(r.hold, true);
});

// what you've already waited at the stop, in the cab, counts on foot: getting out under a cover that timed out doesn't
// start the wait to board over
test('getting out after waiting at the stop, that wait counts towards boarding', async () => {
  const { WAIT_MAX } = await import('../streaming.js');
  const a = makeArrival();
  const hung = { missing: () => true, busy: true, ready: false };
  let r;
  do r = a.step(at(hung)); while (r.cover || r.hold);   // the cover and hold run out
  r = a.step({ foot: true, busy: true, dt: DT });
  assert.ok(r.waited >= WAIT_MAX, `waited ${r.waited.toFixed(1)} s already`);
  r = a.step({ foot: true, busy: false, dt: DT });
  assert.equal(r.waited, 0, 'and nothing building, no wait');
});
