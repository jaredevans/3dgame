// Scenic Tour: boot, loop, input and HUD around the journey (journey.js): drive any leg either way, get out at a
// place, walk, and board one of the two trains waiting there.
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { KITS, loadError } from './config.js';
import { kitModule, setLoading, showLoadError, hideLoading } from './parts.js';
import { LEGS, PLACES, RING, BUILT, worldTerrain, legRoute, laneOf, SEA_LEVEL } from './world-data.js';
import { wantedSet } from './streaming.js';
import { makeStreamer } from './streamer.js';
import { buildTerrain, buildSea } from './terrain-mesh.js';
import { buildTrack } from './track-mesh.js';
import { poseTrain } from './vehicles.js';
import { stepTrain, leaveCab, trainInput } from './drive.js';
import { horn } from './audio.js';
import { buildPlace, seamCheck } from './places.js';
import { buildTerminus, PLATFORM_TOP } from './stations.js';
import { makePlayer } from './player.js';
import { nearestBoardable } from './walk.js';
import { makeWalkWorld } from './walk-world.js';
import { makeJourney } from './journey.js';
import { makeFleet } from './fleet.js';
import { makeKeys } from './keys.js';
import { makeSkyDome } from './sky-dome.js';
import { skyAt, ringPosition } from './sky.js';
import { makeCameras, fitCab } from './cameras.js';
import { makeDieselCab } from './cabs/diesel.js';

const CABS = { diesel: makeDieselCab };
const WALK_RADIUS = { city: 130 };   // how far from a place's centre you may walk (beyond its stations); 75 m elsewhere

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

  // ---- places, legs and trains load through the streamer, by id: only the places whose kits are wired in, the legs
  // between them, and those legs' trains (`train:<leg>`) ----
  const legBuilt = (id) => BUILT.includes(LEGS[id].from) && BUILT.includes(LEGS[id].to);
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
    // the place's stations: a terminus at its end of each built leg it serves
    const ids = [];
    for (const st of PLACES[id].stations.filter((s) => legBuilt(s.leg))) {
      const t = await buildTerminus(st.leg, st.end, { name: PLACES[id].name, platformLength: st.platformLength });
      scene.add(t.group); look.shadows(t.group);
      termini[`${id}:${st.leg}`] = t; ids.push(`${id}:${st.leg}`);
    }
    places[id] = place;
    return { dispose() { place.dispose(); for (const k of ids) { termini[k]?.group.removeFromParent(); delete termini[k]; } delete places[id]; } };
  };
  for (const id of builtLegs) {
    builders[id] = async () => {
      setLoading('laying track');
      const tracks = [buildTrack(routes[id], laneOf(id)), buildTrack(routes[id], -laneOf(id))];
      for (const t of tracks) scene.add(t);
      return { dispose() { for (const t of tracks) { t.removeFromParent(); t.traverse((o) => o.geometry?.dispose()); } } };
    };
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

  setLoading('shaping the land');
  const terrain = worldTerrain({ patches: Object.values(places).map((p) => p.patch).filter(Boolean) });
  const near = (x, z) => Object.values(routes).some((r) => {
    for (let s = 0; s <= r.length; s += 50) { const p = r.at(s); if (Math.hypot(p.x - x, p.z - z) < 600) return true; }
    return false;
  });
  scene.add(buildTerrain(terrain, { x0: -1280, z0: -1536, x1: 3328, z1: 1024, fine: near }));
  scene.add(buildSea(SEA_LEVEL));
  for (const p of Object.values(places)) for (const e of await p.addExtras(terrain)) look.shadows(e);

  const anchor = new THREE.Object3D();
  scene.add(anchor);
  look.follow(anchor);

  // ---- views: the cab and the drone ----
  const views = makeCameras(camera, renderer.domElement, { heightAt: terrain.heightAt });

  // ---- the train you drive: its run (journey.runRoute) and where its front is along it ----
  const drive = { s: 0, v: 0, throttle: 0 };
  let train = null, run = null;
  function take(leg, dir) {
    const t = fleet.trains[leg];
    if (t.run.dir !== dir) fleet.park(leg, dir);   // turned round for the trip back: it waits on its run's start
    train = t; run = t.run;
    Object.assign(drive, { s: t.s, v: 0, throttle: 0 });
    if (!CABS[t.spec.cab]) throw new Error(`no ${t.spec.cab} cab for the ${t.spec.name} yet`);
    t.cab ??= fitCab(renderer, t.model.cars[0], CABS[t.spec.cab]());
    views.attachCab(t.cab);
  }
  take(state.leg, state.dir);

  // ---- you: driving, or on foot in a place ----
  const player = await makePlayer(scene, camera, renderer.domElement, look);
  let pendingTurn = null;   // the train you came on: { leg, dir } it turns round to once you've walked away from it

  const walkWorld = () => makeWalkWorld({
    place: places[state.place], termini: PLACES[state.place].stations.map((st) => termini[`${state.place}:${st.leg}`]),
    terrain, seaLevel: SEA_LEVEL, radius: WALK_RADIUS[state.place] ?? 75,
  });
  // where you can get out: the platform you're heading for, or the one you haven't left yet
  const stopHere = () => journey.stopAt(run, drive);
  function getOut() {
    const here = stopHere();
    state = journey.getOut(state, here);
    // step out onto the platform beside the line, a little behind the cab
    const out = journey.stepOut(run, drive.s), p = run.route.offsetAt(out.s, out.lateral);
    player.enter(p.x, p.z, p.yaw, p.y + PLATFORM_TOP);
    Object.assign(drive, leaveCab(drive));
    train.s = drive.s;
    // the two trains waiting here: yours stays at its platform (turning round for the trip back once you're away from
    // it, if you've arrived); the other is put at its station
    pendingTurn = null;
    for (const w of journey.trainsAt(state, here).filter((w) => legBuilt(w.leg))) {
      if (w.leg === train.leg) { if (w.dir !== run.dir) pendingTurn = w; } else fleet.wait(w.leg, w.dir);
    }
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

  window.__tour = { scene, camera, renderer, look, terrain, routes, controls, PLACES, THREE };
  Object.assign(window.__tour, { drive, player, views, places, termini, skyDome, skyAt, streamer, journey, fleet, frame, seamCheck: (id) => seamCheck(places[id], terrain), snap });
  Object.defineProperties(window.__tour, {
    // the run you're on, with Phase 1's limits and originPlatform alongside it
    run: { get: () => ({ ...run, limits: fleet.trains[run.leg]?.limits, originPlatform: run.origin.platform }) }, mode: { get: () => state.mode }, state: { get: () => state }, train: { get: () => train.model },
    pendingTurn: { get: () => pendingTurn }, walkWorld: { get: () => (state.mode === 'foot' ? walkWorld() : null) },
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
  hideLoading();
  const clock = new THREE.Clock();
  let skyPos = null, lastStage = -1;
  const sunDir = new THREE.Vector3(), moonDir = new THREE.Vector3(), lightDir = new THREE.Vector3();
  // one frame (the debug hook can step it by hand when the page is hidden and frames don't come)
  function frame(dt) {
    fit();
    if (state.mode === 'drive') {
      const before = drive.s;
      Object.assign(drive, stepTrain(drive, trainInput({ driving: true, brakeKey: keys.has('Space'), throttleSteps }), dt, train.spec, train.limits));
      train.s = drive.s;
      poseTrain(train.model, run.route, drive.s, drive.s - before, run.lane);
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
    if (Math.abs(sky.stage - lastStage) > 0.003) { look.setTime(sky.stage); lastStage = sky.stage; }
    skyDome.update(sky, sunDir, dt);
    scene.background = null;
    scene.fog.near = 300; scene.fog.far = 5200 - sky.haze * 3000;
    for (const p of Object.values(places)) p.tick(clock.elapsedTime);
    anchor.position.copy(controls ? controls.target : state.mode === 'foot' ? new THREE.Vector3(player.state.x, player.state.y, player.state.z) : front);
    look.update();
    // point the key light along our sun (or, after dark, a high moon) so shadows agree with the sky
    lightDir.copy(sky.sunElevationDeg > 2 ? sunDir : moonDir.set(-sunDir.x, 0, -sunDir.z).normalize().setY(0.75).normalize());
    look.key.position.copy(look.key.target.position).addScaledVector(lightDir, 160);
    renderer.render(scene, camera);
  }
  renderer.setAnimationLoop(() => frame(clock.getDelta()));
}

boot().catch(fail);
