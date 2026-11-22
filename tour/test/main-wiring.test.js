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
