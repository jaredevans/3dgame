// A terminus at one end of a leg: both lines end at buffer stops, each with a platform on its outer side; the station
// building, canopy and running-in boards stand on the town-side line's platform (the leg's side: left of its direction
// for side +1, right for side -1), where its trains come and go both ways.
// Countryside Railway parts are drawn relative to the track centre line, running +z, on the LEFT (+x) of it, with the
// formation level at their y = 0: so they go on the line, turned to the side they belong on.
import * as THREE from 'three';
import { KITS } from './config.js';
import { part } from './parts.js';
import { legRoute, laneOf, platformWindow, BUFFER_GAP, STOP_SHORT } from './world-data.js';
import { stationWalk, PLATFORM_TOP } from './station-walk.js';
import { STATION_STYLES } from './station-style.js';

export { BUFFER_GAP, STOP_SHORT, PLATFORM_TOP };   // the buffer gap and stopping point (world-data holds them), the platform top
const PIECE = 4;

// where a piece goes: `s` is the piece's start along the route, `side` +1 left of the lane, -1 right of it (turned
// round). `extent` is the piece's own z range: a turned piece is anchored so it still covers s .. s + its length.
function place(obj, route, s, lane, side, extent = [0, PIECE]) {
  const p = route.offsetAt(side > 0 ? s : s + extent[0] + extent[1], lane);
  obj.position.set(p.x, p.y, p.z);
  obj.rotation.y = side > 0 ? p.yaw : p.yaw + Math.PI;
  return obj;
}

// ---- the sign to the departures, on an arrival platform (either style) ----
// A 2.4 x 1 m board, white text on deep green, on two posts 2.2 m high: standing across the platform's town (outer)
// half, 6 m from its open (ramp) end, facing along it. Made in code, its canvas texture once per sign, here at build.
export const SIGN = { w: 2.4, h: 1, posts: 2.2, post: 0.05, depth: 0.06, fromOpenEnd: 6, across: 6.6 };   // across the line's centre
const SIGN_GREEN = '#0d4f33', SIGN_PX = 1024;
const signPosts = new THREE.MeshStandardMaterial({ color: '#1f3a2b', roughness: 0.75, metalness: 0.2, flatShading: true });
const signEdge = new THREE.MeshStandardMaterial({ color: SIGN_GREEN, roughness: 0.8 });

function signTexture(text) {
  const c = document.createElement('canvas'), W = SIGN_PX, H = Math.round(SIGN_PX * SIGN.h / SIGN.w);
  c.width = W; c.height = H;
  const g = c.getContext('2d');
  g.fillStyle = SIGN_GREEN; g.fillRect(0, 0, W, H);
  g.strokeStyle = '#ffffff'; g.lineWidth = 10; g.strokeRect(22, 22, W - 44, H - 44);
  g.fillStyle = '#ffffff'; g.textAlign = 'center'; g.textBaseline = 'middle';
  // the largest size the words fit at, wrapped onto at most three lines inside the border, a new line after a colon
  const font = (px) => `600 ${px}px "Avenir Next", "Trebuchet MS", system-ui, sans-serif`, maxW = W - 120, maxH = H - 100;
  const wrap = (px) => {
    g.font = font(px);
    const lines = [];
    for (const para of text.split(/(?<=:)\s+/)) {
      let open = false;
      for (const word of para.split(/\s+/)) {
        const line = open ? `${lines[lines.length - 1]} ${word}` : word;
        if (open && g.measureText(line).width <= maxW) lines[lines.length - 1] = line; else lines.push(word);
        open = true;
      }
    }
    return lines;
  };
  let px = 110, lines = wrap(px);
  while (px > 30 && (lines.length > 3 || lines.length * px * 1.2 > maxH || lines.some((l) => g.measureText(l).width > maxW))) lines = wrap(px -= 4);
  lines.forEach((l, i) => g.fillText(l, W / 2, H / 2 + (i - (lines.length - 1) / 2) * px * 1.2));
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

// where the sign stands along the line, 6 m in from the platform's open end (its buffers are at the other)
const signS = (end, p0, p1) => (end === 'end' ? p0 + SIGN.fromOpenEnd : p1 - SIGN.fromOpenEnd);
// a platform lamp this near the sign would stand in front of its face: it's left out
const besideSign = (s, end, p0, p1) => Math.abs(s - signS(end, p0, p1)) < 4;
// the sign at the arrival platform of `lane` (the town-side line), at a terminus at `end` of `route`, its platform p0..p1;
// returns it and its footprint (posts and board, one solid: you can't walk between its posts under the board)
function signToDepartures(route, end, lane, [p0, p1], text) {
  const side = Math.sign(lane), s = signS(end, p0, p1);
  const sign = signBoard(text);
  sign.name = 'departure sign';
  // turned with the line: its +z (the board's face) along the platform, its width across it
  const q = route.offsetAt(s, lane + side * (SIGN.across - Math.abs(lane)));
  sign.position.set(q.x, q.y + PLATFORM_TOP, q.z);
  sign.rotation.y = q.yaw;
  sign.updateMatrixWorld(true);
  const hw = SIGN.w / 2, z0 = -SIGN.depth / 2 - 2 * SIGN.post, z1 = SIGN.depth / 2;
  const corners = [[-hw, z0], [hw, z0], [hw, z1], [-hw, z1]]
    .map(([x, z]) => { const v = new THREE.Vector3(x, 0, z).applyMatrix4(sign.matrixWorld); return [v.x, v.z]; });
  return { sign, solid: { key: 'departure-sign', corners } };
}
// the board on its two posts, standing on its own origin, its face to +z (and -z): the departure signs' and the
// walkways' (walkways.js)
export function signBoard(text) {
  const sign = new THREE.Group();
  const map = signTexture(text);
  // lit a little by its own face, so it reads at night as well (the Futuristic place is reached after dark)
  const face = new THREE.MeshStandardMaterial({ map, emissive: '#ffffff', emissiveMap: map, emissiveIntensity: 0.3, roughness: 0.8 });
  // a thin box with the board's face on both its ends (+z, -z): it reads the right way round from either side
  const board = new THREE.Mesh(new THREE.BoxGeometry(SIGN.w, SIGN.h, SIGN.depth), [signEdge, signEdge, signEdge, signEdge, face, face]);
  board.position.y = SIGN.posts - SIGN.h / 2;
  sign.add(board);
  for (const x of [-1, 1]) {
    const post = new THREE.Mesh(new THREE.CylinderGeometry(SIGN.post, SIGN.post, SIGN.posts, 8), signPosts);
    post.position.set(x * (SIGN.w / 2 - SIGN.post), SIGN.posts / 2, -SIGN.depth / 2 - SIGN.post);   // behind the board
    sign.add(post);
  }
  return sign;
}

// leg: the leg id; end: 'start' or 'end' of it; style: its place's station style (station-style.js); sign: the text of
// the sign to the departures on its platform (an arrival station's), or null. Returns the platform its trains use there,
// in the leg's s, its walk frame, and (a kit style) the parts its place's kit lights after dark:
// { group, platform, buffersS, walk, lit: [[object, part key]] }.
export async function buildTerminus(leg, end, { name = '', colorway = 'red-brick', platformLength = 120, style = 'countryside', sign = null } = {}) {
  if (style === 'future') return futureTerminus(leg, end, { name, platformLength, sign });
  const route = legRoute(leg);
  const group = new THREE.Group();
  group.name = `terminus ${name}`;
  const L = route.length, atEnd = end === 'end';
  const buffersS = atEnd ? L : 0;
  // the platform runs over the stretch nearest the buffers
  const { sFrom: p0, sTo: p1, stopS } = platformWindow(L, end, platformLength);
  // the town-side line (the leg's trains, both ways) and the other one; each platform is on its line's outer side
  const lanes = { town: laneOf(leg), other: -laneOf(leg) };
  const sides = { town: Math.sign(lanes.town), other: Math.sign(lanes.other) };
  const parts = (key, params) => part(KITS.railway, key, params);

  const tmpl = {
    straight: await parts('platform-run', { piece: 'straight', colorway, backWall: false }),
    end: await parts('platform-run', { piece: 'end', colorway, backWall: false }),
    ramp: await parts('platform-run', { piece: 'ramp', colorway, backWall: false }),
    canopy: await parts('platform-canopy-run', { piece: 'straight', colorway: 'cream-brown' }),
    lamp: await parts('station-lamp-post', { post: 'cast-iron', colorway: 'station-green' }),
    bench: await parts('station-bench', { colorway: 'green-cream' }),
    buffer: await parts('buffer-stop', { colorway: 'signal-red' }),
  };
  for (const [lane, l] of Object.entries(lanes)) {
    const side = sides[lane];
    for (let s = p0; s < p1 - 0.01; s += PIECE) {
      const nearBuffers = atEnd ? s + PIECE >= p1 - 0.01 : s <= p0 + 0.01;
      const open = atEnd ? s <= p0 + 0.01 : s + PIECE >= p1 - 0.01;
      group.add(place((open ? tmpl.ramp : nearBuffers ? tmpl.end : tmpl.straight).clone(), route, s, l, side));
    }
    // the buffer stop: a 4 m piece of track ending at the line's end
    group.add(atEnd ? place(tmpl.buffer.clone(), route, L - PIECE, l, 1) : place(tmpl.buffer.clone(), route, 0, l, -1));
    // lamps and benches along the platform
    for (let s = p0 + 8; s < p1 - 4; s += 16) {
      if (!(sign && lane === 'town' && besideSign(s, end, p0, p1))) {
        const lamp = tmpl.lamp.clone();
        const q = route.offsetAt(s, l + side * 4.9);
        lamp.position.set(q.x, q.y + PLATFORM_TOP, q.z);
        group.add(lamp);
      }
      if ((s - p0) % 32 === 24) {
        const bench = tmpl.bench.clone();
        const r = route.offsetAt(s + 4, l + side * 4.4);
        bench.position.set(r.x, r.y + PLATFORM_TOP, r.z);
        bench.rotation.y = r.yaw + (side > 0 ? -Math.PI / 2 : Math.PI / 2);
        group.add(bench);
      }
    }
  }
  // the station building and canopy, on the town-side platform at the buffer end
  const town = lanes.town, side = sides.town;
  const building = await parts('station-building', { colorway, hallLength: 14, canopy: false, houseStoreys: 2 });
  const bb = new THREE.Box3().setFromObject(building);
  place(building, route, atEnd ? p1 - 18 : p0 + 2, town, side, [bb.min.z, bb.max.z]);
  group.add(building);
  for (let k = 0; k < 8; k++) group.add(place(tmpl.canopy.clone(), route, atEnd ? p1 - 4 * (k + 1) - 18 : p0 + 18 + 4 * k, town, side));
  for (const s of [atEnd ? p0 + 30 : p1 - 30, atEnd ? p1 - 50 : p0 + 50]) {
    const board = await parts('running-in-board', { colorway: 'cream', length: 4 });
    const q = route.offsetAt(s, town + side * 5.2);
    board.position.set(q.x, q.y + PLATFORM_TOP, q.z);
    board.rotation.y = q.yaw + side * Math.PI / 2;   // as on the left, turned round for the right
    group.add(board);
  }
  const departures = sign ? signToDepartures(route, end, town, [p0, p1], sign) : null;
  if (departures) group.add(departures.sign);
  group.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });

  // for walking: solid things (not the platforms and canopies you walk on and under), and the station's own frame
  group.updateMatrixWorld(true);
  const solid = departures ? [departures.solid] : [];
  for (const o of group.children) {
    const key = o.userData.partKey;
    if (!key || /platform-run|canopy|buffer-stop/.test(key)) continue;   // buffers stand in the track zone, already out of bounds
    solid.push({ key, box: new THREE.Box3().setFromObject(o) });
  }
  const walk = stationWalk(leg, end, { platformLength, solid });
  return { group, platform: { sFrom: p0, sTo: p1, stopS }, buffersS, walk, lit: [] };
}

// ---- the Futuristic terminus, from the Chrome Arcology kit (station-style.js future) ----
// Its parts are measured (station-style.js): the transit-station-module's deck is 4 m up on its piers, its 'side' layout
// open to +z, 16 x 8 m at 4 bays; the plaza stair rises 4 m over 8 m to its -z end; the shelter is 4 x 1.8 m; the arc
// lamp's arm reaches out along +z. A part turned by the line's yaw has its +z along the line and its +x to the left.
const FUT = {
  slab: '#e8ecf2', face: '#9aa8b8', end: '#f4f7fa', endTrim: '#7b8a9c',
  glow: new THREE.MeshStandardMaterial({ color: '#7fe7da', emissive: '#7fe7da', emissiveIntensity: 0.9, roughness: 0.4 }),
  red: new THREE.MeshStandardMaterial({ color: '#ff5a4a', emissive: '#ff3020', emissiveIntensity: 1.4 }),
};
const flat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.6, metalness: 0.05, flatShading: true });
const PLATFORM_IN = 1.6, PLATFORM_OUTER = 6;   // a platform from this far off its line's lane to this far (as the kit's run)

// a strip along the route from s0 to s1, at each s a cross-section [[lateral, height above the formation], ...], one
// colour per segment (faces turned out from `inside`, a lateral and height inside the strip)
function strip(route, s0, s1, section, colours, inside) {
  const pos = [], col = [], c = new THREE.Color(), p = {}, n = Math.max(1, Math.ceil((s1 - s0) / 2));
  const ring = (s) => section.map(([d, h]) => { route.offsetAt(s, d, p); return new THREE.Vector3(p.x, p.y + h, p.z); });
  const centre = (s) => { route.offsetAt(s, inside[0], p); return new THREE.Vector3(p.x, p.y + inside[1], p.z); };
  const tri = (a, b, d, o, colour) => {
    const nrm = new THREE.Vector3().subVectors(b, a).cross(new THREE.Vector3().subVectors(d, a));
    if (nrm.dot(new THREE.Vector3().subVectors(a, o)) < 0) [b, d] = [d, b];
    c.set(colour);
    for (const v of [a, b, d]) { pos.push(v.x, v.y, v.z); col.push(c.r, c.g, c.b); }
  };
  let prev = ring(s0);
  const cap = (r, o, dir) => { for (let k = 1; k < r.length - 1; k++) tri(r[0], r[k], r[k + 1], o.clone().addScaledVector(dir, -1), colours[0]); };
  const fwd = (s) => { const q = route.at(s); return new THREE.Vector3(Math.sin(q.yaw), 0, Math.cos(q.yaw)); };
  cap(prev, prev[0], fwd(s0).negate());
  for (let i = 1; i <= n; i++) {
    const s = s0 + (s1 - s0) * i / n, cur = ring(s), o = centre((s + s0 + (s1 - s0) * (i - 1) / n) / 2);
    for (let k = 0; k < cur.length - 1; k++) { tri(prev[k], prev[k + 1], cur[k + 1], o, colours[k]); tri(prev[k], cur[k + 1], cur[k], o, colours[k]); }
    prev = cur;
  }
  cap(prev, prev[0], fwd(s1));
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.computeVertexNormals();
  return g;
}

async function futureTerminus(leg, end, { name, platformLength, sign }) {
  const S = STATION_STYLES.future, route = legRoute(leg), group = new THREE.Group();
  group.name = `terminus ${name}`;
  const L = route.length, atEnd = end === 'end', buffersS = atEnd ? L : 0, toward = atEnd ? 1 : -1;
  const { sFrom: p0, sTo: p1, stopS } = platformWindow(L, end, platformLength);
  const lanes = { town: laneOf(leg), other: -laneOf(leg) };
  const kit = (key, params) => part(S.kit, key, params);
  const lit = [], solid = [];
  // a kit part at s, `across` metres left of the line's centre, `up` above the formation, turned `turn` from the line's
  // yaw; solid ones are walked round (their own footprint, square to the line)
  async function put(key, params, s, across, up, turn, { solid: isSolid = true } = {}) {
    const obj = await kit(key, params);
    const box = new THREE.Box3().setFromObject(obj);   // its own frame, unturned
    const p = route.offsetAt(s, across);
    obj.position.set(p.x, p.y + up, p.z);
    obj.rotation.y = p.yaw + turn;
    obj.updateMatrixWorld(true);
    group.add(obj);
    lit.push([obj, key]);
    if (isSolid) {
      const corners = [[box.min.x, box.min.z], [box.max.x, box.min.z], [box.max.x, box.max.z], [box.min.x, box.max.z]]
        .map(([x, z]) => { const v = new THREE.Vector3(x, 0, z).applyMatrix4(obj.matrixWorld); return [v.x, v.z]; });
      solid.push({ key, corners });
    }
    return obj;
  }
  const facing = (side) => -side * Math.PI / 2;   // a part's +z turned towards the line, from a platform on `side`

  // the platforms: clean white slabs, a lit mint strip along each edge
  for (const lane of Object.values(lanes)) {
    const side = Math.sign(lane), a = lane + side * PLATFORM_IN, b = lane + side * PLATFORM_OUTER;
    const slab = new THREE.Mesh(strip(route, p0, p1, [[a, -0.06], [a, PLATFORM_TOP], [b, PLATFORM_TOP], [b, -0.06]],
      [FUT.face, FUT.slab, FUT.face], [(a + b) / 2, PLATFORM_TOP / 2]), flat);
    slab.name = 'platform';
    const edge = new THREE.Mesh(strip(route, p0 + 0.5, p1 - 0.5, [[a + side * 0.12, PLATFORM_TOP], [a + side * 0.12, PLATFORM_TOP + 0.01], [a + side * 0.3, PLATFORM_TOP + 0.01], [a + side * 0.3, PLATFORM_TOP]],
      ['#7fe7da', '#7fe7da', '#7fe7da'], [a + side * 0.21, PLATFORM_TOP]), FUT.glow);
    edge.name = 'platform edge';
    group.add(slab, edge);
    // the buffers: a white end block across the line, a lit band on its face and two red lamps
    const sEnd = atEnd ? L - BUFFER_GAP / 2 : BUFFER_GAP / 2, q = route.offsetAt(sEnd, lane);
    const block = new THREE.Group();
    block.add(new THREE.Mesh(new THREE.BoxGeometry(3.2, 1.3, BUFFER_GAP), new THREE.MeshStandardMaterial({ color: FUT.end, roughness: 0.5 })));
    block.children[0].position.y = 0.65;
    const cap = new THREE.Mesh(new THREE.BoxGeometry(3.3, 0.12, BUFFER_GAP + 0.1), new THREE.MeshStandardMaterial({ color: FUT.endTrim, roughness: 0.5 }));
    cap.position.y = 1.36;
    const band = new THREE.Mesh(new THREE.BoxGeometry(2.6, 0.14, 0.04), FUT.glow);
    band.position.set(0, 0.95, -toward * (BUFFER_GAP / 2 + 0.02));
    block.add(cap, band);
    for (const x of [-1.1, 1.1]) { const l = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 0.05, 12).rotateX(Math.PI / 2), FUT.red); l.position.set(x, 0.55, -toward * (BUFFER_GAP / 2 + 0.03)); block.add(l); }
    block.position.set(q.x, q.y, q.z);
    block.rotation.y = q.yaw;
    block.name = 'end block';
    group.add(block);
    // along each platform: arc lamps at its back, their arms out over it; capsule benches between them; shelters on the
    // town side's
    for (let s = p0 + 8; s < p1 - 4; s += 16) {
      if (!(sign && lane === lanes.town && besideSign(s, end, p0, p1))) await put('arc-street-lamp', { colorway: 'arc-cyan' }, s, lane + side * 5.3, PLATFORM_TOP, facing(side));
      if ((s - p0) % 32 === 24) await put('floating-capsule-bench', { colorway: 'arc-white', length: '3.0', backrest: true }, s + 6, lane + side * 4.9, PLATFORM_TOP, facing(side));
    }
  }
  // the concourse beside the town-side platform's buffer end, and its stair up from the town, in the style's footprint
  const town = lanes.town, ts = Math.sign(town), B = S.building, across = ts * (B.near + B.far) / 2;
  const span = atEnd ? [p1 + B.end[0], p1 + B.end[1]] : [p0 - B.start[1], p0 - B.start[0]];   // its stretch, in s
  const moduleAt = atEnd ? span[1] - S.module.length / 2 : span[0] + S.module.length / 2;
  const stairAt = atEnd ? span[0] + S.stairRun / 2 : span[1] - S.stairRun / 2;
  await put(S.parts.building, { colorway: 'transit-blue', layout: 'side', canopy: 'enclosed', bays: 4 }, moduleAt, across, -0.05, facing(ts));
  await put(S.parts.stair, { colorway: 'arcology-white' }, stairAt, across, -0.05, atEnd ? Math.PI : 0);
  // shelters along the town-side platform's back half, from the concourse towards the open end
  for (let k = 0; k < 6; k++) {
    const s = atEnd ? span[0] - 4 - 4.2 * k : span[1] + 4 + 4.2 * k;
    await put(S.parts.canopy, { colorway: 'arcology-mint', endScreens: k === 0 || k === 5 }, s, town + ts * 4.9, PLATFORM_TOP, facing(ts), { solid: false });
  }
  // two signs on the town-side platform, where the running-in boards would be
  for (const s of [atEnd ? p0 + 30 : p1 - 30, atEnd ? p1 - 58 : p0 + 58]) await put(S.parts.sign, { colorway: 'transit-cyan', height: 3 }, s, town + ts * 5.6, PLATFORM_TOP, facing(ts));
  if (sign) { const d = signToDepartures(route, end, town, [p0, p1], sign); group.add(d.sign); solid.push(d.solid); }
  group.traverse((o) => { if (o.isMesh) { o.castShadow = o.material !== FUT.glow && o.material !== FUT.red; o.receiveShadow = true; } });
  group.updateMatrixWorld(true);
  const walk = stationWalk(leg, end, { platformLength, solid });
  return { group, platform: { sFrom: p0, sTo: p1, stopS }, buffersS, walk, lit };
}
