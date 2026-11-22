// Scenic Tour: boot, loop, input and HUD around the journey (journey.js): drive any leg either way, get out at a
// place, walk, and board one of the two trains waiting there.
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { KITS, loadError } from './config.js';
import { kitModule, setLoading, showLoadError, hideLoading, forgetPending } from './parts.js';
import { LEGS, PLACES, RING, FEATURES, worldTerrain, legRoute, laneOf, SEA_LEVEL, stationFrame } from './world-data.js';
import { TRAIN_SPECS } from './trains/specs.js';
import { makeMap } from './map.js';
import { wantedSet, neededToDrive, readyToLeave } from './streaming.js';
import { makeArrival } from './arrival.js';
import { makeStreamer, STALL, own, disown } from './streamer.js';
import { terrainChunkJob, terrainChunkMesh, buildSea } from './terrain-mesh.js';
import { chunksWanted, chunkOf, chunkId, chunkKey, corridorKeys, runFor, CHUNK, FINE, COARSE } from './chunks.js';
import { scatterJob } from './scenery.js';
import { loadScenery, sceneryGroup, sceneryWarmup, disposeScenery } from './scenery-mesh.js';
import { buildTrack } from './track-mesh.js';
import { buildStructures } from './structure-mesh.js';
import { buildSuburbs } from './suburbs-mesh.js';
import { buildEventActors } from './actors/index.js';
import { EVENTS, eventsFor, makeEventTrack } from './events.js';
import { makeReactions, mustBrake } from './react.js';
import { makeSlicer, scenery } from './slicer.js';
import { tunnelDepth } from './structures.js';
import { makeDimmer } from './dimmer.js';
import { makeHdEnvironment, updateHdLight, prepareHdAnimals } from './hd.js';
import { poseTrain } from './vehicles.js';
import { stepTrain, leaveCab, trainInput } from './drive.js';
import { horn } from './audio.js';
import { buildPlace, fetchPlace, seamCheck } from './places.js';
import { release, makeUnloader } from './dispose.js';
import { buildTerminus, PLATFORM_TOP } from './stations.js';
import { makePlayer } from './player.js';
import { nearestBoardable, BODY } from './walk.js';
import { makeWalkWorld } from './walk-world.js';
import { makeJourney } from './journey.js';
import { makeFleet } from './fleet.js';
import { makeKeys } from './keys.js';
import { makeSkyDome } from './sky-dome.js';
import { skyAt, ringPosition, towards } from './sky.js';
import { makeCameras, fitCab } from './cameras.js';
import { makeDieselCab } from './cabs/diesel.js';
import { makeSteamCab, STEAM_MODELS } from './cabs/steam.js';
import { makeFutureCab } from './cabs/future.js';
import { makeShuttleCab } from './cabs/shuttle.js';

// each train spec's cab, made for its leading vehicle (a steam cab is measured per locomotive model)
const CABS = {
  diesel: () => makeDieselCab(),
  steam: (car) => {
    const model = STEAM_MODELS[car.key];
    if (!model) throw new Error(`no steam cab measured for the ${car.key}`);
    return makeSteamCab(model);
  },
  // the Silver Arrow's cab is made to its own front car; the Metro Glide's to the guideway shuttle's shell (measured)
  future: (car, spec) => {
    if (car.key === 'bullet') return makeFutureCab();
    if (car.key === 'guideway-rail-shuttle') return makeShuttleCab({ ride: spec.ride, top: Math.round(spec.top * 3.6) });
    throw new Error(`no futuristic cab measured for the ${car.key}`);
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
  // a new thing made ready to draw before it is first seen, so no frame waits on it: its shader programs compiled
  // against the scene (its lights, fog and shadows), off the main thread where the browser can
  // (KHR_parallel_shader_compile); then drawn once, whole and unculled (its hidden parts too: a place's lamp pools, lit
  // only at night), into a 1 x 1 corner of the canvas with everything but the scene's lights hidden. That uploads its
  // geometry and textures, compiles its shadow's programs and has the GPU set up each way it's drawn, which it does only
  // on a first draw into the canvas itself (the suburbs took up to 130 ms the first frame they came into view, and the
  // Futuristic place's lamp pools 56 ms the first night). The drawing is done in a frame, just before the frame is drawn
  // over it, so the corner is never seen; at boot, behind the loading screen, at once.
  function upload(obj) {
    const parent = obj.parent, visible = obj.visible, culled = [], hidden = [], shown = [];
    obj.traverse((o) => {
      if (o.isMesh && o.frustumCulled) { o.frustumCulled = false; culled.push(o); }
      if (o !== obj && !o.visible) { o.visible = true; shown.push(o); }
      for (const m of [].concat(o.material ?? [])) for (const v of Object.values(m)) if (v?.isTexture) renderer.initTexture(v);
    });
    for (const c of scene.children) if (c.visible && !c.isLight && c !== obj) { c.visible = false; hidden.push(c); }
    obj.visible = true;
    if (parent !== scene) scene.add(obj);
    const scissor = renderer.getScissorTest(), sc = renderer.getScissor(new THREE.Vector4()), vp = renderer.getViewport(new THREE.Vector4());
    try {
      renderer.setScissorTest(true); renderer.setScissor(0, 0, 1, 1); renderer.setViewport(0, 0, 1, 1);
      renderer.render(scene, camera);
    } finally {   // whatever happens, the scene is put back as it was
      renderer.setScissorTest(scissor); renderer.setScissor(sc); renderer.setViewport(vp);
      if (parent && parent !== scene) parent.add(obj); else if (!parent) obj.removeFromParent();
      obj.visible = visible;
      for (const c of hidden) c.visible = true;
      for (const o of shown) o.visible = false;
      for (const o of culled) o.frustumCulled = true;
    }
  }
  let framing = false;   // frames are running: a thing waits to be drawn at the start of the render of the next one it
  // may land in (mayLand: on foot, or at a standstill; the upload is a long task, never on a moving frame). At once while
  // the page is hidden: no frames come, and nothing's seen (and any waiting are drawn as it's hidden)
  let mayLand = true;
  const toDraw = [];
  const drawOnce = (obj) => (framing && !document.hidden ? new Promise((done) => toDraw.push({ obj, done })) : (upload(obj), Promise.resolve()));
  const drawWaiting = () => {
    for (const { obj, done } of toDraw.splice(0)) {   // anything new, drawn once out of sight
      try { upload(obj); } catch (err) { console.error(err); } finally { done(); }
    }
  };
  document.addEventListener('visibilitychange', () => { if (document.hidden) drawWaiting(); });
  // the shared shadow-depth material's programs, one for each way a caster's shadow can differ: its side; plain,
  // instanced or skinned; clipped (a cab's shell) or not; textured or not. three.js picks a new one only when a caster
  // is instanced, skinned or clipped where the one before it wasn't, not for its side, so which ones a frame needs
  // depends on the order things cast: each is drawn here after one that forces the change
  function depthWarmup() {
    const g = new THREE.Group(), box = new THREE.BoxGeometry(1, 1, 1);
    const planes = [new THREE.Vector3(0, 0, 1), new THREE.Vector3(0, 0, -1), new THREE.Vector3(0, -1, 0)].map((n) => new THREE.Plane(n, 100));
    const map = new THREE.DataTexture(new Uint8Array(4), 1, 1);
    const caster = (kind, side, clip = false, textured = false) => {
      const m = new THREE.MeshStandardMaterial({ side, map: textured ? map : null });
      m.shadowSide = side;
      if (clip) Object.assign(m, { clippingPlanes: planes, clipIntersection: true });
      let o;
      if (kind === 'instanced') o = new THREE.InstancedMesh(box, m, 1);
      else if (kind === 'skinned') {
        const geo = box.clone(), n = geo.attributes.position.count;
        geo.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(new Uint16Array(n * 4), 4));
        geo.setAttribute('skinWeight', new THREE.Float32BufferAttribute(Float32Array.from({ length: n * 4 }, (_, i) => (i % 4 ? 0 : 1)), 4));
        o = new THREE.SkinnedMesh(geo, m);
        const bone = new THREE.Bone();
        o.add(bone); o.bind(new THREE.Skeleton([bone]));
      } else o = new THREE.Mesh(box, m);
      o.castShadow = true;
      return o;
    };
    for (const side of [THREE.FrontSide, THREE.BackSide, THREE.DoubleSide]) {
      g.add(caster('instanced', side), caster('plain', side), caster('instanced', side), caster('plain', side),
        caster('skinned', side), caster('instanced', side), caster('plain', side, true), caster('instanced', side),
        caster('plain', side, false, true));   // and one with a texture (a station's name board): its shadow is drawn with it
    }
    return g;
  }
  const warm = async (...objs) => { for (const o of objs) { await renderer.compileAsync(o, camera, scene); await drawOnce(o); } };

  setLoading('lighting');
  const { stage } = await kitModule(KITS.railway, 'stage.mjs');
  const look = stage(renderer, scene, { time: 'day', far: 8000, shadowSpan: 160, sky: false, fog: false });
  makeHdEnvironment(renderer);   // the HD models' own light (hd.js), while HD is on; nothing else is lit by it
  await prepareHdAnimals();      // and the HD animals' materials' maps, made now rather than as the first is built
  const skyDome = makeSkyDome(scene, camera);
  // the land as a height function; each place with its own ground adds its patch as it loads (and takes it away again).
  // This is world-data's one cached terrain: the page is its only user, so the patches on it are the page's.
  const terrain = worldTerrain();

  // ---- places, legs and trains load through the streamer, by id: the places, the legs between them, and those legs'
  // trains (`train:<leg>`) ----
  const legIds = Object.keys(LEGS);
  const routes = Object.fromEntries(legIds.map((id) => [id, legRoute(id)]));
  const journey = makeJourney({ legs: LEGS, places: PLACES });
  // stage()'s shadows, but nothing see-through that leaves the depth alone (a lamp's pool of light on the ground) casts
  // one
  const shadows = (root) => {
    look.shadows(root);
    root.traverse((o) => { if (o.isMesh && [].concat(o.material).every((m) => m.transparent && !m.depthWrite)) o.castShadow = false; });
  };
  // what's let go is taken out of the scene at once and freed together at a standstill (frame())
  const unload = makeUnloader();
  // each train's programs are ready before it is shown, its cab's too (fitted now, its shell cut away as the cab view
  // draws it), so boarding never waits on them
  const fleet = makeFleet({ scene, look, journey, unload, prepare: async (t) => {
    if (CABS[t.spec.cab]) {
      t.cab = fitCab(renderer, t.model.cars[0], CABS[t.spec.cab](t.model.cars[0], t.spec));
      // (a clipped shell's shadow is drawn clipped too: its depth programs are compiled by the upload pass)
      t.cab.clip(true); await warm(t.model.group); t.cab.clip(false);
    }
    await warm(t.model.group);
    if (t.cab) t.cab.interior.visible = false;   // until you're in it
  } });
  const places = {}, termini = {};   // termini keyed `${place}:${leg}`
  const builders = {};
  // developer aid (the debug hook's `slow`): a place's download made to take `s` seconds more, coming in bit by bit
  // (progress: true, a slow connection) or not at all (progress: false, a hung one)
  const slow = {};
  async function slowDownload(id, ctx) {
    const d = slow[id], t0 = performance.now();
    while (d && ctx.current() && performance.now() - t0 < d.s * 1000) {
      await new Promise((r) => setTimeout(r, 250));
      if (d.progress) ctx.progress();
    }
  }
  // a place: downloaded first, as you go; its kit built in one go only where it may land (streamer.js still(): at a
  // standstill, behind the cover if one's up), then its extras and stations. Written into `places` and `termini` only
  // while it's the current build of its id, and let go, it takes out only what it put there (a newer build of it may
  // have replaced it: own / disown)
  for (const id of Object.keys(PLACES)) builders[id] = async (ctx) => {
    setLoading(`building ${PLACES[id].name}`);
    await slowDownload(id, ctx);
    await fetchPlace(id, { onProgress: ctx.progress });
    await ctx.still();
    // buildKit fetches its LAYOUT.json and kit.json again before it builds: as each part comes in (the last just before
    // the build), the build goes on only if it may land at that moment; else it's dropped, to be built at the next
    // standstill (its modules are all in by then)
    const place = await buildPlace(id, { onProgress: () => { ctx.progress(); ctx.landNow(); } });
    const mine = {}, shown = [place.group];   // its stations; what's hidden until its programs are ready
    const thing = { dispose() {
      unload.add(...Object.values(mine).map((t) => t.group));
      place.dispose(unload);
      if (place.patch) terrain.removePatch(place.patch);
      for (const [k, t] of Object.entries(mine)) disown(termini, k, t);
      disown(places, id, place);
    } };
    try {
      ctx.check();
      place.group.visible = false;
      scene.add(place.group); shadows(place.group);
      if (place.patch) terrain.addPatch(place.patch);
      await ctx.still();
      for (const e of await place.addExtras(terrain)) { shadows(e); e.visible = false; shown.push(e); }
      // the place's stations: a terminus at its end of each built leg it serves
      for (const st of PLACES[id].stations) {
        await ctx.still();
        const t = await buildTerminus(st.leg, st.end, { name: PLACES[id].name, platformLength: st.platformLength, style: PLACES[id].station });
        mine[`${id}:${st.leg}`] = t;
        ctx.check();
        t.group.visible = false; shown.push(t.group);
        scene.add(t.group); shadows(t.group);
        for (const [obj, key] of t.lit) place.kitPlace.light?.(obj, key);   // a kit-style station's lamps and windows come on with its place's
      }
      await ctx.still();
      await warm(...shown);
      ctx.check();
    } catch (err) { thing.dispose(); throw err; }
    for (const o of shown) o.visible = true;
    for (const [k, t] of Object.entries(mine)) own(termini, k, t);
    own(places, id, place);
    return thing;
  };
  // scenery built a slice at a time (slicer.js), ticked in frame(); straight through at boot, behind the loading screen
  const slicer = makeSlicer();
  const SCENERY_SLICE = 4;
  // a leg: its two lines' track, and its viaducts, tunnels, trestles and guideways (with any river they cross), built
  // where it may land (ctx.still()). Its extras, its suburbs if it runs through any and its events' actors
  // (actors/index.js), follow in the background: the leg never waits on them (its train does), and if they can't be
  // built (their parts come from Polyfork's CDN), or aren't in after SUBURBS_DEADLINE s of frames, it goes on without
  // them. Nothing is left half-added if the leg's build fails, and the ground fill across its portals
  // (terrain.addStructures: one flag per route) is put in and taken out only by the build that owns it, never by one
  // that stalled and landed late.
  const SUBURBS_DEADLINE = 30;
  const legOwner = {};   // leg -> the build of it whose structures stand
  async function buildLeg(id, ctx) {
    await ctx.still();
    const route = legRoute(id), lanes = [laneOf(id), -laneOf(id)];
    const tracks = lanes.map((lane) => buildTrack(route, lane, route.sections));   // none on its guideways
    let structures = null, suburbs = null, events = null;
    const thing = {
      structures: null, suburbs: null, events: null,
      // done once its extras are in (or left out): the train along it waits for that, so they're never built as you
      // drive
      settled: () => (!suburbs || suburbs.settled) && (!events || events.settled),
      tick: (dt) => { suburbs?.tick(dt); events?.tick(dt); },
      // its train is boarded before its extras are in (you waited WAIT_MAX s): they're left out, optional scenery
      leaveOutExtras() {
        for (const [what, x] of [['suburbs', suburbs], ['event actors', events]]) {
          if (!x || x.settled) continue;
          console.warn(`The ${what} along ${id} were left out: not in when its train set off`);
          x.dispose();
        }
      },
      dispose() {
        unload.add(...tracks, ...(structures ? [structures] : []));   // freed at a standstill, with the kits' parts unless something drawn shares them
        suburbs?.dispose();
        events?.dispose();
        if (disown(legOwner, id, thing)) terrain.removeStructures(route);
      },
    };
    try {
      structures = await buildStructures(route, lanes, route.sections, {
        terrain, waters: FEATURES.filter((f) => f.kind === 'valley' && f.water && f.leg === id),
      });
      ctx.check();
      shadows(structures);
      await ctx.still();
      await warm(...tracks, structures);
      ctx.check();
    } catch (err) { thing.dispose(); throw err; }
    for (const t of tracks) scene.add(t);
    scene.add(structures);
    own(legOwner, id, thing);
    terrain.addStructures(route);   // its portals now fill the ground left out across them
    suburbs = LEGS[id].suburbs ? scenery(async ({ gone }) => {
      const s = await buildSuburbs(id, terrain, slicer);
      if (!s || gone()) return s;   // (left out meanwhile: not drawn, just let go)
      shadows(s.group); await warm(s.group);
      return { group: s.group, dispose: () => unload.add(s.group) };   // freed with the rest, at a standstill
    }, {
      add: (g) => scene.add(g), deadline: SUBURBS_DEADLINE,
      warn: (err) => console.warn(`The suburbs along ${id} were left out: ${err?.url ? `could not load ${err.url}` : err?.message ?? err}`),
    }) : null;
    // its events' actors (`built.actors`, by event id, is what the reactions ask after: have())
    events = EVENTS[id]?.length ? scenery(async ({ gone }) => {
      const e = await buildEventActors(id, { terrain, slicer, gone });
      const s = { group: e.group, actors: e.actors, dispose: () => { e.dispose(); unload.add(e.group); } };   // freed with the rest, at a standstill
      if (gone()) return s;   // (left out meanwhile: not drawn, just let go)
      shadows(e.group); await warm(e.group);
      return s;
    }, {
      add: (g) => scene.add(g), deadline: SUBURBS_DEADLINE,
      warn: (err) => console.warn(`The event actors along ${id} were left out: ${err?.url ? `could not load ${err.url}` : err?.message ?? err}`),
    }) : null;
    Object.assign(thing, { structures, suburbs, events });
    return thing;
  }
  for (const id of legIds) {
    builders[id] = (ctx) => { setLoading('laying track'); return buildLeg(id, ctx); };
    builders[`train:${id}`] = (ctx) => fleet.build(id, ctx);
  }
  const ring = { places: RING.places, legs: RING.legs };
  // no stall time while booting (the loading screen shows how it's going; a slow connection is waited for): it's set
  // after boot. A build that stalls had an import hang: those still pending are given up on, so a retry fetches afresh
  const streamer = makeStreamer(builders, { onError: (err) => { if (err?.stalled) forgetPending(); fail(err); } });
  // anything coming in (a module, a file) is progress for the build in flight
  try { new PerformanceObserver(() => streamer.progress()).observe({ type: 'resource' }); } catch { /* none: kits' onProgress still counts */ }
  // what's near you: places and legs, and the trains on those legs (the one you're in always among them). Nothing new
  // while you're moving (streaming.js): what's beyond is built while you stand at a platform or walk round a place
  const wanted = (where) => {
    const set = wantedSet(where, ring);
    for (const id of [...set]) if (legIds.includes(id)) set.add(`train:${id}`);
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
  // boot a piece is built a slice a frame (LAND_SLICE ms, run inside frame()), so no frame waits on a whole one. ----
  const LAND_SLICE = 4;
  // the line's corridor: chunks within 300 m of a built route or a built place's footprint
  const corridor = corridorKeys([
    ...Object.values(routes).flatMap((r) => Array.from({ length: Math.ceil(r.length / 32) + 1 }, (_, k) => r.at(Math.min(r.length, k * 32), {}))),
    ...Object.keys(PLACES).map((id) => ({ x: PLACES[id].centre.x, z: PLACES[id].centre.z, r: PLACES[id].size ? Math.hypot(...PLACES[id].size) / 2 : 130 })),
  ]);
  const nearLine = (x, z) => corridor.has(chunkKey(Math.floor(x / CHUNK), Math.floor(z / CHUNK)));
  // ---- the scenery on the land (scenery.js): a fine or mid piece's trees, rocks and cacti are laid out as part of its
  // build, after its ground (so a slice at a time with it), and drawn as children of its mesh, so they show, stand in
  // and go with their ground. A chunk's layout is kept while it's about, so a piece changing detail lays out nothing
  // again; a patch that changes the ground there lays it out afresh. None on the coarse tiles beyond 1500 m. ----
  const layouts = new Map();   // chunk key -> its pieces
  const sceneryOn = { on: true }, sceneryGroups = new Set();
  function* pieceJob(c) {
    const arrays = yield* terrainChunkJob(terrain, c, nearLine);
    if (c.cell === COARSE) return { arrays, items: [] };
    let items = layouts.get(c.key);
    if (!items) {
      try { items = yield* scatterJob(c.i, c.j, c.size, terrain); } catch (err) {
        console.warn(`The scenery on ${c.key} was left out: ${err?.message ?? err}`);
        items = [];
      }
      layouts.set(c.key, items);
      if (layouts.size > 600) layouts.delete(layouts.keys().next().value);   // the longest kept
    }
    return { arrays, items };
  }
  let landSliced = false;  // false: build each piece at once (boot); true: frame() builds the active one a slice at a time
  let active = null;       // the piece being built: { id, c, job, done, ms, frames }
  const landTimes = [];    // the last few builds: { id, ms (work), frames }
  const landFrames = [];   // the last few frames' slice of land building, ms
  const land = makeStreamer((id) => {
    const c = chunkOf(id);
    if (!c) return undefined;
    return async () => {
      let built;   // { arrays (its ground), items (its scenery) }
      if (!landSliced) {
        const t0 = performance.now();
        built = runFor(pieceJob(c), Infinity);
        landTimes.push({ id, ms: performance.now() - t0, frames: 0 });
      } else built = await new Promise((done, fail) => { active = { id, c, job: pieceJob(c), done, fail, ms: 0, frames: 0 }; });
      if (landTimes.length > 50) landTimes.shift();
      const mesh = terrainChunkMesh(built.arrays, `terrain ${id}`);
      const trees = sceneryGroup(built.items, { fine: c.cell === FINE, name: `scenery ${id}` });
      if (trees) { trees.visible = sceneryOn.on; mesh.add(trees); sceneryGroups.add(trees); }
      return { mesh, show() { scene.add(mesh); }, dispose() {
        mesh.removeFromParent(); mesh.geometry.dispose();
        if (trees) { disposeScenery(trees); sceneryGroups.delete(trees); }
      } };
    };
  }, { onError: fail, standIn: (id) => chunkOf(id).tile });   // no stall time: built by frames, none while hidden
  // one frame's slice of the piece being built
  function landSlice() {
    let ms = 0;
    if (active) {
      const t0 = performance.now();
      let out;
      // a piece whose job throws fails (the land's streamer reports it) rather than stopping the frame
      try { out = runFor(active.job, LAND_SLICE); } catch (err) { const a = active; active = null; a.fail(err); }
      ms = performance.now() - t0;
      if (active) { active.ms += ms; active.frames++; }
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
    for (const k of dirty) layouts.delete(k);   // its scenery is laid out again on the new ground
    if (active && hit(active.id)) Object.assign(active, { job: pieceJob(active.c) });
    land.redo(land.ids.filter(hit));
  }
  scene.add(buildSea(SEA_LEVEL));

  const anchor = new THREE.Object3D();
  scene.add(anchor);
  look.follow(anchor);

  // ---- views: the cab, the nose, the drone and the director ----
  const views = makeCameras(camera, renderer.domElement, { heightAt: terrain.heightAt, seaLevel: SEA_LEVEL });

  // ---- the train you drive: its run (journey.runRoute) and where its front is along it ----
  const drive = { s: 0, v: 0, throttle: 0 };
  let train = null, run = null;
  // the train on a leg, ready to drive: loaded, with its cab fitted. Checked before anything changes, so a train you
  // can't drive yet leaves you where you were
  function drivable(leg) {
    const t = fleet.trains[leg];
    if (!t) throw new Error(`the train on ${leg} has not loaded yet`);
    if (!CABS[t.spec.cab]) throw new Error(`no ${t.spec.cab} cab for the ${t.spec.name} yet`);
    t.cab ??= fitCab(renderer, t.model.cars[0], CABS[t.spec.cab](t.model.cars[0], t.spec));   // fitted as it loaded (fleet's prepare)
    return t;
  }
  // ---- the events along the run you're driving (events.js), and how the world answers you (react.js): made afresh
  // each time you take a train. Each leg's actors (actors/index.js) come in with its extras ----
  let track = null, reactions = null, hornPressed = false;
  let evOn = null, evOut = null, evLegS = null;   // this frame's events ({ active, started, ended }), the reactions' answer, the front's leg-s
  const legActors = (leg) => streamer.get(leg)?.events?.built?.actors ?? null;
  const eventDefs = Object.fromEntries(Object.entries(EVENTS).map(([leg, defs]) => [leg, new Map(defs.map((e) => [e.id, e]))]));
  // what the director's view is told each frame (cameras.js): this run's showpieces (a shot, no actor), the events with a
  // shot that began this frame (an actor's: a showpiece's window opening is no event), and where the front is on the
  // leg's own route (leg-s: shots' `at` and `lateral` are the leg's), with its tunnels
  const viewCtx = { dt: 0, legS: 0, dir: 'out', v: 0, route: null, length: 0, showpieces: [], started: [], tunnels: [] };
  function startEvents() {
    const defs = eventsFor(run.leg, run.dir);
    track = makeEventTrack(defs);
    reactions = makeReactions(defs.filter((e) => e.react), run.dir, { length: train.length, spec: train.spec });
    evOn = evOut = evLegS = null;
    viewCtx.showpieces = defs.filter((e) => e.shot && !e.actor);
    viewCtx.tunnels = (routes[run.leg].sections ?? []).filter((sec) => sec.kind === 'tunnel');   // kept clear of general shots
    views.restart();
  }
  function viewContext(dt) {
    viewCtx.dt = dt;
    viewCtx.started.length = 0;
    const started = evOn?.started ?? [];
    for (let i = 0; i < started.length; i++) {
      const e = eventDefs[run.leg].get(started[i]);
      if (e?.shot && e.actor) viewCtx.started.push(e);
    }
    viewCtx.legS = evLegS ?? journey.where(state, run, drive.s).s;
    viewCtx.dir = run.dir; viewCtx.v = drive.v; viewCtx.route = routes[run.leg]; viewCtx.length = train.length;
    return viewCtx;
  }
  // what an actor is told each frame (on: its event's { t, u } while it's active, else null; here: you're driving a run
  // on its leg)
  function actorFrame(leg, id, on, dt) {
    const mine = state.mode === 'drive' && run.leg === leg;
    return {
      legS: mine ? evLegS : null, dir: mine ? run.dir : null, here: mine, dt, time: clock.elapsedTime, on,
      react: mine ? evOut?.states.get(id) ?? null : null, camera,
      train: { front: train.model.cars[0].holder.position, v: drive.v, length: train.length }, night: look.night, sunDir,
    };
  }
  const actorErrors = new Set();
  function act(actor, f, what = 'update') {
    try { return actor[what](f); } catch (err) {   // an actor that throws is reported (each different error once); the rest go on
      const key = String(err?.stack ?? err);
      if (!actorErrors.has(key)) { actorErrors.add(key); console.error(err); }
      return null;
    }
  }
  // what the active events along your run add to the sky (actors' weather(f): a shower's clouds and haze), on top of its own
  const clamp01 = (v) => Math.min(1, Math.max(0, v));
  function addWeather(sky) {
    const actors = state.mode === 'drive' && evOn ? legActors(run.leg) : null;
    if (!actors) return;
    for (const [id, on] of evOn.active) {
      const a = actors.get(id);
      const w = a?.weather ? act(a, actorFrame(run.leg, id, on, 0), 'weather') : null;
      if (!w) continue;
      sky.cloudCover = clamp01(sky.cloudCover + (w.cloudCover ?? 0));
      sky.haze = clamp01(sky.haze + (w.haze ?? 0));
    }
  }
  // the current leg's active actors (and once more, with on: null, those whose event just ended); every built leg's
  // `always` ones
  function updateActors(dt) {
    for (const leg of legIds) {
      const actors = legActors(leg);
      if (!actors) continue;
      const mine = state.mode === 'drive' && run.leg === leg && evOn;
      for (const [id, a] of actors) {
        const on = mine ? evOn.active.get(id) ?? null : null;
        if (on || eventDefs[leg].get(id)?.always || (mine && evOn.ended.includes(id))) act(a, actorFrame(leg, id, on, dt));
      }
    }
  }
  // getting out (or jumping) inside an event's window ends it: each active actor is told so once, so nothing freezes in
  // view
  function endEvents() {
    const actors = legActors(run.leg);
    if (actors && evOn) for (const id of evOn.active.keys()) { const a = actors.get(id); if (a) act(a, actorFrame(run.leg, id, null, 0)); }
    track = reactions = evOn = evOut = evLegS = null;
  }
  function take(leg, dir) {
    const t = drivable(leg);
    if (t.run.dir !== dir) fleet.park(leg, dir);   // turned round for the trip back: it waits on its run's start
    train = t; run = t.run;
    Object.assign(drive, { s: t.s, v: 0, throttle: 0 });
    views.attachCab(t.cab);
    startEvents();
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
    endEvents();   // no reactions on foot
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
    for (const w of wait) fleet.wait(w.leg, w.dir);
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
  // a train you can board now: its leg (with its suburbs), its two places and the train itself are in, so nothing is
  // built while you drive
  const needs = (leg) => [...neededToDrive(leg), `train:${leg}`];
  // anything still being built: by the streamer (a build can't be stopped once begun), or a leg's suburbs
  const busy = () => streamer.busy || legIds.some((id) => streamer.has(id) && !streamer.get(id).settled());
  // (on foot, boarding waits on what the train doesn't need only WAIT_MAX s: arr.waited, arrival.js)
  const ready = (leg) => readyToLeave(leg, { has: (id) => streamer.has(id), busy: busy(), settled: (l) => streamer.get(l).settled(), waited: arr.waited });
  // stopping at a platform (arrival.js), decided once a frame: what's beyond is kept while you're in that platform's
  // window, and built only at a standstill, behind a cover ("Arriving at …") that lifts once it's in (or after a few
  // seconds whatever happens). Meanwhile, and while not free to leave, the train is held (a few seconds at most); under
  // the cover you can't get out
  const arrival = makeArrival();
  let arr = { at: null, build: true, cover: null, hold: false, getOut: true, fresh: false, waited: 0 }, coverLabel = '';
  // the waiting train you're beside, if any: { leg, dir, station, to }, whose train is loaded
  const boardable = () => nearestBoardable(player.state, journey.trainsAt(state, state.place)
    .filter((w) => fleet.trains[w.leg])
    .map((w) => ({ ...w, stopped: true, cars: trainPoints(fleet.trains[w.leg].model) })));
  function board(w) {
    drivable(w.leg);
    streamer.get(w.leg).leaveOutExtras();   // (boarded after waiting your longest on them: readyToLeave)
    turnPending();
    state = journey.board(state, w.leg, w.dir);
    take(w.leg, w.dir);
    player.exit();
    keys.ignoreHeld();   // a key you were holding (W, walking up to it) is not throttle until you press it again
    views.setDriving(true);
    $('driver').classList.add('on');
  }

  // the map: M toggles it, Escape closes it; drawn only while open
  const mapView = makeMap(document.getElementById('map'));
  function drawMap() {
    if (!mapView.open) return;
    if (state.mode === 'drive') {
      const f = train.model.cars[0].holder, leg = run.leg;
      mapView.draw({ you: { x: f.position.x, z: f.position.z, yaw: f.rotation.y }, leg, place: null, departure: null });
    } else {
      const d = stationFrame(state.place, 'departure'), to = LEGS[d.leg].to;
      mapView.draw({ you: player.state, leg: null, place: state.place,
        departure: { x: d.x, z: d.z, label: `Departures: ${TRAIN_SPECS[LEGS[d.leg].train].name} to ${PLACES[to].name}` } });
    }
  }
  const keys = makeKeys();
  let throttleSteps = 0;
  addEventListener('keydown', (e) => {
    if (e.repeat && !/Arrow|Key[WS]/.test(e.code)) return;
    keys.down(e.code);
    if (e.code === 'Space') e.preventDefault();
    if (e.code === 'KeyM') { mapView.toggle(); drawMap(); return; }
    if (e.code === 'Escape') { mapView.close(); return; }
    if (keys.ignored(e.code)) return;   // still held from before you boarded
    if (e.code === 'KeyE') {
      if (state.mode === 'drive' && stopHere() && arr.getOut) getOut();
      else if (state.mode === 'foot') { const w = boardable(); if (w && ready(w.leg)) board(w); }
      return;
    }
    if (state.mode !== 'drive') return;
    if (e.code === 'KeyW' || e.code === 'ArrowUp') throttleSteps++;
    if (e.code === 'KeyS' || e.code === 'ArrowDown') throttleSteps--;
    if (e.code === 'KeyH') { horn(train.spec.sound); hornPressed = true; }
    if (e.code === 'KeyV') views.cycle();
    if (e.code === 'Digit1') views.set('cab');
    if (e.code === 'Digit2') views.set('drone');
    if (e.code === 'Digit3') views.set('director');
    if (e.code === 'Digit4') views.set('nose');
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
  // how far: to the metre for the last 100 m, to 10 m below a kilometre, then in kilometres
  const distance = (m) => (m < 100 ? `${Math.round(m)} m` : m < 1000 ? `${Math.round(m / 10) * 10} m` : `${(m / 1000).toFixed(1)} km`);
  let toastLeft = 0, eventLine = '';
  function hud(dt) {
    let prompt = '', message = '';
    if (state.mode === 'drive') {
      const to = PLACES[run.to].name, here = stopHere();
      $('spd').textContent = Math.round(Math.abs(drive.v) * 3.6);
      $('thr').textContent = `throttle ${Math.round(drive.throttle * 100)}%${drive.v < -0.05 ? ' · reversing' : ''}`;
      const toGo = run.stopS - drive.s;
      // on the high-speed stretch, the top speed you've reached on it
      const speed = evOut && [...evOut.states.values()].find((st) => st.inside);
      $('dist').textContent = (toGo > 1 ? `${to} ${distance(toGo)}` : `${to}: stop here`) + (speed ? ` · top ${Math.round(speed.topKmh)} km/h` : '');
      if (here && arr.getOut) prompt = arr.hold ? 'Getting the next towns ready…' : `Get out at ${PLACES[here].name} (E)`;
      else if (evOut?.prompt) prompt = evOut.prompt;
      message = evOut?.message ?? '';
      // a reaction's word (heard at the crossing, the signal's green, the top speed) for 3 s
      if (evOut?.toast) { $('toast').textContent = evOut.toast; toastLeft = 3; }
      $('mode').textContent = `${train.spec.name} to ${to}`;
    } else {
      const w = boardable();
      // honest about what's still being built: the train waits until the line ahead and its far town are in (and says so
      // if one of them couldn't be built: its error is in the console)
      if (w) {
        prompt = ready(w.leg) ? `Board the ${fleet.trains[w.leg].spec.name} to ${PLACES[w.to].name} (E)`
          : needs(w.leg).some((id) => streamer.failed(id)) ? `The way to ${PLACES[w.to].name} couldn't be loaded`
          : `Getting ${PLACES[w.to].name} ready…`;
      }
      $('mode').textContent = `On foot in ${PLACES[state.place].name}${busy() ? ' · getting the next towns ready' : ''}`;
    }
    $('prompt').textContent = prompt;
    $('prompt').classList.toggle('on', !!prompt);
    if (message !== eventLine) { eventLine = message; $('event').textContent = message; $('event').classList.toggle('on', !!message); }
    toastLeft = Math.max(0, toastLeft - dt);
    $('toast').classList.toggle('on', toastLeft > 0);
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
  Object.assign(window.__tour, { builders, slow, slicer, drive, player, views, places, termini, skyDome, skyAt, streamer, journey, fleet, frame, seamCheck: (id) => seamCheck(places[id], terrain), snap, land, landBoot, landTimes, landFrames, buildLeg, legRoute });
  Object.defineProperties(window.__tour, {
    // the run you're on, with Phase 1's limits and originPlatform alongside it
    run: { get: () => ({ ...run, limits: fleet.trains[run.leg]?.limits, originPlatform: run.origin.platform }) }, mode: { get: () => state.mode }, state: { get: () => state }, train: { get: () => train.model },
    pendingTurn: { get: () => pendingTurn }, arr: { get: () => arr }, mayLand: { get: () => mayLand },
    // the land's pieces: how many are live, and of those shown, how many at each detail; which is being built
    chunks: { get: () => {
      const ids = land.ids, on = ids.filter((id) => land.shown(id)), n = (cell) => on.filter((id) => id.endsWith(`:${cell}`)).length;
      return { live: ids.length, shown: on.length, fine: n(4), mid: n(8), coarse: n(16), building: active?.id ?? null };
    } },
    // the scenery on the land: how many chunks carry some, their meshes and pieces, and whether it's drawn (set it to
    // false to see the land without it)
    scenery: { get: () => {
      let meshes = 0, pieces = 0;
      for (const g of sceneryGroups) for (const im of g.children) { meshes++; pieces += im.count; }
      return { chunks: sceneryGroups.size, meshes, pieces, layouts: layouts.size, on: sceneryOn.on };
    }, set: (on) => { sceneryOn.on = !!on; for (const g of sceneryGroups) g.visible = sceneryOn.on; } },
    walkWorld: { get: () => (state.mode === 'foot' ? walkWorld() : null) },
    // the events active on the run you're driving, and the reactions' states
    events: { get: () => ({ active: evOn ? [...evOn.active.keys()] : [], react: evOut ? Object.fromEntries(evOut.states) : {} }) },
  });
  // developer aid: put your train, stopped, at leg-s `legS` on the run you're driving (within its limits), its events
  // and reactions afresh; -> the leg-s it's at
  function jump(legS) {
    if (state.mode !== 'drive') throw new Error('jump works only while driving');
    endEvents();
    const s = run.dir === 'back' ? run.route.length - legS : legS;
    Object.assign(drive, { s: Math.min(train.limits.sMax, Math.max(train.limits.sMin, s)), v: 0, throttle: 0 });
    train.s = drive.s;
    poseTrain(train.model, run.route, drive.s, 0, run.lane);
    startEvents();
    return journey.where(state, run, drive.s).s;
  }
  window.__tour.jump = jump;
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
  // the first view has its ground, and its trees, before the loading screen goes
  setLoading('planting trees');
  await loadScenery();
  // every program the land's scenery will need, and everything already in the scene (you on foot, still hidden), ready
  // before the first frame: one of each scenery shape, compiled against the scene and let go
  {
    const each = sceneryWarmup();
    if (each) scene.add(each);
    await renderer.compileAsync(scene, camera);
    if (each) upload(each);   // the shapes' geometry, shared by every chunk's pieces
    disposeScenery(each);
    const depth = depthWarmup();
    upload(depth);
    release([depth], scene);
  }
  setLoading('shaping the land');
  terrain.takeDirty();   // no chunks yet: nothing to build again
  {
    const t0 = performance.now(), h = here();
    await wantLand(h.x, h.z, true);
    landBoot.ms = Math.round(performance.now() - t0); landBoot.chunks = land.ids.length;
  }
  // the first leg's event actors, built straight through (slicer.sync) behind the loading screen; for BOOT_ACTORS s at
  // most (a slow CDN), then they carry on in the background under their usual deadline
  const BOOT_ACTORS = 20;
  setLoading('setting the scene');
  await Promise.race([streamer.get(state.leg)?.events?.ready, new Promise((r) => setTimeout(r, BOOT_ACTORS * 1000))]);
  landSliced = true;
  slicer.sync = false;
  streamer.stall = STALL;   // from now on, a build with nothing coming in for this long couldn't be loaded
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
  // one frame (the debug hook can step it by hand when the page is hidden and frames don't come). One that throws is
  // reported (each different error once) and the tour goes on with the next
  const frameErrors = new Set();
  function frame(dt) {
    try { frameStep(dt); } catch (err) {
      const key = String(err?.stack ?? err);
      if (!frameErrors.has(key)) { frameErrors.add(key); console.error(err); }
    }
  }
  function frameStep(dt) {
    // a long frame (a stall, a hidden tab) counts as a tenth of a second at most, for everything in it: stepTrain and the
    // walker clamp to that too, so the train never jumps further than v x 0.1 s
    dt = Math.min(dt, 0.1);
    fit();
    if (state.mode === 'drive') {
      const before = drive.s;
      // the events along the run where the front is now, and the reactions to them (the horn, if you sounded it)
      evLegS = journey.where(state, run, drive.s).s;
      evOn = track.step({ legS: evLegS, dt });
      evOut = reactions.step({ legS: evLegS, v: drive.v, dt, horn: hornPressed, have: (id) => !!legActors(run.leg)?.has(id) });
      // the guard brakes for a stop ahead you aren't braking for (a red signal, cattle on the line), and holds it there
      const guard = evOut.brakeTo !== null && (mustBrake(evOut.brakeTo, drive.v, train.spec) || evOut.brakeTo <= 0);
      // held at a platform (or by the guard): the brake on and the throttle shut, so the train sets off only when you
      // open it again
      Object.assign(drive, stepTrain(drive, trainInput({ driving: true, brakeKey: keys.has('Space') || arr.hold || guard, throttleSteps: arr.hold || guard ? 0 : throttleSteps }), dt, train.spec, train.limits));
      if (arr.hold || guard) drive.throttle = 0;
      train.s = drive.s;
      poseTrain(train.model, run.route, drive.s, drive.s - before, run.lane);
      train.cab?.interior.userData.speed?.(Math.abs(drive.v) * 3.6);   // a cab with a speed readout
    }
    throttleSteps = 0; hornPressed = false;
    const front = train.model.cars[0].holder.position;
    if (state.mode === 'foot' && pendingTurn && Math.hypot(player.state.x - front.x, player.state.z - front.z) > 30) turnPending();
    hud(dt);
    if (controls) controls.update();
    else if (state.mode === 'foot') player.update(dt, footInput(), walkWorld());
    else views.update(dt, train.model, viewContext(dt));
    // keep what's near you loaded, and let the sky follow where you are on the ring (it sets the time of day)
    const where = journey.where(state, run, drive.s);
    const driving = state.mode === 'drive', stopped = Math.abs(drive.v) < 0.05;
    // arriving at a platform, what failed is tried again (a few times at most), before the cover is decided so it's
    // built behind it. Not on foot, nor setting off: boarding and leaving wait on nothing that long anyway
    arr = arrival.step({
      foot: !driving, window: driving ? journey.windowAt(run, drive.s) : null, destination: run.to,
      stopped, busy: busy(), ready: driving && ready(run.leg), dt, retry: () => streamer.retry(),
      missing: (p) => [...wanted({ ...where, at: p })].some((id) => streamer.toBuild(id)),
    });
    if (driving) where.at = arr.at;
    let set = wanted(where);
    if (!arr.build) set = new Set([...set].filter((id) => !streamer.toBuild(id)));   // nothing new while moving
    streamer.want(set);
    // what's built may land (a kit built in one go, an upload) only on foot, or at a standstill where arrival lets it
    // be built (behind the cover, once it's up): never on a moving frame. A build waiting for that isn't stalled, nor
    // is one whose upload waits for it
    mayLand = !driving || (stopped && arr.build);
    streamer.landing = mayLand;
    const waitDt = toDraw.length && !mayLand ? 0 : dt;
    streamer.tick(waitDt);
    for (const id of legIds) streamer.get(id)?.tick?.(waitDt);   // a leg's suburbs' bound
    const label = arr.cover ? `${arr.cover.arriving ? 'Arriving at' : 'Getting ready at'} ${PLACES[arr.cover.place].name}…` : '';
    if (label !== coverLabel) {
      coverLabel = label;
      if (label) $('arriveAt').textContent = label;
      $('arrive').classList.toggle('on', !!label);
    }
    // what was let go is freed at a standstill (the scene walked once), never on a moving frame
    if (state.mode === 'foot' || Math.abs(drive.v) < 0.05) unload.flush(scene);
    const want = ringPosition(where);
    skyPos = skyPos === null ? want : towards(skyPos, want, Math.min(1, dt * 1.5));   // the short way round the ring
    const sky = skyAt(skyPos);
    if (Math.abs(sky.stage - lastStage) > 0.003) {
      dimmer.setTime(() => look.setTime(sky.stage)); lastStage = sky.stage;
      for (const t of Object.values(fleet.trains)) t.model.night?.(look.night);   // a train's own lit windows
    }
    dimmer.update(Math.round(tunnelDark() * 100) / 100);   // in steps of 1%, so lights are written only as it changes
    updateHdLight(look.hemi);   // the HD materials' environment, after the daylight and the tunnel's dimming
    addWeather(sky);
    skyDome.update(sky, sunDir, dt);
    scene.background = null;
    scene.fog.near = 300; scene.fog.far = 5200 - sky.haze * 3000;
    for (const p of Object.values(places)) p.tick(clock.elapsedTime);
    updateActors(dt);
    anchor.position.copy(here());
    look.update();
    redoDirty();
    wantLand(anchor.position.x, anchor.position.z);
    // point the key light along our sun (or, after dark, a high moon) so shadows agree with the sky
    lightDir.copy(sky.sunElevationDeg > 2 ? sunDir : moonDir.set(-sunDir.x, 0, -sunDir.z).normalize().setY(0.75).normalize());
    look.key.position.copy(look.key.target.position).addScaledVector(lightDir, 160);
    if (mayLand) drawWaiting();
    drawMap();
    renderer.render(scene, camera);
    landSlice();   // a slice of the land being built, after this frame's work
    slicer.tick(SCENERY_SLICE);   // and a slice of any scenery being built
  }
  framing = true;
  renderer.setAnimationLoop(() => frame(clock.getDelta()));
}

boot().catch(fail);
