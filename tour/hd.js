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
import { hdOn, hdCarUrl, envLevel, animalDress, isAccountCdn, HD_ANIMALS } from './hd-switch.js';

export const HD = hdOn(globalThis.location?.search ?? '', PART_BASES);
// the environment's strength by day, where the HD models sit with the flat models and the towns beside them. It lights a
// surface twice over: its reflection, and a diffuse glow (a white RoomEnvironment at 1 gives a matt surface 4.6 times the
// diffuse light of stage()'s hemisphere light at 1). A metal has only the reflection, so it takes the environment strong;
// anything else (paint, fur, wood) already has the hemisphere light, so it takes only a touch, for its highlights, or it
// comes out pale and washed (a bay horse went dun at sunset). By metalness between the two
const ENV_METAL = 0.45, ENV_DIELECTRIC = 0.06;
const envBase = (m) => ENV_DIELECTRIC + (ENV_METAL - ENV_DIELECTRIC) * Math.min(1, Math.max(0, m.metalness ?? 0));

const failed = new Set();   // kit part keys whose HD edition failed to load: flat from then on, not tried again
// a kit car's HD module, or null (HD off, the part has no HD edition, or it failed to load before)
export const hdUrlFor = (key) => (failed.has(key) ? null : hdCarUrl(key, { on: HD, bases: partBases() }));

const warned = new Set();
// each thing that fell back to flat is said once, by its name (never the account link)
export function warnFlat(what, err) {
  if (warned.has(what)) return;
  warned.add(what);
  const why = String(err?.message ?? err).replace(/https?:\/\/\S+\/c\/[^/\s]+\//g, '<account CDN>/');
  console.warn(`HD ${what} could not be loaded (${why}): using the flat model`);
}
// a car's HD edition failed: built flat, now and from now on
export function hdFailed(key, err) {
  failed.add(key);
  warnFlat(`edition of the ${key}`, err);
}

let envMap = null, level = 1;
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

// give every physically based material under root the environment, at today's strength (before its programs are warmed:
// the envMap is part of the program, the strength only a uniform). Its copies (a cab's clipped shell) keep the flag.
export function hdLight(root) {
  if (!envMap) return root;
  root.traverse((o) => {
    for (const m of [].concat(o.material ?? [])) {
      if (!m?.isMeshStandardMaterial) continue;
      m.envMap = envMap;
      m.userData.hdEnv = envBase(m);   // its daytime strength
      m.envMapIntensity = m.userData.hdEnv * level;
      m.needsUpdate = true;
    }
  });
  return root;
}

// once a frame: the environment's strength from stage()'s hemisphere light now; when it changes, every HD material in
// the scene is written (the scene walked, as the tunnel dimmer walks it for its lights)
export function updateHdLight(hemi, scene) {
  if (!envMap) return;
  const next = envLevel(hemi.intensity, hemi.color);
  if (next === level) return;
  level = next;
  scene.traverse((o) => {
    if (!o.material) return;
    for (const m of [].concat(o.material)) if (m.userData.hdEnv) m.envMapIntensity = m.userData.hdEnv * level;
  });
}

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

const fetchJson = async (url) => {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`${r.status}`);
  return r.json();
};
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
