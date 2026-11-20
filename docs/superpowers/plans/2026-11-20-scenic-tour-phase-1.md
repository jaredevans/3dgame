# Scenic Tour — Phase 1 Implementation Plan (one leg, end to end)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the tour's foundation as one playable leg: board a blue diesel at Downtown City's departure station, drive the cliff-top route to Oceanside in the cab or drone view under a morning sky, stop at the platform, get out and walk round Oceanside, and get back on to return.

**Architecture:** A separate page, `tour.html`, loading ES modules from `tour/`. Pure logic (route curves, train placement, driving, walking, terrain heights, time of day, streaming choice) lives in three.js-free modules tested with Node's built-in test runner; everything that draws lives in browser modules that consume them and is checked in the browser through a `window.__tour` debug hook. Places are built with each self-hosted kit's `buildKit()`; parts come from the kits' own `<key>.mjs` modules via one base URL.

**Tech Stack:** three.js 0.180.0 (jsDelivr import map), Polyfork kits self-hosted under `kits/` (`kit.mjs`, `stage.mjs`, `clips.mjs`, part modules), Node 26 `node --test` for unit tests, no npm dependencies, no build step.

**Spec:** `docs/superpowers/specs/2026-11-20-scenic-tour-design.md`

## Phases

The spec is one product but too big for one plan. Each phase ends playable and gets its own plan once the previous one lands:

1. **This plan.** Foundation and the City → Oceanside leg, both directions. Cab and drone views, walking, one diesel cab interior, morning sky, streaming by id.
2. **The ring.** Mountain, Wild West and Futuristic places and the other four legs and trains, including the bullet train and the steam and futuristic cabs. Crossing town between two stations everywhere. Full-day sky across the ring.
3. **Drama.** Director camera, every route's showpieces and events (spectacle and "you react"), the map, night lighting, polish and performance.

## Global Constraints

- three.js **0.180.0** from `https://cdn.jsdelivr.net/npm/three@0.180.0/` through an import map, exactly as `index.html` does.
- No framework, no build step, no backend, no npm dependencies. Unit tests run with `node --test tour/test/` and nothing installed.
- Polyfork kit files are **never committed**. They load from one base URL: `./kits/` locally, the owner's server in production. `kits/` is gitignored.
- Lighting through Polyfork's `stage()`. **No ACES tone mapping at exposure 1** over Polyfork models.
- Real-world metres, Y up, at the models' real size. Never rescale a Polyfork part to fake a fit.
- The basement (`index.html`) keeps working exactly as now. Its only change is one button linking to `tour.html`.
- **No fail state.** Nothing derails, crashes or penalises.
- A leg takes **about 90 seconds** to drive at the train's normal running speed, including pulling away and stopping.
- Desktop browser, mouse and keyboard.

## Review Focus

1. **A kit file fails to load** (server down, wrong base URL, missing part). Expected: the loading screen names the file that failed, as the basement's does, and never hangs silently. Test: Task 1, `loadError names the URL`.
2. **A long frame** (tab hidden then shown, a stall while streaming). Expected: the train does not jump hundreds of metres or pass through the buffers. Test: Task 5, `stepTrain clamps dt`.
3. **Driving into the buffers at the end of the line,** forwards or reversing back past the start. Expected: the train stops at the buffer stop, never runs off the route's ends. Test: Task 5, `stepTrain stops at route ends`.
4. **Pressing "get out" while moving or between stations.** Expected: nothing happens; you can only get out stopped at a platform. Test: Task 8, `canGetOut false when moving or off-platform`.
5. **Walking into the sea, off the edge of the place or onto the running line.** Expected: you stop at the edge or slide along it, never fall through or wander into the void. Test: Task 8, `stepWalker stays in bounds and slides along blockers`.

---

## File Structure

```
tour.html                  page, import map, HUD markup, styles, loads tour/main.js
tour/config.js             KIT_BASE and kit ids; loadError()
tour/parts.js              part(kitId, key, params), kitModule(kitId, file)  [browser]
tour/route.js              makeRoute(points) arc-length curve, offsetAt()     [pure]
tour/consist.js            placeCars(): basement pivot maths on a 3D route   [pure]
tour/vehicles.js           measureVehicle(), buildTrain(), poseTrain()       [browser]
tour/drive.js              TRAIN_SPECS, stepTrain(), idealLegTime()           [pure]
tour/terrain.js            makeTerrain(): heightAt(), regionAt()             [pure]
tour/terrain-mesh.js       chunked ground meshes from makeTerrain            [browser]
tour/track-mesh.js         double track, sleepers, ballast along a route     [browser]
tour/world-data.js         PLACES, LEGS (control points, stations, trains)   [pure data]
tour/stations.js           buildTerminus()                                   [browser]
tour/places.js             buildPlace(): buildKit + seam to terrain          [browser]
tour/walk.js               stepWalker(), canGetOut(), nearestBoardable()     [pure]
tour/player.js             on-foot figure, over-shoulder camera, prompts     [browser]
tour/cameras.js            cab and drone cameras, V / 1 / 2                  [browser]
tour/cabs/diesel.js        diesel cab interior                               [browser]
tour/sky.js                skyAt() keyframes [pure] + sky dome and clouds    [browser part in sky-dome.js]
tour/sky-dome.js           gradient sky, sun glow, drifting clouds, haze    [browser]
tour/streaming.js          wantedSet() [pure] + Streamer load/unload [browser part in streamer.js]
tour/streamer.js           loads and disposes places and legs by id         [browser]
tour/main.js               boot, loop, input, HUD, window.__tour            [browser]
tour/test/*.test.js        unit tests for every [pure] module
```

`[pure]` modules import nothing from three.js or the DOM, so Node can test them. Browser modules import `three` and the pure modules.

---

### Task 1: The tour page, kit loading, and the basement button

**Files:**
- Create: `tour.html`, `tour/config.js`, `tour/parts.js`, `tour/main.js`, `tour/test/config.test.js`
- Modify: `index.html` (one button in the HUD, top right, "Scenic Tour ▸", linking to `tour.html`)
- Uses: `.claude/launch.json` (already present, not committed) serves the repo root on port 8765 as the `basement-empire` preview, so `./kits/` is at `http://localhost:8765/kits/`.

**Interfaces:**
- Produces: `KIT_BASE: string` (from `?kits=` query parameter, else `'./kits/'`, always ending in `/`); `KITS = { city: 'nyc-city-kit-fbca88', ocean: 'coast-and-boardwalk-d883fd', mountain: 'alpine-and-snow-092f66', west: 'frontier-town-a0085b', future: 'chrome-arcology-transit-kit-87a0e1', railway: 'countryside-railway-9b4c57', nature: 'nature-forest-kit-f29d6a' }`; `kitUrl(kitId, file) -> string`; `loadError(url, err) -> string` (the loading-screen message, naming the URL).
- Produces (browser): `kitModule(kitId, file) -> Promise<module>` (cached dynamic import); `part(kitId, key, params) -> Promise<THREE.Object3D>` calling the part module's `createAsset(params)`; `setLoading(text)` and `showLoadError(msg)` on the loading screen.

- [ ] **Step 1: Write the failing tests** in `tour/test/config.test.js`:
  - `KIT_BASE defaults to ./kits/` — with no query, `resolveKitBase('')` returns `'./kits/'`.
  - `KIT_BASE takes ?kits= and adds a trailing slash` — `resolveKitBase('?kits=https://example.test/k')` returns `'https://example.test/k/'`.
  - `kitUrl joins base, kit and file` — `kitUrl('coast-and-boardwalk-d883fd', 'kit.mjs', './kits/')` returns `'./kits/coast-and-boardwalk-d883fd/kit.mjs'`.
  - `loadError names the URL` — `loadError('./kits/x/y.mjs', new Error('404'))` contains `'./kits/x/y.mjs'` and `'Could not load'`.
- [ ] **Step 2: Run** `node --test tour/test/` — expect FAIL (module not found).
- [ ] **Step 3: Implement** `resolveKitBase(search: string) -> string`, `kitUrl(kitId, file, base = KIT_BASE)`, `loadError(url, err)`, `KIT_BASE`, `KITS` in `tour/config.js`. `KIT_BASE` reads `globalThis.location?.search ?? ''` so the module stays importable in Node.
- [ ] **Step 4: Run** `node --test tour/test/` — expect PASS.
- [ ] **Step 5: Build the page.** `tour.html`: same import map as `index.html`, a loading screen, a HUD with a "◂ Basement" link to `index.html`, a canvas. `tour/main.js`: renderer (no ACES, sRGB output), a camera, `stage(renderer, scene, { time: 'day' })` imported via `kitModule(KITS.railway, 'stage.mjs')`, one test part (`part(KITS.railway, 'buffer-stop', {})`) at the origin, a render loop, and `window.__tour = { scene, camera, renderer }`. Wrap all loading so a failure calls `showLoadError(loadError(url, err))`. `parts.js` must reject with the URL it tried.
- [ ] **Step 6: Verify in the browser.** Start the `basement-empire` preview, open `/tour.html`. Expected: a buffer stop on a lit scene, no console errors. Open `/tour.html?kits=./nope/`: expected the loading screen says `Could not load` and names `./nope/countryside-railway-9b4c57/stage.mjs`. Open `/`: the basement loads as before with the new "Scenic Tour ▸" button, which opens the tour.
- [ ] **Step 7: Commit** `tour.html tour/ index.html` — "Add the Scenic Tour page and self-hosted kit loading".

### Task 2: Route curves

**Files:** Create `tour/route.js`, `tour/test/route.test.js`

**Interfaces:**
- Produces: `makeRoute(points: {x,y,z}[], { step = 1 } = {}) -> Route` where `Route = { length: number, at(s, out?) -> {x, y, z, yaw, pitch}, offsetAt(s, d, out?) -> {x, y, z, yaw, pitch}, minRadius() -> number, maxGrade() -> number }`.
  - Centripetal Catmull-Rom through `points` (open curve, not closed), arc-length parameterised by sampling every `step` metres into a table; `at` interpolates the table. `s` is clamped to `[0, length]`.
  - `yaw` follows the basement convention: `yaw = atan2(dx, dz)`, so heading +z is 0 and heading +x is π/2. `pitch = atan2(dy, horizontal distance)`.
  - `offsetAt(s, d)` is the point `d` metres to the **left** of the direction of travel, same height (left of +z heading is +x).

- [ ] **Step 1: Write the failing tests:**
  - `straight route length` — points `(0,0,0) (0,0,100) (0,0,200)`: `length` within 0.5 of 200.
  - `at clamps and hits the ends` — `at(-5)` equals the first point, `at(1e9)` the last (within 0.01).
  - `yaw convention` — on that route, `at(100).yaw` ≈ 0; on `(0,0,0) (100,0,0) (200,0,0)`, ≈ π/2.
  - `offsetAt is to the left` — heading +z, `offsetAt(100, 2).x` ≈ +2.
  - `pitch on a 2% climb` — points rising 4 m over 200 m: `at(100).pitch` ≈ atan(0.02) within 0.002; `maxGrade()` ≈ 0.02 within 0.002.
  - `minRadius of a quarter circle` — 9 points on a 300 m radius quarter circle: `minRadius()` within 5% of 300.
  - `arc length is monotonic` — `at(s).` positions advance by ≈ 1 m for each 1 m of `s` across the whole curve (max error 2%).
- [ ] **Step 2: Run** `node --test tour/test/route.test.js` — expect FAIL.
- [ ] **Step 3: Implement** `makeRoute` in `tour/route.js`.
- [ ] **Step 4: Run** — expect PASS.
- [ ] **Step 5: Commit** — "Add arc-length route curves for the tour".

### Task 3: Trains on a 3D route

**Files:** Create `tour/consist.js`, `tour/vehicles.js`, `tour/test/consist.test.js`

**Interfaces:**
- Consumes: `Route` (Task 2).
- Produces (pure): `placeCars(route, frontS, cars, gap = COUPLING_GAP, lateral = 0) -> Pose[]` where each car is `{ front, length, pf, pr, bogieZ: number[] }` (the numbers `measureVehicle` measures: vehicle-local z of its front, its length, front and rear pivots, bogie centres) and each `Pose = { x, y, z, yaw, pitch, bogieYaw: number[] }`. Same maths as the basement's `poseTrain` (`index.html` lines 401–416): each car's origin is `front - car.front` along the path, the body is the chord between its two pivots, and the next car's front is `front - (car.length + gap)`. It adds height and pitch from the chord's ends, and `lateral` places everything on a track offset from the route centre via `offsetAt`. `COUPLING_GAP = 0.15` (metres between buffer faces, as `index.html:77`).
- Produces (browser): `measureVehicle(obj, flip)` (a copy of the basement's, unchanged); `buildTrain(def) -> Promise<Train>` where `def = { name, cars: [[kitKey, params, flip?]] }` built with `part(KITS.railway, …)`; `poseTrain(train, route, s, ds, lateral)` applies `placeCars` to the holders, turns bogies and spins wheels by `ds`.

- [ ] **Step 1: Write the failing tests:**
  - `cars follow each other on a straight` — two cars `{front: 8, length: 16, pf: 5, pr: -5, bogieZ: [5, -5]}` on a straight +z route, `frontS = 100`: car 0 at z ≈ 92, car 1 at z ≈ 92 - 16.15 = 75.85; both yaw ≈ 0.
  - `both pivots sit on the curve` — on a 200 m radius arc, each car's pivots (pose position ± pivot distance along yaw) lie within 0.05 m of the route.
  - `pitch on a climb` — on a 2% grade, every car's pitch ≈ atan(0.02).
  - `lateral offset moves the train left` — `lateral = 2` on a +z straight puts every car at x ≈ 2.
- [ ] **Step 2: Run** — expect FAIL.
- [ ] **Step 3: Implement** `placeCars` in `tour/consist.js`; then `vehicles.js` (browser).
- [ ] **Step 4: Run** — expect PASS.
- [ ] **Step 5: Verify in the browser:** in `main.js` temporarily build a test consist (`mainline-diesel` plus two `passenger-carriage`, default knobs) on a test S-curve with a climb; screenshot shows every car on the line with bogies turned into the curve. Remove the temporary scene before committing.
- [ ] **Step 6: Commit** — "Place tour trains on 3D routes with the basement's pivot maths".

### Task 4: World data, terrain and track

**Files:** Create `tour/world-data.js`, `tour/terrain.js`, `tour/terrain-mesh.js`, `tour/track-mesh.js`, `tour/test/terrain.test.js`, `tour/test/world-data.test.js`

**Interfaces:**
- Produces `world-data.js`:
  - `TRACK_CENTRES = 4` (metres between the two lines; the route curve is the centre line, the lines are at `offsetAt(s, ±2)`). `laneFor(dir: 'out'|'back') -> number`: a train running with increasing `s` uses `-2`, one running back uses `+2`.
  - `PLACES = { city: { kit, centre: {x, z}, ground: number, radius: 50, arrival: Station, departure: Station }, ocean: {…} }`. `Station = { leg: legId, end: 'start'|'end', platformLength: 120 }`.
  - `LEGS = { 'city-ocean': { from: 'city', to: 'ocean', train: 'cityOcean', points: {x,y,z}[], sky: [0, 1] } }`. The builder places the control points: out through the city edge, then a cliff-top line along the sea, curves no tighter than 400 m radius, grades no steeper than 2.5%.
- Produces `terrain.js`: `makeTerrain({ routes: Route[], pads: {x, z, r, y}[], seaLevel = 0, seed = 1 }) -> { heightAt(x, z), regionAt(x, z) -> 'sea'|'sand'|'grass'|'rock'|'paving' }`. Base shape from layered value noise plus hand-shaped features for the leg (sea on the seaward side of the cliff line). The track bed: within 6 m of a route's centre line the ground is exactly `route y - 0.3`, blending to the natural ground by 30 m out (cuttings and embankments). Pads: within `r` exactly `y`, blending out over 20 m.
- Produces `terrain-mesh.js`: `buildTerrainChunk(terrain, cx, cz, size = 256, cell = 2) -> THREE.Mesh` coloured per vertex by `regionAt`, plus a sea plane at `seaLevel`.
- Produces `track-mesh.js`: `buildTrack(route, lateral) -> THREE.Group`: two rails at 1.435 m gauge, sleepers every 0.7 m (instanced), a ballast shoulder strip; and `buildTrackBed(route) -> THREE.Group` for both lines.

- [ ] **Step 1: Write the failing tests:**
  - `terrain sits under the track` — on a test route, `heightAt` at the centre line and at ±2 m equals `route.at(s).y - 0.3` within 0.01, at 10 sample points.
  - `terrain honours pads` — `heightAt(pad.x, pad.z)` equals `pad.y` within 0.01.
  - `terrain is continuous` — adjacent samples 1 m apart never differ by more than 2 m anywhere on a 2 km test grid away from the sea cliffs (cliffs are allowed up to 6 m).
  - `the leg lies inside the limits` (world-data) — `makeRoute(LEGS['city-ocean'].points)`: `minRadius() >= 400`, `maxGrade() <= 0.025`.
  - `running sides` — `laneFor('out') === -2`, `laneFor('back') === 2`.
- [ ] **Step 2: Run** — expect FAIL.
- [ ] **Step 3: Implement** the three modules; place the route's control points by eye in the browser until the leg reads as "city edge, then cliffs above the sea".
- [ ] **Step 4: Run** — expect PASS.
- [ ] **Step 5: Verify in the browser:** a free camera along the leg shows both lines of track on a bed that never floats or sinks, cuttings and embankments where the ground rises and falls, sea and cliffs on one side. No gaps between terrain chunks.
- [ ] **Step 6: Commit** — "Add the City to Oceanside route with its terrain and double track".

### Task 5: Driving

**Files:** Create `tour/drive.js`, `tour/test/drive.test.js`; modify `tour/main.js` (input, HUD driver's panel)

**Interfaces:**
- Produces `TRAIN_SPECS = { cityOcean: { name: 'Seaside Excursion', sound: 'diesel', cab: 'diesel', top: 27.8, accel: 1.0, brake: 1.2, cars: [['mainline-diesel', { colorway: 'royal-blue', livery: 'royal-blue', bogies: 'bo-bo' }], ['passenger-carriage', {…royal-blue…}], ['passenger-carriage', {…}], ['brake-coach', {…}]] } }` (top speed in m/s: 100 km/h; accel and brake in m/s²; part keys and knob values from `kits/countryside-railway-9b4c57/PARTS.json`).
- Produces `stepTrain(state, input, dt, spec, limits) -> state` where `state = { s, v, throttle }`, `input = { throttleDelta, brake: boolean }`, `limits = { sMin, sMax }` (the buffer stops). Throttle runs -1..1 in 0.05 steps; the train accelerates toward `throttle * top` at `accel`; `brake` decelerates at `brake` toward 0; `dt` is clamped to 0.1 s; `s` never leaves `[sMin, sMax]` and `v` becomes 0 at either end.
- Produces `idealLegTime(length, spec) -> seconds`: accelerate at `accel` to `top`, cruise, brake at `brake` to a stop (or the triangular profile if the leg is too short to reach `top`).
- HUD: speed in km/h, throttle %, distance to the next platform's stopping point in metres. Keys: `W`/`↑` throttle up, `S`/`↓` down, `Space` held = brake, `H` horn (WebAudio, the basement's `whistle('diesel')` copied).

- [ ] **Step 1: Write the failing tests:**
  - `accelerates to top speed` — from rest with throttle 1, after 60 s of 1/60 steps, `v` ≈ 27.8.
  - `brakes to a stop` — from 27.8 with brake held, `v` reaches 0 after about 23 s (27.8 / 1.2), never negative.
  - `reverse` — throttle -0.5 from rest: `v` approaches -13.9.
  - `stepTrain clamps dt` — one step with `dt = 5` from 27.8 moves `s` by at most 2.78.
  - `stepTrain stops at route ends` — heading for `sMax` at full speed: `s` ends exactly `sMax`, `v` 0; same reversing into `sMin`.
  - `idealLegTime` — length 1800, spec above: within 2 s of 89.9.
  - `the leg is about 90 seconds` (in `world-data.test.js`) — `idealLegTime(makeRoute(LEGS['city-ocean'].points).length, TRAIN_SPECS.cityOcean)` between 80 and 100. If it fails, adjust the leg's control points (Task 4), not the train spec.
- [ ] **Step 2: Run** — expect FAIL.
- [ ] **Step 3: Implement** `drive.js`; wire input and the HUD in `main.js`.
- [ ] **Step 4: Run** — expect PASS.
- [ ] **Step 5: Verify in the browser:** drive the leg end to end in a temporary chase camera; time it at normal speed with stops: 80–100 s. Running into the buffers stops the train dead at them.
- [ ] **Step 6: Commit** — "Drive the tour train with throttle, brake and horn".

### Task 6: Cab and drone cameras, and the diesel cab

**Files:** Create `tour/cameras.js`, `tour/cabs/diesel.js`; modify `tour/main.js`

**Interfaces:**
- Consumes: `Train` holders (Task 3).
- Produces `makeCameras(camera, dom) -> { mode: 'cab'|'drone', set(mode), cycle(), update(dt, train) }`. Keys `V` cycles, `1` cab, `2` drone (`3` is reserved for the director in Phase 3; pressing it does nothing yet).
  - **Cab:** camera at the cab interior's `seat` (eye height 1.7 m above the cab floor), parented to the leading vehicle's holder, looking forward along its yaw and pitch. Mouse drag looks around: yaw ±150°, pitch ±35°; releasing returns slowly to forward over 2 s. Near plane 0.05 m.
  - **Drone:** orbits the train's middle at 25–200 m distance (scroll), mouse-drag orbit, minimum height 3 m above `heightAt`, smoothed to follow the train without lag jitter.
- Produces `makeDieselCab() -> { group, seat: THREE.Vector3 }`, positioned in the mainline diesel's local frame at its No. 1 end: driver's desk with a speedometer and brake handle, windscreen frames and pillars, side windows, a back wall, in the Polyfork palette (flat colours, low poly). Hide the diesel shell's meshes that sit in front of the seat if they block the view (find them by box test against the seat, not by name guesses).

- [ ] **Step 1: Verify in the browser:** in the cab view, the windscreen frames the track ahead, nothing from the shell blocks it, and mouse-look shows the side window and the sea. The drone orbits and zooms smoothly and never dips below the ground.
- [ ] **Step 2: Commit** — "Add cab and drone views and the diesel cab interior".

### Task 7: The two places and their stations

**Files:** Create `tour/places.js`, `tour/stations.js`; modify `tour/world-data.js`, `tour/main.js`

**Interfaces:**
- Consumes: `kitModule`, `part` (Task 1), `Route` (Task 2), `makeTerrain` (Task 4).
- Produces `buildPlace(id) -> Promise<Place>` where `Place = { id, group, kitPlace, blocked(x, z, r), groundAt(x, z), tick(t), dispose() }`:
  - **City:** NYC kit with `buildKit({ folder: kitUrl(KITS.city, ''), city: { seed: 11, blocks: [2, 2] } })` or the size that comes out about 100 m across. NYC has no terrain: the place's terrain pad is flat at `PLACES.city.ground`.
  - **Oceanside:** Coast kit's composed place on its own ground (`terrainParams` with non-island edges; read the knob's options from its `TERRAIN.json`), extended with more of the kit's beach huts, promenade and lamp posts to about 100 m across.
  - The place group is translated to `PLACES[id].centre`. Its ground meets the ring's terrain with no visible seam: `makeTerrain` gets a pad per place; where the kit has its own ground, sample `kitPlace.groundAt` round the place's edge and blend.
- Produces `buildTerminus(route, end, side) -> { group, platform: { sFrom, sTo, stopS }, blocked(x, z, r) }` from Countryside Railway parts: `platform-run` along the last 120 m of the line, `buffer-stop` at the end, `station-building`, `platform-canopy-run`, `station-lamp-post`, `station-bench`, `running-in-board` with the place's name. `stopS` is where the cab should stop (12 m short of the buffers).
- Phase 1 builds City's **departure** terminus (start of the route) and Oceanside's **arrival** terminus (end of the route). The return train uses the same line in reverse (Phase 1 shortcut: the train you arrived on is re-placed facing back along the `back` lane when you get out; the turning trick is the builder's choice in Phase 2).

- [ ] **Step 1: Write the failing test** in `tour/test/world-data.test.js`: `stations sit on the line ends` — City's departure station `end === 'start'` of `city-ocean`, Oceanside's arrival `end === 'end'`, and each place's centre is within 150 m of its station's route end.
- [ ] **Step 2: Run** — expect FAIL; implement the data; run — expect PASS.
- [ ] **Step 3: Implement** `places.js` and `stations.js`.
- [ ] **Step 4: Verify in the browser** with `window.__tour.seamCheck(placeId)` (added in `main.js`: samples 64 points on the place's edge and returns the largest gap between the place's ground and the terrain): both places return under 0.3 m. Screenshots: the city streets with walking people, the Oceanside boardwalk and beach, both termini with the train at the platform.
- [ ] **Step 5: Commit** — "Build Downtown City and Oceanside with their termini".

### Task 8: Getting out, walking and boarding

**Files:** Create `tour/walk.js`, `tour/player.js`, `tour/test/walk.test.js`; modify `tour/main.js`

**Interfaces:**
- Produces (pure): `canGetOut(trainState, platform) -> boolean` (true only if `|v| < 0.05` and the cab's `s` is within `[platform.sFrom, platform.sTo]`); `stepWalker(p, input, dt, world) -> p` where `p = { x, z, yaw }`, `input = { fwd: -1..1, right: -1..1, run: boolean, yawDelta }`, `world = { blocked(x, z, r), heightAt(x, z), inBounds(x, z) }`, walking 1.4 m/s, running 4.0 m/s, body radius 0.35 m; a blocked move tries the x-only then z-only component (sliding); `dt` clamped to 0.1. `nearestBoardable(p, trains, maxDist = 4) -> train | null` (distance to any car of a stopped train at a platform).
- Produces (browser): `makePlayer(scene) -> { enter(x, z, yaw), exit(), update(dt, input, world), position }` using the Countryside Railway `engine-driver` figure animated with the kit's `clips.mjs` `animate()` (`locomotion(speed)`), and the over-the-shoulder camera (2.5 m behind, 0.6 m right, 1.8 m up, mouse look). Prompts: "Get out (E)" when `canGetOut`; "Board the Seaside Excursion to Downtown City (E)" when `nearestBoardable`.
- `world.inBounds` is the place's walkable area: inside the place's radius, not on the running lines between the platform ends and the route, and above sea level.

- [ ] **Step 1: Write the failing tests:**
  - `canGetOut false when moving or off-platform` — `v = 2` on the platform: false; `v = 0` with `s` 50 m before `sFrom`: false; `v = 0` at `stopS`: true.
  - `stepWalker walks and runs` — 1 s forward: moves 1.4 m; with `run`, 4.0 m.
  - `stepWalker stays in bounds and slides along blockers` — walking diagonally into a wall along x = 5 (`blocked` when `x > 4.65`) ends at x ≤ 4.65 with z still advancing; walking toward `inBounds` false stops at the edge.
  - `stepWalker clamps dt` — `dt = 3` moves at most 0.14 m.
  - `nearestBoardable` — a stopped train 3 m away is found; a moving one is not; one 6 m away is not.
- [ ] **Step 2: Run** — expect FAIL.
- [ ] **Step 3: Implement** `walk.js`, then `player.js`, then the get-out / board flow in `main.js`.
- [ ] **Step 4: Run** — expect PASS.
- [ ] **Step 5: Verify in the browser:** stop at Oceanside, get out, walk the boardwalk and the beach, try to walk into the sea and through a beach hut (you stop or slide), walk back and board; drive back to the City and do the same there.
- [ ] **Step 6: Commit** — "Get out, walk round and board at the tour's stations".

### Task 9: The morning sky

**Files:** Create `tour/sky.js`, `tour/sky-dome.js`, `tour/test/sky.test.js`; modify `tour/main.js`

**Interfaces:**
- Produces (pure): `SKY_KEYS` — one entry per ring position 0..5 (0 = leaving City; 1 = Oceanside; …; 5 = back at City) with `{ stage: 0..1 for stage().setTime, zenith, horizon, sunElevationDeg, sunAzimuthDeg, cloudCover, haze }`, matching the spec's table: City → Oceanside bright morning, Oceanside → Mountain midday, Mountain → Wild West afternoon to sunset, Wild West → Futuristic dusk to night, Futuristic → City pre-dawn to sunrise. `skyAt(ringPos) -> blended entry` (colours as `[r, g, b]` 0..1, interpolated; ringPos wraps modulo 5).
- Produces (browser): `makeSkyDome(scene) -> { update(sky, dt) }`: gradient dome, sun disc with glow, two layers of drifting clouds, distance fog in the horizon colour so far terrain melts into the sky; and `look.setTime(sky.stage)`. Ring position comes from the leg and `s / length`; standing in a place holds that place's integer value.

- [ ] **Step 1: Write the failing tests:**
  - `skyAt wraps` — `skyAt(5)` equals `skyAt(0)`; `skyAt(-0.5)` equals `skyAt(4.5)`.
  - `skyAt blends` — `skyAt(0.5).sunElevationDeg` lies between the keys at 0 and 1.
  - `mornings are bright and night is dark` — `skyAt(0.5).stage < 0.2`; `skyAt(3.8).stage > 0.7`.
- [ ] **Step 2: Run** — expect FAIL. **Step 3: Implement.** **Step 4: Run** — expect PASS.
- [ ] **Step 5: Verify in the browser:** the City → Oceanside run under a bright morning sky with puffy clouds and a soft horizon; colours clean, not muddy. Compare screenshots at s = 0, mid-leg and arrival.
- [ ] **Step 6: Commit** — "Add the tour's sky with drifting clouds and a morning light".

### Task 10: Streaming by id, and finishing Phase 1

**Files:** Create `tour/streaming.js`, `tour/streamer.js`, `tour/test/streaming.test.js`; modify `tour/main.js`, `README.md`, `PROJECT_BRIEF.md`

**Interfaces:**
- Produces (pure): `wantedSet(where, ring) -> Set<string>` where `where = { place: id } | { leg: id, s: number }` and `ring = { places: string[] in ring order, legs: string[] in ring order }`. At a place: that place, both legs touching it, and the places at their far ends. On a leg: that leg, both its places, and, once `s` passes the leg's halfway point, the next leg beyond its destination and that leg's far place.
- Produces (browser): `makeStreamer(builders) -> { want(set) }` that builds missing ids in the background (one at a time, never blocking the frame loop) and disposes ids no longer wanted (geometry, materials, textures). Phase 1's ring has only two places and one leg, so the window is everything, but all loading goes through it.
- `README.md`: a "Scenic Tour" section (how to run locally with `kits/`, the `?kits=` parameter for the owner's server, CORS note, controls). `PROJECT_BRIEF.md`: a short pointer to the spec and Phase 1 status.

- [ ] **Step 1: Write the failing tests** with a five-place test ring `['city','ocean','mountain','west','future']`:
  - `at a place` — `wantedSet({ place: 'ocean' })` is `{ocean, city-ocean, ocean-mountain, city, mountain}`.
  - `early on a leg` — `{ leg: 'ocean-mountain', s: 100 }` of a 1500 m leg: `{ocean-mountain, ocean, mountain}`.
  - `past halfway` — `s: 900`: adds `mountain-west` and `west`.
  - `wraps round the ring` — at `future`, includes `future-city` and `city`.
- [ ] **Step 2: Run** — expect FAIL. **Step 3: Implement.** **Step 4: Run** — expect PASS.
- [ ] **Step 5: Final verification in the browser:** from the basement's button, play Phase 1 end to end: board at City, drive to Oceanside in cab view, switch to drone and back, stop at the platform, get out, walk, board, drive back, get out at City. No console errors, no loading pause while driving, all unit tests pass (`node --test tour/test/`), and the basement still plays as before.
- [ ] **Step 6: Commit** — "Stream tour places and legs by id; document the Scenic Tour".
