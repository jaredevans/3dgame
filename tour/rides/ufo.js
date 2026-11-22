// The jet's UFO (west-future), built here in the tour's low-poly style: a flying saucer 16 m across (a faceted metal disc,
// a dark band round its rim, a glass dome lit from inside), a ring of lights round its rim flashing in a chase of
// colours, and its underside glowing. It drops in from high behind the jet after the rocket pass, paces it on its right
// a little ahead, fires bright laser bolts that streak past (each always missing: rides/jet-plan.js BOLTS, boltAt),
// each with a flash at the saucer's rim and a zap, and shoots away up into the night sky with a whoosh
// (rides/jet-plan.js ufoOffset says where, keyed to the jet's ride-s). It stands in the scene from the build, hidden
// until the ride's event ('ufo') runs. Its lights brighten as night falls; the bolts are always bright. Nothing is
// made as it flies: its bolts are a fixed pool, placed each frame.
import * as THREE from 'three';
import { sound } from '../audio.js';
import { UFO, BOLTS, ufoOffset, boltAt, placeOnPath } from './jet-plan.js';
import { dotTexture } from './spray.js';

const N_LIGHTS = 16, POOL = 4;
const RIM = 7.9;                  // the saucer's rim, metres from its middle (UFO.radius is its reach, 8 m)
const PALETTE = ['#ff4a3d', '#ffd23d', '#4dff7a', '#3dc2ff'].map((c) => new THREE.Color(c));
const LOUD = 60;                  // m: a zap nearer the camera than this is at its loudest
const FLASH = 0.1;                // s a bolt's flash at the rim shows

const metal = () => new THREE.MeshStandardMaterial({ color: '#aeb6c0', metalness: 0.75, roughness: 0.32, flatShading: true });

// the saucer: its disc (a lathe of its profile: a shallow dome under it, the rim's edge, a steeper shoulder up to the
// dome), the band round its rim, the glass dome, the rim lights and the glowing underside; its origin at its middle
function saucer(glowTex) {
  const g = new THREE.Group();
  g.name = 'saucer';
  const prof = [[0.01, -1.15], [2.6, -1.2], [5.6, -0.8], [RIM, -0.05], [RIM - 0.4, 0.35], [5.2, 0.85], [3.4, 1.15], [0.01, 1.2]]
    .map(([r, y]) => new THREE.Vector2(r, y));
  const disc = new THREE.Mesh(new THREE.LatheGeometry(prof, 24), metal());
  disc.name = 'saucer disc';
  disc.castShadow = true;
  const band = new THREE.Mesh(new THREE.TorusGeometry(RIM - 0.08, 0.22, 6, 48).rotateX(Math.PI / 2), new THREE.MeshStandardMaterial({ color: '#30353d', metalness: 0.6, roughness: 0.4 }));
  band.name = 'saucer band';
  const domeMat = new THREE.MeshStandardMaterial({ color: '#8fe3ff', transparent: true, opacity: 0.6, roughness: 0.08, metalness: 0.15, emissive: new THREE.Color('#4cc8ff'), emissiveIntensity: 0.2 });
  const dome = new THREE.Mesh(new THREE.SphereGeometry(3.3, 20, 8, 0, Math.PI * 2, 0, Math.PI / 2).translate(0, 1.05, 0), domeMat);
  dome.name = 'saucer dome';
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
  // the underside: a glowing round panel and a ring round it, and a soft glow below
  const under = new THREE.MeshBasicMaterial({ color: '#7dffd9', toneMapped: false, fog: false });
  const panel = new THREE.Mesh(new THREE.CircleGeometry(2.4, 24).rotateX(Math.PI / 2).translate(0, -1.17, 0), under);
  const ring = new THREE.Mesh(new THREE.RingGeometry(3.6, 4.1, 32).rotateX(Math.PI / 2).translate(0, -1.02, 0), under);
  panel.name = 'saucer underside'; ring.name = 'saucer underside ring';
  const glowMat = new THREE.SpriteMaterial({ map: glowTex, color: '#6dffd0', blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity: 0.5, fog: false });
  const glow = new THREE.Sprite(glowMat);
  glow.position.y = -2.2;
  glow.scale.setScalar(16);
  g.add(disc, band, dome, lights, panel, ring, glow);
  return { group: g, lights, domeMat, glowMat, glow, under };
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

// -> the actor of the 'ufo' event (actors/index.js contract). ctx: the registry's (rides/index.js)
export async function buildUfo({ ride, slicer, still }) {
  await slicer.frame();
  await still();   // (the saucer and its bolts made: only where it may land)
  const glowTex = dotTexture();
  const group = new THREE.Group();
  group.name = 'ufo';
  const craft = new THREE.Group();   // posed on the path: heading, then its tilt
  craft.rotation.order = 'YXZ';
  const sc = saucer(glowTex);
  craft.add(sc.group);
  craft.visible = false;
  group.add(craft);
  const bolts = Array.from({ length: POOL }, () => bolt());
  // a flash at the rim where each bolt leaves it
  const flashMat = new THREE.SpriteMaterial({ map: glowTex, color: '#b8ffb0', blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, fog: false });
  const flash = new THREE.Sprite(flashMat);
  flash.scale.setScalar(9);
  flash.visible = false;
  group.add(...bolts.map((b) => b.group), flash);

  const O = { along: 0, side: 0, up: 0, roll: 0, pitch: 0, visible: false }, W = {}, H = {}, T = {}, F = {};
  const B = boltAt(BOLTS[0], 0, 1), dir = new THREE.Vector3(), Z = new THREE.Vector3(0, 0, 1);
  const c = new THREE.Color();
  let next = 0, fired = -1, flashFor = 0, phase = 0, spin = 0, left = false;
  const hide = () => {
    craft.visible = false; flash.visible = false; flashFor = 0; next = 0; fired = -1; left = false;
    for (const b of bolts) b.group.visible = false;
  };
  const loud = (cam, x, y, z) => (cam ? Math.min(1, LOUD / Math.max(LOUD, Math.hypot(cam.position.x - x, cam.position.y - y, cam.position.z - z))) : 1);
  return {
    group,
    update(f) {
      if (!f.on || f.rideS === null) { hide(); return; }
      const s = f.rideS, dt = f.dt, v = ride.profile.v, k = Math.min(1, Math.max(0, f.night));
      ufoOffset(s, O);
      craft.visible = O.visible;
      if (!O.visible) { for (const b of bolts) b.group.visible = false; flash.visible = false; return; }
      placeOnPath(ride, s, O, W);
      craft.position.set(W.x, W.y, W.z);
      craft.rotation.set(O.pitch, W.yaw, O.roll);
      spin += dt * 0.7;
      sc.group.rotation.y = spin;
      // the rim lights: a chase of colours round it, the colours stepping on as it goes, brighter after dark; the
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
      // its bolts in flight: each in a slot of the pool, from tail to head on the jet's path's frame, fading at its end
      for (const b of bolts) b.group.visible = false;
      for (let i = 0; i < BOLTS.length; i++) {
        boltAt(BOLTS[i], s, v, B);
        if (!B.alive) continue;
        const o = bolts[i % POOL];
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
      flash.visible = flashFor > 0 && fired >= 0;
      if (flash.visible) {
        placeOnPath(ride, s, BOLTS[fired].from, F);
        flash.position.set(F.x, F.y, F.z);
        flashMat.opacity = Math.min(1, (flashFor / FLASH) * 1.5);
      }
      // away up into the sky with a whoosh
      if (!left && s >= UFO.leave[0]) { left = true; sound('whoosh'); }
    },
    dispose() {},   // (the group is freed with the rest of the ride's, at a standstill)
  };
}

