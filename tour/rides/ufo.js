// The starfighter's UFO (west-future), built here in the tour's low-poly style, and its end: a flying saucer 16 m
// across (a faceted metal disc, a dark band round its rim, a glass dome lit from inside), a ring of lights round its rim
// flashing in a chase of white and green (owner: no more colours), and its underside glowing. It drops in from high
// behind the starfighter after the rocket, paces it on its right, fires bright laser bolts that streak past close (each
// missing by 3-6 m: rides/jet-plan.js bolts, boltAt), each with a flash at the saucer's rim and a zap; then pulls out
// ahead, and the starfighter fires its missile (Polyfork's missile-0717d1, at its real 2.14 m) from its belly: it drops
// clear, its fins opening, lights with a cyan flame and a smoke trail and flies into the saucer (missileAt), which blows
// up (owner's ruling R20: a flash, a fireball, a shock ring, a boom and a crackle, sparks, and the saucer's own pieces -
// its disc and band in six each, its dome, its underside - flung out away from the starfighter, tumbling and falling
// with smoke, shrinking away into it; blastAt's), brighter after dark. All keyed to the starfighter's ride-s (where:
// ufoOffset, missileAt, debrisAt, fireballAt, ringAt). It stands in the scene from the build, hidden until the ride's
// event ('ufo') runs; its missile is the module's own, loaded with it, optional (warned; the saucer then just blows up
// at the strike). Nothing is made as it flies: its bolts, smoke and sparks are fixed pools, placed each frame.
import * as THREE from 'three';
import { sound } from '../audio.js';
import {
  BLAST, bolts, ufoOffset, boltAt, placeOnPath, missileAt, blastOrigin, blastTime, debrisAt, fireballAt, ringAt,
} from './jet-plan.js';
import { dotTexture, makeSpray } from './spray.js';

export const MISSILE = 'missile-0717d1';   // Polyfork's missile (2.14 m, its nose +z, its middle 0.35 m up)
const N_LIGHTS = 16, POOL = 4, FIRE = 8, SEGMENTS = 6;
const RIM = 7.9;                  // the saucer's rim, metres from its middle (UFO.radius is its reach, 8 m)
// white and green only (owner, 2026-11-22: more colours read as Christmas lights)
const PALETTE = ['#f4fff6', '#4dff7a'].map((c) => new THREE.Color(c));
const LOUD = 60;                  // m: a zap nearer the camera than this is at its loudest
const FLASH = 0.1;                // s a bolt's flash at the rim shows
// the blast's sparks and its fireball's smoke puffs: how fast they fly up and out (m/s; made once, not each burst)
const SPARK_UP = [4, 26], SPARK_OUT = [10, 40], PUFF_UP = [1, 5], PUFF_OUT = [2, 9];
const FIRE_COLOURS = ['#fff2c4', '#ffd06a', '#ff9a3c', '#ff6a2a'].map((c) => new THREE.Color(c));

const metal = () => new THREE.MeshStandardMaterial({ color: '#aeb6c0', metalness: 0.75, roughness: 0.32, flatShading: true });

// a piece of the saucer: its geometry moved to be about its own middle, the mesh put back where it was (so it can tumble
// about itself); -> the mesh, its rest place kept in userData.rest
function piece(name, geo, material) {
  geo.computeBoundingBox();
  const c = geo.boundingBox.getCenter(new THREE.Vector3());
  geo.translate(-c.x, -c.y, -c.z);
  const m = new THREE.Mesh(geo, material);
  m.name = name;
  m.position.copy(c);
  m.userData.rest = c.clone();
  m.castShadow = true;
  return m;
}

// the saucer: its disc (a lathe of its profile: a shallow dome under it, the rim's edge, a steeper shoulder up to the
// dome) and the band round its rim, each in six, the glass dome, the rim lights and the glowing underside (panel and
// ring, as one piece); its origin at its middle. -> { group, pieces (DEBRIS.count), lights, ... }
function saucer(glowTex) {
  const g = new THREE.Group();
  g.name = 'saucer';
  const prof = [[0.01, -1.15], [2.6, -1.2], [5.6, -0.8], [RIM, -0.05], [RIM - 0.4, 0.35], [5.2, 0.85], [3.4, 1.15], [0.01, 1.2]]
    .map(([r, y]) => new THREE.Vector2(r, y));
  const discMat = metal(), bandMat = new THREE.MeshStandardMaterial({ color: '#30353d', metalness: 0.6, roughness: 0.4 });
  const pieces = [];
  for (let k = 0; k < SEGMENTS; k++) {
    const a = (k / SEGMENTS) * Math.PI * 2;
    pieces.push(piece(`saucer disc ${k}`, new THREE.LatheGeometry(prof, 4, a, (2 * Math.PI) / SEGMENTS), discMat));
  }
  for (let k = 0; k < SEGMENTS; k++) {
    // (a torus arc from +x round towards +y, laid flat: round towards -z, so turned on to start where the disc's does)
    const geo = new THREE.TorusGeometry(RIM - 0.08, 0.22, 6, 8, (2 * Math.PI) / SEGMENTS).rotateX(Math.PI / 2).rotateY((k / SEGMENTS) * Math.PI * 2 - Math.PI / 2);
    pieces.push(piece(`saucer band ${k}`, geo, bandMat));
  }
  const domeMat = new THREE.MeshStandardMaterial({ color: '#8fe3ff', transparent: true, opacity: 0.6, roughness: 0.08, metalness: 0.15, emissive: new THREE.Color('#4cc8ff'), emissiveIntensity: 0.2 });
  pieces.push(piece('saucer dome', new THREE.SphereGeometry(3.3, 20, 8, 0, Math.PI * 2, 0, Math.PI / 2).translate(0, 1.05, 0), domeMat));
  // the underside: a glowing round panel and a ring round it (one piece), and a soft glow below
  const under = new THREE.MeshBasicMaterial({ color: '#7dffd9', toneMapped: false, fog: false });
  const underGeo = new THREE.CircleGeometry(2.4, 24).rotateX(Math.PI / 2).translate(0, -1.17, 0);
  const ringGeo = new THREE.RingGeometry(3.6, 4.1, 32).rotateX(Math.PI / 2).translate(0, -1.02, 0);
  const underside = piece('saucer underside', underGeo, under);
  const ring = new THREE.Mesh(ringGeo.translate(-underside.position.x, -underside.position.y, -underside.position.z), under);
  ring.name = 'saucer underside ring';
  underside.add(ring);
  pieces.push(underside);
  // the rim lights: one instanced mesh, each light's colour set every frame (a chase round the rim)
  const lightMat = new THREE.MeshBasicMaterial({ color: '#ffffff', toneMapped: false, fog: false });
  const lights = new THREE.InstancedMesh(new THREE.SphereGeometry(0.45, 8, 6), lightMat, N_LIGHTS);
  lights.name = 'saucer lights';
  const m = new THREE.Matrix4();
  for (let i = 0; i < N_LIGHTS; i++) {
    const a = (i / N_LIGHTS) * Math.PI * 2;
    lights.setMatrixAt(i, m.makeTranslation(Math.cos(a) * (RIM + 0.05), -0.02, Math.sin(a) * (RIM + 0.05)));
    lights.setColorAt(i, PALETTE[i % PALETTE.length]);
  }
  const glowMat = new THREE.SpriteMaterial({ map: glowTex, color: '#6dffd0', blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity: 0.5, fog: false });
  const glow = new THREE.Sprite(glowMat);
  glow.position.y = -2.2;
  glow.scale.setScalar(16);
  g.add(...pieces, lights, glow);
  return { group: g, pieces, lights, domeMat, glowMat, glow, under };
}

// a bolt: a bright core and a softer glow round it, both one metre long along +z from its tail (scaled to its streak);
// its own materials, so each fades out at the end of its own flight
function bolt() {
  const coreMat = new THREE.MeshBasicMaterial({ color: '#f2ffe8', transparent: true, opacity: 1, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false, fog: false });
  const glowMat = new THREE.MeshBasicMaterial({ color: '#57ff6e', transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false, fog: false });
  const g = new THREE.Group();
  g.name = 'laser bolt';
  const core = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 1, 6, 1).rotateX(Math.PI / 2).translate(0, 0, 0.5), coreMat);
  const halo = new THREE.Mesh(new THREE.CylinderGeometry(0.75, 0.75, 1, 8, 1).rotateX(Math.PI / 2).translate(0, 0, 0.5), glowMat);
  for (const o of [core, halo]) { o.castShadow = false; o.renderOrder = 3; g.add(o); }
  g.visible = false;
  return { group: g, coreMat, glowMat };
}

const additive = (glowTex, color) => new THREE.SpriteMaterial({ map: glowTex, color, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity: 0, fog: false });

// -> the actor of the 'ufo' event (actors/index.js contract). ctx: the registry's (rides/index.js)
export async function buildUfo({ ride, slicer, still, cdnPart = null, warn = () => {} }) {
  await slicer.frame();
  await still();   // (the saucer, its bolts and its blast made, the bolts' aims worked out: only where it may land)
  const glowTex = dotTexture();
  const group = new THREE.Group();
  group.name = 'ufo';
  const craft = new THREE.Group();   // posed on the path: heading, then its tilt
  craft.rotation.order = 'YXZ';
  const sc = saucer(glowTex);
  craft.add(sc.group);
  craft.visible = false;
  group.add(craft);
  const pool = Array.from({ length: POOL }, () => bolt());
  // a flash at the rim where each bolt leaves it
  const flashMat = additive(glowTex, '#b8ffb0');
  const flash = new THREE.Sprite(flashMat);
  flash.scale.setScalar(9);
  flash.visible = false;
  group.add(...pool.map((b) => b.group), flash);
  const BOLTS = bolts();

  // the missile: Polyfork's, its fins folded till it's clear, a cyan flame and glow behind it (left out, warned, if it
  // can't be had: the saucer then blows up at the strike all the same)
  const missile = new THREE.Group();
  missile.name = 'missile';
  missile.visible = false;
  const flameMat = new THREE.MeshBasicMaterial({ color: '#8ff8ff', transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false, fog: false });
  const flame = new THREE.Mesh(new THREE.ConeGeometry(0.22, 2.4, 10, 1, true).rotateX(-Math.PI / 2).translate(0, 0, -1.07 - 1.2), flameMat);
  flame.frustumCulled = false;
  const flameGlow = new THREE.Sprite(additive(glowTex, '#9ff6ff'));
  flameGlow.position.z = -1.4;
  flameGlow.scale.setScalar(4);
  missile.add(flame, flameGlow);
  let fins = [];
  if (cdnPart) {
    try {
      await slicer.frame();
      const body = await cdnPart(MISSILE, {});
      body.position.y = -0.35;
      body.traverse((o) => { if (o.isMesh) o.castShadow = true; });
      fins = ['fin-1', 'fin-2', 'fin-3', 'fin-4'].map((n) => body.getObjectByName(n)).filter(Boolean);
      missile.add(body);
    } catch (err) { if (err?.dropped) throw err; warn('missile', err); }
  }
  group.add(missile);
  await slicer.frame();
  await still();   // (the blast's sprites and its smoke and sparks pools made: only where it may land)

  // the blast: a flash, the fireball (FIRE sprites, each its own colour and place in it), the shock ring; smoke and sparks
  const blastFlash = new THREE.Sprite(additive(glowTex, '#ffffff'));
  const fire = Array.from({ length: FIRE }, (_, i) => {
    const sp = new THREE.Sprite(additive(glowTex, FIRE_COLOURS[i % FIRE_COLOURS.length]));
    sp.userData.off = new THREE.Vector3(Math.sin(i * 2.4), Math.cos(i * 1.7) * 0.6, Math.cos(i * 2.4)).multiplyScalar(0.45);
    sp.userData.size = 1.1 + 0.25 * Math.sin(i * 3.1);
    return sp;
  });
  const ringMat = new THREE.MeshBasicMaterial({ color: '#ffe2a8', transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false, side: THREE.DoubleSide, fog: false });
  const shock = new THREE.Mesh(new THREE.RingGeometry(0.92, 1, 48).rotateX(-Math.PI / 2), ringMat);
  shock.rotation.z = 0.25;
  for (const o of [blastFlash, ...fire, shock]) { o.visible = false; o.frustumCulled = false; group.add(o); }
  const smoke = makeSpray({ count: 900, size: 5, life: 2.6, gravity: -0.6, name: 'blast smoke', color: '#5a5550', opacity: 0.8, air: 0.6, floor: -Infinity });
  const trail = makeSpray({ count: 260, size: 1.6, life: 1.4, gravity: -0.3, name: 'missile smoke', color: '#d9d6cf', opacity: 0.8, air: 0.4, floor: -Infinity });
  const sparks = makeSpray({ count: 240, size: 0.7, life: 1.3, gravity: 9.8, name: 'blast sparks', color: '#ffd27a', opacity: 1, air: 0.3, floor: -Infinity });
  group.add(smoke.points, trail.points, sparks.points);

  const O = { along: 0, side: 0, up: 0, roll: 0, pitch: 0, visible: false }, W = {}, H = {}, T = {}, F = {};
  const M = { visible: false, lit: false, fins: 0, along: 0, side: 0, up: 0 }, MA = { ...M }, MW = {}, MN = {};
  const origin = blastOrigin(ride), D = {}, FB = {}, RG = {};
  const B = boltAt(BOLTS[0], 0, 1), dir = new THREE.Vector3(), Z = new THREE.Vector3(0, 0, 1);
  const c = new THREE.Color(), toLocal = new THREE.Quaternion(), p = new THREE.Vector3();
  let next = 0, fired = -1, flashFor = 0, phase = 0, spin = 0, launched = false, struck = false, puff = 0;
  const reset = () => {
    // (whole again for the next ride of a kept kit: each piece back in its place, shown)
    for (const pc of sc.pieces) { pc.position.copy(pc.userData.rest); pc.rotation.set(0, 0, 0); pc.scale.setScalar(1); pc.visible = true; }
    sc.lights.visible = true; sc.glow.visible = true;
  };
  const hide = () => {
    craft.visible = false; flash.visible = false; flashFor = 0; next = 0; fired = -1;
    missile.visible = false; blastFlash.visible = false; shock.visible = false;
    for (const b of pool) b.group.visible = false;
    for (const sp of fire) sp.visible = false;
    if (struck) reset();
    launched = false; struck = false;
  };
  const loud = (cam, x, y, z, near = LOUD) => (cam ? Math.min(1, near / Math.max(near, Math.hypot(cam.position.x - x, cam.position.y - y, cam.position.z - z))) : 1);
  return {
    group,
    update(f) {
      const dt = f.dt;
      smoke.update(dt); trail.update(dt); sparks.update(dt);
      if (!f.on || f.rideS === null) { hide(); return; }
      const s = f.rideS, v = ride.profile.v, k = Math.min(1, Math.max(0, f.night));
      ufoOffset(s, O);
      if (O.visible) {
        placeOnPath(ride, s, O, W);
        craft.position.set(W.x, W.y, W.z);
        craft.rotation.set(O.pitch, W.yaw, O.roll);
        spin += dt * 0.7;
        sc.group.rotation.y = spin;
      }
      craft.visible = O.visible || struck;
      // the rim lights: a chase of white and green round it, stepping on as it goes, brighter after dark; the
      // underside and the dome glowing, pulsing a little
      phase += dt * 7;
      const bright = 0.55 + 0.75 * k, step = Math.floor(phase / 3);
      for (let i = 0; i < N_LIGHTS; i++) {
        const w = Math.max(0, Math.cos(phase - (i * 2 * Math.PI * 3) / N_LIGHTS));
        c.copy(PALETTE[(i + step) % PALETTE.length]).multiplyScalar(bright * (0.15 + 0.85 * w ** 6));
        sc.lights.setColorAt(i, c);
      }
      sc.lights.instanceColor.needsUpdate = true;
      const pulse = 0.85 + 0.15 * Math.sin(f.time * 5.3);
      sc.glowMat.opacity = (0.2 + 0.45 * k) * pulse;
      sc.under.color.setRGB(0.49 * (0.6 + 0.4 * k), 1 * (0.6 + 0.4 * k), 0.85 * (0.6 + 0.4 * k));
      sc.domeMat.emissiveIntensity = 0.15 + 0.6 * k;
      // its bolts in flight: each in a slot of the pool, from tail to head on the craft's path's frame, fading at its end
      for (const b of pool) b.group.visible = false;
      for (let i = 0; i < BOLTS.length; i++) {
        boltAt(BOLTS[i], s, v, B);
        if (!B.alive) continue;
        const o = pool[i % POOL];
        placeOnPath(ride, s, B.tail, T); placeOnPath(ride, s, B.head, H);
        dir.set(H.x - T.x, H.y - T.y, H.z - T.z);
        const len = dir.length();
        if (len < 0.01) continue;
        o.group.visible = true;
        o.group.position.set(T.x, T.y, T.z);
        o.group.quaternion.setFromUnitVectors(Z, dir.divideScalar(len));
        o.group.scale.set(1, 1, len);
        const end = 1 - Math.min(1, Math.max(0, (B.u - 0.8) / 0.2));
        o.coreMat.opacity = end; o.glowMat.opacity = 0.55 * end;
      }
      // those fired since the last frame (ride-s only grows): the zap, and a flash at the rim where it left (kept with
      // the saucer as it flies on)
      while (next < BOLTS.length && BOLTS[next].s <= s) {
        placeOnPath(ride, s, BOLTS[next].from, F);
        sound('zap', loud(f.camera, F.x, F.y, F.z));
        fired = next++;
        flashFor = FLASH;
      }
      flashFor -= dt;
      flash.visible = flashFor > 0 && fired >= 0 && O.visible;
      if (flash.visible) {
        placeOnPath(ride, s, BOLTS[fired].from, F);
        flash.position.set(F.x, F.y, F.z);
        flashMat.opacity = Math.min(1, (flashFor / FLASH) * 1.5);
      }

      // the missile: dropped clear of the belly, then lit, flying on its curve to the saucer, nose along its way, with
      // its smoke behind it
      missileAt(s, v, M);
      missile.visible = M.visible;
      if (M.visible) {
        if (!launched) { launched = true; sound('whoosh'); }
        placeOnPath(ride, s, M, MW);
        missileAt(s + 1, v, MA);
        placeOnPath(ride, s + 1, MA, MN);
        missile.position.set(MW.x, MW.y, MW.z);
        dir.set(MN.x - MW.x, MN.y - MW.y, MN.z - MW.z);
        if (dir.lengthSq() > 1e-6) missile.quaternion.setFromUnitVectors(Z, dir.normalize());
        for (let i = 0; i < fins.length; i++) fins[i].rotation.z = -82 * (Math.PI / 180) * (1 - M.fins);
        flame.visible = flameGlow.visible = M.lit;
        if (M.lit) {
          flame.scale.set(1, 1, 0.8 + 0.4 * Math.random());
          flameGlow.material.opacity = 0.6 + 0.4 * k;
          p.set(0, 0, -1.3).applyQuaternion(missile.quaternion).add(missile.position);
          trail.emit(p.x, p.y, p.z, 0, 0.4, 0, 1.2 + 0.4 * Math.random());
        }
      }

      // the strike: the saucer's pieces flung from where it was, the fireball, the ring, the flash; the boom
      const t = blastTime(ride, s);
      if (t >= 0 && !struck) {
        struck = true;
        sc.lights.visible = false; sc.glow.visible = false;
        craft.updateMatrixWorld(true);
        sc.group.getWorldQuaternion(toLocal).invert();   // (the pieces moved in the saucer's frame, frozen as it was struck)
        sound('boom');
        sparks.burst(origin.x, origin.y, origin.z, 200, SPARK_UP, SPARK_OUT, 3);
      }
      if (!struck) return;
      const live = t <= BLAST.life;
      craft.visible = live;
      for (let i = 0; i < sc.pieces.length; i++) {
        const pc = sc.pieces[i];
        debrisAt(origin, v, i, t, D);
        p.set(D.x, D.y, D.z).sub(origin);
        // (where it was in the saucer, carried along with the rest of the blast)
        pc.position.copy(pc.userData.rest).add(p.applyQuaternion(toLocal));
        pc.rotation.set(D.rx, D.ry, D.rz);
        pc.scale.setScalar(Math.max(0.001, D.scale));
        pc.visible = D.scale > 0.01;
        if (pc.visible && Math.random() < 0.7) smoke.emit(D.x, D.y, D.z, 0, 1, 0, 1.6 + Math.random());
      }
      fireballAt(origin, v, t, FB);
      const glow = 0.75 + 0.25 * k;
      for (let i = 0; i < fire.length; i++) {
        const sp = fire[i];
        sp.visible = FB.a > 0.01;
        if (!sp.visible) continue;
        const o = sp.userData.off;
        sp.position.set(FB.x + o.x * FB.r, FB.y + o.y * FB.r, FB.z + o.z * FB.r);
        sp.scale.setScalar(FB.r * 2 * sp.userData.size);
        sp.material.opacity = FB.a * glow * (0.55 + 0.45 * Math.sin(f.time * 9 + i));
      }
      if (FB.a > 0.05 && (puff += dt) > 0.05) { puff = 0; smoke.burst(FB.x, FB.y, FB.z, 6, PUFF_UP, PUFF_OUT, FB.r * 0.6); }
      blastFlash.visible = t < BLAST.flash;
      if (blastFlash.visible) {
        blastFlash.position.set(origin.x, origin.y, origin.z);
        blastFlash.scale.setScalar(140 * (1 - t / BLAST.flash) + 20);
        blastFlash.material.opacity = (1 - t / BLAST.flash) * glow;
      }
      ringAt(t, RG);
      shock.visible = RG.a > 0.01;
      if (shock.visible) {
        shock.position.set(origin.x, origin.y, origin.z);
        shock.scale.setScalar(Math.max(0.01, RG.r));
        ringMat.opacity = RG.a * 0.8 * glow;
      }
      if (!live) for (const pc of sc.pieces) pc.visible = false;
    },
    dispose() { smoke.dispose(); trail.dispose(); sparks.dispose(); },   // (the group is freed with the rest of the ride's)
  };
}

