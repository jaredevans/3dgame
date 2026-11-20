// Scenic Tour: boot, loop, input and HUD.
import * as THREE from 'three';
import { KITS, loadError } from './config.js';
import { kitModule, part, setLoading, showLoadError, hideLoading } from './parts.js';

const fail = (err) => { console.error(err); showLoadError(loadError(err?.url ?? 'a tour module', err)); };
addEventListener('unhandledrejection', (e) => fail(e.reason));

async function boot() {
  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.setSize(innerWidth, innerHeight);
  document.body.prepend(renderer.domElement);
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(55, innerWidth / innerHeight, 0.05, 6000);
  camera.position.set(6, 3, 8);
  camera.lookAt(0, 0.8, 0);

  setLoading('lighting');
  const { stage } = await kitModule(KITS.railway, 'stage.mjs');
  const look = stage(renderer, scene, { time: 'day', far: 6000 });

  setLoading('a first part');
  const stop = await part(KITS.railway, 'buffer-stop', {});
  scene.add(stop);
  look.shadows(stop);

  addEventListener('resize', () => {
    camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix();
    renderer.setSize(innerWidth, innerHeight);
  });
  window.__tour = { scene, camera, renderer, look };
  hideLoading();
  renderer.setAnimationLoop(() => { look.update(); renderer.render(scene, camera); });
}

boot().catch(fail);
