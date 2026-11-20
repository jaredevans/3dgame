// Scenic Tour: boot, loop, input and HUD.
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { KITS, loadError } from './config.js';
import { kitModule, setLoading, showLoadError, hideLoading } from './parts.js';
import { LEGS, PLACES, worldTerrain, legRoute, laneFor, SEA_LEVEL } from './world-data.js';
import { buildTerrain, buildSea } from './terrain-mesh.js';
import { buildTrack } from './track-mesh.js';
import { buildTrain, poseTrain } from './vehicles.js';
import { COUPLING_GAP } from './consist.js';
import { TRAIN_SPECS, stepTrain } from './drive.js';
import { horn } from './audio.js';
import { buildPlace, seamCheck } from './places.js';
import { buildTerminus, BUFFER_GAP, PLATFORM_TOP } from './stations.js';
import { makePlayer } from './player.js';
import { canGetOut, nearestBoardable } from './walk.js';
import { reverseRoute } from './route.js';
import { makeSkyDome } from './sky-dome.js';
import { skyAt, ringPosition } from './sky.js';
import { makeCameras, fitCab } from './cameras.js';
import { makeDieselCab } from './cabs/diesel.js';

// a run: a train driving forwards along `route` (a leg, or a reversed view of one) in the outbound lane, to `platform`
function makeRun(route, trainLength, destination, platform) {
  return {
    route, lane: laneFor('out'), destination, platform,
    limits: { sMin: trainLength + BUFFER_GAP, sMax: route.length - BUFFER_GAP },
    stopS: platform.stopS,
  };
}

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

  setLoading('building Downtown City and Oceanside');
  const routes = Object.fromEntries(Object.keys(LEGS).map((id) => [id, legRoute(id)]));
  const places = {};
  for (const id of ['city', 'ocean']) { places[id] = await buildPlace(id); scene.add(places[id].group); look.shadows(places[id].group); }
  const termini = {
    city: await buildTerminus(routes['city-ocean'], 'start', { name: PLACES.city.name }),
    ocean: await buildTerminus(routes['city-ocean'], 'end', { name: PLACES.ocean.name }),
  };
  for (const t of Object.values(termini)) { scene.add(t.group); look.shadows(t.group); }

  setLoading('shaping the land');
  const terrain = worldTerrain({ patches: Object.values(places).map((p) => p.patch).filter(Boolean) });
  const near = (x, z) => Object.values(routes).some((r) => {
    for (let s = 0; s <= r.length; s += 50) { const p = r.at(s); if (Math.hypot(p.x - x, p.z - z) < 600) return true; }
    return false;
  });
  scene.add(buildTerrain(terrain, { x0: -1280, z0: -1536, x1: 3328, z1: 1024, fine: near }));
  scene.add(buildSea(SEA_LEVEL));
  for (const p of Object.values(places)) for (const e of await p.addExtras(terrain)) look.shadows(e);

  setLoading('laying track');
  for (const r of Object.values(routes)) { scene.add(buildTrack(r, laneFor('out'))); scene.add(buildTrack(r, laneFor('back'))); }

  setLoading('the Seaside Excursion');
  const spec = TRAIN_SPECS.cityOcean;
  const train = await buildTrain({ name: spec.name, cars: spec.cars });
  scene.add(train.group);
  look.shadows(train.group);
  const trainLength = train.cars.reduce((a, c) => a + c.length, 0) + COUPLING_GAP * (train.cars.length - 1);
  // the run: which route the train drives (always forwards on it), its lane, and where the buffers stop it
  // a run in either direction along the leg: 'out' City -> Oceanside, 'back' on the other line, Oceanside -> City
  const flip = (p, L) => ({ sFrom: L - p.sTo, sTo: L - p.sFrom, stopS: L - p.stopS });
  const leg = routes['city-ocean'];
  function runFor(dir) {
    const r = dir === 'out'
      ? makeRun(leg, trainLength, PLACES.ocean.name, termini.ocean.platform)
      : makeRun(reverseRoute(leg), trainLength, PLACES.city.name, flip(termini.city.platform, leg.length));
    const originPlatform = dir === 'out' ? termini.city.platform : flip(termini.ocean.platform, leg.length);
    return Object.assign(r, { dir, to: dir === 'out' ? 'ocean' : 'city', from: dir === 'out' ? 'city' : 'ocean', originPlatform });
  }
  let run = runFor('out');
  const drive = { s: run.limits.sMin, v: 0, throttle: 0 };
  poseTrain(train, run.route, drive.s, 0, run.lane);

  const anchor = new THREE.Object3D();
  scene.add(anchor);
  look.follow(anchor);

  // ---- views: the cab and the drone ----
  const views = makeCameras(camera, renderer.domElement, { heightAt: terrain.heightAt });
  views.attachCab(fitCab(renderer, train.cars[0], makeDieselCab()));

  // ---- you: driving, or on foot at a station ----
  const player = await makePlayer(scene, camera, renderer.domElement, look);
  let mode = 'drive', at = null, pendingTurn = false;   // at: { place, terminus } where you got out

  // turn the train round for the trip back: it waits on the other line, facing home
  function turnTrain() {
    run = runFor(run.dir === 'out' ? 'back' : 'out');
    Object.assign(drive, { s: run.limits.sMin, v: 0, throttle: 0 });
    poseTrain(train, run.route, drive.s, 0, run.lane);
    pendingTurn = false;
  }
  function walkWorld() {
    const { place, terminus } = at;
    const radius = place.id === 'city' ? 130 : 75;
    return {
      blocked: (x, z, r) => place.blocked(x, z, r) || terminus.walk.blocked(x, z, r),
      heightAt: (x, z) => terminus.walk.platformY(x, z) ?? (place.contains(x, z, 2) ? place.groundAt(x, z) : terrain.heightAt(x, z)),
      inBounds: (x, z) => {
        if (terminus.walk.onTrack(x, z)) return false;
        if (terrain.heightAt(x, z) < SEA_LEVEL + 0.2 && !place.contains(x, z)) return false;
        return Math.hypot(x - place.def.centre.x, z - place.def.centre.z) < radius || terminus.walk.inStation(x, z);
      },
    };
  }
  // where you can get out: the platform you're heading for, or the one you haven't left yet
  const stopHere = () => (canGetOut(drive, run.platform) ? run.to : canGetOut(drive, run.originPlatform) ? run.from : null);
  function getOut() {
    const here = stopHere();
    at = { place: places[here], terminus: termini[here] };
    const p = run.route.offsetAt(drive.s - 8, run.lane - 2.6);
    player.enter(p.x, p.z, p.yaw, p.y + PLATFORM_TOP);
    mode = 'foot';
    pendingTurn = here === run.to;   // arrived: it turns round for the trip back; not yet left: it's ready to go
    views.setDriving(false);
    $('driver').classList.remove('on');
  }
  function trainPoints() {
    const pts = [];
    for (const c of train.cars) {
      const h = c.holder, f = new THREE.Vector3(0, 0, c.front - 1).applyMatrix4(h.matrixWorld), r = new THREE.Vector3(0, 0, c.front - c.length + 1).applyMatrix4(h.matrixWorld);
      for (let k = 0; k <= 4; k++) pts.push({ x: f.x + (r.x - f.x) * k / 4, z: f.z + (r.z - f.z) * k / 4 });
    }
    return pts;
  }
  function board() {
    if (pendingTurn) turnTrain();
    player.exit();
    mode = 'drive';
    views.setDriving(true);
    $('driver').classList.add('on');
  }

  const keys = new Set();
  let throttleSteps = 0;
  addEventListener('keydown', (e) => {
    if (e.repeat && !/Arrow|Key[WS]/.test(e.code)) return;
    keys.add(e.code);
    if (e.code === 'Space') e.preventDefault();
    if (e.code === 'KeyE') {
      if (mode === 'drive' && stopHere()) getOut();
      else if (mode === 'foot' && boardable()) board();
      return;
    }
    if (mode !== 'drive') return;
    if (e.code === 'KeyW' || e.code === 'ArrowUp') throttleSteps++;
    if (e.code === 'KeyS' || e.code === 'ArrowDown') throttleSteps--;
    if (e.code === 'KeyH') horn(spec.sound);
    if (e.code === 'KeyV') views.cycle();
    if (e.code === 'Digit1') views.set('cab');
    if (e.code === 'Digit2') views.set('drone');
  });
  addEventListener('keyup', (e) => keys.delete(e.code));
  addEventListener('blur', () => keys.clear());
  const boardable = () => nearestBoardable(player.state, [{ name: spec.name, stopped: Math.abs(drive.v) < 0.05, cars: trainPoints() }]);
  const footInput = () => ({
    fwd: (keys.has('KeyW') || keys.has('ArrowUp') ? 1 : 0) - (keys.has('KeyS') || keys.has('ArrowDown') ? 1 : 0),
    right: (keys.has('KeyD') || keys.has('ArrowRight') ? 1 : 0) - (keys.has('KeyA') || keys.has('ArrowLeft') ? 1 : 0),
    run: keys.has('ShiftLeft') || keys.has('ShiftRight'),
  });

  const $ = (id) => document.getElementById(id);
  $('driver').classList.add('on');
  function hud() {
    let prompt = '';
    if (mode === 'drive') {
      $('spd').textContent = Math.round(Math.abs(drive.v) * 3.6);
      $('thr').textContent = `throttle ${Math.round(drive.throttle * 100)}%${drive.v < -0.05 ? ' · reversing' : ''}`;
      const toGo = run.stopS - drive.s;
      $('dist').textContent = toGo > 1 ? `${run.destination} ${Math.round(toGo)} m` : `${run.destination}: stop here`;
      if (stopHere()) prompt = `Get out at ${PLACES[stopHere()].name} (E)`;
      $('mode').textContent = `${spec.name} to ${run.destination}`;
    } else {
      const nextDest = pendingTurn ? PLACES[run.from].name : run.destination;
      if (boardable()) prompt = `Board the ${spec.name} to ${nextDest} (E)`;
      $('mode').textContent = `On foot in ${at.place.def.name}`;
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
  Object.assign(window.__tour, { train, drive, player, views, places, termini, skyDome, skyAt, seamCheck: (id) => seamCheck(places[id], terrain), snap });
  Object.defineProperties(window.__tour, { run: { get: () => run }, mode: { get: () => mode }, walkWorld: { get: () => (at ? walkWorld() : null) } });
  // developer aid: render a still from any viewpoint into an overlay (click it to close)
  function snap(pos, at, fov = 50) {
    const cam = new THREE.PerspectiveCamera(fov, innerWidth / innerHeight, 0.1, 8000);
    cam.position.set(...pos); cam.lookAt(...at);
    renderer.render(scene, cam);
    let img = document.getElementById('snap');
    if (!img) { img = document.createElement('img'); img.id = 'snap'; img.style.cssText = 'position:fixed;inset:0;width:100%;height:100%;z-index:50'; img.onclick = () => img.remove(); document.body.append(img); }
    img.src = renderer.domElement.toDataURL();
    return 'ok';
  }
  hideLoading();
  const clock = new THREE.Clock();
  let skyPos = null, lastStage = -1;
  const sunDir = new THREE.Vector3(), moonDir = new THREE.Vector3(), lightDir = new THREE.Vector3();
  const head = {};
  renderer.setAnimationLoop(() => {
    fit();
    const dt = clock.getDelta();
    const before = drive.s;
    Object.assign(drive, stepTrain(drive, { throttleDelta: throttleSteps, brake: mode === 'drive' && keys.has('Space') }, dt, spec, run.limits));
    throttleSteps = 0;
    if (mode === 'foot' && pendingTurn && Math.hypot(player.state.x - train.cars[0].holder.position.x, player.state.z - train.cars[0].holder.position.z) > 30) turnTrain();
    poseTrain(train, run.route, drive.s, drive.s - before, run.lane);
    hud();
    if (controls) controls.update();
    else if (mode === 'foot') player.update(dt, footInput(), walkWorld());
    else views.update(dt, train);
    // the sky: where you are on the ring sets the time of day
    const want = mode === 'foot' ? ringPosition({ place: at.place.id })
      : ringPosition({ leg: 'city-ocean', fraction: run.dir === 'out' ? drive.s / run.route.length : 1 - drive.s / run.route.length });
    skyPos = skyPos === null ? want : skyPos + (want - skyPos) * Math.min(1, dt * 1.5);
    const sky = skyAt(skyPos);
    if (Math.abs(sky.stage - lastStage) > 0.003) { look.setTime(sky.stage); lastStage = sky.stage; }
    skyDome.update(sky, sunDir, dt);
    scene.background = null;
    scene.fog.near = 300; scene.fog.far = 5200 - sky.haze * 3000;
    for (const p of Object.values(places)) p.tick(clock.elapsedTime);
    anchor.position.copy(controls ? controls.target : mode === 'foot' ? new THREE.Vector3(player.state.x, player.state.y, player.state.z) : train.cars[0].holder.position);
    look.update();
    // point the key light along our sun (or, after dark, a high moon) so shadows agree with the sky
    lightDir.copy(sky.sunElevationDeg > 2 ? sunDir : moonDir.set(-sunDir.x, 0, -sunDir.z).normalize().setY(0.75).normalize());
    look.key.position.copy(look.key.target.position).addScaledVector(lightDir, 160);
    renderer.render(scene, camera);
  });
}

boot().catch(fail);
