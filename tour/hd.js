// HD models: the trains' HD editions and the animals dressed by Polyfork's materials engine, when the owner's account CDN
// is configured (hd-switch.js; ?hd=0 turns it off), and the light their materials are authored for.
// An HD material is physically based: a metal has no diffuse term, all its brightness is reflected environment, and under
// stage()'s three lights alone it renders as a dark grey rod. So every HD material gets an environment of its own (a
// PMREM'd RoomEnvironment as its envMap), and nothing else in the scene does: the flat models and the places are lit as
// before, with no scene.environment and no tone mapping. Its strength follows the daylight (envLevel: stage()'s
// hemisphere light after the time of day and the tunnel dimmer), written only as it changes.
import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { PART_BASES } from './config.js';
import { firstOf, partBases } from './parts.js';
import { hdOn, hdCarUrl, envLevel, animalDress, isAccountCdn, withTimeout, jsonWithin, maskAccount, HD_ANIMALS } from './hd-switch.js';

export const HD = hdOn(globalThis.location?.search ?? '', PART_BASES);
// the environment's strength by day, where the HD models sit with the flat models and the towns beside them. It lights a
// surface twice over: its reflection, and a diffuse glow (a white RoomEnvironment at 1 gives a matt surface 4.6 times the
// diffuse light of stage()'s hemisphere light at 1). A metal has only the reflection, so it takes the environment strong;
// anything else (paint, fur, wood) already has the hemisphere light, so it takes only a touch, for its highlights, or it
// comes out pale and washed (a bay horse went dun at sunset). By metalness between the two
const ENV_METAL = 0.45, ENV_DIELECTRIC = 0.06;
const envBase = (m) => ENV_DIELECTRIC + (ENV_METAL - ENV_DIELECTRIC) * Math.min(1, Math.max(0, m.metalness ?? 0));

// How long an HD load from the account CDN is waited on before the flat model is built instead. A host that never
// answers would otherwise hold a train's build for ever (at boot, the loading screen; after it, the streamer's retries
// would import the same hung URL again each time)
export const HD_WAIT = 15;       // s, a train car's HD module and its createAsset
export const PARAMS_WAIT = 8;    // s, an animal's -params.json from one base (then the next base is tried)
const failed = new Set();   // kit part keys whose HD edition failed to load: flat from then on, not tried again
let down = false;           // the account CDN didn't answer in time: every train car flat from then on
// a kit car's HD module, or null (HD off, the part has no HD edition, it failed to load before, or the account CDN is
// down)
export const hdUrlFor = (key) => (down || failed.has(key) ? null : hdCarUrl(key, { on: HD, bases: partBases() }));
// load(): a car's HD edition, given up on after HD_WAIT s (thrown, as a failed load is)
export const hdCar = (key, load) => withTimeout(load(), HD_WAIT * 1000, `the ${key}'s HD edition`);

const warned = new Set();
// each thing that fell back to flat is said once, by its name (never the account link)
export function warnFlat(what, err) {
  if (warned.has(what)) return;
  warned.add(what);
  const why = maskAccount(err?.message ?? err);
  console.warn(`HD ${what} could not be loaded (${why}): using the flat model`);
}
// a car's HD edition failed: built flat, now and from now on; one that timed out takes every HD train car with it (the
// account CDN isn't answering: the next car would only wait as long again)
export function hdFailed(key, err) {
  failed.add(key);
  if (err?.timeout) down = true;
  warnFlat(err?.timeout ? 'editions (the account CDN did not answer)' : `edition of the ${key}`, err);
}

let envMap = null, level = 1;
// every HD material, held weakly (one let go of with its train is forgotten with it), its strength written to each as the
// daylight changes. A copy of one (fitCab clones the lead car's shell materials) is registered as it's made
const lit = new Set();   // WeakRef<Material>
function register(m) {
  lit.add(new WeakRef(m));
  m.clone = function clone() {
    const c = THREE.Material.prototype.clone.call(this);
    register(c);
    return c;
  };
}
// made once, at boot (behind the loading screen), only while HD is on. The unloader frees what a train let go of uses and
// nothing still in the scene does: the environment outlives every model, so freeing it is a no-op (a render target's
// texture never comes back)
export function makeHdEnvironment(renderer) {
  if (!HD || envMap) return;
  const pmrem = new THREE.PMREMGenerator(renderer);
  const room = new RoomEnvironment();
  envMap = pmrem.fromScene(room, 0.04).texture;
  room.traverse((o) => { o.geometry?.dispose(); [].concat(o.material ?? []).forEach((m) => m.dispose()); });
  pmrem.dispose();
  envMap.dispose = () => {};
}

// give every physically based material under root (of the meshes `only` picks) the environment, at today's strength
// (before its programs are warmed: the envMap is part of the program, the strength only a uniform). Its copies (a cab's
// clipped shell) are registered too.
export function hdLight(root, only = () => true) {
  if (!envMap) return root;
  root.traverse((o) => {
    if (!o.material || !only(o)) return;
    for (const m of [].concat(o.material)) {
      if (!m?.isMeshStandardMaterial) continue;
      if (m.userData.hdEnv === undefined) register(m);
      m.envMap = envMap;
      m.userData.hdEnv = envBase(m);   // its daytime strength
      m.envMapIntensity = m.userData.hdEnv * level;
      m.needsUpdate = true;
    }
  });
  return root;
}

// once a frame: the environment's strength from stage()'s hemisphere light now; when it changes, every HD material is
// written, in the scene or not (a train being built, an animal's source)
export function updateHdLight(hemi) {
  if (!envMap) return;
  const next = envLevel(hemi.intensity, hemi.color);
  if (next === level) return;
  level = next;
  for (const ref of lit) {
    const m = ref.deref();
    if (m) m.envMapIntensity = m.userData.hdEnv * level; else lit.delete(ref);
  }
}
export const hdMaterials = () => lit.size;   // (the debug hook's: how many are registered, freed ones included until next write)

// Polyfork's materials engine, imported once while HD is on, from beside the parts (scripts/extract-parts.mjs fetches it:
// polyfork.dev serves it without the CORS headers a page here needs to import it, and the account CDN hasn't it); null if
// HD is off or it couldn't be loaded (said once: the animals stay flat)
let engine = null;
export function materialsEngine() {
  if (!HD) return Promise.resolve(null);
  engine ??= firstOf(partBases().filter((b) => !isAccountCdn(b)), 'materials.mjs', (url) => import(url)).catch((err) => {
    warnFlat('materials engine (materials.mjs: run node scripts/extract-parts.mjs)', err);
    return null;
  });
  return engine;
}

// each base given PARAMS_WAIT s (a host that never answers is given up on, skipped from then on, and the next base tried)
const fetchJson = (url) => jsonWithin(url, PARAMS_WAIT * 1000);
const hows = new Map();   // animal id -> promise of { engine, zones, materials } or null
// how the animal `id` is dressed in HD (hd-switch.js animalDress), from its -params.json on the parts' bases; null if HD
// is off or it can't be (said once: that animal stays flat)
export function animalHow(id) {
  if (!hows.has(id)) {
    hows.set(id, (async () => {
      const engine = await materialsEngine();
      if (!engine) return null;
      const how = animalDress(await firstOf(partBases(), `${id}-params.json`, fetchJson), engine.guessMaterials);
      if (!how) throw new Error('no colour zones to dress');
      return { engine, ...how };
    })().catch((err) => { warnFlat(`dress of the ${id}`, err); return null; }));
  }
  return hows.get(id);
}

// at boot, behind the loading screen, while HD is on: the maps of every kind of surface the actors' animals are dressed
// in, made now (the engine makes each on first use, a coat's fur in ~75 ms, which would otherwise stall a frame as the
// first of them is built). For `within` s at most (a slow connection): the boot goes on without them
export async function prepareHdAnimals({ within = 10 } = {}) {
  const hows = await Promise.race([Promise.all(HD_ANIMALS.map(animalHow)), new Promise((r) => setTimeout(() => r([]), within * 1000))]);
  for (const how of hows) {
    if (!how) continue;
    for (const spec of Object.values(how.materials)) how.engine.mapsFor(spec.kind, spec.finish ?? null, spec.seed ?? 1);
  }
}
