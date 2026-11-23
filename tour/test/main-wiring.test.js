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
  assert.match(src, /'Digit4' && state\.mode !== 'ride'\) views\.set\('nose'\)/);
});

// riding, the views are the seat, the chase and the director (owner's ruling R23): V cycles those three, 4 (the nose)
// does nothing; driving, V cycles all four as before
test('main.js: on a ride V cycles the seat, chase and director only, and 4 gives no nose; a train keeps all four', () => {
  assert.match(src, /const RIDE_VIEWS = \['cab', 'drone', 'director'\];/);
  const v = src.match(/if \(e\.code === 'KeyV'\) \{[\s\S]*?\n {4}\}/);
  assert.ok(v, 'no V handler');
  assert.match(v[0], /if \(state\.mode === 'ride'\) views\.set\(RIDE_VIEWS\[\(RIDE_VIEWS\.indexOf\(views\.mode\) \+ 1\) % RIDE_VIEWS\.length\]\);/);
  assert.match(v[0], /else views\.cycle\(\);/);
  // (and the cycle itself is unchanged for trains: cameras.js's four)
  const cams = readFileSync(new URL('../cameras.js', import.meta.url), 'utf8');
  assert.match(cams, /const MODES = \['cab', 'nose', 'drone', 'director'\];/);
  // the director never looks steeply down on a train or ride from close by (owner, 2026-11-22): a wide shot is stood
  // out and brought down (director.test.js steepOver), but for the balloon's; and a moving shot past a route's end goes
  // on along its heading rather than standing over the vehicle at its pad
  assert.match(cams, /unsteep\(shot, ctx, sign, at, lateral \* f\);/);
  assert.match(cams, /function unsteep\(shot, ctx, sign, at, lateral\) \{\n\s*if \(ctx\.overhead\) return;/);
  assert.match(cams, /const on = Math\.min\(route\.length, Math\.max\(0, s\)\), past = s - on;/);
  // in a tunnel the director's view rides the train's nose, its planner going on, and puts its shot on afresh after
  assert.match(cams, /const \{ shot, cut \} = director\.step\(ctx\);\n[\s\S]{0,200}if \(tunnelAt\(ctx\.tunnels, ctx\.legS\)\) \{[\s\S]{0,160}shotCam\.fresh = true;\n\s*noseView\(dt, train\);/);
});

// auto mode (Z by train, X by ride) presses what a player would: its throttle steps join yours, its brake is
// stepTrain's brake key (with the guard's, so the guard still stops it), and on foot its keys are what the walker steps with
test('main.js: Z and X toggle the auto tours, whose throttle, brake and walking keys go through the player\'s inputs', () => {
  assert.match(src, /import \{[^}]*\btourKey\b[^}]*\} from '\.\/autopilot\.js'/);
  assert.match(src, /if \(e\.code === 'KeyZ' \|\| e\.code === 'KeyX'\) \{\n\s*const next = tourKey\(e\.code, \{ mode: state\.mode, tour: auto\.on \? auto\.tour : null, afterRide: autoAfterRide \}\);/);
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
  // both tours watch from the director's view only (owner, 2026-11-22): no cycling through the views
  assert.match(src, /function autoView\(\) \{\n\s*if \(views\.mode !== 'director'\) views\.set\('director'\);/);
  assert.doesNotMatch(src, /auto\.cycle|makeViewCycle/);
  // the ride tour: on foot it goes to the place's ride, and takes it only within reach and once it's ready
  assert.match(step[0], /if \(auto\.tour === 'rides'\) \{ autoRideStep\(dt, k\); return; \}/);
  const ride = src.match(/function autoRideStep\(dt, k\) \{[\s\S]*?\n {2}\}/);
  assert.ok(ride, 'no autoRideStep()');
  assert.match(ride[0], /if \(nearRide\(player\.state, ride, RIDE_REACH\)\) \{\n\s*if \(!rideReady\(leg\)\) return;[\s\S]*takeRide\(leg\);[\s\S]*autoView\(\);/);
  assert.match(ride[0], /autoPlanTo\(ride\.board, \{ reach: AUTO_RIDE_REACH \}\)/);
  assert.doesNotMatch(ride[0], /\bboard\(|pressE\(\)/, 'the ride tour never boards a train');
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

// a ride (Phase 4): E on foot takes it only from beside where it waits (nearRide) once it's ready (readyToRide), and
// never ahead of a train you're beside (auto's E, beside the onward train, boards that); riding, E and the driving keys
// do nothing but the views still answer; the runner's done sets you down (journey.landed)
test('main.js: E takes a ride only near it and ready; riding ignores the driving keys; done lands you', () => {
  assert.match(src, /import \{[^}]*\breadyToRide\b[^}]*\} from '\.\/streaming\.js'/);
  assert.match(src, /import \{[^}]*\bnearRide\b[^}]*\bmakeRideRunner\b[^}]*\} from '\.\/ride-run\.js'/);
  const near = src.match(/const rideNear = \(\) => \{[\s\S]*?\n {2}\};/);
  assert.ok(near, 'no rideNear()');
  assert.match(near[0], /nearRide\(player\.state, \w+, RIDE_REACH\)/);
  assert.match(src, /import \{[^}]*\bRIDE_REACH\b[^}]*\} from '\.\/ride-run\.js'/);   // (6 m: ride-run.test.js)
  const press = src.match(/function pressE\(\) \{[\s\S]*?\n {2}\}/);
  assert.ok(press, 'no pressE()');
  assert.match(press[0], /const w = boardable\(\);/);
  assert.match(press[0], /else if \(!w && !auto\.on\) \{ const r = rideNear\(\); if \(r && rideReady\(r\.leg\)\) takeRide\(r\.leg\); \}/);
  assert.match(src, /const rideReady = \(leg\) => readyToRide\(leg, /);
  const take = src.match(/function takeRide\(leg\) \{[\s\S]*?\n {2}\}/);
  assert.ok(take, 'no takeRide()');
  assert.match(take[0], /state = journey\.ride\(state, leg\)/);
  assert.match(take[0], /\.leaveOutExtras\(\)/);
  assert.match(take[0], /turnPending\(\)/);
  assert.match(take[0], /player\.exit\(\)/);
  assert.match(take[0], /runner\.start\(/);
  // riding: only the views; no throttle, horn or E
  assert.match(src, /if \(state\.mode !== 'drive' && state\.mode !== 'ride'\) return;/);
  assert.match(src, /if \(state\.mode === 'drive'\) \{\n\s*if \(e\.code === 'KeyW' \|\| e\.code === 'ArrowUp'\) throttleSteps\+\+;/);
  assert.match(src, /ride: new Set\(\),/);
  // Z mid-ride waits for the landing; T doesn't work mid-ride
  assert.match(src, /autoAfterRide = next\.afterRide;/);   // (Z mid-ride: autopilot.test.js tourKey)
  assert.match(src, /const tpCan = \(\) => !controls && state\.mode !== 'ride' && canTeleport\(/);
  // the frame: the runner, then landing when it's done
  assert.match(src, /ridden = runner\.update\(dt, rideEnv\);/);
  assert.match(src, /if \(ridden\.done\) stepOff\(\);/);
  const land = src.match(/function stepOff\(\) \{[\s\S]*?\n {2}\}/);
  assert.ok(land, 'no stepOff()');
  assert.match(land[0], /journey\.landed\(state\)/);
  assert.match(land[0], /fleet\.wait\(w\.leg, w\.dir\)/);
  assert.match(land[0], /player\.enter\(/);
  assert.match(land[0], /runner\.stop\(\)/);
  assert.match(land[0], /if \(autoAfterRide\) \{ autoAfterRide = false; startAuto\('train'\); \}/);
  // nothing lands, nor is freed, on a ride's moving frames; the ride's kit stays wanted while riding (where.ride)
  assert.match(src, /mayLand = state\.mode === 'ride' \? false : /);
  assert.match(src, /if \(\(state\.mode === 'foot' \|\| \(state\.mode === 'drive' && Math\.abs\(drive\.v\) < 0\.05\)\)/);
  assert.match(src, /where\.ride = true/);
  assert.match(src, /views\.update\(dt, runner\.train, rideViewContext\(dt\)\)/);
  // the prompts by a ride: ready, or still being built
  assert.match(src, /if \(r\) prompt = rideReady\(r\.leg\) \? `Take the \$\{r\.name\} to \$\{PLACES\[r\.to\]\.name\} \(E\)` : `Getting the \$\{r\.name\} ready…`;/);
  // the vehicle you stepped off, let go of or wanted again where it waits, is put back on its own pad
  assert.match(src, /if \(kit\) parkVehicle\(kit, rideFor\(rideKeep\.leg\), 0\);/);
  // every ride's path worked out behind the loading screen, before the first places are asked for
  const warmAt = src.indexOf('for (const leg of RIDE_LEGS) rideFor(leg)'), firstWant = src.indexOf('await streamer.want(wanted({ place: state.place }))');
  assert.ok(warmAt > 0 && warmAt < firstWant, 'the rides are worked out before the first want');
});

// Ruling R10: riding a leg, its `always` actors are told it's a ride (their frame's `ride` flag), so the signal's work
// train, a train event, doesn't run for the ride as it would for a train at the ride's leg-s
test('main.js tells the leg\'s actors a ride\'s frame from a train\'s; the signal keeps its work train for trains', () => {
  const frame = src.match(/function actorFrame\(leg, id, on, dt\) \{[\s\S]*?\n {2}\}/);
  assert.ok(frame, 'no actorFrame()');
  const [rideBranch, trainBranch] = frame[0].split(/\n {4}return \{\n {6}legS: mine/);
  assert.match(rideBranch, /state\.mode === 'ride' && state\.leg === leg/);
  assert.match(rideBranch, /\bride: true\b/);
  assert.doesNotMatch(trainBranch, /\bride: true\b/);
  const climb = readFileSync(new URL('../actors/climb.js', import.meta.url), 'utf8');
  assert.match(climb, /import \{[^}]*\bworkTrainRuns\b[^}]*\} from '\.\/paths\.js'/);
  assert.match(climb, /if \(!workTrainRuns\(f\)\) \{ workS = WORK\.at; work\.group\.visible = false; return; \}/);
});

// the rides' vehicles are solid on foot (walk-world.js vehicles): every built ride's but the one you're on, its
// footprint where its holder stands now (waiting, or landed and kept); the walk world gets them each time it's made
test('main.js gives the walk world the rides\' standing vehicles', () => {
  assert.match(src, /import \{[^}]*\bsolidVehicles\b[^}]*\} from '\.\/walk-world\.js'/);
  const fn = src.match(/function rideVehicles\(\) \{[\s\S]*?\n {2}\}/);
  assert.ok(fn, 'no rideVehicles()');
  assert.match(fn[0], /for \(let k = 0; k < RIDE_IDS\.length; k\+\+\)/);
  assert.match(fn[0], /if \(!kit \|\| kit === runner\.kit\) continue;/);
  assert.match(fn[0], /foot: vehicleFoot\(kit\.vehicle\), holder: kit\.vehicle\.holder/);
  assert.match(fn[0], /return solidVehicles\(rideStanding, player\.state\.x, player\.state\.z, BODY, rideSolid\);/);
  assert.match(src, /const walkWorld = \(\) => makeWalkWorld\(\{[\s\S]*?vehicles: rideVehicles\(\),\n {2}\}\);/);
});

// riding, the far place's trains are put at their platforms out of view (rides.js placeFarTrains, this frame's camera,
// after the views have moved it), and as you land if they never were
test('main.js puts the far place\'s trains at their platforms on a frame neither is in view, after the views move', () => {
  assert.match(src, /import \{[^}]*\bplaceFarTrains\b[^}]*\} from '\.\/rides\.js'/);
  const views = src.indexOf("else if (state.mode === 'ride') views.update(dt, runner.train, rideViewContext(dt));");
  const place = src.indexOf("if (state.mode === 'ride' && !rideLeg.placed && placeFarTrains(ridden.legS, routes[state.leg].length, farTrainsSeen))");
  assert.ok(views > 0 && place > views, 'the trains are placed before the camera has moved this frame');
  assert.doesNotMatch(src, /ridden\.legS > routes\[state\.leg\]\.length \/ 2/);
  assert.match(src, /farView\.frustum\.setFromProjectionMatrix\(farView\.m\)/);
});

// a hidden tab has no frames, but WebAudio plays on: the ride's engine (and any sound) is suspended while it's hidden
test('main.js quiets the sound while the tab is hidden', () => {
  assert.match(src, /import \{[^}]*\bhideSound\b[^}]*\} from '\.\/audio\.js'/);
  assert.match(src, /document\.addEventListener\('visibilitychange', \(\) => \{[^\n]*hideSound\(document\.hidden\)/);
});

// the ride loop makes nothing new each frame: an always actor's ride frame is its own, kept and filled
test('main.js keeps each always actor\'s ride frame, not a new one a frame', () => {
  const frame = src.match(/function actorFrame\(leg, id, on, dt\) \{[\s\S]*?\n {2}\}/);
  const [rideBranch] = frame[0].split(/\n {4}return \{\n {6}legS: mine/);
  assert.match(rideBranch, /let f = rideFrames\.get\(id\);/);
  assert.match(rideBranch, /return f;/);
  assert.equal((rideBranch.match(/\{ front:/g) ?? []).length, 1, 'its train made more than once');
  assert.match(src, /rideLeg\.on = rideLeg\.track\.step\(rideLegAt\);/);
});
