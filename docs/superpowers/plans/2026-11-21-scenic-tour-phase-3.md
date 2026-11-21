# Scenic Tour Phase 3 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give the ring its sights and events, the director's camera, the map and signs to the departure station, so the tour meets the spec's "Done when".

**Architecture:** Each leg's events are pure data in leg-s (distance from the leg's first place). A pure schedule (`events.js`) tells which events are on. Pure reaction rules (`react.js`) decide the horn, stop and top-speed events and a guard brake. The models that act them out are "actors", one file per leg under `tour/actors/`. They are built with their leg in the background, like its suburbs: optional, a part per frame, and left out if they're not in. A pure shot planner (`director.js`) chooses the director's shots, which `cameras.js` frames. The map is a 2D canvas overlay with a pure projection. Wayfinding adds a sign on each arrival platform and a pointer in the HUD.

**Tech Stack:** three.js 0.180.0 through the import map; ES modules in `tour/`; no build step; WebAudio; `node --test tour/test/`.

**Spec:** `docs/superpowers/specs/2026-11-20-scenic-tour-design.md` ("Cameras", "Things to see and things that happen", "Driving", "At a station: walking", "Done when").

## Global Constraints

- three.js 0.180.0 from jsDelivr through the import map; no framework, no build step, static files only.
- Polyfork kits are self-hosted in `kits/` (gitignored) and **never committed**. Kit parts load with `part(KITS.<kit>, key, params)` (tour/parts.js).
- **Parts from Polyfork's free CDN** (`CDN` in config.js, overridable with `?cdn=`; it sends `Access-Control-Allow-Origin: *`):
  - **Animated animals** load as GLB with their own authored clips, played with `THREE.AnimationMixer`. The `.mjs` builds the model without its clips, so use the GLB.
  - **Animals and their clips** (found 2026-11-21 through `GET https://polyfork.dev/api/assets?q=…`):
    - `cow-base`: Walk, Idle, Run
    - `dolphin-base`: Swim, Idle, Swim fast
    - `herring-gull-base`: Idle, Walk, Run, Fly
    - `deer-base`: Walk, Idle, Run
    - `saddled-horse-da86d3`: Walk, Idle, Run
    - `wild-horse-047e93`: Walk, Idle, Run
  - **Static models** load with `cdnPart(id, params)`: `old-lighthouse-48ca6c` (13.9 m, lit at night), `narrow-body-airliner-619183` (36 m, lit at night) and `solar-array-rack-789c93` (4 × 2.1 m).
  - **Failures.** A CDN part that fails to load leaves its actor out with a warning, as the suburbs do. The tour never stops for one.
- Lighting stays `stage()` with no ACES tone mapping at exposure 1.
- Real metres. Never rescale a kit or CDN part to fake a fit.
- **Procedural models**, built only where Polyfork has nothing suitable: the eagle, wind turbines, the rocket, sailboats, the container ship, the rainbow, rain and snow.
  - Build them at real size in the same low-poly, flat-shaded style: `MeshStandardMaterial`, `flatShading: true`, `roughness ≥ 0.7`, and no textures except a sign's canvas.
- **Moving actors.** A moving actor (a herd, riders, a passing train, cars) never enters a platform window: the first and last 122 m of a leg. Anything that keeps pace with the train stops following it below 3 m/s and goes on its way instead of walking backwards.
- **No fail state.** "Events never punish you." If you ignore a "you react" event, nothing bad happens. The train eases to a stop by itself for the signal and the cattle, and a short message explains why. A horn you didn't sound simply isn't heard.
- "Events fire every time you drive the leg, in either direction where it makes sense."
- **Nothing is built on a moving frame.** Actors are built with their leg (`buildLeg`, behind `ctx.still()`), and anything slow is spread with `slicer.frame()` between parts, as the suburbs are. Everything new is warmed (`warm()`) before it is shown. Per-frame actor work stays light: update only actors whose window you're in, plus the static ones that are always shown.
- Director: "cuts every 5–8 seconds"; "cuts to events when they happen"; hand-placed shots at the showpieces (tunnel mouth, viaduct, trestle, cliff edge, skyline), and general shots (trackside, chase, high wide, helicopter) between them.
- `V` cycles cab → drone → director, and `1` `2` `3` pick one. `M` shows the map, driving or on foot. `H` sounds the horn.
- The basement (`index.html`) is not touched.
- Every new pure module has Node tests in `tour/test/`, and the whole suite passes after each task.

## Review Focus

1. **Driving a leg backwards.** Each event's window, stop point and shots must mirror correctly on a `back` run. A signal is approached from the high-s side; the stop point is short of it on that side. Pinned in Task 1 (`eventsFor back`) and Task 2 (`signal back`).
2. **A missing actor never acts.** If a leg's actors failed or were left out, its reactions are off. There must be no auto-brake at a signal or cattle you can't see. Pinned in Task 2 (`have false`).
3. **Reversing, or stopping and setting off again, inside a window.** Nothing gets stuck braking. A window you leave and re-enter fires again. Pinned in Task 2 (`resets on leaving`, `never brakes once cleared`).
4. **A long frame (hidden tab) or a train already past the point.** Timers count at most 0.1 s per frame. A red signal or cattle already behind the cab never brake you and simply clear. Pinned in Task 2 (`passed while red`, `dt clamp`).
5. **Director at a standstill or crawling.** A shot never divides by speed, never puts the camera underground, and doesn't choose trackside when the train isn't moving. Pinned in Task 9 (`standstill`).

---

### Task 1: The event schedule

**Files:**
- Create: `tour/events.js`
- Test: `tour/test/events.test.js`
- Modify: `docs/superpowers/specs/2026-11-20-scenic-tour-design.md`. In Anti-goals, amend **Waiting**: "A loading screen while driving or boarding, or the train stopping mid-route to load. (Amended 2026-11-21 by the owner: the brief 'Arriving at …' cover while you stand at a platform, a few seconds at most, is accepted.)"

**Interfaces:**
- Produces:
  - `EVENTS: { [legId]: EventDef[] }`. An `EventDef` is `{ id, s0, s1, dirs?: ('out'|'back')[], actor?: string, react?: ReactDef, shot?: ShotSpec, always?: boolean }`, with `s0 < s1` in leg-s.
    - `dirs` defaults to both.
    - `actor` names the actor that plays it (Tasks 3–8).
    - `always`: the actor is shown and updated wherever you are on the leg (static scenery such as the lighthouse or turbines).
    - `shot` is the director's shot for it (Task 9).
  - `ReactDef = { kind: 'crossing'|'signal'|'cattle'|'speed', at?: { out: number, back: number }, s0?, s1? }`.
  - `eventsFor(leg, dir) -> EventDef[]`: the defs whose `dirs` include `dir`.
  - `makeEventTrack(defs) -> { step({ legS, dt }) -> { active: Map<id, { t, u }>, started: id[], ended: id[] } }`.
    - An event is active while `s0 ≤ legS ≤ s1`.
    - `t` is seconds since it started, counting at most 0.1 s per step.
    - `u = (legS - s0) / (s1 - s0)`.
    - Leaving the window ends the event; entering again restarts it at `t = 0`.
  - `aheadOf(legS, at, dir) -> metres`: how far the front of a train on `dir` has to go to reach leg-s `at`. It is `at - legS` on `out` and `legS - at` on `back`, and negative once passed.

- [ ] **Step 1: Write the failing tests**

```js
import { EVENTS, eventsFor, makeEventTrack, aheadOf } from '../events.js';
import { legRoute, RING } from '../world-data.js';

test('every leg has its events, inside the line, ids unique', () => {
  for (const leg of RING.legs) {
    const L = legRoute(leg).length, ids = new Set();
    assert.ok(EVENTS[leg].length >= 5, leg);
    for (const e of EVENTS[leg]) {
      assert.ok(e.s0 >= 0 && e.s1 <= L && e.s0 < e.s1, `${leg} ${e.id}`);
      assert.ok(!ids.has(e.id)); ids.add(e.id);
    }
    assert.equal(EVENTS[leg].filter((e) => e.react).length, 1, `${leg}: one "you react" event`);
  }
});
test('the react kinds per leg are the spec\'s', () => {
  const kind = (leg) => EVENTS[leg].find((e) => e.react).react.kind;
  assert.deepEqual(RING.legs.map(kind), ['crossing', 'signal', 'cattle', 'speed', 'crossing']);
});
test('eventsFor back keeps only events that run both ways', () => { /* a def with dirs ['out'] is absent from eventsFor(leg,'back') */ });
test('every react point is at least 300 m from the start of each run it is on', () => {
  /* for each react def with `at`, for each dir it runs: aheadOf(start legS of that run, at[dir], dir) >= 300, where the
     start legS is 0 on out and the leg's length on back (each crossing, the signal, the cattle) */
});
test('aheadOf mirrors on a back run', () => {
  assert.equal(aheadOf(300, 400, 'out'), 100);
  assert.equal(aheadOf(500, 400, 'back'), 100);
  assert.ok(aheadOf(450, 400, 'out') < 0);
});
test('a track starts, runs and ends an event, and fires again on re-entry', () => {
  const tr = makeEventTrack([{ id: 'a', s0: 100, s1: 200 }]);
  assert.deepEqual(tr.step({ legS: 50, dt: 0.1 }).started, []);
  const r = tr.step({ legS: 150, dt: 0.1 });
  assert.deepEqual(r.started, ['a']); assert.equal(r.active.get('a').u, 0.5);
  assert.deepEqual(tr.step({ legS: 250, dt: 0.1 }).ended, ['a']);
  assert.deepEqual(tr.step({ legS: 150, dt: 0.1 }).started, ['a']);
});
test('t counts at most 0.1 s a step', () => { /* step dt 5 inside the window: t === 0.1 */ });
```

- [ ] **Step 2: Run `node --test tour/test/events.test.js`.** Expected: FAIL, because the module isn't there yet.

- [ ] **Step 3: Write `tour/events.js` with this data.** These are leg-s windows; actor names are the ones Tasks 3–8 build. Values marked `~` are placed by the implementer of the actor's task within ±100 m, to suit the land, and then written back here.

| Leg | id (actor) | s0–s1 | notes |
|---|---|---|---|
| city-ocean (1927 m) | `lighthouse` | 0–1927 | `always` |
| | `gulls` | 400–1850 | |
| | `freight` | 600–1150 | passing freight on the other line |
| | `dolphins` | 900–1300 | |
| | `boats` | 0–1927 | `always`: sailboats and a big ship offshore |
| | `crossing` | ~1150–1600 | react `crossing`, `at: { out: ~1500, back: ~1500 }`; shot `trackside` at the crossing |
| | showpiece `cliffs` | 900–1300 | shot `wide`, seaward |
| ocean-mountain (1106 m) | `deer` | 150–420 | |
| | `rain` | 80–520 | |
| | `rainbow` | 520–1000 | |
| | `signal` | 200–760 | out only; `always` (the signal post stands the whole leg); react `signal`, `at: { out: 400 }`; shot `below` at s 771, showing the work train clearing the viaduct |
| | `eagle` | 640–1000 | |
| | showpiece `portal` | 434–700 | out only; shot `portal` at s 642 (held through the tunnel, Task 9) |
| | showpiece `portal-back` | 380–642 | back only; shot `portal` at s 434 |
| | showpiece `viaduct` | 646–896 | shot `below` at s 771 |
| mountain-west (1427 m) | `snow` | 250–750 | |
| | `rockfall` | 450–650 | |
| | showpiece `trestle` | 690–870 | shot `below` at s 780 |
| | `riders` | 950–1300 | |
| | `horses` | 1100–1400 | |
| | `cattle` | 700–1300 | react `cattle`, `at: { out: ~980, back: ~980 }` |
| | `tumbleweeds` | 1100–1427 | |
| | `stagecoach` | 1150–1427 | |
| west-future (4145 m) | `farm` | 0–4145 | `always`: turbines and a solar farm |
| | `speed` | 700–3400 | react `speed`, `s0: 800, s1: 3300` |
| | `bullet` | 1500–2300 | |
| | `rocket` | 1900–2900 | |
| | `drones` | 3000–3700 | |
| | showpiece `guideway` | 400–3800 | shot `arc` |
| future-city (2083 m) | `fliers` | 0–2083 | `always`: hover pods between the towers at both ends |
| | showpiece `bridge` | 495–705 | shot `below` at s 600 |
| | `traffic` | 780–1800 | |
| | `plane` | 1100–1500 | |
| | `crossing` | ~1350–1750 | react `crossing`, `at: { out: ~1650, back: ~1650 }` |
| | showpiece `skyline` | 1700–2083 | shot `wide` |

- `ShotSpec = { kind, at?: leg-s, lateral?: metres (+ left of the leg's out direction), height?: metres above ground, fov? }`. Task 9 defines its kinds; here, give `at` and the side only.
- A showpiece is an `EventDef` with a `shot` and no `actor`.
- Every event that isn't `always` carries a shot too, so the director "cuts to events when they happen":
  - the passing freight and bullet, the signal and the cattle: `trackside`, at their `at` or the window's middle;
  - gulls, dolphins, deer, eagle, riders, horses, stagecoach, tumbleweeds and drones: `heli`, on their side;
  - rockfall: `chase`;
  - rocket: `wide`, towards its pad;
  - plane: `trackside` looking up (height 1.2, fov 60);
  - rain, snow and rainbow: `high-wide`, the rainbow's `lateral` on the side away from the sun;
  - traffic: `high-wide`, on the street's side.

- [ ] **Step 4: Run the tests.** Run `node --test tour/test/`. Expected: PASS, with every earlier test still passing.

- [ ] **Step 5: Commit** `git add tour/events.js tour/test/events.test.js docs/superpowers/specs/2026-11-20-scenic-tour-design.md && git commit -m "Lay out each leg's sights and events"`

### Task 2: Reactions and the guard brake

**Files:**
- Create: `tour/react.js`
- Test: `tour/test/react.test.js`

**Interfaces:**
- Consumes: `aheadOf`, `EVENTS` (Task 1); and, for the tests only, `makeJourney`, `stepTrain`, `TRAIN_SPECS`, `LEGS`, `PLACES`.
- Produces:
  - `makeReactions(defs, dir, { length })`, where `defs` are EventDefs with a `react`. It returns `{ step(input) -> out }`.
    - `input = { legS, v, dt, horn: boolean (pressed this frame), have: (id) => boolean }`. `v` is the run's speed, + forwards.
    - `out = { brakeTo: number|null, prompt: string|null, toast: string|null, message: string|null, states: Map<id, state> }`.
    - `brakeTo` is how many metres ahead the front must stop.
  - `mustBrake(brakeTo, v, spec) -> boolean`. It is true when `v > 0.05` and `brakeTo <= v² / (2 · 0.8 · spec.brake) + v · 0.5`.
  - The states each actor reads:
    - crossing `{ gates: 0..1, heard }`
    - signal `{ aspect: 'red'|'green', t }`, where `t` is seconds since the approach began
    - cattle `{ on: boolean, leaving: 0..1 }`
    - speed `{ inside, topKmh }`

Rules (with `d = aheadOf(legS, at, dir)` and dt clamped to 0.1):

- **crossing.**
  - `gates` → 1 while `-length ≤ d ≤ 350`, else → 0, eased at 0.5 per second.
  - Horn pressed while `80 ≤ d ≤ 400` sets `heard` and gives the toast `"Heard at the crossing"`.
  - The prompt `"Level crossing ahead: sound the horn (H)"` shows while `80 ≤ d ≤ 400` and not heard.
  - Never `brakeTo`.
- **signal.**
  - It shows red from the start of the run.
  - Its approach **arms** the first time the train is moving (`|v| > 1`) with `0 ≤ d ≤ 700`. From then, `t` counts.
    - A train standing at its platform never arms it.
    - The stop timer below counts only once it is armed.
  - It turns green once you've been stopped (`|v| < 0.05`), armed, with `0 ≤ d ≤ 200` for 3 s.
  - It also turns green at once if `d < 0` while red: passed, with no penalty.
  - There is no timeout: you always reach it red.
  - While armed and red, and `d ≥ 0`: `brakeTo = d - 12`.
  - While `mustBrake` is true or you're stopped there, the message is `"Red signal: a work train is clearing the viaduct"`.
  - Green gives the toast `"The signal is green"`.
- **cattle.**
  - It arms as the signal does: the first time the train moves with `0 ≤ d ≤ 700`.
  - `on` until one of these, then `leaving` runs 0 → 1 over 5 s (at once if `d < 0`):
    - the horn is pressed with `0 ≤ d ≤ 300`;
    - you've been stopped, armed, within `0 ≤ d ≤ 120` for 4 s;
    - `d < 0`.
  - While armed and `on || leaving < 0.6`, and `d ≥ 0`: `brakeTo = d - 20`.
  - The prompt `"Cattle on the line: sound the horn (H)"` shows while `on` and `d ≤ 500`.
  - The message `"Cattle on the line: the train stops for them"` shows while braking for them.
- **speed.**
  - `inside` while `s0 ≤ legS ≤ s1`. `topKmh` is the highest `|v|·3.6` inside.
  - Leaving gives the toast `"Top speed on the high-speed stretch: <n> km/h"`.
- **All kinds.**
  - Each state resets once `legS` is more than 800 m from its `at` (or outside `[s0 - 800, s1 + 800]`).
  - A def whose `have(id)` is false contributes nothing: no prompt and no brake.
  - Of several `brakeTo` values, the smallest wins.

- [ ] **Step 1: Write the failing tests**

```js
const spec = { brake: 0.8 };
const sig = { id: 'signal', react: { kind: 'signal', at: { out: 400 } } };
const sigBoth = { id: 'signal', react: { kind: 'signal', at: { out: 400, back: 930 } } };   // made up, to check the mirroring
const have = () => true;
test('signal: armed by moving, red brakes short of it, out', () => {
  const r = makeReactions([sig], 'out', { length: 50 });
  const o = r.step({ legS: 0, v: 16, dt: 0.1, horn: false, have });
  assert.equal(o.brakeTo, 388);
});
test('signal back: approached from the high side', () => {
  const r = makeReactions([sigBoth], 'back', { length: 50 });
  assert.equal(r.step({ legS: 1000, v: 16, dt: 0.1, horn: false, have }).brakeTo, 58);
});
test('standing at the platform never arms it, nor turns it green', () => {
  // legS 45, v 0, dt 0.1 x 100: aspect red, brakeTo null, no toast
});
test('signal: green after 3 s stopped near it once armed, then no brake', () => {
  // one step at legS 250 v 5 (arms), then legS 300 v 0 dt 0.1 x 31: aspect green, brakeTo null, toast once "The signal is green"
});
// the real trains from the real starts (journey.runRoute / limits, TRAIN_SPECS, stepTrain with the guard brake), at
// full throttle and never braking themselves, for train lengths 40 and 120: each stops short of the event while it's
// still red / on the line, waits, and goes on once it clears
test('the Highland Climber, out from Oceanside, stops short of the red signal and goes on at green', () => {
  /* loop at dt 0.05: input brake = mustBrake(out.brakeTo, v, spec); assert min d >= 0 while aspect red;
     the train stops (v 0) with 0 <= d <= 200; aspect green within 4 s of stopping; then it passes the signal */
});
test('the Canyon Express, out and back, stops short of the cattle unless the horn sounds', () => {
  /* the same from each run's start at the cattle's `at` in EVENTS; a second run pressing H at d 280 never stops */
});
test('passed while red: green, no brake', () => { /* legS 450 v 10 out: brakeTo null, aspect green */ });
test('have false: no prompt, no brake', () => { /* have: () => false at legS 300: brakeTo null, prompt null */ });
test('resets on leaving: red again on the next approach', () => { /* green at 300, then legS 1300, then back to 0: aspect red */ });
test('never brakes once cleared', () => { /* cattle: horn at d 250 -> after 5 s leaving 1, brakeTo null while still short of it */ });
test('crossing: the horn in its window is heard, outside it is not', () => { /* horn at d 600: heard false; at d 300: heard true, toast */ });
test('speed: tops recorded inside, toast on leaving', () => { /* v 80 inside -> topKmh 288; legS past s1 -> toast "...288 km/h" */ });
test('dt clamp: a 5 s frame counts 0.1 s', () => { /* signal stopped near it, one step dt 5: still red */ });
test('mustBrake: true inside stopping distance, false well outside and at rest', () => {
  assert.equal(mustBrake(100, 16, spec), true);
  assert.equal(mustBrake(400, 16, spec), false);
  assert.equal(mustBrake(5, 0, spec), false);
});
```

- [ ] **Step 2: Run `node --test tour/test/react.test.js`.** Expected: FAIL.
- [ ] **Step 3: Implement `tour/react.js` to the rules above.**
- [ ] **Step 4: Run `node --test tour/test/`.** Expected: all PASS.
- [ ] **Step 5: Commit** `git commit -m "Decide the horn, signal, cattle and top-speed events, and a guard brake"`

### Task 3: Actors on the line, end to end with the level crossings

**Files:**
- Create:
  - `tour/actors/index.js`: the registry and the builder for a leg
  - `tour/actors/crossing.js`: the level crossing, used on two legs
  - `tour/actors/animals.js`: Polyfork's CDN animals with their own clips
- Modify:
  - `tour/main.js`: `buildLeg`, the frame, keys, the HUD, and the debug hook
  - `tour/slicer.js`: `scenery()`'s handle gains a `built` getter (what its build returned once added, else null)
  - `tour/audio.js`: the crossing bell and event sounds
  - `tour.html`: `#toast` already exists; add `#event` for messages
- Test: `tour/test/actors.test.js` (the clip choice), `tour/test/main-wiring.test.js` (two guards)

**Interfaces:**
- Consumes: `eventsFor`, `makeEventTrack`, `aheadOf` (Task 1); `makeReactions`, `mustBrake` (Task 2).
- Produces:
  - `ACTORS: { [actorName]: (ctx) => Promise<Actor> }` in `tour/actors/index.js`. Each leg file registers into it by importing and spreading its own map: `export const coast = { lighthouse, gulls, … }`.
    - `ctx = { leg, route (legRoute(leg), leg-s), def, terrain, slicer, kit: (kitKey, key, params) => part }`.
  - `Actor = { group: THREE.Object3D, update(f), dispose?() }`.
    - `f = { legS, dir, dt, time, on: { t, u } | null, react: state | null, camera, train: { front: Vector3, v, length }, night: look.night (0..1), sunDir: Vector3 }`.
    - `update` is called each frame only while the actor's event is active, or always for `always` actors.
    - An actor hides its own moving parts when `on` is null.
  - `buildEventActors(leg, { terrain, slicer }) -> Promise<{ group, actors: Map<id, Actor>, dispose() }>`.
    - It builds each EventDef's actor in turn, with `await slicer.frame()` between them.
    - An actor whose build throws is warned about (`console.warn`, naming leg and id) and left out; the rest go on.
    - An actor name not yet in `ACTORS` (a later task's) is skipped quietly.
  - `loadAnimal(id) -> Promise<{ make() -> Animal }>` in `animals.js`.
    - It loads `${CDN}${id}.glb` once with `GLTFLoader` (from `three/addons/`) and caches it by id.
    - `make()` clones it with `SkeletonUtils.clone` and gives it its own `AnimationMixer`.
    - It throws an error naming the URL if the load fails.
  - `Animal = { object, play(name, { timeScale = 1, fade = 0.3 }), update(dt) }`.
  - `clipFor(speed, clips: string[], { walk = 1.4, run = 6 }) -> { name, timeScale }`, a pure function:
    - `Idle` below 0.2 m/s;
    - `Walk` up to `(walk + run) / 2`, timed by `speed / walk`;
    - beyond that, `Run`, timed by `speed / run`;
    - `Swim` and `Swim fast` stand in for Walk and Run on a swimmer;
    - `Fly` on a bird when airborne (`speed > 2`);
    - timeScale is clamped to [0.5, 2].
  - `sound(name)` in `audio.js` for `'bell'` (one ding), `'whoosh'`, `'rumble'` and `'roar'`. Make the noise sounds from a filtered noise buffer, and keep each under 0.12 gain.
  - The debug hook gains:
    - `__tour.jump(legS)`: puts your train, stopped, at that leg-s on its current run, for checking events;
    - `__tour.events`, a getter returning `{ active: [...ids], react: Object.fromEntries(states) }`.

**Wiring in main.js:**
- **In `buildLeg`.** After the structures land, start `events = scenery(...)` beside `suburbs`, with the same `add`, `deadline: SUBURBS_DEADLINE` and warn pattern:
  - its build is `buildEventActors(id, { terrain, slicer })`;
  - its group is `shadows()`ed and `warm()`ed before it is returned.
- **Settled and left out.** `thing.settled()` is true once both suburbs and events are settled. Rename `leaveOutSuburbs` to `leaveOutExtras`, which leaves out both; update its one caller in `board()`.
- **On each new run.** When you take a train (`take`), make the leg's track and reactions:
  - `track = makeEventTrack(eventsFor(leg, dir))`;
  - `reactions = makeReactions(eventsFor(leg, dir).filter((e) => e.react), dir, { length: train.length })`.
- **Each frame while driving.** Let `legS = where.s` and `on = track.step(...)`. Then:
  - `r = reactions.step({ legS, v: drive.v, dt, horn: hornPressed, have: (id) => !!legThing?.events?.built?.actors.has(id) })`.
    - Expose the built result on the scenery handle so `have` can read it.
    - Set `hornPressed` by the `H` keydown; clear it after the step.
  - Brake if `r.brakeTo !== null && mustBrake(r.brakeTo, drive.v, train.spec)`. OR this into `stepTrain`'s `brakeKey`, and force the throttle to 0 on frames it brakes, as `arr.hold` does.
  - Update the active actors of the current leg, and the `always` ones of every built leg.
- **HUD.**
  - `r.prompt` shows in `#prompt` when there's no get-out prompt.
  - `r.message` shows in `#event` (a line above the driver's panel).
  - `r.toast` and the speed toast show in `#toast` for 3 s.
  - While `speed.inside`, `#dist` gains ` · top <n> km/h`.
- **On foot.** No reactions run; `always` actors keep updating.
- **Getting out** inside an event's window ends it: each active actor gets one update with `on: null`, so rain, the work train and the like don't freeze in view. On boarding, the track and reactions are made afresh.
- **Boot.** The first leg's actors are built straight through behind the loading screen (slicer `sync`). Note the boot time before and after this task, using `landBoot` and the loading screen's duration. If it grows by more than 1.5 s, build that leg's actors after the loading screen goes instead, in the background like any other leg's.

**The level crossing actor (`crossing.js`):**
- **The crossing.** Railway `level-crossing` with `barriers: 1`, on both lines at the crossing's `at`. Turn it to the line, and animate its `boom-west` and `boom-east` rig nodes from `react.gates`.
- **The road.** A flat road strip (6 m wide) crossing at right angles, 70 m each side, on the terrain. Use the `country-lane-tile` part (railway) along it, or a flat `MeshStandardMaterial` strip `#5d5a55` if the tiles don't fit the slope.
- **Waiting cars.** Two cars wait on each side, 8 m and 14 m back from the boom: NYC `veh-compact-car` and `veh-taxi` on city-ocean; Chrome Arcology `wheeled-city-coupe` on future-city. When the gates lift, they drive over and away at 8 m/s, and are back in place next time.
- **The bell.** `sound('bell')` rings once a second while gates > 0 and the train is within 300 m.
- **Placing it.** Choose `at` within the window from Task 1 so the line is within 1.5 m of the natural ground for 15 m either side, then write it back into `events.js`.

- [ ] **Step 1: Write the failing tests.**
  - `clipFor`:
    - gives `Idle` at 0;
    - gives `Walk` at 1.4 with timeScale 1, and `Run` at 9 with timeScale 1.5;
    - picks `Swim fast` over `Run` for a dolphin's clip list;
    - picks `Fly` for a gull's list at 12 m/s;
    - never gives a timeScale outside [0.5, 2].
  - In main-wiring: `main.js` passes `mustBrake(` into the train's brake, and `board()` calls `leaveOutExtras()`.
- [ ] **Step 2: Run `node --test tour/test/`.** Expected: the new tests FAIL.
- [ ] **Step 3: Implement** the actor registry, the crossing, the animals' loader, the sounds and the wiring above.
- [ ] **Step 4: Run `node --test tour/test/`.** Expected: all PASS.
- [ ] **Step 5: Check it in the page.**
  - Start `preview_start {name: "basement-empire"}` and open `/tour.html?debug`.
  - Run `__tour.jump(1050)`, then drive towards Oceanside.
  - Expected:
    - the prompt shows;
    - `H` gives "Heard at the crossing";
    - the booms come down, the bell rings, and the cars cross after you;
    - there are no console errors.
  - Do the same at the far end of future-city once its leg is built (board there via the ring, or `jump` on that run).
- [ ] **Step 6: Commit** `git commit -m "Act out events along the line, starting with the level crossings"`

### Task 4: The Highland Climber's leg (Oceanside → Mountain)

**Files:**
- Create: `tour/actors/climb.js` (registered in `tour/actors/index.js`)
- Modify: `tour/main.js`: the sky tweak only
- Test: `tour/test/actors.test.js` (pure helpers only)

**Interfaces:**
- Consumes: the actor contract, `loadAnimal` and `clipFor` (Task 3); the signal state (Task 2).
- Produces:
  - An `Actor` may expose `weather(f) -> { cloudCover?: number, haze?: number } | null`. The frame adds this to `sky` before `skyDome.update`.
  - `rainbowArc(sunDir) -> { centre: Vector3 direction, radius: radians }`, a pure helper.

**The actors:**
- **`signal`.**
  - Two railway `colour-light-signal`s at s 400 on your line, one with `aspect: 'red'` and one with `aspect: 'green'`. Show whichever the state says (red before the approach arms).
  - It stands on the left of the line as the driver approaches, 2.6 m out from the centre, facing them.
  - Out runs only. On a back run, the post still stands, showing green, facing away.
  - The work train is railway `diesel-shunter` + two `hopper-wagon`s, posed with `poseTrain` on your line.
    - It stands on the viaduct at s 700 while the signal is red.
    - When it turns green, it runs on towards the Mountain at 6 m/s.
    - It is hidden once more than 320 m ahead of your front, or when you're on a back run.
- **`deer`.** Three CDN `deer-base`, grazing (`Idle`) on the slope 25–60 m from the line, on the land side.
  - At `u > 0.3` they run off uphill at 7 m/s for 4 s, using the clip from `clipFor`.
- **`rain`.**
  - About 1500 streaks: one `LineSegments` with a fixed buffer, recycled in a 60 m box round the camera and falling at 9 m/s.
  - Shown while on, fading in over `u` 0–0.1 and out over 0.9–1.
  - `weather` returns `{ cloudCover: +0.45, haze: +0.15 }` scaled by the fade.
- **`rainbow`.**
  - A thin seven-band torus segment (radius 400 m, additive, `depthWrite: false`, opacity 0.35) placed in the sky opposite the sun, from `rainbowArc`, at 42° from the antisolar point.
  - It fades in over `u` 0–0.2 and out over 0.8–1.
  - It is hidden if the sun's elevation is below 0 or above 42°. In that case write a `console.info` once, and leave the event as a no-show: the spec allows dropping an event with a note.
- **`eagle`.** A procedural eagle: dark-brown body 0.9 m, 2 m wings flapping slowly, gliding mostly. It circles at 25–40 m up, 40 m out on the valley side, keeping pace with the train (its centre follows the front).

- [ ] **Step 1: Write the failing tests.** `rainbowArc` puts the centre opposite the sun, with its y below the horizon when the sun is up.
- [ ] **Step 2: Run `node --test tour/test/`.** Expected: FAIL.
- [ ] **Step 3: Implement** the actors and the sky tweak.
- [ ] **Step 4: Run `node --test tour/test/`.** Expected: PASS.
- [ ] **Step 5: Check it in the page.** Drive the leg out from Oceanside, and back.
  - Expected:
    - it rains, then clears to the rainbow;
    - the deer bound off;
    - if you don't brake, the train stops itself before the red signal, with its message;
    - it goes green after 3 s, and the work train goes ahead;
    - in the director view, the work train is seen clearing the viaduct;
    - the eagle is over the viaduct;
    - on a back run, the train is never stopped.
  - Take `__tour.snap` stills of the rainbow and the signal.
- [ ] **Step 6: Commit** `git commit -m "Rain, a rainbow, deer, an eagle and the red signal on the climb"`

### Task 5: The Canyon Express's leg (Mountain → Wild West)

**Files:**
- Create: `tour/actors/canyon.js`
- Test: `tour/test/actors.test.js` (pure helpers)

**Interfaces:**
- Consumes: the actor contract, `loadAnimal`, `clipFor` and `sound` (Task 3); the cattle state (Task 2).
- Produces: `herdPath(route, s, side, lateral) -> { x, y, z, yaw }`, a pure helper: a point that runs beside the line.

**The actors:**
- **`snow`.** About 2500 points falling at 1.2 m/s, drifting, in a 70 m box round the camera. Shown while on, faded at the ends. `weather` adds `{ haze: +0.1 }`.
- **`rockfall`.**
  - Six nature `rock-medium` boulders (`colorway: 'granite-grey'`).
  - When the event starts, they tumble down the slope behind the train: starting 40–60 m up, 30–60 m behind the last car, on the uphill side. They roll with gravity along the terrain's slope and come to rest 12 m or more from the line.
  - `sound('rumble')` once.
- **`riders`.** Three CDN `saddled-horse-da86d3` running (`Run`).
  - Each carries a frontier `outlaw-character`, seated on the saddle with the `Sitting` clip from the kit's `clips.mjs` (`animate(figure, { clips: ['Sitting'] })`) and parented to the horse.
  - They race along a track 25–35 m from the line, matching the train's speed minus 1 m/s, so they slowly fall behind.
- **`horses`.** Eight CDN `wild-horse-047e93` (`Run`), galloping alongside on the other side, 40–70 m out, as a loose herd.
- **`cattle`.**
  - Five CDN `cow-base`: `Idle` while on the line, `Walk` while leaving.
  - While `on`, they stand on the track at `at`, the whole group within 4 m of your line.
  - While `leaving`, they amble off to the land side, 25 m out.
  - If the event is passed with `d < 0`, they're already off: the rule clears them.
  - **Placing it.** Choose `at` on level line with open land beside it, then write it back into `events.js`.
- **`tumbleweeds`.** Six frontier `tumbleweed`, rolling across the line ahead of the train, rotating as they roll and blown by a steady wind. They are recycled ahead of the train.
- **`stagecoach`.** A frontier `stagecoach` with two CDN `saddled-horse-da86d3` (`Run`) in front. It runs on a dirt road 30 m from the line at 9 m/s, its wheels (`wheel-*` rig) spinning.

- [ ] **Step 1: Write the failing tests.** `herdPath` stays at least `lateral - 0.5` m from the line's centre, and its yaw follows the route.
- [ ] **Step 2: Run `node --test tour/test/`.** Expected: FAIL.
- [ ] **Step 3: Implement** the actors.
- [ ] **Step 4: Run `node --test tour/test/`.** Expected: PASS.
- [ ] **Step 5: Check it in the page.** Drive the leg both ways.
  - Expected:
    - snow at the pass;
    - rocks tumble behind;
    - the riders race and fall behind;
    - if you ignore the cattle, the train stops itself before them with its message, and they amble off after 4 s;
    - with the horn, they leave and you never stop.
  - Take `snap` stills.
- [ ] **Step 6: Commit** `git commit -m "Snow, rockfall, riders, horses, cattle, tumbleweeds and a stagecoach on the Canyon Express"`

### Task 6: The Silver Arrow's leg (Wild West → Futuristic)

**Files:**
- Create: `tour/actors/desert.js`
- Modify: `tour.html`: speed boards' text, only if the HUD needs it

**Interfaces:**
- Consumes: the actor contract and `sound` (Task 3); the speed state (Task 2); `buildTrain` with `builder: 'bullet'` (tour/vehicles.js) for the passing train.

**The actors:**
- **`farm` (always).**
  - Twelve procedural wind turbines: 80 m hub, 40 m blades, white, turning slowly, three blades. Put them in two rows 500–900 m north of the line between s 1000 and 2500.
  - A solar farm of about 300 CDN `solar-array-rack-789c93`: its meshes copied into one `InstancedMesh` per material, in rows 250–400 m south of the line around s 1500.
  - Keep turbines off the mesas (`FEATURES`).
- **`speed`.**
  - A pair of marker boards at `s0` and `s1`: white and red, "HIGH SPEED" and "END", made from a canvas texture, 3 m out on the driver's side.
  - The HUD and toast come from Task 3's wiring.
- **`bullet`.**
  - A second Silver Arrow (4 cars), built with `buildTrain`, on the other line, running the other way at 280 km/h.
  - Time it so the two fronts pass at the window's middle: work out where it starts from your speed when the event starts.
  - `sound('whoosh')` as the fronts pass (within 60 m).
  - Hidden once more than 600 m behind you.
- **`rocket`.**
  - A procedural rocket: white, 40 m, with a nose cone and four fins, on a pad 6 km south-west of the line at s 2400.
  - When the event starts, it lifts off and climbs, pitching east, for 60 s, with an exhaust plume: additive cone plus glow sprite. It leaves a fading trail made from a `Line` with a growing buffer.
  - `sound('roar')` once, quiet.
  - It is visible from the drone and the cab against the dusk sky.
- **`drones`.**
  - Twenty-four Chrome Arcology `service-drone-bot`s (`undercarriage: 'hover'`) in formation, 60–100 m up, 150 m off the line, flying alongside.
  - They morph between a ring, a line and an arrow every 6 s.
  - Each carries a small emissive light, shown when `look.night > 0`.

- [ ] **Step 1: Run `node --test tour/test/`.** Expected: PASS. This task is visual; its rules were pinned in Tasks 1–2.
- [ ] **Step 2: Implement** the actors.
- [ ] **Step 3: Check it in the page.**
  - Drive the bullet leg at full throttle.
  - Expected:
    - the boards;
    - the top speed shown, then the toast;
    - the other Silver Arrow flashes past with a whoosh;
    - the rocket climbs on the horizon;
    - the drones fly in formation with lights after dusk;
    - the turbines turn.
  - Check the frame time with the turbines in view, using `landFrames` and DevTools performance. There must be no long task over 50 ms from the actors.
- [ ] **Step 4: Commit** `git commit -m "The high-speed stretch, a passing bullet, a rocket launch, drones and a wind farm"`

### Task 7: The Seaside Excursion's leg (City → Oceanside)

**Files:**
- Create: `tour/actors/coast.js`

**Interfaces:**
- Consumes: the actor contract (Task 3), `COAST` (world-data), and `buildTrain` for the freight.

**The actors:**
- **`lighthouse` (always).** The CDN `old-lighthouse-48ca6c` (13.9 m; its lamp lights at night through `place.light`-style `has_night`, or by turning its lamp's emissive up with `night`).
  - It stands on the cliff-top headland seaward of the line, near x 1120, z -300. Keep it on land: `terrain.heightAt > SEA_LEVEL + 3`.
  - Add a slowly turning additive beam cone, shown when `night > 0.2`.
- **`boats` (always).**
  - Four procedural sailboats (8 m, white sails) drifting slowly 300–900 m offshore.
  - One coast `fishing-boat` (`parked: false`) puttering 150 m out.
  - One procedural container ship (180 m, dark hull, stacked coloured boxes) on the horizon, 2.5 km out, moving at 4 m/s.
  - All bob gently.
- **`gulls`.** Six CDN `herring-gull-base` flying (`Fly`) with the train. They keep 10–25 m off the seaward side and 8–15 m up, weaving.
- **`dolphins`.** A pod of four CDN `dolphin-base` (`Swim fast`), 80–150 m offshore.
  - They leap in arcs in turn, each leap 1.2 s, pitched along the arc.
  - Each leap ends in a splash: a short burst of white particles.
- **`freight`.**
  - A railway `mainline-diesel` (`colorway: 'deep-green'`) with eight `tank-wagon`s and `hopper-wagon`s, on the other line, coming the other way at 60 km/h.
  - Time it so the fronts pass at the window's middle, as in Task 6.
  - Hidden once more than 400 m behind you.
- **`cliffs`** is a showpiece and needs nothing here.

- [ ] **Step 1: Run `node --test tour/test/`.** Expected: PASS.
- [ ] **Step 2: Implement** the actors.
- [ ] **Step 3: Check it in the page.** Drive City → Oceanside and back.
  - Expected:
    - gulls with the train;
    - dolphins along the cliffs;
    - boats and the ship offshore;
    - the freight passes;
    - the lighthouse is on the headland, its beam turning after dark (on the back run).
  - Take `snap` stills.
- [ ] **Step 4: Commit** `git commit -m "Gulls, dolphins, boats, a lighthouse and a passing freight along the coast"`

### Task 8: The Metro Glide's leg (Futuristic → City)

**Files:**
- Create: `tour/actors/metro.js`

**Interfaces:**
- Consumes:
  - the actor contract (Task 3);
  - the suburbs' street (`LAYOUT.street`, tour/suburbs.js), only where the leg's suburbs stand (`LEGS['future-city'].suburbs`);
  - the City and Futuristic places' centres (`PLACES`).

**The actors:**
- **`fliers` (always).** Twelve Chrome Arcology `commuter-hover-pod`s and `hover-cargo-skiff`s flying lanes between the towers. Six circle over the Futuristic place at 30–60 m, and six over Downtown City at 40–90 m, gliding and banking at 15 m/s. Each shows its lights after dark.
- **`traffic`.**
  - Cars on the suburbs' street on both sides (`route.offsetAt(s, ±LAYOUT.street)` at the ground), going both ways at 10–14 m/s within the event's window, spaced 40–80 m.
  - Use NYC `veh-compact-car`, `veh-taxi` and `veh-box-truck`, and Chrome Arcology `wheeled-city-coupe`.
  - Headlights show after dark: small emissive quads.
  - Only where the suburbs were built. If they were left out, the event shows nothing.
- **`plane`.** The CDN `narrow-body-airliner-619183` (36 m, lit after dark), gear down, on an approach path crossing the line low: 120 m up over the line at the window's middle, descending at 3° towards the north-east.
- **`skyline`** and **`bridge`** are showpieces.

- [ ] **Step 1: Run `node --test tour/test/`.** Expected: PASS.
- [ ] **Step 2: Implement** the actors.
- [ ] **Step 3: Check it in the page.** Drive Futuristic → City.
  - Expected:
    - pods fly round the towers at both ends;
    - traffic runs on the suburban streets;
    - the plane comes in low overhead;
    - the crossing works at the city end.
- [ ] **Step 4: Commit** `git commit -m "Flying vehicles, a plane overhead and road traffic into the city"`

### Task 9: The director's shot planner

**Files:**
- Create: `tour/director.js`
- Test: `tour/test/director.test.js`

**Interfaces:**
- Consumes: `eventsFor` (Task 1); `ShotSpec`.
- Produces: `makeDirector({ rand = Math.random } = {}) -> { step(input) -> { shot, cut }, reset() }`.
  - `input = { dt, legS, dir, v, showpieces: EventDef[] (with shot, for this run), started: EventDef[] (events started this frame, with a shot), length (train, m) }`.
  - `shot = { kind, id: string|null, at: leg-s|null, lateral, height, fov, hold }`.
  - Kinds:
    - `'trackside'`: fixed, low, ahead of the train;
    - `'chase'`: moving, behind and above;
    - `'high-wide'`: fixed, 60 m up, 150 m out;
    - `'heli'`: moving, alongside;
    - `'below'`: fixed, near the ground, under a bridge;
    - `'portal'`: fixed, beside a tunnel mouth, looking at it;
    - `'arc'`: moving, a slow arc round the nose;
    - `'wide'`: fixed, far, long lens.

Rules:
- `hold` is uniform in [5, 8] s. A cut comes when the shot's age ≥ hold.
- An event with a `shot` that starts cuts to it at once if the current shot's age ≥ 1.5 s (else at 1.5 s). Its hold is `max(hold, 5)`.
- At a cut, a showpiece is preferred if `legS` is within its window, or within `v · 4` m before it in the direction of travel, and it was not used in the last two cuts. Its spec gives `at`, `lateral`, `height` and `fov`.
- Otherwise, the next general kind cycles through `trackside`, `chase`, `high-wide`, `heli`, never the same kind twice running.
  - `trackside` is used only when `|v| > 3`. Its `at = legS + sign · (|v|·3 + 40)`, where sign is +1 out and -1 back, with `lateral = ±(4.5 + rand·3)` and `height = 1.2`.
  - Otherwise it falls through to the next kind.
- Defaults:
  - `trackside` fov 45, `chase` 55, `high-wide` 40 (lateral ±150, height 60), `heli` 50 (lateral ±35, height 18), `wide` 28 (lateral given), `below` 50 (height 1.5), `portal` 45, `arc` 50.
- At a standstill (`|v| < 0.05`) only `chase`, `heli` and `high-wide` are chosen.
- A `portal` or `below` showpiece shot holds until the train leaves its window, up to 20 s, instead of 5–8 s. That covers the tunnel's 12 s of darkness with the shot at its mouth.
- An event that starts while such a shot holds still cuts in, as it does from any shot.

- [ ] **Step 1: Write the failing tests**

```js
const seq = (xs) => { let i = 0; return () => xs[i++ % xs.length]; };
test('holds 5 to 8 s between cuts', () => { /* rand 0 -> cuts at 5 s; rand 0.999 -> at ~8 s */ });
test('cuts to a started event after 1.5 s at the least', () => { /* shot age 0.5: no cut; at 1.5: cut to its kind, id = event id */ });
test('prefers a showpiece the train is in, not twice in a row', () => { /* viaduct showpiece at 646..896, legS 700 -> kind below, id viaduct; next cut not viaduct */ });
test('general kinds rotate, never the same twice running', () => { /* 20 cuts, no consecutive repeat */ });
test('a portal shot holds through the tunnel, up to 20 s', () => { /* portal showpiece 434..700, v 16 from legS 440: no cut for 15 s; at legS > 700 it cuts */ });
test('trackside is ahead of the train, mirrored on a back run', () => {
  /* v 20, out, legS 500 -> at 600; back, legS 500 -> at 400 */
});
test('standstill: no trackside, no division by speed', () => { /* v 0: kinds within chase|heli|high-wide, all fields finite */ });
```

- [ ] **Step 2: Run `node --test tour/test/director.test.js`.** Expected: FAIL.
- [ ] **Step 3: Implement `tour/director.js`.**
- [ ] **Step 4: Run `node --test tour/test/`.** Expected: PASS.
- [ ] **Step 5: Commit** `git commit -m "Plan the director's shots: cuts, showpieces and events"`

### Task 10: The director's view

**Files:**
- Modify:
  - `tour/cameras.js`: mode `'director'`, framing each shot kind
  - `tour/main.js`: Digit3; passing showpieces and started events
  - `tour.html`: help line `V change view · 1 cab · 2 drone · 3 director`

**Interfaces:**
- Consumes: `makeDirector` (Task 9); `eventsFor` (Task 1); `route.offsetAt`; `terrain.heightAt`.
- Produces:
  - `makeCameras(...)` gains `director` mode in `MODES = ['cab', 'nose', 'drone', 'director']` (the nose view was added at the owner's request before this task; keep it), and `4` picks the nose view.
  - `update(dt, train, ctx)` takes `ctx = { legS, dir, v, route (leg route, leg-s), length, showpieces, started }` when the director is on.

**Framing:**
- **Fixed kinds.** Fixed kinds compute their position once, at the cut: `route.offsetAt(at, lateral)`, with y = ground (`heightAt`) + height. A `below` shot puts y at ground + height under the structure. A `portal` shot puts the camera 25 m beyond the mouth, 10 m out and 4 m up.
- **Following the train.**
  - Fixed kinds look at the train's middle each frame, eased with `1 - exp(-dt·4)`.
  - Moving kinds (`chase`, `heli`, `arc`) follow the front each frame, eased.
- **Clamps.** Every camera position keeps `y ≥ heightAt + 1.2`. A `below` shot uses 0.5 when over water: `y ≥ SEA_LEVEL + 1` there.
- **Lens.** fov is set per shot; leaving the director view puts it back to 55.
- **Cab and drone.** The cab interior stays hidden and the shell unclipped in the director view, as in the drone.
- **On foot.** Nothing changes: the over-the-shoulder view.

- [ ] **Step 1: Run `node --test tour/test/`.** Expected: PASS. The camera code is the page's; Task 9 pinned the planner.
- [ ] **Step 2: Implement** the director view and its wiring.
- [ ] **Step 3: Check it in the page.** In each leg, press `3` and drive.
  - Expected:
    - cuts every 5–8 s;
    - below the viaduct and the trestle as the train crosses;
    - at the tunnel mouth as it bursts out;
    - wide over the cliffs and the skyline;
    - an arc round the bullet's nose;
    - cuts to the crossing, the signal, the cattle and the passing trains as they happen;
    - never underground; no console errors.
  - Take a `snap` still of each showpiece shot.
- [ ] **Step 4: Commit** `git commit -m "The director's view: dramatic shots that cut to showpieces and events"`

### Task 11: The map

**Files:**
- Create: `tour/map.js`
- Modify:
  - `tour.html`: `<canvas id="map">` overlay, centred, 80% of the shorter side, hidden until on; help line `M map`
  - `tour/main.js`: key `M` toggles and `Escape` closes, driving or on foot; draw while open
- Test: `tour/test/map.test.js`

**Interfaces:**
- Consumes: `legRoute`, `PLACES`, `RING`, `stationFrame` (world-data).
- Produces:
  - `mapFrame(points: {x,z}[], { w, h, pad }) -> { scale, toScreen(x, z) -> [px, py] }`. It fits the points with the same scale on both axes, puts north (-z) up and centres them.
  - `makeMap(canvas) -> { open, toggle(), close(), draw({ you: {x, z, yaw}, leg|null, place|null, departure: {x, z, label}|null }) }`.

**Drawing:**
- **The routes.** Every leg's route, sampled every 25 m, as 3 px lines in cream. The current leg is in gold.
- **The places.** Each place is a circle with its name.
- **You.** A red dot with a heading tick.
- **Departure marker.** On foot, the departure station is marked with a green flag and a label, for example `"Departures: Highland Climber to Mountain"`.
- **Background.** Translucent dark (`#141b24e6`), with rounded corners.
- **Cost.** Redrawn only while open.

- [ ] **Step 1: Write the failing tests.**
  - `mapFrame` maps the bounds' corners inside `[pad, w - pad]` and `[pad, h - pad]`.
  - Equal distances on x and z map to equal pixels.
  - A point further north (smaller z) has a smaller py.
- [ ] **Step 2: Run `node --test tour/test/map.test.js`.** Expected: FAIL.
- [ ] **Step 3: Implement** the map and its keys.
- [ ] **Step 4: Run `node --test tour/test/`.** Expected: PASS.
- [ ] **Step 5: Check it in the page.** Press `M` while driving and on foot in two places.
  - Expected: the ring, the five names, your dot moving, and on foot the departure flag.
  - Take a screenshot.
- [ ] **Step 6: Commit** `git commit -m "A map of the ring, driving or on foot"`

### Task 12: Signs to the departure station, and the docs

**Files:**
- Create: `tour/wayfinding.js`
- Modify:
  - `tour/stations.js`: a sign on arrival platforms
  - `tour/main.js`: pass the sign text; the on-foot HUD pointer
  - `README.md`, `PROJECT_BRIEF.md`: describe Phase 3: events, director, map, signs; Phase 3 done
- Test: `tour/test/wayfinding.test.js`

**Interfaces:**
- Consumes: `stationFrame`, `PLACES`, `LEGS` (world-data); `TRAIN_SPECS`.
- Produces:
  - `departureFor(placeId) -> { leg, train: string, to: string, x, z }`: the middle of the place's departure platform.
  - `pointer(from: {x, z}, viewYaw, target: {x, z}) -> { arrow: '↑'|'↗'|'→'|'↘'|'↓'|'↙'|'←'|'↖', metres }`. The arrow is relative to the way you're looking (yaw convention as route.js: `atan2(dx, dz)`).
  - `buildTerminus(leg, end, { ..., sign: string|null })` adds a code-made board.
    - The board is 2.4 × 1 m, white text on deep green from a canvas texture, on two posts 2.2 m high.
    - It stands on an arrival platform's town side, 6 m from its open (ramp) end, facing along the platform.
    - Its posts are solid: add them to the terminus's walk `solid`, so the walker can't pass through.

**The sign and the pointer:**
- **The sign's text.** For arrival stations, `"Departures across town: <train> to <place>"`.
- **The pointer.** On foot, `#mode` reads `On foot in <place> · Departures <arrow> <distance>`, using `distance()` from main.js.

- [ ] **Step 1: Write the failing tests.**
  - `departureFor('ocean')` is `{ leg: 'ocean-mountain', train: 'Highland Climber', to: 'Mountain', … }`.
  - `pointer` gives `'↑'` straight ahead, `'→'` 90° to the right, `'↓'` behind, and the right `metres`.
- [ ] **Step 2: Run `node --test tour/test/wayfinding.test.js`.** Expected: FAIL.
- [ ] **Step 3: Implement** the sign, the pointer and the docs.
- [ ] **Step 4: Run `node --test tour/test/`.** Expected: PASS.
- [ ] **Step 5: Check it in the page.** Get out at Oceanside and the Mountain.
  - Expected:
    - the sign on the arrival platform;
    - you can't walk through its posts;
    - the HUD arrow points to the departure station as you turn;
    - following it gets you there.
- [ ] **Step 6: Run the "Done when" check.** Drive the whole ring once, out, with the director view on for part of each leg, and run one leg back.
  - Expected:
    - every leg's events happen;
    - none can make you fail;
    - no loading pause while driving;
    - no console errors.
  - Record any event that couldn't be made and why in `PROJECT_BRIEF.md`.
- [ ] **Step 7: Commit** `git commit -m "Signs and a pointer to the departure station; the docs for Phase 3"`
