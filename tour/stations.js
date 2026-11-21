// A terminus at one end of a leg: both lines end at buffer stops, each with a platform on its outer side; the station
// building, canopy and running-in boards stand on the town-side line's platform (the leg's side: left of its direction
// for side +1, right for side -1), where its trains come and go both ways.
// Countryside Railway parts are drawn relative to the track centre line, running +z, on the LEFT (+x) of it, with the
// formation level at their y = 0: so they go on the line, turned to the side they belong on.
import * as THREE from 'three';
import { KITS } from './config.js';
import { part } from './parts.js';
import { legRoute, laneOf, platformWindow, BUFFER_GAP, STOP_SHORT } from './world-data.js';

export { BUFFER_GAP, STOP_SHORT };   // the buffer gap and stopping point (world-data holds them)
export const PLATFORM_TOP = 1.175;
const PIECE = 4;

// where a piece goes: `s` is the piece's start along the route, `side` +1 left of the lane, -1 right of it (turned
// round). `extent` is the piece's own z range: a turned piece is anchored so it still covers s .. s + its length.
function place(obj, route, s, lane, side, extent = [0, PIECE]) {
  const p = route.offsetAt(side > 0 ? s : s + extent[0] + extent[1], lane);
  obj.position.set(p.x, p.y, p.z);
  obj.rotation.y = side > 0 ? p.yaw : p.yaw + Math.PI;
  return obj;
}

// leg: the leg id; end: 'start' or 'end' of it. Returns the platform its trains use there, in the leg's s.
export async function buildTerminus(leg, end, { name = '', colorway = 'red-brick', platformLength = 120 } = {}) {
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
      const lamp = tmpl.lamp.clone();
      const q = route.offsetAt(s, l + side * 4.9);
      lamp.position.set(q.x, q.y + PLATFORM_TOP, q.z);
      group.add(lamp);
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
  group.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });


  // for walking: solid things (not the platforms and canopies you walk on and under), and the station's own frame
  group.updateMatrixWorld(true);
  const solid = [];
  for (const o of group.children) {
    const key = o.userData.partKey;
    if (!key || /platform-run|canopy|buffer-stop/.test(key)) continue;   // buffers stand in the track zone, already out of bounds
    solid.push({ key, box: new THREE.Box3().setFromObject(o) });
  }
  const mid = (p0 + p1) / 2, o = route.at(mid), sn = Math.sin(o.yaw), cs = Math.cos(o.yaw);
  const local = (x, z) => { const dx = x - o.x, dz = z - o.z; return { along: dx * sn + dz * cs, across: dx * cs - dz * sn }; };
  const half = (p1 - p0) / 2, lineEnd = atEnd ? L - mid : -mid;   // where the track stops, along the station
  const walk = {
    inStation(x, z) { const l = local(x, z); return Math.abs(l.along) <= half + 40 && Math.abs(l.across) <= 30; },
    onTrack(x, z) {
      const l = local(x, z);
      const pastEnd = atEnd ? l.along > lineEnd : l.along < lineEnd;
      return Math.abs(l.across) < 3.6 && !pastEnd && Math.abs(l.along) <= half + 40;
    },
    platformY(x, z) {
      const l = local(x, z), a = Math.abs(l.across);
      return a >= 3.5 && a <= 8 && Math.abs(l.along) <= half ? o.y + PLATFORM_TOP : null;
    },
    blocked(x, z, r) {
      for (const b of solid) if (x > b.box.min.x - r && x < b.box.max.x + r && z > b.box.min.z - r && z < b.box.max.z + r) return b.key;
      return null;
    },
  };
  return { group, platform: { sFrom: p0, sTo: p1, stopS }, buffersS, walk };
}
