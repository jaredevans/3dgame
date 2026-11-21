# Scenic Tour — Phase 2 Implementation Plan (the whole ring)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close the ring: add Mountain, Wild West and Futuristic, the four legs between them with their own trains (tank steam, tender steam, bullet train, commuter), steam and futuristic cabs, two stations per place on two sides of each town, and a world that streams as you travel, so you can drive the whole lap both ways under a full day of sky.

**Architecture:** Phase 1's modules stay; three things generalise. (1) `world-data.js` describes the whole ring: five places, five legs with their control points, each leg's town side, each place's two stations, terrain features and biomes. (2) A pure `journey.js` replaces the leg-specific state in `main.js`: which leg and direction you're on, which two trains wait at the place you're in, getting out and boarding. (3) Terrain and scenery stream in 256 m chunks around you instead of one global build. New places and legs then arrive as data plus their own structures, trains and cabs.

**Tech Stack:** as Phase 1: three.js 0.180.0 (import map), self-hosted Polyfork kits under `kits/` loaded via `KIT_BASE`, `node --test tour/test/`, no build step, no npm dependencies.

**Spec:** `docs/superpowers/specs/2026-11-20-scenic-tour-design.md` (as revised 2026-11-20: towns beside their stations). Phase 1 plan: `docs/superpowers/plans/2026-11-20-scenic-tour-phase-1.md`.

## Milestones

Each ends playable and is committed before the next starts.

- **2a — the engine and the Mountain (Tasks 1–6).** The ring's data, journeys over many legs and trains, chunked terrain, bridges and tunnels, then Mountain and the Oceanside → Mountain climb with the tank engine and the steam cab.
- **2b — the Wild West (Task 7).** The tender engine and wooden coaches, over the pass and through the canyon onto a trestle.
- **2c — closing the ring (Tasks 8–11).** The Futuristic place with the bullet train and elevated guideway, the commuter back into Downtown City, scenery along every route, and a full lap.

## Global Constraints

- three.js **0.180.0** via the import map; no framework, build step, backend or npm dependencies; unit tests with `node --test tour/test/`.
- Polyfork kits are **never committed**; everything loads through `KIT_BASE` (`./kits/` locally, `?kits=` in production). Parts from kits not downloaded come from Polyfork's free per-part CDN.
- Lighting via `stage()` with `sky:false, fog:false`; **no ACES tone mapping at exposure 1**.
- Real metres, real sizes; never rescale a Polyfork part to fit.
- **No fail state.** Nothing derails, crashes or penalises.
- Each leg takes **about 90 seconds** at its train's normal speed, from rest to rest (`idealLegTime` 80–100 s).
- **Towns beside their stations, never behind them.** Each place has **two stations on two different sides of its town**, each with its platform and building on the town side; travelling on means walking through the town.
- Ring order: Downtown City → Oceanside → Mountain → Wild West → Futuristic → Downtown City. One lap of the ring is one day of sky (Phase 1's `SKY_KEYS`).
- The basement (`index.html`) is untouched.

## Review Focus

1. **Arriving the "wrong" way round** — driving a leg backwards (e.g. Mountain → Oceanside) and getting out at the station that is normally a departure. Expected: the right two trains wait (onwards and back), both facing away from the town, and the prompts name the right destinations. Test: Task 3, `trainsAt after arriving backwards`.
2. **Standing at a place's edge where a terrain chunk hasn't loaded yet**, or loading a place after its chunks. Expected: no hole in the ground, no kit island wall; chunks touching a place rebuild once its ground is known. Test: Task 4, `adding a patch dirties the chunks it touches`.
3. **The bullet train at full speed through a long curve**, and the dt clamp at 83 m/s. Expected: one long frame moves it ≤ 8.4 m and it never passes the buffers; curves never tighter than 2,000 m so the body doesn't swing absurdly. Tests: Task 1, `bullet leg curves and grades`; Task 8, `bullet stops at the buffers from full speed`.
4. **Walking from one station to the other through each town**, including the Mountain's slopes and the Wild West's bluffs. Expected: a clear walkable path exists between the two platforms; you never end up under a kit's island or on the seabed. Test: Task 6/7/8, `a walk exists between the two stations` (per place, on a coarse grid with `makeWalkWorld`).
5. **A tunnel seen from the cab**. Expected: you drive into darkness between two portals; you never see sky or terrain from underneath. Test: Task 5, `terrain stays natural over a tunnel and the bed resumes past its portals`.

---

## File Structure

```
tour/world-data.js        + the whole ring: PLACES (5, two stations each), LEGS (5, side, train), FEATURES, BIOMES
tour/terrain.js           + features (massif, mesa, canyon), biomes, route sections, addPatch/removePatch, natural()
tour/structures.js        NEW pure: structuresFor(route, natural) -> sections (viaduct | tunnel | trestle | guideway)
tour/structure-mesh.js    NEW browser: viaducts, tunnel tubes and portals, trestles, elevated guideway
tour/journey.js           NEW pure: the journey state machine (legs, directions, which trains wait where)
tour/chunks.js            NEW pure: chunksWanted(x, z) -> Map(chunkId -> cell)
tour/terrain-mesh.js      + buildTerrainChunk takes heights it already has (regionAt cost), chunk ids
tour/scenery.js           NEW browser: instanced trees, rocks, cacti per chunk by biome
tour/trains/specs.js      NEW pure: TRAIN_SPECS for all five trains (moved from drive.js)
tour/trains/bullet.js     NEW browser: the bullet train, built in code
tour/cabs/steam.js        NEW browser: steam cab interior (tank and tender engines)
tour/cabs/future.js       NEW browser: futuristic cab (bullet and commuter)
tour/cameras.js           ~ fitCab takes a cab box measured per vehicle
tour/stations.js          ~ termini keyed by place and leg; walk helpers merged per place
tour/main.js              ~ shrinks: boot, loop, input and HUD around journey.js
```

---

### Task 1: The whole ring as data

**Files:** Modify `tour/world-data.js`; create `tour/trains/specs.js`; modify `tour/drive.js` (re-export `TRAIN_SPECS` from `trains/specs.js` so Phase 1 imports keep working); tests `tour/test/world-data.test.js`, `tour/test/ring.test.js`.

**Interfaces:**
- Produces `LEGS[id] = { from, to, train, side: +1 | -1, points }` for `city-ocean`, `ocean-mountain`, `mountain-west`, `west-future`, `future-city`. `side` is the side of the route (left +1, right −1, in the route's own direction) that both its stations' towns stand on; the train runs both ways on the line on that side (`lateral = side * 2`). `city-ocean` keeps `side: +1` and its Phase 1 points.
- Produces `laneOf(legId) -> number` (= `LEGS[id].side * TRACK_CENTRES / 2`); `laneFor` stays for Phase 1 callers and equals `laneOf('city-ocean')`.
- Produces `PLACES[id].stations = [{ leg, end: 'start'|'end', role: 'departure'|'arrival', platformLength: 120 }, …]` — exactly one arrival (the leg ending here) and one departure (the leg starting here) per place.
- Produces `stationFrame(placeId, role) -> { x, z, y, yaw, side, leg, end }`: the middle of that station's platform, heading of the route there, and the town side.
- Produces `TRAIN_SPECS` in `tour/trains/specs.js` (top m/s, accel and brake m/s², sound, cab, cars as kit parts or a builder name):

| id | name | cars | top | accel | brake | sound | cab |
|---|---|---|---|---|---|---|---|
| `cityOcean` | Seaside Excursion | (Phase 1, unchanged) | 100/3.6 | 1.0 | 1.2 | diesel | diesel |
| `oceanMountain` | Highland Climber | `tank-locomotive` {colorway/livery 'signal-red', tanks 'saddle'}, 2 × `passenger-carriage` {era 'green', length 15.5} | 60/3.6 | 0.5 | 0.8 | steam | steam |
| `mountainWest` | Canyon Express | `tender-locomotive` + `coal-tender` {colorway/livery 'deep-green'}, 3 × `passenger-carriage` {era 'teak'}, `brake-coach` {era 'teak'} | 90/3.6 | 0.7 | 1.0 | steam | steam |
| `westFuture` | Silver Arrow | builder `'bullet'`, 4 cars | 300/3.6 | 2.5 | 2.5 | bullet | future |
| `futureCity` | Metro Glide | 3 × `guideway-rail-shuttle` from the Chrome Arcology kit | 120/3.6 | 1.0 | 1.2 | future | future |

- Place targets (centre ±150 m, station ground ±10 m): city (128, −74) and ocean (1902, −198) unchanged; mountain ≈ (2600, 700), ground ≈ 30; west ≈ (1500, 1950), ground ≈ 15; future ≈ (−1100, 1250), ground ≈ 10. Kits: Alpine and Snow, Frontier Town, Chrome Arcology, each as its composed place (`build: {}`), turned as needed.
- City's second station is the `future-city` arrival along City's **north** edge (z ≈ −140); Oceanside's second station is the `ocean-mountain` departure along its **east** edge (line heading south from near the shore, `side: −1`).

- [ ] **Step 1: Write the failing tests** in `tour/test/ring.test.js`:
  - `every leg is about 90 seconds` — for each leg, `idealLegTime(makeRoute(points).length, TRAIN_SPECS[leg.train])` in [80, 100].
  - `curves and grades` — `minRadius() >= 400` and `maxGrade() <= 0.025` for every leg except `west-future`.
  - `bullet leg curves and grades` — `west-future`: `minRadius() >= 2000`, `maxGrade() <= 0.015`.
  - `each place has one arrival and one departure` — roles and legs match `LEGS` `from`/`to`.
  - `towns stand beside both their stations` — for every station, with `f = stationFrame`: the place centre is on side `f.side` (signed across-distance ≥ 20 m) and within 60 m along of the platform's middle.
  - `the two stations are on different sides of the town` — for each place, the directions from the place centre to its two station frames differ by ≥ 90°, and the platforms' middles are ≥ 60 m apart.
  - `legs keep apart` — sampling every 20 m, no two legs come within 60 m of each other except within 250 m of a place they share; no leg passes within 40 m of a place's centre except its own two.
  - `left-hand line by default` — `laneOf('city-ocean') === 2`; `laneOf('ocean-mountain') === -2`.
- [ ] **Step 2: Run** `node --test tour/test/` — expect FAIL.
- [ ] **Step 3: Implement** the data. Lay the routes so their character matches the spec's table (cliff line, forest climb, snowy pass then canyon, dead-straight desert run on long sweeping curves, suburbs and river into the towers). Update `world-data.test.js` where Phase 1's tests assumed one leg (keep every Phase 1 assertion about `city-ocean`).
- [ ] **Step 4: Run** — expect PASS. Also print each leg's length and time; they go in the commit message.
- [ ] **Step 5: Commit** — "Lay out the whole Scenic Tour ring".

### Task 2: Mountains, deserts and canyons in the land

**Files:** Modify `tour/terrain.js`, `tour/world-data.js` (`FEATURES`, `BIOMES`, `worldTerrain`); test `tour/test/terrain.test.js`.

**Interfaces:**
- `makeTerrain({ …, features = [], biomes = [] })` with features `{ kind: 'massif', x, z, r, h }` (a range of peaks rising to `h` metres, ridged noise, falling off by `r`), `{ kind: 'mesa', x, z, r, h }` (flat-topped, steep-sided), `{ kind: 'canyon', leg, s0, s1, depth, width }` (walls rising `depth` metres either side of the route beyond `width/2`, between those route distances). Biomes `{ kind: 'grass'|'snow'|'desert'|'urban', x, z, r }` (nearest wins, blending over 200 m) change `regionAt`: snow above the snowline (60 m) in the snow biome; red earth `'redrock'` and `'sand'` in the desert; `'paving'` urban.
- `terrain.natural(x, z)` — the height without track beds or pads (structures need it).
- New regions for colouring: `'snow'`, `'redrock'`, `'scree'`.

- [ ] **Step 1: Write the failing tests:** `a massif rises toward its centre` (height at centre ≥ 0.8 h, at r + 200 ≈ base); `a mesa is flat on top and steep at its edge` (top variation < 2 m within 0.7 r; slope > 1 at r); `a canyon walls the route` (between s0 and s1, ground 40 m to either side ≥ track + 0.8 depth; the bed itself unchanged); `snow lies high in the snow biome only` (regionAt 'snow' at 120 m in a snow biome, not in grass); `natural ignores the track bed`.
- [ ] **Step 2: Run** — expect FAIL. **Step 3: Implement.** **Step 4: Run** — expect PASS.
- [ ] **Step 5: Verify in the browser** with `?free=<s>` on each leg: mountains read as mountains, the desert as desert; colours clean.
- [ ] **Step 6: Commit** — "Shape mountains, mesas and canyons in the tour's land".

### Task 3: Journeys over many legs

**Files:** Create `tour/journey.js`, `tour/test/journey.test.js`; modify `tour/main.js` (use it), `tour/stations.js` (termini keyed `${place}:${leg}`), `tour/walk-world.js` (a place's world merges both its termini).

**Interfaces:**
- `makeJourney({ legs, places }) -> state` and pure transitions:
  - `state = { mode: 'drive'|'foot', leg, dir: 'out'|'back', place }` — `place` is where you are on foot (or the place you're leaving).
  - `trainsAt(state, placeId) -> [{ leg, dir, station: 'departure'|'arrival', to }]` — the two trains waiting while you're in that place: on its departure leg running `out` to that leg's `to`, and on its arrival leg running `back` to that leg's `from`. Each waits at the station of its leg in this place, facing away from the town.
  - `getOut(state, placeId) -> state'` (mode `foot`, `place` set); `board(state, leg, dir) -> state'` (mode `drive`).
  - `runRoute(legId, dir)` returns `{ route, lane, platform, origin, destination }` built from `legRoute`, `reverseRoute`, `laneOf` and the termini platforms (Phase 1's `runFor`, generalised).
- Trains are streamed by id `train:<leg>`; a waiting train is posed at its station when you arrive in the place.
- `makeWalkWorld({ place, termini: [a, b], terrain, … })` — both stations' walk helpers (update `walk-world.test.js` to the new signature; its Phase 1 assertions stay).
- The sky follows any leg: `ringPosition({ leg, fraction })` with `fraction` measured from the leg's `from` place whichever way you drive.
- Phase 1's deferred minors that live in this code are fixed here: boarding ignores keys already held (no throttle from a held `W`); stepping out is clamped to the platform window; the `clips.mjs` import moves inside the fallback `try`. Each gets a test where it's pure (`journey.test.js`: `getting out lands on the platform`), else a browser check.

- [ ] **Step 1: Write the failing tests:** `trainsAt in Oceanside` (out on `ocean-mountain` to mountain from the departure station; back on `city-ocean` to city from the arrival station); `trainsAt after arriving backwards` (drive `ocean-mountain` back, get out in oceanside: the same two trains, the same stations); `boarding the onward train starts its leg out`; `boarding the back train starts its leg back`; `getting out only at a place on the run's route ends`.
- [ ] **Step 2: Run** — expect FAIL. **Step 3: Implement** `journey.js`; then move `main.js` onto it, so City ↔ Oceanside plays exactly as before (regression).
- [ ] **Step 4: Run** — expect PASS. **Step 5: Verify in the browser:** Phase 1's round trip still works (get out, walk, board, back).
- [ ] **Step 6: Commit** — "Run journeys over any leg, either way".

### Task 4: Terrain in chunks that stream

**Files:** Create `tour/chunks.js`, `tour/test/chunks.test.js`; modify `tour/terrain.js` (`addPatch`, `removePatch`, dirty set), `tour/terrain-mesh.js`, `tour/main.js` (chunks through the streamer), test `tour/test/terrain.test.js`.

**Interfaces:**
- `chunksWanted(x, z, { size = 256, fine = 700, far = 4500 }) -> Map<'c:i,j', cell>` — cell 4 within `fine` metres of the chunk, 16 out to `far`.
- `terrain.addPatch(p)`, `terrain.removePatch(p)`; `terrain.takeDirty() -> Set<chunkId>` of chunks whose ground changed (any chunk within 60 m of the patch's land).
- `buildTerrainChunk(terrain, i, j, size, cell)` computes heights once and passes height and slope to colouring (no extra `heightAt` calls).
- Chunks stream as ids `c:i,j:cell`; a chunk whose wanted cell changes is rebuilt and the old one disposed once the new one is in.

- [ ] **Step 1: Write the failing tests:** `near chunks are fine and far ones coarse`; `the wanted set moves with you`; `adding a patch dirties the chunks it touches`; `building a chunk calls heightAt once per vertex` (count calls on a fake terrain).
- [ ] **Step 2: Run** — expect FAIL. **Step 3: Implement.** **Step 4: Run** — expect PASS.
- [ ] **Step 5: Verify in the browser:** drive City → Oceanside: no gaps or pops in front of the train; the frame never stalls more than one chunk build (watch `renderer.info` and a frame-time log).
- [ ] **Step 6: Commit** — "Stream the tour's land in chunks".

### Task 5: Viaducts, tunnels and trestles

**Files:** Create `tour/structures.js`, `tour/structure-mesh.js`, `tour/test/structures.test.js`; modify `tour/terrain.js` (route sections), `tour/world-data.js` (sections per leg, and any forced ones: the Mountain climb's tunnel, the Wild West trestle, the desert guideway).

**Interfaces:**
- `structuresFor(route, natural, { forced = [] }) -> [{ kind: 'viaduct'|'tunnel'|'trestle'|'guideway', s0, s1 }]` — a viaduct where the formation stands ≥ 8 m above natural ground for ≥ 40 m; a tunnel where it lies ≥ 12 m below for ≥ 60 m; `forced` sections override (e.g. `{ kind: 'trestle', s0, s1 }`). Sections are padded by 10 m and merged.
- Route objects carry `route.sections`; `makeTerrain` leaves natural ground over tunnels and under viaducts/trestles/guideways (no bed or embankment there), and cuts approach cuttings within 30 m of a tunnel portal.
- `buildStructures(route, lanes, sections) -> THREE.Group`: viaduct (Countryside Railway `stone-viaduct` spans where they fit, else generated stone piers and arches every 20 m), tunnel (a dark tube round both lines plus `tunnel-portal` at each end), trestle (`trestle-bridge` or generated timber bents every 6 m), guideway (Chrome Arcology `maglev-guideway-run` or a generated deck on piers).

- [ ] **Step 1: Write the failing tests:** `a valley gets a viaduct`; `a ridge gets a tunnel`; `short dips get neither`; `forced sections win`; `terrain stays natural over a tunnel and the bed resumes past its portals`.
- [ ] **Step 2: Run** — expect FAIL. **Step 3: Implement.** **Step 4: Run** — expect PASS.
- [ ] **Step 5: Verify in the browser:** a still of each kind; from the cab, a tunnel is dark between its portals with no sky or underside visible.
- [ ] **Step 6: Commit** — "Build viaducts, tunnels and trestles where the line needs them".

### Task 6: Mountain, the climb from Oceanside, and the steam cab (milestone 2a)

**Files:** Modify `tour/world-data.js` (Mountain place and stations, Oceanside's departure station, `ocean-mountain` sections and features), create `tour/cabs/steam.js`; modify `tour/cameras.js` (`fitCab(renderer, vehicle, interior)` takes the cab box from the interior, measured per model).

**Interfaces:**
- `makeSteamCab(model: 'tank'|'tender') -> { group, seat, box }` — an open-backed steam cab: firebox backhead with fire glow, regulator, reverser, gauges, brake handle, spectacle windows either side of the boiler; `box` is the cab's region in the locomotive's frame, measured from the model (as Phase 1 measured the diesel) so the shell is clipped there only.
- Mountain: the Alpine kit's composed place on its own island ground, as a patch; walking uses its land (Phase 1's `onLand`).

- [ ] **Step 1: Write the failing tests:** `a walk exists between the two stations` for oceanside and mountain — a breadth-first search on a 2 m grid using `makeWalkWorld` (fed by stub places built from the data's footprints and a terrain from `worldTerrain()`) finds a path from one platform's middle to the other's.
- [ ] **Step 2: Run** — expect FAIL. **Step 3: Implement** the place, stations and steam cab.
- [ ] **Step 4: Run** — expect PASS. **Step 5: Verify in the browser:** City → Oceanside → walk through the town → board the Highland Climber at the east station → climb through the tunnel and over the viaduct to Mountain → walk through the village to its other station. Seams ≤ 0.3 m at both places; no console errors; the steam cab frames the line ahead past the boiler.
- [ ] **Step 6: Commit** — "Add the Mountain and the Highland Climber".

### Task 7: The Wild West and the Canyon Express (milestone 2b)

**Files:** Modify `tour/world-data.js` (Wild West place, stations, `mountain-west` sections: the snowy pass, the canyon feature, a forced trestle); reuse `cabs/steam.js` with the tender engine.

- [ ] **Step 1: Write the failing test:** `a walk exists between the two stations` for the Wild West.
- [ ] **Step 2: Run** — expect FAIL. **Step 3: Implement.** **Step 4: Run** — expect PASS.
- [ ] **Step 5: Verify in the browser:** Mountain → Wild West in the afternoon light turning golden: snow at the pass, the canyon walls, the trestle; the town's walk between stations; seams ≤ 0.3 m.
- [ ] **Step 6: Commit** — "Add the Wild West and the Canyon Express".

### Task 8: The Futuristic place, the bullet train and its guideway

**Files:** Create `tour/trains/bullet.js`, `tour/cabs/future.js`; modify `tour/vehicles.js` (`buildTrain` accepts builder trains), `tour/world-data.js` (Futuristic place, stations, `west-future` guideway sections), `tour/audio.js` (`horn('bullet')`, `horn('future')`).

**Interfaces:**
- `buildBullet({ cars = 4 }) -> Promise<Train>` — the same `Train` shape as `buildTrain` (`{ name, group, cars: [measured vehicles] }`), each car `{ holder, obj, front, length, pf, pr, bogies: [], bogieZ: [], wheels: [], spin: 1 }`. Low-poly, flat colours: white body, a long sculpted nose (≈ 8 m) on both end cars, a blue window band and stripe, skirts hiding the running gear, ≈ 25 m cars. It must read as a bullet train at a glance and sit with the Polyfork models.
- `makeFutureCab() -> { group, seat, box }` — wraparound glass, a low sleek console with a speed readout.

- [ ] **Step 1: Write the failing tests:** `bullet stops at the buffers from full speed` (stepTrain at 83.3 m/s with no brake into `sMax`: stops exactly there, v 0; one 5 s frame moves ≤ 8.34 m); `a walk exists between the two stations` for the Futuristic place.
- [ ] **Step 2: Run** — expect FAIL. **Step 3: Implement.** **Step 4: Run** — expect PASS.
- [ ] **Step 5: Verify in the browser:** Wild West → Futuristic at dusk on the elevated guideway: the speed feels fast, the place glows ahead at night (stage lamps), the futuristic cab frames the guideway.
- [ ] **Step 6: Commit** — "Add the Futuristic place and the Silver Arrow".

### Task 9: The Metro Glide back into Downtown City (closing the ring)

**Files:** Modify `tour/world-data.js` (`future-city` sections: suburbs and a river bridge; City's north-edge arrival station).

- [ ] **Step 1: Write the failing test:** `a walk exists between the two stations` for Downtown City (south platform to north platform through the streets).
- [ ] **Step 2: Run** — expect FAIL. **Step 3: Implement.** **Step 4: Run** — expect PASS.
- [ ] **Step 5: Verify in the browser:** Futuristic → City at sunrise; get out on City's north platform, walk through to the south platform, board the Seaside Excursion.
- [ ] **Step 6: Commit** — "Close the ring with the Metro Glide".

### Task 10: Scenery along every route

**Files:** Create `tour/scenery.js`, `tour/test/scenery.test.js`; modify `tour/main.js` (scenery streams with chunks).

**Interfaces:**
- Pure `scatter(chunkI, chunkJ, size, terrain, { seed }) -> [{ key, x, z, ry, s }]` — deterministic per chunk; by biome: grass (Nature & Forest trees, bushes, rocks), snow (Alpine `snow-laden-spruce`, `windblown-larch`, `rock-outcrop`), desert (Frontier `saguaro-cactus`, `sagebrush`, `dead-cottonwood`), urban (none). Never within 12 m of a route, on a pad, in a place's footprint, below sea level, or on rock/snow too steep (slope > 0.8).
- Browser: one `InstancedMesh` per part per chunk; disposed with its chunk. Density: about 60 per fine chunk, none on coarse chunks beyond 1.5 km (they're in haze).

- [ ] **Step 1: Write the failing tests:** `scatter is the same every time for a chunk`; `nothing grows on the line, the pads, the places or the sea`; `each biome grows its own`.
- [ ] **Step 2: Run** — expect FAIL. **Step 3: Implement.** **Step 4: Run** — expect PASS.
- [ ] **Step 5: Verify in the browser:** stills along each leg: no bare stretches; nothing in the swept path of a train.
- [ ] **Step 6: Commit** — "Plant trees, rocks and cacti along the tour's routes".

### Task 11: A full lap (milestone 2c)

**Files:** Modify `README.md`, `PROJECT_BRIEF.md`, `tour/main.js` (HUD: next station and its distance on any leg).

- [ ] **Step 1: Verify the whole lap in the browser**, both directions: every leg drives (time each by stepping `stepTrain` at 1/60 s, 80–100 s), every place can be walked through from one station to the other, every train boards, the sky passes through morning, midday, sunset, night and sunrise, and the streamer keeps memory flat (`renderer.info.memory` roughly the same after a lap as after the first leg). No console errors.
- [ ] **Step 2: Docs:** README Scenic Tour section (the five places, five trains, controls), PROJECT_BRIEF status ("phase 2 built").
- [ ] **Step 3: Run** `node --test tour/test/` — all pass.
- [ ] **Step 4: Commit** — "Drive the whole Scenic Tour ring".
