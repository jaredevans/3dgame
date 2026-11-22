# Scenic Tour Phase 4 (the other ways to travel) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** At each place, beside the onward train, a ride waits (boat, balloon, stagecoach, jet, flying car) that, once taken, carries you on its own to the next place through a set piece, setting you down to carry on as after a train.

**Architecture:** Each ride is pure data (tour/rides.js): a path of its own (a `makeRoute` curve in world metres), a speed profile lasting ~90 s, a table mapping ride-s to the leg's leg-s, its boarding and landing points, and a timeline of set pieces in ride-s. A ride runner (tour/ride-run.js) moves the vehicle along its path, feeds the leg-s mapping to everything already keyed to the leg (streaming, sky, the leg's `always` actors such as the rocket), and hands the views and the director a one-car "train" made of the vehicle and the ride's own path. Journey gains a `ride` mode; main.js only wires it in.

**Tech Stack:** three.js 0.180.0 through the import map; ES modules in `tour/`; no build step; WebAudio; `node --test tour/test/`.

**Spec:** `docs/superpowers/specs/2026-11-21-scenic-tour-rides-design.md` (approved 2026-11-21), on top of `docs/superpowers/specs/2026-11-20-scenic-tour-design.md`.

## Global Constraints

- three.js 0.180.0 through the import map; static files; no build step. Polyfork kits self-hosted in `kits/` and never committed; single parts only through `cdnPart(id, params)` / `loadAnimal(id)` / kit `part()`, self-hosted in `kits/parts/` by `node scripts/extract-parts.mjs` (re-run it after naming a new part id).
- `stage()` lighting, no ACES tone mapping at exposure 1. Real metres, bar two owner exceptions: the octopus scaled up ~5× (to some 15–20 m across) and the crows 3–4×.
- **No fail state**: the octopus, the gang and the UFO never win; every set piece is a scripted near-miss, every ride.
- **No gore or real violence**: gunshots are muzzle flashes, dust puffs and ricochet pings, no one hit; lasers are bright bolts that miss.
- **Nothing is built on a moving frame**; no loading pause while riding; no per-frame allocation in the ride loop.
- Rides go onward only; fully automatic once taken (no steering, no getting off mid-ride); about 90 seconds each.
- During a ride the leg's train events don't play; only the leg's `always` actors (the lighthouse, boats offshore, wind/solar farm, the Futuristic place's pods, the City's helicopters and drones, the signal post, the rocket) keep updating, as for a train at the mapped leg-s.
- The `Z` auto tour takes the trains only.
- The trains, their events, the director's train shots, the map, the signs and the auto tour keep working as now.
- Pure logic in three-free modules (Node has no `three` package) with Node tests.
- HD where the tour's HD path already covers it: every animal loaded through `loadAnimal` is listed in `HD_ANIMALS` (tour/hd-switch.js; a test enforces it), so the octopus and the crows are added there (dressed in HD if Polyfork has a materials map for them, else flat with one warning).

## Review Focus

1. **A ride not built yet (or its vehicle failed to load).** Walking up to it says "Getting <ride> ready…" (or nothing, with a console warning, if its vehicle couldn't be loaded); it is never boardable half-built. Pinned in Task 2 (`readyToRide`) and Task 3 (prompt).
2. **`Z`, `E`, `V`, `M` and the throttle keys during a ride.** `Z` doesn't start the auto tour mid-ride (it waits until you land, then carries on by train); `E` and driving keys do nothing; `V` cycles the views; `M` shows the map with your dot on the ride's path. Pinned in Task 3 (wiring test + page check).
3. **Arriving by ride, then going back.** The train back along that leg is standing at the arrival platform facing back, boardable, exactly as after a train. Pinned in Task 2 (`journey.landed` returns the trains to place) and Task 3 (page check).
4. **The ride's leg-s mapping.** Monotonic, inside [0, L], starting near the departure end and ending near the arrival end, so streaming and the sky never jump backwards. Pinned in Task 1 (each ride's table).
5. **A long frame or a hidden tab mid-ride.** The ride advances at most 0.1 s a frame and never skips its set piece's trigger. Pinned in Task 1 (`rideStep` clamps dt; timeline crossing).

---

### Task 1: The rides as data

**Files:**
- Create: `tour/rides.js` (pure), `tour/test/rides.test.js`

**Interfaces:**
- Consumes: `makeRoute` (tour/route.js), `legRoute`, `PLACES`, `LEGS`, `COAST`, `SEA_LEVEL`, `stationFrame`, `laneOf`, `worldTerrain` (tour/world-data.js), `ROCKET`/`rocketPad` (tour/actors/paths.js) for the jet.
- Produces:
  - `RIDE_LEGS = ['city-ocean', 'ocean-mountain', 'mountain-west', 'west-future', 'future-city']`.
  - `rideFor(leg) -> Ride` (memoised): `{ leg, id: 'boat'|'balloon'|'coach'|'jet'|'car', name: string (for prompts: "speedboat", "hot-air balloon", "stagecoach", "jet", "flying car"), from, to, board: { x, z, y, yaw }, land: { x, z, y, yaw }, step: { x, z, y, yaw } (where you're set down, on foot), path: Route (makeRoute over its points, metres), duration: s, profile, legS: Float64Array (leg-s per metre of path), events: EventDef[] (in ride-s, same shape as events.js: `{ id, s0, s1, actor, shot? }`), showpieces: EventDef[] (shots, no actor) }`.
  - `rideStep(state: { s, t }, dt, ride) -> { s, t, v, done }`: advances by a speed profile (ease out of the start, cruise, ease into the landing) so the whole path takes `ride.duration` (85–95 s); dt clamped to 0.1; `done` once `s >= path.length`.
  - `rideLegS(ride, s) -> number`: the leg-s for ride-s, from the table.

Paths (the designer's calls in the spec are the builder's here; these are the decisions):
- **Boat** (city-ocean): a jetty on Downtown City's seafront (the nearest point of `COAST` to the City's centre, its end over water ≥ 2 m deep), at sea level, along the coast 120–250 m offshore (the cliffs on its right going out), into Oceanside's harbour beside the ocean-mountain departure station (its shore end, 1995, −208 in world-data's `LEGS['ocean-mountain']` first points). `step`: that station's platform approach.
- **Balloon** (ocean-mountain): up from a pad by Oceanside's departure station to ~150 m above the land, over the forest, viaduct and waterfall valley, down to a pad by the Mountain's arrival station.
- **Coach** (mountain-west): along a new road over the hills beside the line (never in the canyon slot 620–1150), from the Mountain's station yard to the Wild West's arrival station, the path's y on the ground (`terrain.heightAt` + 0.2), grade ≤ 12%.
- **Jet** (west-future): take-off from a hardstanding by the Wild West's departure station, low over the desert (60–150 m up), a circle of radius 1.2–2 km round the rocket pad (`rocketPad`), landing on an apron by the Futuristic place's arrival station; cruising ~210 m/s (750–800 km/h).
- **Car** (future-city): up from a pad by the Futuristic place's departure station, 40–80 m up over the suburbs and the river, in among the City's towers (clear of them), down to a pad by the City's arrival station.
- Boarding points (`board`) lie on each departure station's walkable town-side approach (station-walk.js), within 25 m of the platform's open end; the vehicle stands near them on open level ground (the jet up to 80 m away, the boat at its jetty 300 m away on the seafront).

- [ ] **Step 1: Write the failing tests** (`tour/test/rides.test.js`)

```js
test('five rides, one per leg, onward', () => { /* rideFor(leg).from/to === LEGS[leg].from/to for every RIDE_LEGS leg; ids boat, balloon, coach, jet, car in that order */ });
test('each ride lasts 85-95 s from start to done, at dt 1/60', () => { /* loop rideStep until done; 85 <= t <= 95 */ });
test('rideStep clamps a long frame and never jumps a set piece', () => { /* one step of dt 5 advances like dt 0.1; for each event, some step has s within [s0, s1] at dt 0.1 */ });
test('the leg-s table is monotonic, in [0, L], from the departure end to the arrival end', () => { /* legS[0] <= 150; legS[last] >= L - 150; non-decreasing */ });
test('paths start at board and end at land, within 1 m', () => {});
test('never underground: every 2 m of path >= terrain + 1 (coach: within 0.5 m of the ground; boat: at sea level over water depth >= 1.5 m away from its two jetties)', () => {});
test('the coach keeps out of the canyon slot and its grade stays <= 12%', () => {});
test('the jet flies round the rocket pad: its path comes within 2.2 km of the pad and passes all round it (bearing spans >= 300 degrees)', () => {});
test('the car keeps 15 m clear of the City and Futuristic towers (tower boxes as Task 8 of phase 3 measured in paths.js LANES tests)', () => {});
test('boarding points are on the walk (stationWalk townSide) within 25 m of the departure platform\'s open end; the boat\'s jetty is joined to the City by its walkway (Task 5)', () => { /* the boat case asserts the walkway's two ends instead */ });
```

- [ ] **Step 2: Run `node --test tour/test/rides.test.js`.** Expected: FAIL (module missing).
- [ ] **Step 3: Implement `tour/rides.js`** — paths as control points built from world data (not hand-typed coordinates where world data gives them), `makeRoute` over them, the profile, the leg-s table (nearest leg-s per path metre, then made non-decreasing), and empty `events`/`showpieces` (each ride's task fills its own).
- [ ] **Step 4: Run `node --test tour/test/`.** Expected: PASS.
- [ ] **Step 5: Commit** `git commit -m "The rides as data: five paths, their timing and their place along each leg"`

### Task 2: Riding in the journey and the streaming

**Files:**
- Modify: `tour/journey.js`, `tour/streaming.js`
- Test: `tour/test/journey.test.js`, `tour/test/streaming.test.js`

**Interfaces:**
- Consumes: `rideFor`, `rideLegS` (Task 1).
- Produces:
  - journey state `{ mode: 'ride', leg, dir: 'out', place: from }`.
  - `journey.ride(state, leg) -> state` (from foot at `LEGS[leg].from`, its departure leg only; throws otherwise).
  - `journey.landed(state) -> { state: { mode: 'foot', leg, dir: 'out', place: to }, trains: [{ leg, dir, station }] }` — the two trains to put at the place you land at, as `arrive` does after a train (the arrival leg's train `back` at its arrival station; the departure leg's `out` at its departure).
  - `journey.where(state, run, s)` for `ride`: `{ leg, s: legS, back: false, fraction: legS / L }` where `s` is the ride-s (main passes `rideLegS`).
  - streaming: `wantedSet({ place }, ring)` also wants `ride:<departure leg of place>`; `wantedSet({ leg, ride: true })` wants what driving that leg wants plus `ride:<leg>`; `readyToRide(leg, opts)` = `readyToLeave(leg, opts) && opts.has('ride:' + leg)`.

- [ ] **Step 1: Write the failing tests** — `ride` from the right place only (throws at the arrival station's place, from a drive state, for a back leg); `landed` puts you on foot at `to` and lists the arrival leg's `back` train and the departure leg's `out`; `where` for a ride gives the mapped leg-s and its fraction; `wantedSet` on foot at a place includes its departure leg's `ride:`; `readyToRide` is false until `ride:<leg>` is built, and with WAIT_MAX as `readyToLeave`.
- [ ] **Step 2: Run** the two test files. Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run `node --test tour/test/`.** Expected: PASS.
- [ ] **Step 5: Commit** `git commit -m "Riding in the journey: a ride mode, landing as after a train, and the ride wanted while you stand at its place"`

### Task 3: The ride runner, end to end with the flying car

**Files:**
- Create: `tour/ride-run.js` (the runtime), `tour/rides/car.js` (the flying car's vehicle), `tour/rides/index.js` (the registry: `RIDE_BUILDERS[id] = (ctx) => Promise<RideKit>`)
- Modify: `tour/main.js` (wiring only: the `ride:<leg>` builder, boarding/landing, the frame, keys, HUD, map, auto-tour guard), `tour/cameras.js` only if the seat needs it, `tour/audio.js` (`engine(kind)` loops: start/stop/set level), `tour.html` (help: "at a departure station, E by the ride takes it")
- Test: `tour/test/ride-run.test.js` (pure parts), `tour/test/main-wiring.test.js`

**Interfaces:**
- Consumes: Tasks 1–2; `makeEventTrack` (events.js) for ride-s set pieces; the actor contract (tour/actors/index.js) for set-piece actors; `views.attachCab`, `views.setDriving`, `views.set`, `views.restart` (cameras.js); `makeDirector` through cameras.js's director view.
- Produces:
  - `RideKit = { vehicle: { holder: Object3D, box: Box3 (holder frame, +z forward), seat: Vector3 (holder frame) }, crew?: Object3D[], actors: Map<id, Actor> (set pieces, by ride event id), boardMarker: Object3D, landPad?: Object3D, update(f), dispose() }`. `f` as actors' frame plus `{ rideS, rideV }`.
  - `makeRideRunner({ scene, views, audio }) -> { start(ride, kit), update(dt) -> { done, legS, pos: Vector3, yaw }, train: { cars: [{ holder, box, front, length }], spec: { name } }, stop() }` — the vehicle posed on the path each frame (position from `path.at`, yaw/pitch from it, a gentle bank on turns); `train` is the one-car stand-in the views and director use.
  - The `ride:<leg>` streaming builder: builds the RideKit at a standstill (`ctx.still()`), a part per `slicer.frame()`, warmed (`warm()`), hidden until in; a vehicle that fails to load fails the build (warned; the ride isn't offered); a set piece that fails is left out (warned).
- Wiring (main.js):
  - On foot near `ride.board` (within 4 m) and `readyToRide(leg)`: prompt "Take the <name> to <place> (E)"; not ready: "Getting the <name> ready…". E boards: `state = journey.ride(...)`, the walker hidden, views: `attachCab` with a cab object `{ holder: vehicle.holder, seat: vehicle.seat, interior: <empty group>, clip() {} }` so the cab view is the seat; `views.setDriving(true)`.
  - Each frame while riding: `runner.update(dt)`; `where = journey.where(state, null, rideS)` with the mapped leg-s; streaming/sky as for driving; the leg's `always` actors updated as for a train at that leg-s (here true, dir 'out', the leg's events track stepped with the mapped leg-s, no reactions, no guard brake); the ride's own set-piece actors from its own events track in ride-s; the director's ctx built from the ride (route: `ride.path`, legS: ride-s, dir 'out', v, showpieces: `ride.showpieces`, started: the ride track's started, tunnels: [], length: vehicle length). HUD: "<Name> to <place>", no throttle panel. Map: your dot at the vehicle.
  - On `done`: `journey.landed`, the two trains placed (`fleet.wait`), you step down at `ride.step` on foot, the ride kit's vehicle stays at the landing pad until you've walked 30 m away, then is hidden (it's built again for the next time you're at that place).
  - Keys during a ride: E, W/S/↑/↓/Space/H ignored; V/1–4 views; M map; Z: if pressed during a ride, auto starts once you land (walking on to the onward train), never takes rides.
- The flying car: Chrome Arcology `commuter-hover-pod` with a code-built glazed cabin all round (glass panels, thin frame) fitted to it so the seat view sees 360°; lit after dark; `engine('car')` a soft hum. No escort yet (Task 4).

- [ ] **Step 1: Write the failing tests** — pure: the one-car stand-in's `front`/`length` from a box; a ride track's started events in ride-s at dt 0.1; the boarding range (`nearRide(p, ride, 4)`). Wiring: main.js routes E to `journey.ride` only near `ride.board` with `readyToRide`, ignores driving keys in `ride` mode, and calls `journey.landed` on `done`.
- [ ] **Step 2: Run.** Expected: FAIL.
- [ ] **Step 3: Implement** the runner, the registry, the car, the wiring, the sound loop.
- [ ] **Step 4: Run `node --test tour/test/`.** Expected: PASS.
- [ ] **Step 5: Check in the page** (`preview_start` name "basement-empire", http://127.0.0.1:8765/tour.html?debug): get to the Futuristic place (drive the ring with E/W, or `__tour.jump`), walk to the departure station: the car waits; the prompt; take it; ~90 s over the suburbs into the City (stills in the seat, chase and director views); set down at the City's arrival station on foot; the train back (Metro Glide) stands at the arrival platform and is boardable; M during the ride shows the dot moving; Z during it starts the auto tour only after landing. No console errors; no long frames over 50 ms during the ride.
- [ ] **Step 6: Commit** `git commit -m "Rides: the runner, end to end with the flying car"`

### Task 4: The flying car's escort

**Files:** Modify `tour/rides/car.js`, `tour/rides.js` (the car's events/showpieces), `tour/audio.js` (`sound('whoosh')` reused) · Test: `tour/test/rides.test.js`

- Five to seven escort pods and skiffs (Chrome Arcology `commuter-hover-pod`, `hover-cargo-skiff`) flying in a loose formation with the car, some ahead, some behind and beside, swapping places now and then; each eased along offsets from the car's pose (a pure `formationOffsets(t)` in rides.js or a three-free helper beside it, never within 8 m of the car or each other); a pass with a whoosh; lit after dark.
- Director showpieces for the car (in ride-s): a wide shot of the formation over the river, a chase among the towers.
- [ ] **Step 1: Test** `formationOffsets`: ≥ 5 slots, some ahead and some behind, min separation 8 m at 200 sampled t; continuous (no jump > 2 m between t and t + 0.1).
- [ ] **Step 2–4:** fail, implement, pass.
- [ ] **Step 5: Page check** on the ride (seat and director stills).
- [ ] **Step 6: Commit** `git commit -m "The flying car's escort"`

### Task 5: The boat and the giant octopus

**Files:** Create `tour/rides/boat.js` · Modify `tour/rides.js`, `tour/walk-world.js` + `tour/world-data.js` (the City's walkway to its jetty), `tour/audio.js` · Test: `tour/test/rides.test.js`, `tour/test/walk-world.test.js`

- The Caique Fishing Boat `caique-fishing-boat-262c24` (`cdnPart`), the coast kit's `fisherman` at the wheel (standing; Polyfork's clips `Idle`), wake and spray (particles), pitching and rolling with speed; `engine('boat')` outboard roar.
- The City's seafront: a jetty (built in code or from the coast kit's `boardwalk-deck-run`/`pier-head-platform`) at the path's start, and a **walkway** joining the City's walk to it: `PLACES.city.walkways = [{ points: [{x,z}…], width: 3 }]` (data), walk-world.js letting you walk on it (inBounds true on the strip, its ground the walkway's level), a sign at the City's end ("Speedboat to Oceanside ↓" — the departure station's sign may add a line). Oceanside's harbour: a short jetty by the ocean-mountain departure station where the boat lands; `step` on that station's approach.
- The octopus (`loadAnimal('octopus-base')`, scaled ~5×, its Swim clips): rises out of the sea beside the boat at the ride's middle, arms over the hull (pose arm bones if the rig allows, else its clips and its scale carry it), the boat swerves hard away (a timeline offset on the path's lateral), the octopus sinks back; splash and surge sounds; never touches the boat's hull mesh.
- Director showpieces: the octopus rising (wide from low over the water), the boat's run under the cliffs.
- [ ] **Tests:** walkway: a point on the strip is in bounds, a point 5 m off it isn't, and the City's arrival → jetty is walkable on a 0.5 m grid (autopath's planner); the swerve offset is continuous and returns to 0; the octopus's closest approach to the hull keeps ≥ 1 m (from the timeline's poses, pure).
- [ ] **Page check:** walk from the City's departure station to the jetty, take the boat, the octopus set piece in seat and director views, land at Oceanside, the Seaside Excursion stands at Oceanside's arrival platform facing back. Commit `git commit -m "The boat, its jetty and walkway, and the giant octopus"`

### Task 6: The balloon and the crows

**Files:** Create `tour/rides/balloon.js` · Modify `tour/rides.js`, `tour/audio.js` · Test: `tour/test/rides.test.js`

- A code-built balloon in the low-poly style: envelope ~20 m tall in bright panels, wicker basket, burners with flame at night, two jet engines on the basket's sides with exhaust glow; the seat in the basket. `engine('balloon')`: burner whoosh bursts and the jets' whine.
- Crows: 5–7 `crow-base` (`loadAnimal`, Fly clip), scaled 3–4×, circling the canopy above the basket, sometimes swooping past the basket; always above the basket's rim and outside the envelope (pure orbit helper, tested).
- Director showpieces: the balloon over the viaduct and waterfall (wide), the crows round the canopy (heli).
- [ ] **Tests:** crow orbits keep ≥ 3 m outside the envelope's radius and above the basket; continuous. **Page check** and commit `git commit -m "The balloon and its crows"`

### Task 7: The stagecoach, its road and the gang

**Files:** Create `tour/rides/coach.js`, `tour/rides/road-mesh.js` · Modify `tour/rides.js`, `tour/scenery.js` (keep trees off the road), `tour/audio.js` · Test: `tour/test/rides.test.js`

- The road: a dirt strip along the coach's path, drawn on the land (a mesh draped on `terrain.heightAt`, built with the leg's actors — it belongs to the ride's kit), trees and rocks kept off it.
- The coach: Frontier `stagecoach` (wheels spinning, a bounce over the ground), two `saddled-horse-da86d3` (`Run`), the driver (`outlaw-character` swapped for a `townswoman`/`prospector-character` or a railway figure in the driver's seat, `Sitting` clip); the seat on the roof by the driver. `engine('coach')`: hooves, wheels, creak.
- The gang: 4–5 riders (`outlaw-character` on `saddled-horse-da86d3`, `Sitting`) charging from behind and alongside for ~30 s mid-ride, firing: muzzle flashes, dust puffs where shots land well wide of the coach, cap-gun cracks and ricochet pings; they fall back one by one (horses pulling up) and are gone before the Wild West. Never within 4 m of the coach; no hit.
- Director showpieces: the chase from low ahead (trackside-style on the ride path), a heli alongside.
- [ ] **Tests:** the road stays clear of the railway's formation and swept path; the gang's positions keep ≥ 4 m from the coach and all shot puffs land ≥ 6 m from it; the gang is gone (out of sight, > 400 m back) before the last 300 m. **Page check** and commit `git commit -m "The stagecoach, its road and the gang"`

### Task 8: The jet and the UFO

**Files:** Create `tour/rides/jet.js`, `tour/rides/ufo.js` · Modify `tour/rides.js`, `tour/main.js` (only if the rocket needs a nudge to launch on the jet's timing), `tour/audio.js` · Test: `tour/test/rides.test.js`

- The jet: Polyfork `business-jet-684611`, gear up after take-off and down for landing (its rig), the hardstanding and the apron (flat pads), the seat in the cockpit. `engine('jet')`.
- The rocket: the west-future leg's rocket actor (always) launches as the mapped leg-s enters its window, as for a train; the jet's timeline is set so its circle round the pad comes during the climb (tested on the timeline: the jet's bearing to the pad sweeps while the rocket's flight time is between 5 s and 45 s).
- The UFO (code-built): a flying saucer (dome, rim, ring of flashing lights cycling, glowing underside), appearing after the rocket pass, pacing the jet, firing laser bolts (bright additive streaks) that always miss (the bolt's nearest approach ≥ 15 m from the jet, tested), then shooting away into the night sky; zap sounds.
- Director showpieces: the jet round the rocket (wide), the UFO alongside (heli).
- [ ] **Tests** as above. **Page check** (a dusk-into-night ride: the lights) and commit `git commit -m "The jet, the rocket pass and the UFO"`

### Task 9: Docs and the "Done when" check

**Files:** Modify `README.md`, `PROJECT_BRIEF.md`, `tour.html` (help)

- README: the rides (what each is, how to take one), `node scripts/extract-parts.mjs` names the new parts; PROJECT_BRIEF: Phase 4 status.
- [ ] **"Done when" check:** at each of the five places, the ride waits beside the train (the boat at the City's jetty) and either can be taken; all five rides run start to finish (~90 s each) with their set piece; each sets you down on foot at the next place with the train back standing at its platform; V cycles the views on every ride and M shows you moving; no loading pause during a ride, no console errors; the trains and the Z auto tour as before (auto takes trains only). Record any ride or set piece that couldn't be made, and why.
- [ ] **Commit** `git commit -m "The docs for Phase 4"`
