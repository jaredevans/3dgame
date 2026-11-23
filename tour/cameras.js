// Driving views: the cab (first person from the driver's seat), the nose (riding just above the front of the train, a
// clear view down the line ahead), the drone (orbiting the train) and the director (director.js plans the shots and
// their cuts; framed here). V cycles them; 1 cab, 2 drone, 3 director, 4 nose.
import * as THREE from 'three';
import { makeDirector, steepOver, STEEP } from './director.js';
import { clearUnder } from './structures.js';

const MODES = ['cab', 'nose', 'drone', 'director'];
const FOV = 55;   // every view but the director's, which sets its own per shot
// the nose view: this far above the top of the leading car, and back from its very front (on a long sloping nose, the
// front is its tip), looking a touch down the line
const NOSE = { up: 0.9, back: 0.4, pitch: -0.05 };
const CAB_YAW = THREE.MathUtils.degToRad(150), CAB_PITCH = THREE.MathUtils.degToRad(35);
// the director's framing (metres, seconds). Fixed kinds stand where the shot puts them and turn to follow the train's
// middle; moving kinds ride along with the front, eased as an offset from it. Both ease at EASE (1 - exp(-dt * EASE))
// within a shot and snap on a cut. Something faster than any train (SHOT.quick: the jet, at 212 m/s) would leave what
// they look at behind it, eased in the world (by its speed over the ease: some 55 m for the jet, behind a chase's own
// place, so it looked back; the drone's 37 m): for that, a fixed shot turns faster as it goes faster, and a moving shot
// and the drone look at it as an offset from it, all blended in over SHOT.quick to twice that, so a train is as ever
const SHOT = {
  ease: 4,
  quick: 90,                               // m/s: faster than any train (the Silver Arrow's top is 83)
  ground: 1.2, sea: 1,                     // the camera keeps this high over the ground, and over the sea
  aim: 2,                                  // looking this far above the rails at the train
  lead: 20,                                // a fixed shot with no place of its own stands where the front will be
                                           // half way through it, and this much further on
  wide: { up: 22 },                        // over the line (the planner's 10 m left the trees in the way)
  portal: { beyond: 25, out: 10, up: 4 },  // past the mouth (up from the rails), looking back into it
  // low beside a bridge, as far out of these as the ground still lies this far under its rails, and this far up from the
  // ground to the rails (right under it the deck hides the train on it, and the next pier the rest; the further out and
  // the higher, the less of the train its parapet hides)
  below: { out: [30, 22, 15, 8], under: 6, rise: 0.35 },
  // by the line: no lower than this under its rails (beside a bridge, it stands out in the air at the train's level,
  // not down at the foot of the piers), and this far out at the least beside a bridge, clear of its parapet
  trackside: { drop: 1.5, clear: 9 },
  chase: { back: 30 },                     // behind the front, looking at it
  heli: { ahead: 25 },                     // abreast of the front, a little ahead
  // round the nose, from this far either side of dead ahead (radians): wide and low, the whole train sweeping past
  // against the desert (owner, 2026-11-21: 16 m out and 6 m up looked down on it, too close)
  arc: { radius: 55, sweep: 0.8 },
  // where the land stands between a shot and the line (a canyon's wall, a hill), it's drawn in towards the line, to
  // these parts of its lateral, until it sees the train; a moving shot looks again every `recheck` s
  reach: [1, 0.7, 0.45, 0.25, 0.1], sight: 10, recheck: 0.25,
};
const BRIDGES = new Set(['viaduct', 'trestle', 'guideway']);
const onBridge = (sections, s) => !!sections?.some((x) => BRIDGES.has(x.kind) && !x.grade && s >= x.s0 && s <= x.s1);
const FIXED = new Set(['trackside', 'high-wide', 'wide', 'below', 'portal', 'arrival']), WIDE = new Set(['high-wide', 'wide']);
// the arrival shot: this far past the end of the line, on the train's own line, looking back up it at the train's
// front as it comes in to stop (owner, 2026-11-21)
const ARRIVAL = { beyond: 5 };

export function makeCameras(camera, dom, { heightAt, seaLevel = 0 }) {
  let mode = 'cab', cab = null;   // cab: { holder, seat, clip(on), interior }
  const look = { yaw: 0, pitch: -0.04, dragging: false, idle: 0 };
  const drone = { az: 2.4, el: 0.42, dist: 60, target: new THREE.Vector3(), ready: false, pos: new THREE.Vector3() };
  let px = 0, py = 0;
  dom.addEventListener('pointerdown', (e) => { look.dragging = true; px = e.clientX; py = e.clientY; dom.setPointerCapture?.(e.pointerId); });
  addEventListener('pointerup', () => { look.dragging = false; look.idle = 0; });
  addEventListener('pointermove', (e) => {
    if (!look.dragging) return;
    const dx = (e.clientX - px) / innerHeight, dy = (e.clientY - py) / innerHeight;
    px = e.clientX; py = e.clientY;
    if (mode === 'cab' || mode === 'nose') {
      look.yaw = THREE.MathUtils.clamp(look.yaw - dx * 2.4, -CAB_YAW, CAB_YAW);
      look.pitch = THREE.MathUtils.clamp(look.pitch - dy * 2.0, -CAB_PITCH, CAB_PITCH);
    } else {
      drone.az -= dx * 4; drone.el = THREE.MathUtils.clamp(drone.el + dy * 3, 0.05, 1.45);
    }
  });
  dom.addEventListener('wheel', (e) => {
    if (mode !== 'drone') return;
    drone.dist = THREE.MathUtils.clamp(drone.dist * Math.exp(e.deltaY * 0.001), 25, 200);
    e.preventDefault();
  }, { passive: false });

  function set(m) {
    if (!MODES.includes(m)) return;
    if (m === 'director' && mode !== 'director') restart();
    mode = m;
    cab?.clip(mode === 'cab');
    if (cab) cab.interior.visible = mode === 'cab';
    camera.near = mode === 'cab' ? 0.05 : mode === 'nose' ? 0.1 : 0.3;
    if (mode !== 'director') camera.fov = FOV;   // the director's lens is put on at its next cut
    camera.updateProjectionMatrix();
  }

  // ---- the director: the planner's shot, framed. `fresh`: the next frame snaps to its shot, cut or not ----
  const director = makeDirector();
  const shotCam = { shot: null, fresh: true, age: 0, spin: 1, reach: 0, recheck: 0, pos: new THREE.Vector3(), target: new THREE.Vector3(), off: new THREE.Vector3(), aimOff: new THREE.Vector3() };
  const rp = {}, want = new THREE.Vector3(), aim = new THREE.Vector3(), front = new THREE.Vector3(), seen = new THREE.Vector3();
  // 0 at a train's speeds, rising to 1 at twice SHOT.quick: how far a view follows as for something faster than any train
  const quick = (v) => Math.min(1, Math.max(0, (Math.abs(v) - SHOT.quick) / SHOT.quick));
  function restart() { director.reset(); shotCam.shot = null; shotCam.fresh = true; }
  const lift = (x, z, y) => {
    const h = heightAt(x, z);
    return Math.max(y, h + SHOT.ground, h < seaLevel ? seaLevel + SHOT.sea : -Infinity);
  };
  // nothing of the land between (ax, ay, az) and (bx, by, bz), sampled
  function clearSight(ax, ay, az, bx, by, bz) {
    for (let i = 1; i < SHOT.sight; i++) {
      const t = i / SHOT.sight;
      if (heightAt(ax + (bx - ax) * t, az + (bz - az) * t) > ay + (by - ay) * t) return false;
    }
    return true;
  }
  // a fixed shot (not the portal) at leg-s `at`, `lateral` out: into shotCam.pos
  function standAt(shot, route, at, lateral) {
    route.offsetAt(at, lateral, rp);
    // the ground (the sea's surface over the sea); a wide shot stands its height over the line if that's higher, so
    // from out at sea it looks over the cliff, not up at it
    let base = Math.max(heightAt(rp.x, rp.z), seaLevel);
    if (WIDE.has(shot.kind)) base = Math.max(base, rp.y);
    if (shot.kind === 'trackside') base = Math.max(base, rp.y - SHOT.trackside.drop);
    const up = shot.kind === 'below' ? Math.max(shot.height, (rp.y - base) * SHOT.below.rise)
      : shot.kind === 'wide' ? SHOT.wide.up : shot.height;
    shotCam.pos.set(rp.x, base + up, rp.z);
    shotCam.pos.y = lift(shotCam.pos.x, shotCam.pos.z, shotCam.pos.y);
  }
  // where a fixed shot stands, worked out once, at its cut
  function placeFixed(shot, ctx, sign, train) {
    const route = ctx.route;
    if (shot.kind === 'portal') {
      route.offsetAt(shot.at + sign * SHOT.portal.beyond, Math.sign(shot.lateral || 1) * SHOT.portal.out, rp);
      shotCam.pos.set(rp.x, rp.y + SHOT.portal.up, rp.z);
    } else if (shot.kind === 'arrival') {
      // at the line's end (a route stops there, so step on past it along its heading), over the rails
      route.offsetAt(shot.at, shot.lateral, rp);
      shotCam.pos.set(rp.x + Math.sin(rp.yaw) * sign * ARRIVAL.beyond, rp.y + shot.height, rp.z + Math.cos(rp.yaw) * sign * ARRIVAL.beyond);
    } else {
      let at = shot.at ?? ctx.legS + sign * (Math.abs(ctx.v) * shot.hold / 2 + SHOT.lead);
      let lateral = shot.lateral;
      if (shot.kind === 'below') {
        at = clearUnder(route.sections, at);   // between the piers, not in one
        if (!lateral) {
          for (const out of SHOT.below.out) {
            lateral = shotCam.spin * out;
            route.offsetAt(at, lateral, rp);
            if (Math.max(heightAt(rp.x, rp.z), seaLevel) <= rp.y - SHOT.below.under) break;
          }
        }
      }
      if (shot.kind === 'trackside' && onBridge(route.sections, at)) {
        lateral = (lateral < 0 ? -1 : 1) * Math.max(Math.abs(lateral), SHOT.trackside.clear);
      }
      if (!WIDE.has(shot.kind)) { standAt(shot, route, at, lateral); return; }
      // a wide one is drawn in until it sees the train where it is now, and the line where it stands abreast of it; at
      // each, never looking steeply down on the train from close by (unsteep)
      route.at(at, rp);
      const lx = rp.x, ly = rp.y + SHOT.aim, lz = rp.z, now = aimFixed(shot, ctx, sign, train);
      for (const f of SHOT.reach) {
        standAt(shot, route, at, lateral * f);
        unsteep(shot, ctx, sign, at, lateral * f);
        const p = shotCam.pos;
        if (clearSight(p.x, p.y, p.z, lx, ly, lz) && clearSight(p.x, p.y, p.z, now.x, now.y, now.z)) break;
      }
      return;
    }
    shotCam.pos.y = lift(shotCam.pos.x, shotCam.pos.z, shotCam.pos.y);
  }
  // a wide shot standing where it would look steeply down on the train from close by, anywhere over the stretch it runs
  // through in the shot (from the front now on to as far as it goes meanwhile, and on to the shot's place if that's
  // further): stood out from the line (STEEP.out) if it's over it, then brought down until it doesn't, though never into
  // the ground (owner, 2026-11-22). Not for a ride the director may look down on (ctx.overhead: the balloon)
  const steep = { over: 0, d: Infinity };
  function unsteep(shot, ctx, sign, at, lateral) {
    if (ctx.overhead) return;
    const end = ctx.legS + sign * (Math.abs(ctx.v) * shot.hold + SHOT.lead);
    const far = sign * (at - end) > 0 ? at : end;
    if (!steepOver(shotCam.pos, ctx.route, ctx.legS, far, SHOT.aim, steep).over) return;
    if (steep.d < STEEP.out) {
      standAt(shot, ctx.route, at, (Math.sign(lateral) || shotCam.spin) * Math.max(STEEP.out, Math.abs(lateral)));
      if (!steepOver(shotCam.pos, ctx.route, ctx.legS, far, SHOT.aim, steep).over) return;
    }
    const p = shotCam.pos;
    p.y = lift(p.x, p.z, p.y - steep.over);
  }
  // what a fixed shot looks at: the train's middle; from the tunnel mouth, the mouth until the train is out of it; at the
  // line's end, the train's front, head-on
  function aimFixed(shot, ctx, sign, train) {
    const cars = train.cars;
    if (shot.kind === 'arrival') {
      aim.copy(cars[0].holder.position);
      aim.y += SHOT.aim;
      return aim;
    }
    if (shot.kind === 'portal') {
      const mid = ctx.legS - sign * ctx.length / 2;
      ctx.route.at(sign * (mid - shot.at) > 0 ? mid : shot.at, rp);
      return aim.set(rp.x, rp.y + SHOT.aim, rp.z);
    }
    aim.copy(cars[0].holder.position).add(cars[cars.length - 1].holder.position).multiplyScalar(0.5);
    aim.y += SHOT.aim;
    return aim;
  }
  // where a moving shot wants to be this frame, and what it looks at (the front, or the nose for the arc)
  function placeMoving(shot, ctx, sign, train) {
    const lead = train.cars[0], route = ctx.route;
    front.copy(lead.holder.position);
    if (shot.kind === 'arc') {
      lead.holder.updateMatrixWorld();
      aim.set(0, lead.box.max.y * 0.5, lead.box.max.z).applyMatrix4(lead.holder.matrixWorld);
      route.at(ctx.legS, rp);
      const u = Math.min(1, shotCam.age / shot.hold), turn = shotCam.spin * SHOT.arc.sweep * (2 * u - 1);
      const heading = rp.yaw + (sign > 0 ? 0 : Math.PI) + turn;
      want.set(aim.x + Math.sin(heading) * SHOT.arc.radius, aim.y + shot.height, aim.z + Math.cos(heading) * SHOT.arc.radius);
      return;
    }
    const s = ctx.legS + sign * (shot.kind === 'chase' ? -SHOT.chase.back : SHOT.heli.ahead);
    aim.copy(front); aim.y += SHOT.aim;
    // a shot out to the side draws in while the land hides the train, and back out once it doesn't
    if (shot.lateral && shotCam.recheck <= 0) {
      shotCam.recheck = SHOT.recheck;
      const last = SHOT.reach.length - 1;
      if (shotCam.age === 0) { shotCam.reach = 0; while (shotCam.reach < last && !sees(shot, route, s, shotCam.reach)) shotCam.reach++; }
      else if (!sees(shot, route, s, shotCam.reach)) shotCam.reach = Math.min(last, shotCam.reach + 1);
      else if (shotCam.reach > 0 && sees(shot, route, s, shotCam.reach - 1)) shotCam.reach--;
    }
    alongside(shot, route, s, shot.lateral ? SHOT.reach[shotCam.reach] : 0);
  }
  // a moving shot at leg-s `s`, this part of its lateral out: into `want`; and whether it sees `aim` from there. Past
  // either end of the route (a chase 30 m behind a ride just off its pad), it's on along the route's heading there: held
  // at the end, it stood right over the vehicle, looking straight down on it (owner, 2026-11-22)
  function alongside(shot, route, s, f) {
    const on = Math.min(route.length, Math.max(0, s)), past = s - on;
    route.offsetAt(on, shot.lateral * f, rp);
    return want.set(rp.x + Math.sin(rp.yaw) * past, rp.y + shot.height, rp.z + Math.cos(rp.yaw) * past);
  }
  function sees(shot, route, s, i) {
    alongside(shot, route, s, SHOT.reach[i]);
    return clearSight(want.x, lift(want.x, want.z, want.y), want.z, aim.x, aim.y, aim.z);
  }
  function directorView(dt, train, ctx) {
    const { shot, cut } = director.step(ctx);
    const sign = ctx.dir === 'out' ? 1 : -1;
    const snap = cut || shotCam.fresh || shot !== shotCam.shot;
    if (snap) {
      shotCam.shot = shot; shotCam.fresh = false; shotCam.age = 0; shotCam.spin = -shotCam.spin; shotCam.recheck = 0;
      if (camera.fov !== shot.fov) { camera.fov = shot.fov; camera.updateProjectionMatrix(); }
      if (FIXED.has(shot.kind)) placeFixed(shot, ctx, sign, train);
    } else { shotCam.age += dt; shotCam.recheck -= dt; }
    const k = snap ? 1 : 1 - Math.exp(-dt * SHOT.ease), w = quick(ctx.v);
    if (FIXED.has(shot.kind)) {
      const kf = snap ? 1 : 1 - Math.exp(-dt * SHOT.ease * (1 + w * (Math.abs(ctx.v) / SHOT.quick - 1)));
      shotCam.target.lerp(aimFixed(shot, ctx, sign, train), kf);
      seen.copy(shotCam.target);
    } else {
      // eased as an offset from the front, so a fast train doesn't leave it behind
      placeMoving(shot, ctx, sign, train);
      shotCam.off.lerp(want.sub(front), k);
      shotCam.pos.copy(front).add(shotCam.off);
      shotCam.pos.y = lift(shotCam.pos.x, shotCam.pos.z, shotCam.pos.y);
      shotCam.target.lerp(aim, k);
      shotCam.aimOff.lerp(aim.sub(front), k);
      seen.copy(front).add(shotCam.aimOff).sub(shotCam.target).multiplyScalar(w).add(shotCam.target);
    }
    camera.position.copy(shotCam.pos);
    camera.lookAt(seen);
  }

  const q = new THREE.Quaternion(), e = new THREE.Euler(0, 0, 0, 'YXZ'), v = new THREE.Vector3(), mid = new THREE.Vector3();
  // the mouse looks round from the cab or the nose; let go, the view eases back ahead
  function settleLook(dt, rest) {
    if (look.dragging) return;
    look.idle += dt;
    if (look.idle > 0.4) { const k = 1 - Math.exp(-dt * 1.6); look.yaw += (0 - look.yaw) * k; look.pitch += (rest - look.pitch) * k; }
  }
  // the camera at `at` in a vehicle holder's own frame, looking along its +z (turned by the mouse)
  function ride(holder, at, pitch) {
    holder.updateMatrixWorld();
    camera.position.copy(at).applyMatrix4(holder.matrixWorld);
    holder.getWorldQuaternion(q);
    // the vehicle faces +z; a camera looks down -z, so turn it round first
    e.set(pitch, Math.PI + look.yaw, 0);
    camera.quaternion.copy(q).multiply(new THREE.Quaternion().setFromEuler(e));
  }
  // ctx (the director's): { dt, legS, dir, v, route (the leg's, in leg-s), length, showpieces, started }
  function update(dt, train, ctx) {
    if (mode === 'director' && ctx) { directorView(dt, train, ctx); return; }
    if (mode === 'cab' && cab) {
      settleLook(dt, -0.04);
      ride(cab.holder, cab.seat, look.pitch);
      return;
    }
    if (mode === 'nose') {
      settleLook(dt, -0.04);
      const lead = train.cars[0];
      ride(lead.holder, v.set(0, lead.box.max.y + NOSE.up, lead.box.max.z - NOSE.back), look.pitch + 0.04 + NOSE.pitch);
      return;
    }
    // drone: orbit the middle of the train, following it smoothly (nearer something small: a ride's vehicle sets
    // droneScale, its share of the train's distance)
    const cars = train.cars, k = train.droneScale ?? 1;
    mid.copy(cars[0].holder.position).add(cars[cars.length - 1].holder.position).multiplyScalar(0.5);
    if (!drone.ready) { drone.target.copy(mid); drone.ready = true; }
    drone.target.lerp(mid, 1 - Math.exp(-dt * 6));
    // (something faster than any train: about its middle itself, else it orbits a point left behind it)
    seen.copy(mid).sub(drone.target).multiplyScalar(quick(ctx?.v ?? 0)).add(drone.target);
    const yawTrain = cars[0].holder.rotation.y;
    const az = yawTrain + drone.az;
    v.set(Math.sin(az) * Math.cos(drone.el), Math.sin(drone.el), Math.cos(az) * Math.cos(drone.el)).multiplyScalar(drone.dist * k);
    drone.pos.copy(seen).add(v);
    drone.pos.y = Math.max(drone.pos.y, heightAt(drone.pos.x, drone.pos.z) + 3);
    camera.position.copy(drone.pos);
    camera.lookAt(seen.x, seen.y + 2 * k, seen.z);
  }

  return {
    get mode() { return mode; },
    set, cycle: () => set(MODES[(MODES.indexOf(mode) + 1) % MODES.length]),
    attachCab(c) { cab = c; set(mode); },
    // on foot the player's camera takes over: show the train whole, no cab inside it, through the usual lens
    setDriving(on) {
      cab?.clip(on && mode === 'cab');
      if (cab) cab.interior.visible = on && mode === 'cab';
      camera.near = on && mode === 'cab' ? 0.05 : 0.1;
      camera.fov = FOV;
      shotCam.fresh = true;   // back in the director's view, its shot (and lens) is put on again
      camera.updateProjectionMatrix();
    },
    // a new run (a train taken, a jump): the director starts afresh
    restart,
    // the director's shot and where it's looking (debug)
    get shot() { return mode === 'director' ? { ...shotCam.shot, target: shotCam.target.toArray() } : null; },
    update,
  };
}

// Fit a cab interior to a vehicle: add it to the vehicle's holder and cut the shell away inside the cab's box
// (three planes, clipped only where all three agree), leaving the nose ahead and the body behind.
export function fitCab(renderer, vehicle, interior) {
  renderer.localClippingEnabled = true;
  const shellMeshes = [];
  vehicle.obj.traverse((o) => { if (o.isMesh) shellMeshes.push(o); });
  const planes = [new THREE.Plane(), new THREE.Plane(), new THREE.Plane()];
  for (const m of shellMeshes) { m.material = m.material.clone(); m.material.clipIntersection = true; }
  vehicle.holder.add(interior.group);
  const c = interior.box, local = [
    new THREE.Plane(new THREE.Vector3(0, 0, 1), -(c.zFront + 0.02)),   // clipped where z < front
    new THREE.Plane(new THREE.Vector3(0, 0, -1), c.zBack - 0.02),      // and z > back
    new THREE.Plane(new THREE.Vector3(0, -1, 0), c.floor - 0.02),      // and y > floor
  ];
  let on = false;
  const update = () => {
    if (!on) return;
    vehicle.holder.updateMatrixWorld();
    local.forEach((p, i) => planes[i].copy(p).applyMatrix4(vehicle.holder.matrixWorld));
  };
  for (const m of shellMeshes) m.onBeforeRender = update;
  return {
    holder: vehicle.holder, seat: interior.seat, interior: interior.group,
    clip(v) { on = v; for (const m of shellMeshes) m.material.clippingPlanes = v ? planes : null; update(); },
  };
}
