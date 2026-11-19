// Candy Dash: collect candy from every front door before the timer runs out, while a ghost chases you.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { buildKit } from '../kit/kit.mjs';
import { stage } from '../kit/stage.mjs';
import { animate } from '../kit/clips.mjs';
import { createAsset as makeKid } from '../halloween/kid-in-a-caped-663f11.mjs';
import { createAsset as makeNeighbour } from '../halloween/neighbour-handing-out-candy-2c1159.mjs';
import { createAsset as makePumpkin } from '../halloween/jack-o-lantern-0b1ddb.mjs';
import { createAsset as makeGravestone } from '../halloween/foam-yard-gravestone-d64ffc.mjs';
import { createAsset as makeSkeleton } from '../halloween/giant-yard-skeleton-770f04.mjs';
import { createAsset as makeSpider } from '../halloween/giant-yard-spider-70ddce.mjs';

// ---- tunable numbers (starting values from the brief) ----
const TIME_LIMIT = 90;        // seconds
const WALK = 3, RUN = 6;      // m/s
const TURN = 2.6;             // rad/s
const GHOST_SLOW = 2, GHOST_FAST = 5;   // m/s, rising over the round
const COLLECT_RADIUS = 2;     // m
const TOUCH_RADIUS = 1.0;     // m
const HEARTS = 3;
const PLAYER_RADIUS = 0.35;
const HOUSE_KEYS = ['porch-front-cottage', 'two-storey-family-house', 'single-storey-ranch-house',
  'split-level-house', 'townhouse-row-unit'];
const PEOPLE_KEYS = new Set(['suburban-resident', 'neighborhood-child']);

const $ = (id) => document.getElementById(id);
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
document.body.prepend(renderer.domElement);
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(55, innerWidth / innerHeight, 0.1, 500);
addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
});

// ---- the place ----
const place = await buildKit({ folder: './kit/', params: { season: 'autumn' } });
scene.add(place.group);
const look = stage(renderer, scene, { time: 'dusk' });
look.shadows(place.group);
look.ground(place);
await place.surround();

// Collision: everything tall enough to walk into, except the people (decoration you can walk through).
const solids = place.boxes({ minHeight: 0.45 }).filter((b) => b.low && !PEOPLE_KEYS.has(b.key));
function blocked(x, z, radius = PLAYER_RADIUS) {
  for (const b of solids) {
    if (x <= b.low.min.x - radius || x >= b.low.max.x + radius || z <= b.low.min.z - radius || z >= b.low.max.z + radius) continue;
    if (!b.hull) return true;
    let inside = true, near = Infinity;
    for (let i = 0; i < b.hull.length; i++) {
      const p = b.hull[i], q = b.hull[(i + 1) % b.hull.length];
      const ex = q[0] - p[0], ez = q[1] - p[1], px = x - p[0], pz = z - p[1];
      if (ex * pz - ez * px < 0) inside = false;
      const t = Math.max(0, Math.min(1, (px * ex + pz * ez) / (ex * ex + ez * ez || 1)));
      near = Math.min(near, Math.hypot(px - ex * t, pz - ez * t));
    }
    if (inside || near < radius) return true;
  }
  return false;
}
const groundY = (x, z) => Math.max(place.groundAt(x, z), place.surfaceAt(x, z) ? 0.05 : 0);
const edge = place.bounds.clone().expandByScalar(4);

// ---- player ----
const player = makeKid({ THREE });
scene.add(player);
look.shadows(player);
look.follow(player);
const playerAnim = await animate(player, { base: './kit/clips/' });
const startSpot = place.openSpot({ near: new THREE.Vector3(4, 0, 2) });

// ---- candy points: one neighbour in front of each house door ----
const doors = [], idlers = [];
const beamGeo = new THREE.CylinderGeometry(0.12, 0.12, 14, 8, 1, true);
const beamMat = new THREE.MeshBasicMaterial({ color: 0xffb347, transparent: true, opacity: 0.35, depthWrite: false, blending: THREE.AdditiveBlending });
const gemGeo = new THREE.OctahedronGeometry(0.38);
const gemMat = new THREE.MeshBasicMaterial({ color: 0xff7ad9 });
const pumpkinFaces = ['classic', 'scary', 'goofy', 'cat'];

function frontOf(house) {
  // The door is a named rig node on every house: stand the neighbour a few metres out from it.
  house.updateWorldMatrix(true, true);
  let doorNode = null;
  house.traverse((o) => { if (!doorNode && /door/i.test(o.name)) doorNode = o; });
  const centre = new THREE.Box3().setFromObject(house).getCenter(new THREE.Vector3());
  const door = doorNode ? new THREE.Box3().setFromObject(doorNode).getCenter(new THREE.Vector3()) : centre.clone();
  const dx = door.x - centre.x, dz = door.z - centre.z;
  const dir = Math.abs(dx) > Math.abs(dz) ? new THREE.Vector3(Math.sign(dx) || 1, 0, 0) : new THREE.Vector3(0, 0, Math.sign(dz) || 1);
  for (let out = 3.2; out <= 9; out += 0.4) {
    const x = door.x + dir.x * out, z = door.z + dir.z * out;
    if (!blocked(x, z, 0.6)) return { x, z, dir };
  }
  return null;
}

for (const key of HOUSE_KEYS) {
  for (const house of place.of(key)) {
    const spot = frontOf(house);
    if (!spot) continue;
    const yaw = Math.atan2(spot.dir.x, spot.dir.z);
    const y = groundY(spot.x, spot.z);

    const neighbour = makeNeighbour({ THREE, figure: doors.length % 2 ? 'feminine' : 'masculine', age: doors.length % 3 ? 'adult' : 'old' });
    neighbour.position.set(spot.x, y, spot.z);
    neighbour.rotation.y = yaw;
    scene.add(neighbour);
    look.shadows(neighbour);
    const idle = await animate(neighbour, { clips: ['Idle'], base: './kit/clips/' });   // out of the bind pose
    idle.play('Idle');
    idlers.push(idle);

    // two jack-o'-lanterns flanking the neighbour, lit by a warm lamp
    const side = new THREE.Vector3(spot.dir.z, 0, -spot.dir.x);
    [-1, 1].forEach((s, i) => {
      const p = makePumpkin({ THREE, face: pumpkinFaces[(doors.length + i) % 4], size: i ? 'large' : 'medium' });
      const px = spot.x + side.x * s * 1.1 - spot.dir.x * 0.5, pz = spot.z + side.z * s * 1.1 - spot.dir.z * 0.5;
      p.position.set(px, groundY(px, pz), pz);
      p.rotation.y = yaw + s * 0.4;
      scene.add(p);
    });
    const lamp = new THREE.PointLight(0xff9a3c, 6, 9, 1.6);
    lamp.position.set(spot.x, y + 1.2, spot.z);
    scene.add(lamp);

    // marker: a spinning candy gem and a beam you can see from the street
    const marker = new THREE.Group();
    const gem = new THREE.Mesh(gemGeo, gemMat);
    gem.position.y = 2.9;
    const beam = new THREE.Mesh(beamGeo, beamMat);
    beam.position.y = 3.4 + 7;
    marker.add(gem, beam);
    marker.position.set(spot.x, y, spot.z);
    scene.add(marker);

    doors.push({ key, x: spot.x, z: spot.z, marker, gem, lamp, collected: false });
  }
}

// ---- a little extra Halloween dressing on open lawn ----
{
  const spots = place.spots(10, { from: startSpot, radius: 1.2 }).filter((p) => !place.surfaceAt(p.x, p.z));
  const makers = [
    () => makeSkeleton({ THREE }), () => makeGravestone({ THREE }), () => makeSpider({ THREE }),
    () => makePumpkin({ THREE, size: 'large', face: 'scary' }), () => makeGravestone({ THREE }),
  ];
  spots.forEach((p, i) => {
    const o = makers[i % makers.length]();
    o.position.set(p.x, groundY(p.x, p.z), p.z);
    o.rotation.y = i * 1.7;
    scene.add(o);
    look.shadows(o);
  });
}

// ---- ghost ----
const ghost = new THREE.Group();
{
  const gltf = await new GLTFLoader().loadAsync('./models/sea-ghost.glb');
  gltf.scene.traverse((o) => {
    if (!o.isMesh) return;
    o.material = o.material.clone();
    o.material.transparent = true; o.material.opacity = 0.8; o.material.depthWrite = false;
    if (o.material.emissive) { o.material.emissive.set(0x7fd8ff); o.material.emissiveIntensity = 0.55; }
  });
  ghost.add(gltf.scene);
  const glow = new THREE.PointLight(0x8fdcff, 10, 12, 1.5);
  glow.position.y = 1.2;
  ghost.add(glow);
  scene.add(ghost);
}

// ---- game state ----
const keys = new Set();
const game = { state: 'ready', time: TIME_LIMIT, hearts: HEARTS, candy: 0, heading: 0, safe: 0, elapsed: 0 };
const camPos = new THREE.Vector3(), camTarget = new THREE.Vector3();

function farSideFrom(x, z) {
  // the corner of the map furthest from the player
  const b = place.bounds, corners = [[b.min.x, b.min.z], [b.min.x, b.max.z], [b.max.x, b.min.z], [b.max.x, b.max.z]];
  corners.sort((p, q) => Math.hypot(q[0] - x, q[1] - z) - Math.hypot(p[0] - x, p[1] - z));
  return corners[0];
}

function reset() {
  Object.assign(game, { time: TIME_LIMIT, hearts: HEARTS, candy: 0, heading: 0, safe: 0, elapsed: 0 });
  player.position.set(startSpot.x, groundY(startSpot.x, startSpot.z), startSpot.z);
  player.rotation.y = 0;
  const [gx, gz] = farSideFrom(startSpot.x, startSpot.z);
  ghost.position.set(gx, 0, gz);
  for (const d of doors) { d.collected = false; d.marker.visible = true; d.lamp.intensity = 6; }
  snapCamera();
  drawHud();
}

function drawHud() {
  const t = Math.ceil(game.time);
  $('time').textContent = `⏱ ${t}`;
  $('time').classList.toggle('low', t <= 15);
  $('candy').textContent = `🍬 ${game.candy} / ${doors.length}`;
  $('hearts').textContent = '♥'.repeat(game.hearts) + '♡'.repeat(HEARTS - game.hearts);
}

function start() {
  reset();
  game.state = 'playing';
  $('start').style.display = 'none';
  $('end').style.display = 'none';
  $('hud').style.display = 'flex';
}

function finish(won, why) {
  game.state = won ? 'won' : 'lost';
  playerAnim.locomotion(0);
  $('endTitle').textContent = won ? 'Sweet victory!' : 'Game over';
  $('endText').textContent = won
    ? `You collected all ${doors.length} candies in ${game.elapsed.toFixed(1)} seconds.`
    : `${why} You collected ${game.candy} of ${doors.length} candies in ${game.elapsed.toFixed(1)} seconds.`;
  $('end').style.display = 'flex';
}

addEventListener('keydown', (e) => {
  if (e.code === 'Enter' && game.state !== 'playing' && game.state !== 'loading') start();
  if (e.code.startsWith('Arrow') || e.code === 'Space') e.preventDefault();
  keys.add(e.code);
});
addEventListener('keyup', (e) => keys.delete(e.code));
addEventListener('blur', () => keys.clear());

function cameraGoal() {
  const h = game.heading;
  camTarget.set(player.position.x, player.position.y + 1.1, player.position.z);
  return new THREE.Vector3(player.position.x - Math.sin(h) * 6.5, player.position.y + 3.8, player.position.z - Math.cos(h) * 6.5);
}
function snapCamera() { camPos.copy(cameraGoal()); camera.position.copy(camPos); camera.lookAt(camTarget); }

function update(dt) {
  // --- player ---
  const turn = (keys.has('KeyA') || keys.has('ArrowLeft') ? 1 : 0) - (keys.has('KeyD') || keys.has('ArrowRight') ? 1 : 0);
  const fwd = (keys.has('KeyW') || keys.has('ArrowUp') ? 1 : 0) - (keys.has('KeyS') || keys.has('ArrowDown') ? 1 : 0);
  const running = keys.has('ShiftLeft') || keys.has('ShiftRight');
  game.heading += turn * TURN * dt;
  const speed = fwd > 0 ? (running ? RUN : WALK) : fwd < 0 ? -WALK * 0.6 : 0;
  if (speed) {
    const p = player.position;
    const dx = Math.sin(game.heading) * speed * dt, dz = Math.cos(game.heading) * speed * dt;
    const inMap = (x, z) => x > edge.min.x && x < edge.max.x && z > edge.min.z && z < edge.max.z;
    const free = (x, z) => inMap(x, z) && !blocked(x, z);
    if (free(p.x + dx, p.z + dz)) { p.x += dx; p.z += dz; }
    else if (free(p.x + dx, p.z)) p.x += dx;          // slide along walls
    else if (free(p.x, p.z + dz)) p.z += dz;
    p.y = groundY(p.x, p.z);
  }
  player.rotation.y = game.heading;
  playerAnim.locomotion(Math.abs(speed));

  // --- candy ---
  for (const d of doors) {
    if (d.collected) continue;
    if (Math.hypot(d.x - player.position.x, d.z - player.position.z) < COLLECT_RADIUS) {
      d.collected = true; d.marker.visible = false; d.lamp.intensity = 1.5;
      game.candy++;
    }
  }

  // --- ghost: straight at the player, through walls, faster as time passes ---
  const gs = GHOST_SLOW + (GHOST_FAST - GHOST_SLOW) * Math.min(1, game.elapsed / TIME_LIMIT);
  const gx = player.position.x - ghost.position.x, gz = player.position.z - ghost.position.z, gd = Math.hypot(gx, gz) || 1;
  ghost.position.x += (gx / gd) * gs * dt;
  ghost.position.z += (gz / gd) * gs * dt;
  ghost.rotation.y = Math.atan2(gx, gz);
  game.safe = Math.max(0, game.safe - dt);
  if (gd < TOUCH_RADIUS && game.safe === 0) {
    game.hearts--;
    game.safe = 1.5;
    const [fx, fz] = farSideFrom(player.position.x, player.position.z);
    ghost.position.set(fx, 0, fz);
    $('hit').style.transition = 'none'; $('hit').style.opacity = 1;
    requestAnimationFrame(() => { $('hit').style.transition = 'opacity .6s'; $('hit').style.opacity = 0; });
  }

  // --- clock and endings ---
  game.elapsed += dt;
  game.time = Math.max(0, game.time - dt);
  drawHud();
  if (game.candy === doors.length) finish(true);
  else if (game.hearts <= 0) finish(false, 'The ghost got you.');
  else if (game.time === 0) finish(false, 'Time ran out.');
}

const clock = new THREE.Clock();
function frame() {
  const dt = Math.min(clock.getDelta(), 0.05), t = clock.elapsedTime;
  if (game.state === 'playing') update(dt);

  // things that move in every state
  ghost.position.y = groundY(ghost.position.x, ghost.position.z) + 0.35 + Math.sin(t * 2.2) * 0.18;
  for (const d of doors) if (!d.collected) { d.gem.rotation.y = t * 2.5; d.gem.position.y = 2.9 + Math.sin(t * 3 + d.x) * 0.15; }
  playerAnim.update(dt);
  for (const a of idlers) a.update(dt);
  place.tick(t);

  camPos.lerp(cameraGoal(), 1 - Math.exp(-6 * dt));
  camera.position.copy(camPos);
  camera.lookAt(camTarget);
  look.update();
  renderer.render(scene, camera);
  requestAnimationFrame(frame);
}

reset();
$('go').innerHTML = 'Press <kbd>Enter</kbd> to start';
window.__game = { game, player, ghost, doors, place, keys, start, update, blocked, finish };   // for testing from the console
frame();
