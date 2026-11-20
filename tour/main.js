// Scenic Tour: boot, loop, input and HUD.
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { KITS, loadError } from './config.js';
import { kitModule, setLoading, showLoadError, hideLoading } from './parts.js';
import { LEGS, PLACES, worldTerrain, legRoute, laneFor, SEA_LEVEL } from './world-data.js';
import { buildTerrain, buildSea } from './terrain-mesh.js';
import { buildTrack } from './track-mesh.js';

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

  const anchor = new THREE.Object3D();
  scene.add(anchor);
  look.follow(anchor);

  let controls = null;
  if (params.has('free')) {
    controls = new OrbitControls(camera, renderer.domElement);
    const p = routes['city-ocean'].at(+params.get('free') || 900);
    controls.target.set(p.x, p.y, p.z);
    camera.position.set(p.x - 60, p.y + 40, p.z + 80);
    controls.update();
  }

  addEventListener('resize', () => {
    camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix();
    renderer.setSize(innerWidth, innerHeight);
  });
  window.__tour = { scene, camera, renderer, look, terrain, routes, controls, PLACES, THREE };
  hideLoading();
  renderer.setAnimationLoop(() => {
    controls?.update();
    anchor.position.copy(controls ? controls.target : camera.position);
    look.update();
    renderer.render(scene, camera);
  });
}

boot().catch(fail);
