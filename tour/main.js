// Scenic Tour: boot, loop, input and HUD around the journey (journey.js): drive any leg either way, get out at a
// place, walk, and board one of the two trains waiting there.
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { quietToNonIndexed } from './three-guards.js';
import { KITS, loadError } from './config.js';
import { kitModule, part, cdnPart, setLoading, showLoadError, hideLoading, forgetPending } from './parts.js';
import { LEGS, PLACES, RING, FEATURES, worldTerrain, legRoute, laneOf, SEA_LEVEL, COACH_ROAD_LEG, stationSpot } from './world-data.js';
import { departureFor, departureSign, rideSign, pointer } from './wayfinding.js';
import { makeMap } from './map.js';
import { wantedSet, neededToDrive, readyToLeave, readyToRide } from './streaming.js';
import { makeArrival } from './arrival.js';
import { makeStreamer, STALL, own, disown } from './streamer.js';
import { terrainChunkJob, terrainChunkMesh, buildSea } from './terrain-mesh.js';
import { chunksWanted, chunksNear, chunkOf, chunkId, chunkKey, corridorKeys, runFor, CHUNK, FINE, COARSE } from './chunks.js';
import { scatterJob } from './scenery.js';
import { loadScenery, sceneryGroup, sceneryWarmup, disposeScenery } from './scenery-mesh.js';
import { buildTrack } from './track-mesh.js';
import { buildStructures } from './structure-mesh.js';
import { buildSuburbs } from './suburbs-mesh.js';
import { buildEventActors } from './actors/index.js';
import { loadAnimal } from './actors/animals.js';
import { EVENTS, eventsFor, makeEventTrack } from './events.js';
import { makeReactions, mustBrake } from './react.js';
import { makeSlicer, scenery } from './slicer.js';
import { autoThrottle, autoMark, makeViewCycle, makeHornCue } from './autopilot.js';
import { findPath, makeFollower } from './autopath.js';
import { tunnelDepth } from './structures.js';
import { makeDimmer } from './dimmer.js';
import { makeHdEnvironment, updateHdLight, prepareHdAnimals } from './hd.js';
import { poseTrain } from './vehicles.js';
import { stepTrain, leaveCab, trainInput } from './drive.js';
import { horn, shimmer, engine, hideSound } from './audio.js';
import { makeTeleport, teleportChoices, canTeleport, FIZZ } from './teleport.js';
import { makeTeleportFx } from './teleport-fx.js';
import { buildPlace, fetchPlace, seamCheck } from './places.js';
import { release, makeUnloader } from './dispose.js';
import { buildTerminus, PLATFORM_TOP } from './stations.js';
import { makePlayer } from './player.js';
import { nearestBoardable, BODY } from './walk.js';
import { makeWalkWorld, solidVehicles } from './walk-world.js';
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
import { RIDE_LEGS, RIDE_LAND, rideFor, rideLegEvents, rideLand, placeFarTrains } from './rides.js';
import { nearRide, makeRideRunner, parkVehicle, vehicleFoot, RIDE_REACH } from './ride-run.js';
import { RIDE_BUILDERS } from './rides/index.js';
import { roadJob, roadMesh } from './rides/road-mesh.js';

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
// the kits' modules ask three for a non-indexed copy of what's already non-indexed, hundreds of times a build: handed
// back the same, without three's warning each time (three-guards.js)
quietToNonIndexed(THREE.BufferGeometry.prototype);
const params = new URLSearchParams(location.search);

async function boot() {
  const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: params.has('debug') });
  // local clipping on from the start: the cabs' shells (cameras.js fitCab) and the figure's teleport cut (player.js)
  renderer.localClippingEnabled = true;
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
  // (and the sound quiet while it's hidden: audio.js hideSound)
  document.addEventListener('visibilitychange', () => { hideSound(document.hidden); if (document.hidden) drawWaiting(); });
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
        // an arrival platform's sign says where the next train leaves from, across the town
        const sign = st.role === 'arrival' ? departureSign(id) : null;
        // and a departure station's board, where its ride boards away from it (the City's speedboat, at its jetty)
        const waySign = st.role === 'departure' ? rideSign(id) : null;
        const t = await buildTerminus(st.leg, st.end, { name: PLACES[id].name, platformLength: st.platformLength, style: PLACES[id].station, waySign, sign });
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
    let structures = null, suburbs = null, events = null, road = null;
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
        unload.add(...tracks, ...(structures ? [structures] : []), ...(road ? [road] : []));   // freed at a standstill, with the kits' parts unless something drawn shares them
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
      // the stagecoach's road on the bench cut for it (world-data.js coachRoad), drawn with its leg: there whenever the
      // land is, whether or not you take the coach (its heights a slice at a time; made into a mesh at a standstill)
      const roadArrays = id === COACH_ROAD_LEG ? await slicer.run(roadJob(terrain)) : null;
      ctx.check();
      shadows(structures);
      await ctx.still();
      if (roadArrays) road = roadMesh(roadArrays);
      await warm(...tracks, structures, ...(road ? [road] : []));
      ctx.check();
    } catch (err) { thing.dispose(); throw err; }
    for (const t of tracks) scene.add(t);
    scene.add(structures);
    if (road) scene.add(road);
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
  // ---- the rides (rides.js): each ride's path and its tables worked out once, here behind the loading screen (the jet's
  // take ~0.2 s), on the land as the tests measure it, before any place's patch is on it ----
  setLoading('planning the rides');
  for (const leg of RIDE_LEGS) rideFor(leg);
  const RIDE_IDS = RIDE_LEGS.map((leg) => `ride:${leg}`);
  // a ride waiting at its departure place (`ride:<leg>`, wanted while you stand there: streaming.js): its vehicle, pads
  // and set pieces (rides/index.js), built at a standstill and shown once all are in and warmed, the vehicle at the start
  // of its path. Only a ride with a builder is offered. One whose vehicle can't be loaded fails, warned (not an error on
  // screen: the train still goes), and isn't offered; it's tried again as any failed build is
  async function buildRide(leg, ctx) {
    const ride = rideFor(leg);
    await ctx.still();
    let kit;
    try {
      kit = await RIDE_BUILDERS[ride.id]({
        ride, slicer, terrain, still: ctx.still, check: ctx.check, cdnPart, loadAnimal,
        kit: (kitKey, key, params) => part(KITS[kitKey], key, params),
        warn: (what, err) => console.warn(`The ${ride.name}'s ${what} ${err?.url ? `could not be loaded (${err.url})` : `were left out: ${err?.message ?? err}`}`),
      });
    } catch (err) {
      if (err?.dropped) throw err;
      console.warn(`The ${ride.name} to ${PLACES[ride.to].name} isn't offered: ${err?.url ? `could not load ${err.url}` : err?.message ?? err}`);
      throw Object.assign(new Error(`the ${ride.name} along ${leg} could not be built`), { warned: true });
    }
    const group = new THREE.Group();
    group.name = `ride ${leg}`;
    const thing = { kit, dispose() { kit.dispose?.(); unload.add(group); } };   // (freed at a standstill, with the rest)
    try {
      ctx.check();
      group.add(kit.vehicle.holder, kit.boardMarker, ...(kit.landPad ? [kit.landPad] : []), ...[...kit.actors.values()].map((a) => a.group));
      parkVehicle(kit, ride, 0);
      group.visible = false;
      scene.add(group); shadows(group);
      await ctx.still();
      await warm(group);
      ctx.check();
    } catch (err) { thing.dispose(); throw err; }
    group.visible = true;
    return thing;
  }
  for (const leg of RIDE_LEGS) {
    if (RIDE_BUILDERS[rideFor(leg).id]) builders[`ride:${leg}`] = (ctx) => { setLoading(`the ${rideFor(leg).name}`); return buildRide(leg, ctx); };
  }
  const ring = { places: RING.places, legs: RING.legs };
  // no stall time while booting (the loading screen shows how it's going; a slow connection is waited for): it's set
  // after boot. A build that stalls had an import hang: those still pending are given up on, so a retry fetches afresh
  // (a ride that couldn't be built was warned about: it's left unoffered, no error on screen)
  const streamer = makeStreamer(builders, { onError: (err) => { if (err?.stalled) forgetPending(); if (!err?.warned) fail(err); } });
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
  const BEAM_SLICE = 12;   // ms a frame under the teleport's beam, where nothing moves
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
  function landSlice(slice = LAND_SLICE) {
    let ms = 0;
    if (active) {
      const t0 = performance.now();
      let out;
      // a piece whose job throws fails (the land's streamer reports it) rather than stopping the frame
      try { out = runFor(active.job, slice); } catch (err) { const a = active; active = null; a.fail(err); }
      ms = performance.now() - t0;
      if (active) { active.ms += ms; active.frames++; }
      if (out) { const a = active; active = null; landTimes.push({ id: a.id, ms: a.ms, frames: a.frames }); a.done(out); }
    }
    landFrames.push(ms); if (landFrames.length > 600) landFrames.shift();
  }
  let landAt = null;
  // ask for the pieces round (x, z) at the detail asked for (`detail`: a fast ride's, rides.js rideLand; else as for a
  // train or on foot); again only once you've moved a little (its `every` metres), or the detail asked for has changed
  const AS_EVER = { fine: 700, mid: 1500, corridor: true, coarseFirst: 0, every: 16 }, NO_CORRIDOR = new Set(), rideLandAt = {};
  function wantLand(x, z, force = false, detail = AS_EVER) {
    const d = detail, same = landAt && landAt.fine === d.fine && landAt.mid === d.mid && landAt.corridor === d.corridor && landAt.coarseFirst === d.coarseFirst;
    if (!force && same && Math.hypot(x - landAt.x, z - landAt.z) < d.every) return null;
    landAt = { x, z, fine: d.fine, mid: d.mid, corridor: d.corridor, coarseFirst: d.coarseFirst };
    const opts = { fine: d.fine, mid: d.mid, corridor: d.corridor ? corridor : NO_CORRIDOR, coarseFirst: d.coarseFirst };
    return land.want([...chunksWanted(x, z, opts)].map(([key, cell]) => chunkId(key, cell)));
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
  // ---- a ride you've taken: the runner (ride-run.js) carries its vehicle and gives the views its seat as the cab ----
  const runner = makeRideRunner({ scene, views, audio: { engine }, interior: new THREE.Group() });
  let ridden = null;   // this frame's answer from the runner, while you ride
  const rideEnv = { time: 0, camera, night: 0, sunDir: null };   // what its set pieces are told (filled each frame)
  // what a ride's kit not being ridden is told each frame (waiting at its pad, or on the one it landed on: its lights)
  const rideIdle = { rideS: null, rideV: 0, legS: null, dir: null, here: false, dt: 0, time: 0, on: null, react: null, camera, train: null, night: 0, sunDir: null };
  // the leg's `always` actors as you ride (the rocket, the pods over the towns: as for a train at the ride's leg-s), and
  // whether the far place's two trains are at their platforms yet
  const rideLeg = { track: null, on: null, placed: false, far: [] };
  const rideLegAt = { legS: 0, dt: 0 };   // (what its track is told each frame, the same object)
  // whether either of the far place's two trains (rideLeg.far: each { leg, dir, platform: a sphere round the platform
  // it's to stand at }) is in the camera's view this frame, where it stands now or at that platform: either in the
  // frustum and nearer than the fog's far end. Scratch three.js objects, made once
  const farView = { frustum: new THREE.Frustum(), m: new THREE.Matrix4(), sphere: new THREE.Sphere() };
  const FAR_CAR = 15;   // m round a car's middle a sphere takes in the rest of it
  function farTrainsSeen() {
    camera.updateMatrixWorld();
    farView.m.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
    farView.frustum.setFromProjectionMatrix(farView.m);
    const fog = scene.fog?.far ?? Infinity, cam = camera.position, S = farView.sphere;
    const inView = () => S.center.distanceTo(cam) - S.radius < fog && farView.frustum.intersectsSphere(S);
    for (let i = 0; i < rideLeg.far.length; i++) {
      const w = rideLeg.far[i];
      S.center.copy(w.platform.center); S.radius = w.platform.radius;
      if (inView()) return true;
      const cars = fleet.trains[w.leg]?.model.cars;
      if (!cars?.length) continue;
      const a = cars[0].holder.position, b = cars[cars.length - 1].holder.position;
      S.center.copy(a).add(b).multiplyScalar(0.5);
      S.radius = a.distanceTo(b) / 2 + FAR_CAR;
      if (inView()) return true;
    }
    return false;
  }
  // m: the vehicle you stepped off stays on its pad till you're this much further from it than where you stepped off (the
  // boat's jetty runs 31 m out from there)
  const RIDE_KEEP = 30;
  let rideKeep = null;    // { id, leg, x, z, reach } of that ride, meanwhile
  let autoAfterRide = false;   // Z pressed mid-ride: the auto tour starts once you've landed

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
  const rideFrames = new Map();   // event id -> the frame its actor is told riding along its leg
  function actorFrame(leg, id, on, dt) {
    const mine = state.mode === 'drive' && run.leg === leg;
    // riding along its leg: as for a train at the ride's leg-s, going out, with no reactions, told it's a ride (the leg's
    // train events, as the signal's work train, don't run for it)
    if (state.mode === 'ride' && state.leg === leg) {
      // (each always actor's own frame and train, filled afresh each frame: one ride's actors are many frames' callers)
      let f = rideFrames.get(id);
      if (!f) {
        f = { legS: 0, dir: 'out', here: true, ride: true, dt: 0, time: 0, on: null, react: null, camera, train: { front: null, v: 0, length: 0 }, night: 0, sunDir: null };
        rideFrames.set(id, f);
      }
      f.legS = ridden.legS; f.dt = dt; f.time = clock.elapsedTime; f.on = on; f.night = look.night; f.sunDir = sunDir;
      f.train.front = ridden.pos; f.train.v = ridden.v; f.train.length = runner.train.cars[0].length;
      return f;
    }
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
  // `always` ones (riding a leg, only those: its track has no others)
  function updateActors(dt) {
    for (const leg of legIds) {
      const actors = legActors(leg);
      if (!actors) continue;
      const mine = state.mode === 'drive' && run.leg === leg && evOn;
      const riding = state.mode === 'ride' && state.leg === leg ? rideLeg.on : null;
      for (const [id, a] of actors) {
        const on = mine ? evOn.active.get(id) ?? null : riding ? riding.active.get(id) ?? null : null;
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

  // the rides' vehicles where they stand (waiting at their pads, or on the one they landed on: rideKeep keeps its kit),
  // solid to you on foot, as a train's cars are; their pads stay walkable. One entry a kit, made as it's first met, and
  // the same two arrays filled each time (the walk world is made afresh every frame)
  const rideFoot = new WeakMap(), rideStanding = [], rideSolid = [];
  function rideVehicles() {
    rideStanding.length = 0;
    for (let k = 0; k < RIDE_IDS.length; k++) {
      const kit = streamer.get(RIDE_IDS[k])?.kit;
      if (!kit || kit === runner.kit) continue;
      let v = rideFoot.get(kit);
      if (!v) { v = { foot: vehicleFoot(kit.vehicle), holder: kit.vehicle.holder }; rideFoot.set(kit, v); }
      rideStanding.push(v);
    }
    // (one you already stand in, built round you on its pad, lets you out: walk-world.js solidVehicles)
    return solidVehicles(rideStanding, player.state.x, player.state.z, BODY, rideSolid);
  }
  const walkWorld = () => makeWalkWorld({
    place: places[state.place], termini: PLACES[state.place].stations.map((st) => termini[`${state.place}:${st.leg}`]),
    terrain, seaLevel: SEA_LEVEL, vehicles: rideVehicles(),
  });
  // where you can get out: the platform you're heading for, or the one you haven't left yet
  const stopHere = () => journey.stopAt(run, drive);
  // where you step down beside a run's line, at `out` ({ s, lateral }: journey.stepOut's) in the place you're in: stopped
  // past the mark, the cab is beside the station building, so further from the buffers, clear of it
  function stepDown(r, out) {
    const w = walkWorld(), away = out.s > r.route.length / 2 ? -1 : 1;
    let s = out.s;
    for (let k = 0; k < 40; k++) {
      const q = r.route.offsetAt(s, out.lateral);
      if (!w.blocked(q.x, q.z, BODY)) break;
      s += away;
    }
    return r.route.offsetAt(s, out.lateral);
  }
  function getOut() {
    const here = stopHere();
    endEvents();   // no reactions on foot
    state = journey.getOut(state, here);
    // step out onto the platform beside the line, a little behind the cab
    const p = stepDown(run, journey.stepOut(run, drive.s));
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
  // ---- a ride: on foot at a place's departure station, E beside where its ride waits takes it ----
  // (RIDE_REACH, 6 m: none of them waits right on the edge of where you can walk; owner's ruling R22)
  // riding, V and 1-3 give the seat, the chase (the drone) and the director only: no nose, which would sit over the
  // balloon's crown (owner's ruling R23); a train keeps all four
  const RIDE_VIEWS = ['cab', 'drone', 'director'];
  // the ride you're beside, on foot: the one leaving from this place, if it's offered (it has a builder and hasn't failed)
  const rideNear = () => {
    const leg = departureFor(state.place).leg, id = `ride:${leg}`;
    if (!builders[id] || streamer.failed(id)) return null;
    const ride = rideFor(leg);
    return nearRide(player.state, ride, RIDE_REACH) ? ride : null;
  };
  // ready as the train along its leg would be (readyToLeave), and its own kit in
  const rideReady = (leg) => readyToRide(leg, { has: (id) => streamer.has(id), busy: busy(), settled: (l) => streamer.get(l).settled(), waited: arr.waited });
  function takeRide(leg) {
    const kit = streamer.get(`ride:${leg}`).kit;
    streamer.get(leg).leaveOutExtras();   // (as boarding its train: what isn't in by now is left out)
    turnPending();
    state = journey.ride(state, leg);
    player.exit();
    keys.ignoreHeld();
    // (the leg's always events, as for a train; one the ride cues itself, the jet's rocket, starts where the ride says)
    rideLeg.track = makeEventTrack(rideLegEvents(rideFor(leg), eventsFor(leg, 'out').filter((e) => e.always)));
    rideLeg.on = null; rideLeg.placed = false;
    // the next place's two trains, and the platforms they're to stand at (the middle of each, 120 m long, in a sphere)
    rideLeg.far = journey.landed(state).trains.map((w) => {
      const to = LEGS[leg].to, p = stationSpot(to, w.station)(60, 0);
      return { ...w, platform: new THREE.Sphere(new THREE.Vector3(p.x, PLACES[to].ground + 2, p.z), 75) };
    });
    rideKeep = null;
    runner.start(rideFor(leg), kit);
    views.set('cab');   // you start in your seat aboard
    ridden = runner.update(0, rideEnv);
  }
  // the ride is done: you step off on foot by the next place's arrival station, as after getting out of a train, its two
  // trains at their platforms (put there half way along: frame()); the vehicle stays on its pad till you're away from it
  function stepOff() {
    const ride = runner.ride, t = journey.landed(state);
    runner.stop();
    state = t.state;
    for (const w of t.trains) fleet.wait(w.leg, w.dir);
    pendingTurn = null;
    rideLeg.track = null; rideLeg.on = null;
    const p = ride.step;
    rideKeep = { id: `ride:${ride.leg}`, leg: ride.leg, x: ride.land.x, z: ride.land.z, reach: RIDE_KEEP + Math.hypot(p.x - ride.land.x, p.z - ride.land.z) };
    player.enter(p.x, p.z, p.yaw, walkWorld().heightAt(p.x, p.z));
    keys.ignoreHeld();
    ridden = null;
    if (autoAfterRide) { autoAfterRide = false; startAuto(); }
  }

  // the map: M toggles it, Escape closes it; drawn only while open
  const mapView = makeMap(document.getElementById('map'));
  function drawMap() {
    if (!mapView.open) return;
    if (state.mode === 'ride') {
      mapView.draw({ you: { x: ridden.pos.x, z: ridden.pos.z, yaw: ridden.yaw }, leg: state.leg, place: null, departure: null });
    } else if (state.mode === 'drive') {
      const f = train.model.cars[0].holder, leg = run.leg;
      mapView.draw({ you: { x: f.position.x, z: f.position.z, yaw: f.rotation.y }, leg, place: null, departure: null });
    } else {
      const d = departureFor(state.place);
      mapView.draw({ you: player.state, leg: null, place: state.place, departure: { x: d.x, z: d.z, label: `Departures: ${d.train} to ${d.to}` } });
    }
  }
  // ---- teleport (T): a list of the places; pick one and you fizz out where you stand (on foot, or in a cab standing
  // still), a beam holds the view while it's built, and you fizz in on its arrival platform, on foot, its two trains at
  // their platforms. teleport.js is the timing (the beam's wait bounded by WAIT_MAX, as the arrival cover's),
  // teleport-fx.js the sparkles; the figure dissolves through player.dissolve. You're moved only once the place is in,
  // behind the beam (`swap`); until then both where you are and where you're going are wanted ----
  const tp = makeTeleport();
  const fx = makeTeleportFx(scene);
  const STILL_KEYS = { fwd: 0, right: 0, run: false };   // what you walk with meanwhile
  const LANDING_PITCH = -0.06;
  const CAB_SHIMMER = 0.4;
  const tpSeat = new THREE.Vector3();
  let tpLegs = [], tpNear = [];   // where you land: its trains' legs, and the land under you (chunk ids), to be in first
  let tpKeep = new Set();         // till you're moved: all that's wanted where you stand and where you're going
  let tpBeam = -1, tpListOpen = false;
  const tpLog = [];   // each teleport: { from, to, beam (s under the beam), swapAt (s of it before the place was in), back }
  // the place you're at: on foot, or stopped at one's platform (null between stations)
  const tpHere = () => (state.mode === 'foot' ? state.place : stopHere());
  const tpCan = () => !controls && state.mode !== 'ride' && canTeleport({ mode: state.mode, v: drive.v, covered: state.mode === 'drive' && !arr.getOut, busy: tp.active });
  function openTeleportList() {
    $('teleportList').replaceChildren(...teleportChoices(RING.places, tpHere()).map((c) => {
      const li = document.createElement('li'), k = document.createElement('kbd');
      k.textContent = c.n;
      li.append(k, PLACES[c.id].name);
      if (!c.offered) li.className = 'here';
      return li;
    }));
    tpListOpen = true;
    $('teleport').classList.add('on');
  }
  function closeTeleportList() { tpListOpen = false; $('teleport').classList.remove('on'); }
  function pickTeleport(n) {
    const c = teleportChoices(RING.places, tpHere())[n - 1];
    if (!c?.offered || !tpCan()) return;
    closeTeleportList();
    if (!tp.start(c.id, tpHere())) return;
    streamer.retry();   // (a place that failed before is tried again: a few times at most)
    // what's wanted where you stand (at the platform you're stopped at, from a cab: as the frame wants it) and where
    // you're going, kept till you're moved: nothing of either is let go as you fizz, nor if you come back
    const here = journey.where(state, run, drive.s);
    if (state.mode === 'drive') here.at = arr.at;
    tpKeep = new Set([...wanted(here), ...wanted({ place: c.id })]);
    // auto mode, if it's on, stands still meanwhile and carries on round the ring from where you land: its way across
    // this town (and any search for it) is let go
    auto.token++;
    auto.planning?.job.return();
    auto.planning = null;
    auto.follower.clear();
    Object.assign(auto.out, { throttleSteps: 0, brake: false });
    Object.assign(auto.keys, { fwd: 0, right: 0, run: false });
    Object.assign(auto, { still: 0, failures: 0 });
    if (auto.on) autoLog('teleport', { from: state.place, to: c.id });
    drive.throttle = 0; throttleSteps = 0;
    tpLog.push({ from: tpHere(), to: c.id, beam: 0, swapAt: null, back: false });
    if (tpLog.length > 50) tpLog.shift();
    // the column round you, or round the driver's seat (seen from the seat itself you're inside it, and the beam's
    // shimmer comes up over the view as it glows: teleportStep)
    if (state.mode === 'drive') {
      train.cab.holder.updateMatrixWorld();
      tpSeat.copy(train.cab.seat).applyMatrix4(train.cab.holder.matrixWorld);
      fx.at(tpSeat.x, tpSeat.y - 1.65, tpSeat.z);
    }
    $('beamTo').textContent = `Teleporting to ${PLACES[c.id].name}…`;
    shimmer(true, FIZZ);
  }
  // the place is in: you're moved there behind the beam, as if you'd stepped off its arrival train
  function teleportSwap() {
    if (state.mode === 'drive') {   // out of the cab as getting out does: the train left standing where it is
      endEvents();
      Object.assign(drive, leaveCab(drive));
      train.s = drive.s;
      views.setDriving(false);
      $('driver').classList.remove('on');
    }
    turnPending();   // the train you came on here turns round for the trip back, as once you'd walked away from it
    const t = journey.teleport(state, tp.to);
    state = t.state;
    for (const w of t.trains) fleet.wait(w.leg, w.dir);   // (one not loaded yet stands there when it is)
    if (fleet.trains[train.leg] === train) { run = train.run; Object.assign(drive, { s: train.s, v: 0, throttle: 0 }); }
    const p = stepDown(journey.runRoute(t.at.leg, t.at.dir), t.at);
    // seen from just above head height, under the platform's canopy (the usual view, higher, is in its roof there), so
    // you see yourself fizz in; it rises to the usual one as you set off
    player.enter(p.x, p.z, p.yaw, p.y + PLATFORM_TOP, LANDING_PITCH);
    player.dissolve(1);
    tpLegs = t.trains.map((w) => w.leg);
    tpNear = [...chunksNear(p.x, p.z, 48)].map((k) => chunkId(k, FINE));
    skyPos = ringPosition(journey.where(state, run, drive.s));   // the time of day there at once, under the beam
  }
  // what you land among is in: the place's two trains, and the land under you at its finest
  function tpSettled() {
    if (!tp.swapped) return false;
    for (let k = 0; k < tpLegs.length; k++) if (!fleet.trains[tpLegs[k]]) return false;
    for (let k = 0; k < tpNear.length; k++) if (!land.shown(tpNear[k])) return false;
    return true;
  }
  // a frame of it, before the frame's driving or walking
  function teleportStep(dt) {
    const to = tp.to, log = tpLog[tpLog.length - 1];
    const r = tp.step(dt, !!places[to], tpSettled(), streamer.failed(to));
    if (r.swap) { log.swapAt = Math.round(r.waited * 10) / 10; teleportSwap(); }
    if (r.land) {
      log.beam = Math.round(r.waited * 10) / 10; log.back = r.back; log.cancelled = r.cancelled;
      if (r.back && !r.cancelled) { $('toast').textContent = `${PLACES[to].name} couldn't be loaded`; toastLeft = 3; }
      shimmer(false, FIZZ);
    }
    if (state.mode === 'foot') fx.at(player.state.x, player.state.y, player.state.z);
    player.dissolve(state.mode === 'foot' ? r.gone : 0);
    fx.update(clock.elapsedTime, r.glow, r.gone * player.height / fx.height, renderer.domElement.height);
    // (in the cab's own view you're inside the column: its shimmer is shown over the view, faintly, as it glows)
    const beam = state.mode === 'drive' && views.mode === 'cab' ? Math.max(r.beam, r.glow * CAB_SHIMMER) : r.beam;
    if (Math.abs(beam - tpBeam) > 0.01 || (beam === 0) !== (tpBeam === 0)) { tpBeam = beam; $('beam').style.opacity = beam; }
    if (r.done && auto.on) autoLog('landed', { place: state.place });
  }

  const keys = makeKeys();
  let throttleSteps = 0;
  // E: get out at a platform you've stopped at, or board the train you're beside, or take the ride you're beside (a
  // train first; auto mode, pressing E beside the onward train, never takes a ride); H: the horn. Auto mode presses them
  // too. Riding, E does nothing
  function pressE() {
    if (state.mode === 'drive' && stopHere() && arr.getOut) getOut();
    else if (state.mode === 'foot') {
      const w = boardable();
      if (w && ready(w.leg)) board(w);
      else if (!w && !auto.on) { const r = rideNear(); if (r && rideReady(r.leg)) takeRide(r.leg); }
    }
  }
  function pressH() { horn(train.spec.sound); hornPressed = true; }
  // the keys that take the controls back from auto mode, driving and on foot
  const TAKE_OVER = {
    drive: new Set(['KeyW', 'KeyS', 'ArrowUp', 'ArrowDown', 'Space', 'KeyH', 'KeyE']),
    foot: new Set(['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'KeyE']),
    ride: new Set(),   // (it's never on during a ride)
  };
  addEventListener('keydown', (e) => {
    if (e.repeat && !/Arrow|Key[WS]/.test(e.code)) return;
    keys.down(e.code);
    if (e.code === 'Space') e.preventDefault();
    if (e.code === 'KeyM') { mapView.toggle(); drawMap(); return; }
    // T: the teleport list (on foot, or in the cab standing still), T again to close it; a number picks a place. Esc
    // or T, till you've been moved, takes you back where you stood. (Esc with the map open only closes the map: a second
    // Esc cancels)
    if (e.code === 'Escape') { if (mapView.open) return void mapView.close(); closeTeleportList(); tp.cancel(); return; }
    if (e.code === 'KeyT') { if (tpListOpen) closeTeleportList(); else if (tp.active) tp.cancel(); else if (tpCan()) openTeleportList(); return; }
    if (tpListOpen && /^Digit[1-5]$/.test(e.code)) { pickTeleport(+e.code.slice(5)); return; }
    // (the auto tour takes the trains only: Z mid-ride starts it once you've landed, or Z again thinks better of it)
    if (e.code === 'KeyZ' && state.mode === 'ride') { autoAfterRide = !autoAfterRide; return; }
    if (e.code === 'KeyZ') { if (auto.on) stopAuto(); else startAuto(); return; }
    if (tp.active) return;   // fizzing out or in: nothing else does anything till you're there
    if (auto.on && TAKE_OVER[state.mode].has(e.code)) stopAuto();   // you have the controls (and this key does its job)
    if (keys.ignored(e.code)) return;   // still held from before you boarded
    if (e.code === 'KeyE') { pressE(); return; }
    if (state.mode !== 'drive' && state.mode !== 'ride') return;
    // riding, only the views answer: no throttle, brake or horn
    if (state.mode === 'drive') {
      if (e.code === 'KeyW' || e.code === 'ArrowUp') throttleSteps++;
      if (e.code === 'KeyS' || e.code === 'ArrowDown') throttleSteps--;
      if (e.code === 'KeyH') pressH();
    }
    if (e.code === 'KeyV') {
      if (state.mode === 'ride') views.set(RIDE_VIEWS[(RIDE_VIEWS.indexOf(views.mode) + 1) % RIDE_VIEWS.length]);
      else views.cycle();
    }
    if (e.code === 'Digit1') views.set('cab');
    if (e.code === 'Digit2') views.set('drone');
    if (e.code === 'Digit3') views.set('director');
    if (e.code === 'Digit4' && state.mode !== 'ride') views.set('nose');
  });
  addEventListener('keyup', (e) => keys.up(e.code));
  addEventListener('blur', () => keys.clear());
  const footInput = () => ({
    fwd: (keys.has('KeyW') || keys.has('ArrowUp') ? 1 : 0) - (keys.has('KeyS') || keys.has('ArrowDown') ? 1 : 0),
    right: (keys.has('KeyD') || keys.has('ArrowRight') ? 1 : 0) - (keys.has('KeyA') || keys.has('ArrowLeft') ? 1 : 0),
    run: keys.has('ShiftLeft') || keys.has('ShiftRight'),
  });

  // ---- auto mode (Z): the tour drives itself round the ring, pressing what you would. Driving, the autopilot's throttle
  // steps and brake (autopilot.js) go into stepTrain with your keys', the horn when a prompt asks for it, E once stopped
  // at the destination; on foot, the conductor runs the way the planner found across the town (autopath.js) with the
  // walking keys, and boards the onward train with E. Any control key, or Z again, gives you the controls back where
  // you are ----
  const AUTO_SLICE = 4;      // ms a frame of path search, at most
  const AUTO_OUT_AFTER = 1;  // s stood still at the destination platform before getting out
  const autoSlicer = makeSlicer();
  autoSlicer.sync = false;
  const auto = {
    on: false, t: 0, still: 0, failures: 0, planning: null, token: 0, message: '', messageLeft: 0, log: [], heard: '',
    to: { stopS: 0, spec: null },              // where it's stopping, and the train's brakes
    out: { throttleSteps: 0, brake: false },   // the autopilot's keys, driving
    keys: { fwd: 0, right: 0, run: false },    // and on foot
    cycle: makeViewCycle(), horn: makeHornCue(), follower: makeFollower(),
  };
  const autoLog = (what, data = {}) => { auto.log.push({ t: Math.round(auto.t * 10) / 10, what, ...data }); if (auto.log.length > 500) auto.log.shift(); };
  function startAuto() {
    Object.assign(auto, { on: true, still: 0, failures: 0, message: '', messageLeft: 0 });
    auto.follower.clear();
    if (state.mode === 'drive') autoViews();
    autoLog('start', { mode: state.mode, place: state.place, leg: state.leg });
  }
  function stopAuto(message = '') {
    if (!auto.on) return;
    auto.on = false;
    auto.token++;   // a path still being searched for is let go
    auto.planning?.job.return();
    auto.planning = null;
    auto.follower.clear();
    Object.assign(auto.out, { throttleSteps: 0, brake: false });
    Object.assign(auto.keys, { fwd: 0, right: 0, run: false });
    auto.message = message; auto.messageLeft = message ? 8 : 0;
    autoLog('stop', { message });
  }
  // the views it cycles through while it drives (carrying on from the one showing, if it's one of them)
  function autoViews() {
    const m = auto.cycle.start(views.mode);
    if (m !== views.mode) views.set(m);
    autoLog('view', { mode: m });
  }
  // the way across town to beside the onward train's cab (where you'd step down from it, journey.stepOut), from where
  // he stands, searched for a slice a frame. A second search (after a failure) looks wider, on a finer grid, and closer
  // to things
  function autoPlan() {
    const t = fleet.trains[departureFor(state.place).leg];
    if (!t) return;   // (not in yet: he waits where he is)
    const step = journey.stepOut(t.run, t.s), goal = t.run.route.offsetAt(step.s, step.lateral);
    const from = { x: player.state.x, z: player.state.z }, token = ++auto.token, t0 = performance.now(), started = auto.t;
    const job = findPath(walkWorld(), from, { x: goal.x, z: goal.z }, auto.failures ? { margin: 80, cell: 0.25, clear: 0, soft: 0.2 } : {});
    auto.planning = { job };
    autoSlicer.run(job).then((path) => {
      if (token !== auto.token) return;
      auto.planning = null;
      if (!path) { autoLog('plan', { place: state.place, found: false, ms: Math.round(performance.now() - t0) }); autoFail('no way found'); return; }
      const length = path.points.reduce((a, q, k) => (k ? a + Math.hypot(q.x - path.points[k - 1].x, q.z - path.points[k - 1].z) : 0), 0);
      autoLog('plan', { place: state.place, found: true, ms: Math.round(performance.now() - t0), took: Math.round((auto.t - started) * 10) / 10, searched: path.searched, waypoints: path.points.length, metres: Math.round(length) });
      auto.follower.set(path.points);
    }, (err) => {
      if (token !== auto.token) return;
      auto.planning = null;
      console.error(err);
      autoFail('the search failed');
    });
  }
  // no way found, or stuck: look again from where he is; the second time, the controls are yours
  function autoFail(why) {
    auto.failures++;
    autoLog('fail', { place: state.place, why, x: Math.round(player.state.x * 10) / 10, z: Math.round(player.state.z * 10) / 10 });
    auto.follower.clear();
    if (auto.failures >= 2) stopAuto("Auto tour stopped: couldn't find the way to the departures");
  }
  // a frame of auto, before the frame's driving or walking: it reads what last frame left (the reactions' prompt, the
  // platform's hold), as your keys do
  function autoStep(dt) {
    auto.t += dt;
    if (state.mode === 'ride') return;   // (never on: it takes the trains only)
    if (state.mode === 'drive') {
      const stopped = Math.abs(drive.v) < 0.05;
      // stopped at the destination platform (on its mark, or wherever it came to a stand in it), free to get out
      auto.still = stopped && stopHere() === run.to && arr.getOut && !arr.hold ? auto.still + dt : 0;
      if (auto.still >= AUTO_OUT_AFTER) {
        autoLog('getOut', { place: run.to, leg: run.leg, off: Math.round((drive.s - run.stopS) * 100) / 100 });
        auto.still = 0;
        pressE();
        Object.assign(auto.out, { throttleSteps: 0, brake: false });
        return;
      }
      // (short of the platform where the guard wants it stopped: it draws up there and waits)
      auto.to.stopS = autoMark(run.stopS, drive.s, evOut?.brakeTo); auto.to.spec = train.spec;
      autoThrottle(drive, auto.to, auto.out);
      if (auto.horn.step(evOut?.prompt, dt)) { autoLog('horn', { leg: run.leg, prompt: evOut.prompt }); pressH(); }
      if (evOut?.message && evOut.message !== auto.heard) { auto.heard = evOut.message; autoLog('event', { leg: run.leg, message: evOut.message, s: Math.round(drive.s) }); }
      if (evOut?.toast) { auto.heard = ''; autoLog('event', { leg: run.leg, toast: evOut.toast, s: Math.round(drive.s) }); }
      const m = auto.cycle.step(dt);
      if (m) { views.set(m); autoLog('view', { mode: m }); }
      return;
    }
    const k = auto.keys;
    k.fwd = 0; k.right = 0;
    if (auto.planning) return;
    if (!auto.follower.path) { autoPlan(); return; }
    const how = auto.follower.step(player.state, dt, k);
    if (how === 'stuck') { autoFail('stuck'); return; }
    if (how !== 'arrived') return;
    k.fwd = 0; k.right = 0;
    // beside the onward train: on board as soon as it's ready to go ("Getting … ready" meanwhile)
    const w = boardable(), leg = departureFor(state.place).leg;
    if (w?.leg !== leg) { autoFail('not beside the train'); return; }
    if (!ready(leg)) return;
    const place = state.place;
    pressE();
    if (state.mode !== 'drive') return;
    autoLog('board', { place, leg });
    auto.failures = 0;
    auto.follower.clear();
    autoViews();
  }

  const $ = (id) => document.getElementById(id);
  $('driver').classList.add('on');
  // how far: to the metre for the last 100 m, to 10 m below a kilometre, then in kilometres
  const distance = (m) => (m < 100 ? `${Math.round(m)} m` : m < 1000 ? `${Math.round(m / 10) * 10} m` : `${(m / 1000).toFixed(1)} km`);
  let toastLeft = 0, eventLine = '', autoShown = '';
  const lookDir = new THREE.Vector3();
  function hud(dt) {
    let prompt = '', message = '';
    if (state.mode === 'ride') {
      // the ride and where it's going; no throttle or speed panel, nothing to do
      const r = runner.ride;
      $('mode').textContent = `${r.name[0].toUpperCase()}${r.name.slice(1)} to ${PLACES[r.to].name}`;
    } else if (state.mode === 'drive') {
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
      } else {
        // by a ride: the same wait as the train's, and its own kit
        const r = rideNear();
        if (r) prompt = rideReady(r.leg) ? `Take the ${r.name} to ${PLACES[r.to].name} (E)` : `Getting the ${r.name} ready…`;
      }
      // which way the departures are from you, relative to the way the camera looks (the way you see the town)
      camera.getWorldDirection(lookDir);
      const d = departureFor(state.place), to = pointer(player.state, Math.atan2(lookDir.x, lookDir.z), d);
      // (beside its train, it's here: the arrow would point on to the platform's middle)
      const way = w?.leg === d.leg ? 'here' : `${to.arrow} ${distance(to.metres)}`;
      $('mode').textContent = `On foot in ${PLACES[state.place].name} · Departures ${way}${busy() ? ' · getting the next towns ready' : ''}`;
    }
    if (tp.active) prompt = '';   // (teleporting: nothing to do meanwhile)
    $('prompt').textContent = prompt;
    $('prompt').classList.toggle('on', !!prompt);
    auto.messageLeft = Math.max(0, auto.messageLeft - dt);
    const autoLine = auto.on ? 'Auto tour · Z to take over' : autoAfterRide ? 'Auto tour once you land · Z to cancel'
      : auto.messageLeft > 0 ? auto.message : '';
    if (autoLine !== autoShown) { autoShown = autoLine; $('auto').textContent = autoLine; $('auto').classList.toggle('on', !!autoLine); }
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

  // where you are: the drone's target in free view, you on foot, the ride's vehicle, or your train's front
  const here = () => (controls ? controls.target
    : state.mode === 'foot' ? new THREE.Vector3(player.state.x, player.state.y, player.state.z)
    : state.mode === 'ride' ? ridden.pos : train.model.cars[0].holder.position);
  const landBoot = {};
  window.__tour = { scene, camera, renderer, look, terrain, routes, controls, PLACES, THREE };
  Object.assign(window.__tour, { builders, slow, slicer, drive, player, views, places, termini, skyDome, skyAt, streamer, journey, fleet, frame, seamCheck: (id) => seamCheck(places[id], terrain), snap, land, landBoot, landTimes, landFrames, buildLeg, legRoute });
  Object.defineProperties(window.__tour, {
    // the run you're on, with Phase 1's limits and originPlatform alongside it
    run: { get: () => ({ ...run, limits: fleet.trains[run.leg]?.limits, originPlatform: run.origin.platform }) }, mode: { get: () => state.mode }, state: { get: () => state }, train: { get: () => train.model },
    pendingTurn: { get: () => pendingTurn }, arr: { get: () => arr }, mayLand: { get: () => mayLand },
    // teleport: the phase it's in, where to, and each one so far (how long the beam held, and how much of that was
    // waiting for the place)
    teleport: { get: () => ({ phase: tp.phase, to: tp.to, swapped: tp.swapped, list: tpListOpen, log: tpLog }) },
    skyPos: { get: () => skyPos },   // where on the ring the sky is (it follows where you are)
    // auto mode: on or not, how many failures at this place, and what it's done (getting out, each way found, the horn,
    // the views, boarding)
    auto: { get: () => ({ on: auto.on, failures: auto.failures, planning: !!auto.planning, path: auto.follower.path, left: auto.follower.left, log: auto.log }) },
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
    // the ride you're on: where along its path and its leg, how fast, how long since it set off; whether the auto tour
    // waits for its landing; the vehicle kept on its pad after one (and the runner, its kit and vehicle)
    ride: { get: () => ({
      on: state.mode === 'ride' && ridden ? { leg: state.leg, s: ridden.s, t: ridden.t, v: ridden.v, legS: ridden.legS, placed: rideLeg.placed } : null,
      autoAfterRide, keep: rideKeep, near: state.mode === 'foot' ? rideNear()?.leg ?? null : null, runner,
    }) },
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
    fx.group.visible = true;   // (the teleport's sparkles: hidden till used)
    await renderer.compileAsync(scene, camera);
    fx.group.visible = false;
    // you on foot: drawn once too, since compiling alone gives his materials their unclipped programs (the renderer
    // counts a material's clipping planes only as it draws it), and his clipped ones (player.dissolve) would be made the
    // first time you get out
    upload(player.figure);
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
    if (tp.active) teleportStep(dt);   // (auto mode waits meanwhile)
    else if (auto.on) autoStep(dt);
    if (tpListOpen && !tpCan()) closeTeleportList();   // (the train moved off)
    if (state.mode === 'ride') {
      rideEnv.time = clock.elapsedTime; rideEnv.night = look.night; rideEnv.sunDir = sunDir;
      ridden = runner.update(dt, rideEnv);
      rideLegAt.legS = ridden.legS; rideLegAt.dt = dt;
      rideLeg.on = rideLeg.track.step(rideLegAt);
      if (ridden.done) stepOff();
    }
    if (state.mode === 'drive') {
      if (auto.on) throttleSteps += auto.out.throttleSteps;   // its key presses, with any of yours
      const before = drive.s;
      // the events along the run where the front is now, and the reactions to them (the horn, if you sounded it)
      evLegS = journey.where(state, run, drive.s).s;
      evOn = track.step({ legS: evLegS, dt });
      evOut = reactions.step({ legS: evLegS, v: drive.v, dt, horn: hornPressed, have: (id) => !!legActors(run.leg)?.has(id) });
      // the guard brakes for a stop ahead you aren't braking for (a red signal, cattle on the line), and holds it there
      const guard = evOut.brakeTo !== null && (mustBrake(evOut.brakeTo, drive.v, train.spec) || evOut.brakeTo <= 0);
      // held at a platform (or by the guard): the brake on and the throttle shut, so the train sets off only when you
      // open it again
      Object.assign(drive, stepTrain(drive, trainInput({ driving: true, brakeKey: keys.has('Space') || (auto.on && auto.out.brake) || arr.hold || guard || tp.active, throttleSteps: arr.hold || guard || tp.active ? 0 : throttleSteps }), dt, train.spec, train.limits));
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
    else if (state.mode === 'foot' && tp.active) player.update(dt, STILL_KEYS, walkWorld());   // standing still while you fizz
    else if (state.mode === 'foot') player.update(dt, auto.on ? auto.keys : footInput(), walkWorld());
    else if (state.mode === 'ride') views.update(dt, runner.train, runner.viewContext(dt));
    else views.update(dt, train.model, viewContext(dt));
    // riding, the far place's two trains put at their platforms once you're a third of the way along and neither is in
    // view where it stands or where it's going (this frame's camera, as the director has cut: rides.js placeFarTrains);
    // else as you land (stepOff)
    if (state.mode === 'ride' && !rideLeg.placed && placeFarTrains(ridden.legS, routes[state.leg].length, farTrainsSeen)) {
      rideLeg.placed = true;
      for (const w of rideLeg.far) fleet.wait(w.leg, w.dir);
    }
    // keep what's near you loaded, and let the sky follow where you are on the ring (it sets the time of day). Riding,
    // where you are is the leg-s the ride's progress maps to, and its own kit stays wanted
    const where = state.mode === 'ride' ? journey.where(state, null, ridden.legS) : journey.where(state, run, drive.s);
    if (state.mode === 'ride') where.ride = true;
    // (teleporting from a cab you're getting out, standing still: as on foot)
    const driving = state.mode === 'drive' && !tp.active, stopped = Math.abs(drive.v) < 0.05;
    // arriving at a platform, what failed is tried again (a few times at most), before the cover is decided so it's
    // built behind it. Not on foot, nor setting off: boarding and leaving wait on nothing that long anyway
    arr = arrival.step({
      foot: !driving, window: driving ? journey.windowAt(run, drive.s) : null, destination: run.to,
      stopped, busy: busy(), ready: driving && ready(run.leg), dt, retry: () => streamer.retry(),
      missing: (p) => [...wanted({ ...where, at: p })].some((id) => streamer.toBuild(id)),
    });
    if (driving) where.at = arr.at;
    let set = wanted(where);
    if (tp.active && !tp.swapped) for (const id of tpKeep) set.add(id);   // where you stood, and where you're going, too
    // nothing new while moving (riding too)
    if (!arr.build || state.mode === 'ride') set = new Set([...set].filter((id) => !streamer.toBuild(id)));
    // the vehicle you've stepped off stays on its pad (its kit wanted) till you're away from it; then, let go here, or
    // still wanted where it waits (you've teleported back there), it's back on the pad it leaves from
    if (rideKeep) {
      const h = here();
      if (Math.hypot(h.x - rideKeep.x, h.z - rideKeep.z) > rideKeep.reach) {
        const kit = streamer.get(rideKeep.id)?.kit;
        if (kit) parkVehicle(kit, rideFor(rideKeep.leg), 0);
        rideKeep = null;
      } else set.add(rideKeep.id);
    }
    streamer.want(set);
    // what's built may land (a kit built in one go, an upload) only on foot, or at a standstill where arrival lets it
    // be built (behind the cover, once it's up): never on a moving frame. A build waiting for that isn't stalled, nor
    // is one whose upload waits for it
    // (teleporting, only under the beam: the fizz out and in never wait on a kit built in one go; riding, never)
    mayLand = state.mode === 'ride' ? false : tp.active ? tp.phase === 'beam' : !driving || (stopped && arr.build);
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
    // (teleporting, only under the beam; riding, never)
    if ((state.mode === 'foot' || (state.mode === 'drive' && Math.abs(drive.v) < 0.05)) && (!tp.active || tp.phase === 'beam')) unload.flush(scene);
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
    rideIdle.dt = dt; rideIdle.time = clock.elapsedTime; rideIdle.night = look.night; rideIdle.sunDir = sunDir;
    for (let k = 0; k < RIDE_IDS.length; k++) {
      const kit = streamer.get(RIDE_IDS[k])?.kit;
      if (kit && kit !== runner.kit) act(kit, rideIdle);
    }
    anchor.position.copy(here());
    look.update();
    redoDirty();
    // (a fast ride's land round where it's going, as rides.js rideLand says)
    if (state.mode === 'ride' && runner.ride.profile.v > RIDE_LAND.slow) {
      rideLand(runner.ride, ridden.s, ridden.v, rideLandAt);
      wantLand(rideLandAt.x, rideLandAt.z, false, rideLandAt);
    } else wantLand(anchor.position.x, anchor.position.z);
    // point the key light along our sun (or, after dark, a high moon) so shadows agree with the sky
    lightDir.copy(sky.sunElevationDeg > 2 ? sunDir : moonDir.set(-sunDir.x, 0, -sunDir.z).normalize().setY(0.75).normalize());
    look.key.position.copy(look.key.target.position).addScaledVector(lightDir, 160);
    if (mayLand) drawWaiting();
    drawMap();
    renderer.render(scene, camera);
    landSlice(tp.phase === 'beam' ? BEAM_SLICE : LAND_SLICE);   // a slice of the land being built, after this frame's work (more under the beam)
    slicer.tick(SCENERY_SLICE);   // and a slice of any scenery being built
    autoSlicer.tick(AUTO_SLICE);  // and of auto's search for the way across a town
  }
  framing = true;
  renderer.setAnimationLoop(() => frame(clock.getDelta()));
}

boot().catch(fail);
