// Scenic Tour: boot, loop, input and HUD around the journey (journey.js): drive any leg either way, get out at a
// place, walk, and board one of the two trains waiting there.
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { KITS, loadError } from './config.js';
import { kitModule, setLoading, showLoadError, hideLoading } from './parts.js';
import { LEGS, PLACES, RING, BUILT, FEATURES, worldTerrain, legRoute, laneOf, legBuilt, SEA_LEVEL } from './world-data.js';
import { wantedSet } from './streaming.js';
import { makeStreamer } from './streamer.js';
import { terrainChunkJob, terrainChunkMesh, buildSea } from './terrain-mesh.js';
import { chunksWanted, chunkOf, chunkId, chunkKey, corridorKeys, runFor, CHUNK } from './chunks.js';
import { buildTrack } from './track-mesh.js';
import { buildStructures } from './structure-mesh.js';
import { tunnelDepth } from './structures.js';
import { makeDimmer } from './dimmer.js';
import { poseTrain } from './vehicles.js';
import { stepTrain, leaveCab, trainInput } from './drive.js';
import { horn } from './audio.js';
import { buildPlace, seamCheck } from './places.js';
import { buildTerminus, PLATFORM_TOP } from './stations.js';
import { makePlayer } from './player.js';
import { nearestBoardable, BODY } from './walk.js';
import { makeWalkWorld } from './walk-world.js';
import { makeJourney } from './journey.js';
import { makeFleet } from './fleet.js';
import { makeKeys } from './keys.js';
import { makeSkyDome } from './sky-dome.js';
import { skyAt, ringPosition } from './sky.js';
import { makeCameras, fitCab } from './cameras.js';
import { makeDieselCab } from './cabs/diesel.js';
import { makeSteamCab, STEAM_MODELS } from './cabs/steam.js';
import { makeFutureCab } from './cabs/future.js';

// each train spec's cab, made for its leading vehicle (a steam cab is measured per locomotive model)
const CABS = {
  diesel: () => makeDieselCab(),
  steam: (car) => {
    const model = STEAM_MODELS[car.key];
    if (!model) throw new Error(`no steam cab measured for the ${car.key}`);
    return makeSteamCab(model);
  },
  // the Silver Arrow's cab is made to its own front car
  future: (car) => {
    if (car.key !== 'bullet') throw new Error(`no futuristic cab measured for the ${car.key}`);
    return makeFutureCab();
  },
};

const fail = (err) => { console.error(err); showLoadError(err?.url ? loadError(err.url, err) : `Something went wrong: ${err?.message ?? err}`); };
addEventListener('unhandledrejection', (e) => fail(e.reason));
const params = new URLSearchParams(location.search);

async function boot() {
  const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: params.has('debug') });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.setSize(innerWidth, innerHeight);
  document.body.prepend(renderer.domElement);
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(55, innerWidth / innerHeight, 0.05, 8000);
  // keep the canvas the size of the window (a tab opened in the background starts at zero size)
  function fit() {
    if (renderer.domElement.width === Math.floor(innerWidth * renderer.getPixelRatio()) && renderer.domElement.height === Math.floor(innerHeight * renderer.getPixelRatio())) return;
    camera.aspect = innerWidth / Math.max(1, innerHeight); camera.updateProjectionMatrix();
    renderer.setSize(innerWidth, innerHeight);
  }
  addEventListener('resize', fit);

  setLoading('lighting');
  const { stage } = await kitModule(KITS.railway, 'stage.mjs');
  const look = stage(renderer, scene, { time: 'day', far: 8000, shadowSpan: 160, sky: false, fog: false });
  const skyDome = makeSkyDome(scene, camera);
  // the land as a height function; each place with its own ground adds its patch as it loads (and takes it away again).
  // This is world-data's one cached terrain: the page is its only user, so the patches on it are the page's.
  const terrain = worldTerrain();

  // ---- places, legs and trains load through the streamer, by id: only the places whose kits are wired in, the legs
  // between them (bar any held back for a later task: world-data legBuilt), and those legs' trains (`train:<leg>`) ----
  const builtLegs = Object.keys(LEGS).filter(legBuilt);
  const routes = Object.fromEntries(builtLegs.map((id) => [id, legRoute(id)]));
  const journey = makeJourney({ legs: LEGS, places: PLACES });
  const fleet = makeFleet({ scene, look, journey });
  const places = {}, termini = {};   // termini keyed `${place}:${leg}`
  const builders = {};
  for (const id of BUILT) builders[id] = async () => {
    setLoading(`building ${PLACES[id].name}`);
    const place = await buildPlace(id);
    scene.add(place.group); look.shadows(place.group);
    if (place.patch) terrain.addPatch(place.patch);
    for (const e of await place.addExtras(terrain)) look.shadows(e);
    // the place's stations: a terminus at its end of each built leg it serves
    const ids = [];
    for (const st of PLACES[id].stations.filter((s) => legBuilt(s.leg))) {
      const t = await buildTerminus(st.leg, st.end, { name: PLACES[id].name, platformLength: st.platformLength, style: PLACES[id].station });
      scene.add(t.group); look.shadows(t.group);
      for (const [obj, key] of t.lit) place.kitPlace.light?.(obj, key);   // a kit-style station's lamps and windows come on with its place's
      termini[`${id}:${st.leg}`] = t; ids.push(`${id}:${st.leg}`);
    }
    places[id] = place;
    return { dispose() { place.dispose(); if (place.patch) terrain.removePatch(place.patch); for (const k of ids) { termini[k]?.group.removeFromParent(); delete termini[k]; } delete places[id]; } };
  };
  // a leg: its two lines' track, and its viaducts, tunnels, trestles and guideways (with any river they cross)
  async function buildLeg(id) {
    const route = legRoute(id), lanes = [laneOf(id), -laneOf(id)];
    const tracks = lanes.map((lane) => buildTrack(route, lane, route.sections));   // none on its guideways
    for (const t of tracks) scene.add(t);
    const structures = await buildStructures(route, lanes, route.sections, {
      terrain, waters: FEATURES.filter((f) => f.kind === 'valley' && f.water && f.leg === id),
    });
    look.shadows(structures);
    scene.add(structures);
    terrain.addStructures(route);   // its portals now fill the ground left out across them
    return { structures, dispose() {
      for (const t of tracks) { t.removeFromParent(); t.traverse((o) => o.geometry?.dispose()); }
      structures.userData.dispose();
      terrain.removeStructures(route);
    } };
  }
  for (const id of builtLegs) {
    builders[id] = () => { setLoading('laying track'); return buildLeg(id); };
    builders[`train:${id}`] = () => fleet.build(id);
  }
  const ring = { places: RING.places.filter((id) => BUILT.includes(id)), legs: RING.legs.filter((id) => builtLegs.includes(id)), length: (id) => routes[id].length };
  const streamer = makeStreamer(builders, { onError: fail });
  // what's near you: places and legs, and the trains on those legs (the one you're in always among them)
  const wanted = (where) => {
    const set = wantedSet(where, ring);
    for (const id of [...set]) if (builtLegs.includes(id)) set.add(`train:${id}`);
    return set;
  };
  // you start in the cab of the Seaside Excursion at City's south platform
  let state = journey.start('city-ocean', 'out');
  const firstRun = journey.runRoute(state.leg, state.dir);
  // the first places, leg and train are needed to start at all: if one failed, its error is already on screen; stop here
  const first = await streamer.want(wanted({ place: state.place }));
  if (first.failed.length || !fleet.trains[state.leg] || !termini[`${firstRun.from}:${state.leg}`] || !termini[`${firstRun.to}:${state.leg}`]) return;

  // ---- the land: pieces of the world grid round you (chunks.js), fine near you and beside the line, mid further off,
  // coarse 512 m tiles beyond 1500 m, through a streamer of their own so a slow kit never holds up the ground. A piece
  // whose detail changes is built again; a tile's new pieces show together once all are in, as the old ones go. After
  // boot a piece is built a few rows a frame (LAND_SLICE ms, run inside frame()), so no frame waits on a whole one. ----
  const LAND_SLICE = 4;
  // the line's corridor: chunks within 300 m of a built route or a built place's footprint
  const corridor = corridorKeys([
    ...Object.values(routes).flatMap((r) => Array.from({ length: Math.ceil(r.length / 32) + 1 }, (_, k) => r.at(Math.min(r.length, k * 32), {}))),
    ...BUILT.map((id) => ({ x: PLACES[id].centre.x, z: PLACES[id].centre.z, r: PLACES[id].size ? Math.hypot(...PLACES[id].size) / 2 : 130 })),
  ]);
  const nearLine = (x, z) => corridor.has(chunkKey(Math.floor(x / CHUNK), Math.floor(z / CHUNK)));
  let landSliced = false;  // false: build each piece at once (boot); true: frame() builds the active one a slice at a time
  let active = null;       // the piece being built: { id, c, job, done, ms, frames }
  const landTimes = [];    // the last few builds: { id, ms (work), frames }
  const landFrames = [];   // the last few frames' slice of land building, ms
  const land = makeStreamer((id) => {
    const c = chunkOf(id);
    if (!c) return undefined;
    return async () => {
      let arrays;
      if (!landSliced) {
        const t0 = performance.now();
        arrays = runFor(terrainChunkJob(terrain, c, nearLine), Infinity);
        landTimes.push({ id, ms: performance.now() - t0, frames: 0 });
      } else arrays = await new Promise((done) => { active = { id, c, job: terrainChunkJob(terrain, c, nearLine), done, ms: 0, frames: 0 }; });
      if (landTimes.length > 50) landTimes.shift();
      const mesh = terrainChunkMesh(arrays, `terrain ${id}`);
      return { mesh, show() { scene.add(mesh); }, dispose() { mesh.removeFromParent(); mesh.geometry.dispose(); } };
    };
  }, { onError: fail, standIn: (id) => chunkOf(id).tile });
  // one frame's slice of the piece being built
  function landSlice() {
    let ms = 0;
    if (active) {
      const t0 = performance.now(), out = runFor(active.job, LAND_SLICE);
      ms = performance.now() - t0; active.ms += ms; active.frames++;
      if (out) { const a = active; active = null; landTimes.push({ id: a.id, ms: a.ms, frames: a.frames }); a.done(out); }
    }
    landFrames.push(ms); if (landFrames.length > 600) landFrames.shift();
  }
  let landAt = null;
  // ask for the pieces round (x, z); again only once you've moved a little
  function wantLand(x, z, force = false) {
    if (!force && landAt && Math.hypot(x - landAt.x, z - landAt.z) < 16) return null;
    landAt = { x, z };
    return land.want([...chunksWanted(x, z, { corridor })].map(([key, cell]) => chunkId(key, cell)));
  }
  // the pieces a patch added or taken away has changed, built again at whatever detail they are (and the one being
  // built started again)
  function redoDirty() {
    const dirty = terrain.takeDirty();
    if (!dirty.size) return;
    const hit = (id) => chunkOf(id).keys.some((k) => dirty.has(k));
    if (active && hit(active.id)) Object.assign(active, { job: terrainChunkJob(terrain, active.c, nearLine) });
    land.redo(land.ids.filter(hit));
  }
  scene.add(buildSea(SEA_LEVEL));

  const anchor = new THREE.Object3D();
  scene.add(anchor);
  look.follow(anchor);

  // ---- views: the cab and the drone ----
  const views = makeCameras(camera, renderer.domElement, { heightAt: terrain.heightAt });

  // ---- the train you drive: its run (journey.runRoute) and where its front is along it ----
  const drive = { s: 0, v: 0, throttle: 0 };
  let train = null, run = null;
  // the train on a leg, ready to drive: loaded, with its cab fitted. Checked before anything changes, so a train you
  // can't drive yet leaves you where you were
  function drivable(leg) {
    const t = fleet.trains[leg];
    if (!t) throw new Error(`the train on ${leg} has not loaded yet`);
    if (!CABS[t.spec.cab]) throw new Error(`no ${t.spec.cab} cab for the ${t.spec.name} yet`);
    t.cab ??= fitCab(renderer, t.model.cars[0], CABS[t.spec.cab](t.model.cars[0]));
    return t;
  }
  function take(leg, dir) {
    const t = drivable(leg);
    if (t.run.dir !== dir) fleet.park(leg, dir);   // turned round for the trip back: it waits on its run's start
    train = t; run = t.run;
    Object.assign(drive, { s: t.s, v: 0, throttle: 0 });
    views.attachCab(t.cab);
  }
  take(state.leg, state.dir);

  // ---- you: driving, or on foot in a place ----
  const player = await makePlayer(scene, camera, renderer.domElement, look);
  let pendingTurn = null;   // the train you came on: { leg, dir } it turns round to once you've walked away from it

  const walkWorld = () => makeWalkWorld({
    place: places[state.place], termini: PLACES[state.place].stations.map((st) => termini[`${state.place}:${st.leg}`]),
    terrain, seaLevel: SEA_LEVEL,
  });
  // where you can get out: the platform you're heading for, or the one you haven't left yet
  const stopHere = () => journey.stopAt(run, drive);
  function getOut() {
    const here = stopHere();
    state = journey.getOut(state, here);
    // step out onto the platform beside the line, a little behind the cab
    const out = journey.stepOut(run, drive.s);
    // stopped past the mark, the cab is beside the station building: step down further from the buffers, clear of it
    const w = walkWorld(), away = out.s > run.route.length / 2 ? -1 : 1;
    for (let k = 0; k < 40; k++) {
      const q = run.route.offsetAt(out.s, out.lateral);
      if (!w.blocked(q.x, q.z, BODY)) break;
      out.s += away;
    }
    const p = run.route.offsetAt(out.s, out.lateral);
    player.enter(p.x, p.z, p.yaw, p.y + PLATFORM_TOP);
    Object.assign(drive, leaveCab(drive));
    train.s = drive.s;
    // the two trains waiting here: yours stays at its platform (turning round for the trip back once you're away from
    // it, if you've arrived); the other is put at its station
    const { turn, wait } = journey.arrive(state);
    pendingTurn = turn;
    for (const w of wait.filter((w) => legBuilt(w.leg))) fleet.wait(w.leg, w.dir);
    views.setDriving(false);
    $('driver').classList.remove('on');
  }
  function turnPending() {
    if (!pendingTurn) return;
    fleet.park(pendingTurn.leg, pendingTurn.dir);
    if (pendingTurn.leg === train.leg) { run = train.run; Object.assign(drive, { s: train.s, v: 0, throttle: 0 }); }
    pendingTurn = null;
  }
  function trainPoints(model) {
    const pts = [];
    for (const c of model.cars) {
      const h = c.holder, f = new THREE.Vector3(0, 0, c.front - 1).applyMatrix4(h.matrixWorld), r = new THREE.Vector3(0, 0, c.front - c.length + 1).applyMatrix4(h.matrixWorld);
      for (let k = 0; k <= 4; k++) pts.push({ x: f.x + (r.x - f.x) * k / 4, z: f.z + (r.z - f.z) * k / 4 });
    }
    return pts;
  }
  // the waiting train you're beside, if any: { leg, dir, station, to }, on a built leg whose train is loaded
  const boardable = () => nearestBoardable(player.state, journey.trainsAt(state, state.place)
    .filter((w) => legBuilt(w.leg) && fleet.trains[w.leg])
    .map((w) => ({ ...w, stopped: true, cars: trainPoints(fleet.trains[w.leg].model) })));
  function board(w) {
    drivable(w.leg);
    turnPending();
    state = journey.board(state, w.leg, w.dir);
    take(w.leg, w.dir);
    player.exit();
    keys.ignoreHeld();   // a key you were holding (W, walking up to it) is not throttle until you press it again
    views.setDriving(true);
    $('driver').classList.add('on');
  }

  const keys = makeKeys();
  let throttleSteps = 0;
  addEventListener('keydown', (e) => {
    if (e.repeat && !/Arrow|Key[WS]/.test(e.code)) return;
    keys.down(e.code);
    if (e.code === 'Space') e.preventDefault();
    if (keys.ignored(e.code)) return;   // still held from before you boarded
    if (e.code === 'KeyE') {
      if (state.mode === 'drive' && stopHere()) getOut();
      else if (state.mode === 'foot') { const w = boardable(); if (w) board(w); }
      return;
    }
    if (state.mode !== 'drive') return;
    if (e.code === 'KeyW' || e.code === 'ArrowUp') throttleSteps++;
    if (e.code === 'KeyS' || e.code === 'ArrowDown') throttleSteps--;
    if (e.code === 'KeyH') horn(train.spec.sound);
    if (e.code === 'KeyV') views.cycle();
    if (e.code === 'Digit1') views.set('cab');
    if (e.code === 'Digit2') views.set('drone');
  });
  addEventListener('keyup', (e) => keys.up(e.code));
  addEventListener('blur', () => keys.clear());
  const footInput = () => ({
    fwd: (keys.has('KeyW') || keys.has('ArrowUp') ? 1 : 0) - (keys.has('KeyS') || keys.has('ArrowDown') ? 1 : 0),
    right: (keys.has('KeyD') || keys.has('ArrowRight') ? 1 : 0) - (keys.has('KeyA') || keys.has('ArrowLeft') ? 1 : 0),
    run: keys.has('ShiftLeft') || keys.has('ShiftRight'),
  });

  const $ = (id) => document.getElementById(id);
  $('driver').classList.add('on');
  function hud() {
    let prompt = '';
    if (state.mode === 'drive') {
      const to = PLACES[run.to].name, here = stopHere();
      $('spd').textContent = Math.round(Math.abs(drive.v) * 3.6);
      $('thr').textContent = `throttle ${Math.round(drive.throttle * 100)}%${drive.v < -0.05 ? ' · reversing' : ''}`;
      const toGo = run.stopS - drive.s;
      $('dist').textContent = toGo > 1 ? `${to} ${Math.round(toGo)} m` : `${to}: stop here`;
      if (here) prompt = `Get out at ${PLACES[here].name} (E)`;
      $('mode').textContent = `${train.spec.name} to ${to}`;
    } else {
      const w = boardable();
      if (w) prompt = `Board the ${fleet.trains[w.leg].spec.name} to ${PLACES[w.to].name} (E)`;
      $('mode').textContent = `On foot in ${PLACES[state.place].name}`;
    }
    $('prompt').textContent = prompt;
    $('prompt').classList.toggle('on', !!prompt);
  }

  let controls = null;
  if (params.has('free')) {
    controls = new OrbitControls(camera, renderer.domElement);
    const p = routes['city-ocean'].at(+params.get('free') || 900);
    controls.target.set(p.x, p.y, p.z);
    camera.position.set(p.x - 60, p.y + 40, p.z + 80);
    controls.update();
  }

  // where you are: the drone's target in free view, you on foot, or your train's front
  const here = () => (controls ? controls.target
    : state.mode === 'foot' ? new THREE.Vector3(player.state.x, player.state.y, player.state.z) : train.model.cars[0].holder.position);
  const landBoot = {};
  window.__tour = { scene, camera, renderer, look, terrain, routes, controls, PLACES, THREE };
  Object.assign(window.__tour, { drive, player, views, places, termini, skyDome, skyAt, streamer, journey, fleet, frame, seamCheck: (id) => seamCheck(places[id], terrain), snap, land, landBoot, landTimes, landFrames, buildLeg, legRoute });
  Object.defineProperties(window.__tour, {
    // the run you're on, with Phase 1's limits and originPlatform alongside it
    run: { get: () => ({ ...run, limits: fleet.trains[run.leg]?.limits, originPlatform: run.origin.platform }) }, mode: { get: () => state.mode }, state: { get: () => state }, train: { get: () => train.model },
    pendingTurn: { get: () => pendingTurn },
    // the land's pieces: how many are live, and of those shown, how many at each detail; which is being built
    chunks: { get: () => {
      const ids = land.ids, on = ids.filter((id) => land.shown(id)), n = (cell) => on.filter((id) => id.endsWith(`:${cell}`)).length;
      return { live: ids.length, shown: on.length, fine: n(4), mid: n(8), coarse: n(16), building: active?.id ?? null };
    } },
    walkWorld: { get: () => (state.mode === 'foot' ? walkWorld() : null) },
  });
  // developer aid: render a still from any viewpoint into an overlay (click it to close)
  function snap(pos, at, fov = 50) {
    const cam = new THREE.PerspectiveCamera(fov, innerWidth / innerHeight, 0.1, 8000);
    cam.position.set(...pos); cam.lookAt(...at);
    skyDome.follow(cam);
    renderer.render(scene, cam);
    skyDome.follow(camera);
    let img = document.getElementById('snap');
    if (!img) { img = document.createElement('img'); img.id = 'snap'; img.style.cssText = 'position:fixed;inset:0;width:100%;height:100%;z-index:50'; img.onclick = () => img.remove(); document.body.append(img); }
    img.src = renderer.domElement.toDataURL();
    return 'ok';
  }
  // the first view has its ground before the loading screen goes
  setLoading('shaping the land');
  terrain.takeDirty();   // no chunks yet: nothing to build again
  {
    const t0 = performance.now(), h = here();
    await wantLand(h.x, h.z, true);
    landBoot.ms = Math.round(performance.now() - t0); landBoot.chunks = land.ids.length;
  }
  landSliced = true;
  hideLoading();
  const clock = new THREE.Clock();
  let skyPos = null, lastStage = -1;
  // in a tunnel, from the cab, the daylight fades out (dimmer.js keeps each light's time-of-day strength to go back to)
  const dimmer = makeDimmer(() => { const ls = []; scene.traverse((o) => { if (o.isLight) ls.push(o); }); return ls; });
  const DARK = 0.85, DARK_IN = 25;   // dimmed this much once this many metres in
  let darkOverride = null;           // the debug hook can force a darkness (null: work it out)
  Object.assign(window.__tour, { dimmer, forceDark: (v) => { darkOverride = v; } });
  function tunnelDark() {
    if (darkOverride !== null) return darkOverride;
    if (state.mode !== 'drive' || views.mode !== 'cab') return 0;
    const fwd = run.route.reversed ?? run.route, s = run.route.reversed ? run.route.length - drive.s : drive.s;
    const u = tunnelDepth(fwd.sections, s);
    return u <= 0 ? 0 : DARK * Math.min(1, u / DARK_IN) ** 0.7;
  }
  const sunDir = new THREE.Vector3(), moonDir = new THREE.Vector3(), lightDir = new THREE.Vector3();
  // one frame (the debug hook can step it by hand when the page is hidden and frames don't come)
  function frame(dt) {
    fit();
    if (state.mode === 'drive') {
      const before = drive.s;
      Object.assign(drive, stepTrain(drive, trainInput({ driving: true, brakeKey: keys.has('Space'), throttleSteps }), dt, train.spec, train.limits));
      train.s = drive.s;
      poseTrain(train.model, run.route, drive.s, drive.s - before, run.lane);
      train.cab?.interior.userData.speed?.(Math.abs(drive.v) * 3.6);   // a cab with a speed readout
    }
    throttleSteps = 0;
    const front = train.model.cars[0].holder.position;
    if (state.mode === 'foot' && pendingTurn && Math.hypot(player.state.x - front.x, player.state.z - front.z) > 30) turnPending();
    hud();
    if (controls) controls.update();
    else if (state.mode === 'foot') player.update(dt, footInput(), walkWorld());
    else views.update(dt, train.model);
    // keep what's near you loaded, and let the sky follow where you are on the ring (it sets the time of day)
    const where = journey.where(state, run, drive.s);
    streamer.want(wanted(where));
    const want = ringPosition(where);
    skyPos = skyPos === null ? want : skyPos + (want - skyPos) * Math.min(1, dt * 1.5);
    const sky = skyAt(skyPos);
    if (Math.abs(sky.stage - lastStage) > 0.003) {
      dimmer.setTime(() => look.setTime(sky.stage)); lastStage = sky.stage;
      for (const t of Object.values(fleet.trains)) t.model.night?.(look.night);   // a train's own lit windows
    }
    dimmer.update(Math.round(tunnelDark() * 100) / 100);   // in steps of 1%, so lights are written only as it changes
    skyDome.update(sky, sunDir, dt);
    scene.background = null;
    scene.fog.near = 300; scene.fog.far = 5200 - sky.haze * 3000;
    for (const p of Object.values(places)) p.tick(clock.elapsedTime);
    anchor.position.copy(here());
    look.update();
    redoDirty();
    wantLand(anchor.position.x, anchor.position.z);
    // point the key light along our sun (or, after dark, a high moon) so shadows agree with the sky
    lightDir.copy(sky.sunElevationDeg > 2 ? sunDir : moonDir.set(-sunDir.x, 0, -sunDir.z).normalize().setY(0.75).normalize());
    look.key.position.copy(look.key.target.position).addScaledVector(lightDir, 160);
    renderer.render(scene, camera);
    landSlice();   // a few rows of the land being built, after this frame's work
  }
  renderer.setAnimationLoop(() => frame(clock.getDelta()));
}

boot().catch(fail);
