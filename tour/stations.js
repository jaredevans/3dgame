// A terminus at one end of a leg: both lines end at buffer stops, each with a platform on its outer side; the station
// building, canopy, lamps, benches and running-in board stand on the outbound line's platform.
// Countryside Railway parts are drawn relative to the track centre line, running +z, on the LEFT (+x) of it, with the
// formation level at their y = 0: so they go on the line, turned to the side they belong on.
import * as THREE from 'three';
import { KITS } from './config.js';
import { part } from './parts.js';
import { laneFor } from './world-data.js';

export const BUFFER_GAP = 1.5;   // metres from the line's end to a buffer face
export const STOP_SHORT = 12;    // the stopping point is this far short of the buffers
export const PLATFORM_TOP = 1.175;
const PIECE = 4;

// where a piece goes: `s` is the piece's start along the route, `side` +1 left of the lane, -1 right of it
function place(obj, route, s, lane, side, along = 0, y = 0) {
  const p = route.offsetAt(side > 0 ? s : s + PIECE, lane);
  obj.position.set(p.x, p.y + y, p.z);
  obj.rotation.y = side > 0 ? p.yaw : p.yaw + Math.PI;
  if (along) obj.translateZ(along);
  return obj;
}

// end: 'start' or 'end' of the route. Returns the platform each lane's train uses, in this route's s.
export async function buildTerminus(route, end, { name = '', colorway = 'red-brick' } = {}) {
  const group = new THREE.Group();
  group.name = `terminus ${name}`;
  const L = route.length, atEnd = end === 'end';
  const buffersS = atEnd ? L : 0;
  // platform runs over the 120 m nearest the buffers
  const p0 = atEnd ? L - BUFFER_GAP - 120 : BUFFER_GAP, p1 = p0 + 120;
  const lanes = { out: laneFor('out'), back: laneFor('back') };
  const sides = { out: -1, back: +1 };   // outer side of each line: right of the outbound, left of the return
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
  // the station building and canopy, on the outbound platform at the buffer end
  const out = lanes.out, side = sides.out;
  const building = await parts('station-building', { colorway, hallLength: 14, canopy: false, houseStoreys: 2 });
  place(building, route, atEnd ? p1 - 18 : p0 + 2, out, side);
  group.add(building);
  for (let k = 0; k < 8; k++) group.add(place(tmpl.canopy.clone(), route, atEnd ? p1 - 4 * (k + 1) - 18 : p0 + 18 + 4 * k, out, side));
  for (const s of [atEnd ? p0 + 30 : p1 - 30, atEnd ? p1 - 50 : p0 + 50]) {
    const board = await parts('running-in-board', { colorway: 'cream', length: 4 });
    const q = route.offsetAt(s, out + side * 5.2);
    board.position.set(q.x, q.y + PLATFORM_TOP, q.z);
    board.rotation.y = q.yaw + Math.PI / 2;
    group.add(board);
  }
  group.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });

  // what a stopped train needs: the platform window and the stopping point, in this route's s
  const stopS = atEnd ? L - BUFFER_GAP - STOP_SHORT : BUFFER_GAP + STOP_SHORT;
  return { group, platform: { sFrom: p0, sTo: p1, stopS }, buffersS };
}
