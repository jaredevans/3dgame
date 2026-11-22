// Wiring in main.js that no unit test reaches otherwise (it's a page module, not importable in Node).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const src = readFileSync(new URL('../main.js', import.meta.url), 'utf8');

// the frame ticks each place with the THREE.Clock's elapsed time: its walkers walk and its figures' mixers run on it.
// A local of the same name in the frame (as the stall clock's frame time once was) hands them undefined, and they stop
// (NaN) without a word
test('main.js has one `clock`, the THREE.Clock the places are ticked with', () => {
  const decls = src.match(/\b(?:const|let|var)\s+clock\b/g) ?? [];
  assert.equal(decls.length, 1, `declared ${decls.length} times`);
  assert.match(src, /const clock = new THREE\.Clock\(\)/);
  assert.match(src, /p\.tick\(clock\.elapsedTime\)/);
});

// the guard brakes for a red signal or cattle on the line: the reactions' stopping distance reaches the train's brake
// (stepTrain's brakeKey), not just the HUD, or the train runs through them
test("main.js brakes the train when the guard must (mustBrake into stepTrain's brake)", () => {
  assert.match(src, /import \{[^}]*\bmustBrake\b[^}]*\} from '\.\/react\.js'/);
  const guard = src.match(/const (\w+) = [^;\n]*mustBrake\(/);
  assert.ok(guard, 'no guard brake worked out with mustBrake(');
  assert.match(src, new RegExp(`brakeKey: [^,]*\\b${guard[1]}\\b`), `the guard brake (${guard[1]}) is not in stepTrain's brakeKey`);
});

// boarding a train its leg's extras (suburbs, event actors) aren't in for leaves them out, so they're never built as
// you drive
test('board() leaves out the leg\'s extras', () => {
  const board = src.match(/function board\(w\) \{[\s\S]*?\n {2}\}/);
  assert.ok(board, 'no board()');
  assert.match(board[0], /\.leaveOutExtras\(\)/);
  assert.doesNotMatch(src, /leaveOutSuburbs/);
});

// the director's view (cameras.js) plans from this run's showpieces (a shot, no actor) and the events with a shot that
// start (an actor's: a showpiece's window opening would cut to it as a short event shot), in the leg's own leg-s and
// left (run.route is turned round on a back run)
test("main.js tells the director this run's showpieces and events, on the leg's route", () => {
  assert.match(src, /viewCtx\.showpieces = defs\.filter\(\(e\) => e\.shot && !e\.actor\)/);
  assert.match(src, /if \(e\?\.shot && e\.actor\) viewCtx\.started\.push\(e\)/);
  assert.match(src, /viewCtx\.route = routes\[run\.leg\]/);
  assert.match(src, /views\.update\(dt, train\.model, viewContext\(dt\)\)/);
  assert.match(src, /'Digit3'\) views\.set\('director'\)/);
  assert.match(src, /'Digit4'\) views\.set\('nose'\)/);
});

// auto mode (Z) presses what a player would: its throttle steps join yours, its brake is stepTrain's brake key (with
// the guard's, so the guard still stops it), and on foot its keys are what the walker steps with
test('main.js: Z toggles auto mode, whose throttle, brake and walking keys go through the player\'s inputs', () => {
  assert.match(src, /e\.code === 'KeyZ'\) \{ if \(auto\.on\) stopAuto\(\); else startAuto\(\);/);
  assert.match(src, /if \(auto\.on && TAKE_OVER\[state\.mode\]\.has\(e\.code\)\) stopAuto\(\)/);
  assert.match(src, /brakeKey: keys\.has\('Space'\) \|\| \(auto\.on && auto\.out\.brake\) \|\| arr\.hold \|\| guard/);
  assert.match(src, /if \(auto\.on\) throttleSteps \+= auto\.out\.throttleSteps/);
  assert.match(src, /player\.update\(dt, auto\.on \? auto\.keys : footInput\(\), walkWorld\(\)\)/);
  // E and H are the same for both: auto gets out, boards and sounds the horn through them
  assert.match(src, /if \(e\.code === 'KeyE'\) \{ pressE\(\); return; \}/);
  assert.match(src, /if \(e\.code === 'KeyH'\) pressH\(\)/);
  const step = src.match(/function autoStep\(dt\) \{[\s\S]*?\n {2}\}/);
  assert.ok(step, 'no autoStep()');
  assert.match(step[0], /pressE\(\)/);
  assert.match(step[0], /pressH\(\)/);
  assert.doesNotMatch(step[0], /\bgetOut\(\)|\bboard\(/, 'auto gets out and boards only as E does');
  // it gets out only at the run's destination (just after boarding, stopHere() is the platform it's leaving), and
  // boards only the onward train
  assert.match(step[0], /stopHere\(\) === run\.to/);
  assert.match(step[0], /departureFor\(state\.place\)\.leg/);
  // it draws up where the guard wants it stopped (a red signal, cattle), rather than creeping on each time he lets go
  assert.match(step[0], /auto\.to\.stopS = autoMark\(run\.stopS, drive\.s, evOut\?\.brakeTo\)/);
  assert.match(step[0], /autoThrottle\(drive, auto\.to, auto\.out\)/);
  // its search for the way runs on a slicer of its own, ticked each frame
  assert.match(src, /autoSlicer\.tick\(AUTO_SLICE\)/);
});

// teleport (T): the list opens only when T may work (canTeleport), its numbers are taken before the views' 1-4, and
// nothing else answers a key while you fizz; meanwhile auto mode waits, the train is braked, you stand still, and both
// where you are and where you're going are wanted until you're moved there
test('main.js: T teleports, and the frame holds everything else still meanwhile', () => {
  assert.match(src, /import \{[^}]*\bmakeTeleport\b[^}]*\bcanTeleport\b[^}]*\} from '\.\/teleport\.js'/);
  assert.match(src, /e\.code === 'KeyT'\) \{ if \(tpListOpen\) closeTeleportList\(\); else if \(tp\.active\) tp\.cancel\(\); else if \(tpCan\(\)\) openTeleportList\(\);/);
  assert.match(src, /e\.code === 'Escape'\) \{[^}]*tp\.cancel\(\);/);
  // Esc with the map open closes only the map (a second Esc cancels the teleport)
  assert.match(src, /e\.code === 'Escape'\) \{ if \(mapView\.open\) return void mapView\.close\(\); closeTeleportList\(\); tp\.cancel\(\);/);
  const digits = src.indexOf("pickTeleport(+e.code.slice(5))"), views = src.indexOf("'Digit1') views.set('cab')");
  assert.ok(digits > 0 && views > digits, 'the list\'s numbers come before the views\'');
  assert.match(src, /if \(tp\.active\) return;/);
  assert.match(src, /if \(tp\.active\) teleportStep\(dt\);[^\n]*\n\s*else if \(auto\.on\) autoStep\(dt\);/);
  assert.match(src, /brakeKey: [^}]*\|\| tp\.active,/);
  assert.match(src, /state\.mode === 'foot' && tp\.active\) player\.update\(dt, STILL_KEYS, walkWorld\(\)\)/);
  // till you're moved, all that was wanted where you stood (worked out once, at the pick) and where you're going
  assert.match(src, /if \(tp\.active && !tp\.swapped\) for \(const id of tpKeep\) set\.add\(id\)/);
  assert.match(src, /tpKeep = new Set\(\[\.\.\.wanted\(here\), \.\.\.wanted\(\{ place: c\.id \}\)\]\)/);
  // you're moved as journey.teleport says, and its trains put at their stations
  const swap = src.match(/function teleportSwap\(\) \{[\s\S]*?\n {2}\}/);
  assert.ok(swap, 'no teleportSwap()');
  assert.match(swap[0], /journey\.teleport\(state, tp\.to\)/);
  assert.match(swap[0], /fleet\.wait\(w\.leg, w\.dir\)/);
  assert.match(swap[0], /turnPending\(\)/);
});

// the figure's teleport cut (player.js) and the cabs' shells are clipped planes: local clipping is on from the renderer's
// making, not left to the cabs' fitting having run first
test('main.js turns on local clipping where it makes the renderer', () => {
  assert.match(src, /const renderer = new THREE\.WebGLRenderer\([^\n]*\n(?:\s*\/\/[^\n]*\n)*\s*renderer\.localClippingEnabled = true;/);
});
