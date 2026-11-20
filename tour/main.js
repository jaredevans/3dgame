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
import { makeCameras, fitCab } from './cameras.js';
import { makeDieselCab } from './cabs/diesel.js';

const BUFFER_GAP = 1.5;   // metres between the end of the line and a buffer face
const STOP_SHORT = 12;    // the stopping point is this far short of the buffers

// a run: a train driving forwards along `route` (a leg, or a reversed view of one) in the outbound lane
function makeRun(route, trainLength, destination) {
  return {
    route, lane: laneFor('out'), destination,
    limits: { sMin: trainLength + BUFFER_GAP, sMax: route.length - BUFFER_GAP },
    stopS: route.length - BUFFER_GAP - STOP_SHORT,
  };
}

const fail = (err) => { console.error(err); showLoadError(loadError(err?.url ?? 'a tour module', err)); };
addEventListener('unhandledrejection', (e) => fail(e.reason));
const params = new URLSearchParams(location.search);

async function boot() {
  const renderer = new THREE.WebGLRenderer({ antialias: true });
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
  const look = stage(renderer, scene, { time: 'day', far: 8000, shadowSpan: 160 });

  setLoading('shaping the land');
  const terrain = worldTerrain();
  const routes = Object.fromEntries(Object.keys(LEGS).map((id) => [id, legRoute(id)]));
  const near = (x, z) => Object.values(routes).some((r) => {
    for (let s = 0; s <= r.length; s += 50) { const p = r.at(s); if (Math.hypot(p.x - x, p.z - z) < 600) return true; }
    return false;
  });
  scene.add(buildTerrain(terrain, { x0: -1280, z0: -1536, x1: 3328, z1: 1024, fine: near }));
  scene.add(buildSea(SEA_LEVEL));

  setLoading('laying track');
  for (const r of Object.values(routes)) { scene.add(buildTrack(r, laneFor('out'))); scene.add(buildTrack(r, laneFor('back'))); }

  setLoading('the Seaside Excursion');
  const spec = TRAIN_SPECS.cityOcean;
  const train = await buildTrain({ name: spec.name, cars: spec.cars });
  scene.add(train.group);
  look.shadows(train.group);
  const trainLength = train.cars.reduce((a, c) => a + c.length, 0) + COUPLING_GAP * (train.cars.length - 1);
  // the run: which route the train drives (always forwards on it), its lane, and where the buffers stop it
  const run = makeRun(routes['city-ocean'], trainLength, PLACES.ocean.name);
  const drive = { s: run.limits.sMin, v: 0, throttle: 0 };
  poseTrain(train, run.route, drive.s, 0, run.lane);

  const anchor = new THREE.Object3D();
  scene.add(anchor);
  look.follow(anchor);

  // ---- views: the cab and the drone ----
  const views = makeCameras(camera, renderer.domElement, { heightAt: terrain.heightAt });
  views.attachCab(fitCab(renderer, train.cars[0], makeDieselCab()));

  // ---- input ----
  const keys = new Set();
  let throttleSteps = 0;
  addEventListener('keydown', (e) => {
    if (e.repeat && !/Arrow|Key[WS]/.test(e.code)) return;
    keys.add(e.code);
    if (e.code === 'KeyW' || e.code === 'ArrowUp') throttleSteps++;
    if (e.code === 'KeyS' || e.code === 'ArrowDown') throttleSteps--;
    if (e.code === 'KeyH') horn(spec.sound);
    if (e.code === 'KeyV') views.cycle();
    if (e.code === 'Digit1') views.set('cab');
    if (e.code === 'Digit2') views.set('drone');
    if (e.code === 'Space') e.preventDefault();
  });
  addEventListener('keyup', (e) => keys.delete(e.code));
  addEventListener('blur', () => keys.clear());

  const $ = (id) => document.getElementById(id);
  $('driver').classList.add('on');
  function hud() {
    $('spd').textContent = Math.round(Math.abs(drive.v) * 3.6);
    $('thr').textContent = `throttle ${Math.round(drive.throttle * 100)}%${drive.v < -0.05 ? ' · reversing' : ''}`;
    const toGo = run.stopS - drive.s;
    $('dist').textContent = toGo > 1 ? `${run.destination} ${Math.round(toGo)} m` : `${run.destination}: stop here`;
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
  Object.assign(window.__tour, { train, drive, run, views });
  hideLoading();
  const clock = new THREE.Clock();
  const head = {};
  renderer.setAnimationLoop(() => {
    fit();
    const dt = clock.getDelta();
    const before = drive.s;
    Object.assign(drive, stepTrain(drive, { throttleDelta: throttleSteps, brake: keys.has('Space') }, dt, spec, run.limits));
    throttleSteps = 0;
    poseTrain(train, run.route, drive.s, drive.s - before, run.lane);
    hud();
    if (controls) controls.update();
    else views.update(dt, train);
    anchor.position.copy(controls ? controls.target : train.cars[0].holder.position);
    look.update();
    renderer.render(scene, camera);
  });
}

boot().catch(fail);
