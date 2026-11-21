// The level crossing (city-ocean and future-city): the Countryside Railway's level-crossing on each line at the
// crossing's `at`, a road across the line square to it, and cars waiting either side. Its booms follow the reaction's
// gates (react.js); its bell rings while they're down and the train is near; once they lift after the train, the
// cars drive over and away.
//
// The part is 12 m of road (its x) over 4 m of track (its z, the part's z = 0..4) with a barrier housing either side
// of its rails, 2.53 m out. The lines are 4 m apart, so each line's part stands with its inner housing (and boom)
// between the lines, in the other line's way: each part is clipped to its own side of the middle, and the outer two
// booms close the road, one on each approach. The two parts' ramps meet in the middle at the same height.
import * as THREE from 'three';
import { laneOf } from '../world-data.js';
import { ROAD } from '../suburbs.js';
import { sound } from '../audio.js';

const POST = 2.53;                        // a barrier housing's distance from its part's rails (the part's own measure)
const PART = { half: 6, deck: 1.4, deckY: 0.30, endY: 0.056 };   // the part's road: its half-length, deck half-width and heights
const CARS = { 'city-ocean': ['city', ['veh-compact-car', 'veh-taxi']], 'future-city': ['future', ['wheeled-city-coupe', 'wheeled-city-coupe']] };
const WAIT = [8, 14];                     // the waiting cars' distances back from the boom
const CAR_SPEED = 8;                      // m/s once the road is open
const KEEP_LEFT = 1.05;                   // a car's lane centre off the road's middle (left-hand traffic; the cars are 2 m wide)
const GATE_RATE = 0.5;                    // the booms' swing, a full one a 2 s (react.js's gatesPerSec)
const BELL_NEAR = 300;                    // the bell rings while the train's front is this near
const ROAD_COLOR = '#5d5a55';
const roadMat = new THREE.MeshStandardMaterial({ color: ROAD_COLOR, roughness: 0.95, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });

export async function buildCrossing({ leg, route, def, terrain, slicer, kit }) {
  const at = def.react.at.out;
  const P = route.at(at);
  // the crossing's frame: u across the line (+ left of the leg's out direction), v along it
  const L = new THREE.Vector3(Math.cos(P.yaw), 0, -Math.sin(P.yaw)), F = new THREE.Vector3(Math.sin(P.yaw), 0, Math.cos(P.yaw));
  const point = (u, v) => new THREE.Vector3(P.x + L.x * u + F.x * v, 0, P.z + L.z * u + F.z * v);
  const group = new THREE.Group();
  group.name = `crossing ${leg}`;

  // the crossing itself: a part on each line, turned to it, its inner housing hidden
  const lanes = [laneOf(leg), -laneOf(leg)];
  const booms = [];
  for (const lane of lanes) {
    await slicer.frame();   // a kit part can't be sliced: one a frame
    const part = await kit('railway', 'level-crossing', { barriers: 1 });
    const holder = new THREE.Group();
    const c = point(lane, 0);
    holder.position.set(c.x, P.y, c.z);
    holder.rotation.set(-P.pitch, P.yaw, 0, 'YXZ');
    part.position.z = -2;   // its 4 m of track centred on the crossing
    holder.add(part);
    group.add(holder);
    // its inner housing and boom stand between the lines: cut away (the part's own material, clipped to its side of the
    // middle; its road there lies under the other part's anyway), and the boom hidden
    part.getObjectByName(lane > 0 ? 'mount-west' : 'mount-east').visible = false;
    const side = Math.sign(lane), keep = new THREE.Plane(L.clone().multiplyScalar(side), -side * (L.x * P.x + L.z * P.z));
    part.traverse((o) => { if (o.isMesh) Object.assign(o.material, { clippingPlanes: [keep], clipShadows: true }); });
    for (const n of ['boom-west', 'boom-east']) booms.push(part.getObjectByName(n));
  }
  const outer = Math.max(...lanes) + PART.half;   // where the parts' road ends, either side
  // the road's height at u on the parts: the higher of the two (each one's deck, then its ramp down to its ends)
  const partY = (u) => Math.max(...lanes.map((lane) => {
    const x = Math.abs(u - lane);
    return x > PART.half ? -Infinity : x <= PART.deck ? PART.deckY : PART.deckY - (x - PART.deck) / (PART.half - PART.deck) * (PART.deckY - PART.endY);
  }));
  const ground = (u, v) => { const q = point(u, v); return terrain.heightAt(q.x, q.z) + 0.06; };
  // the road's surface at (u, v): on the parts, or on the land beyond them (easing down from the parts' ends over 4 m)
  const roadY = (u, v) => {
    const a = Math.abs(u);
    if (a <= outer) return P.y + partY(u);
    const end = P.y + PART.endY, w = Math.min(1, (a - outer) / 4);
    return end + (ground(u, v) - end) * w;
  };

  // the road beyond the parts: a strip on the land either side, out to ROAD.length
  {
    const pos = [], idx = [];
    for (const side of [1, -1]) {
      const base = pos.length / 3;
      const n = Math.ceil((ROAD.length - outer) / 2);
      for (let k = 0; k <= n; k++) {
        const u = side * (outer + (ROAD.length - outer) * k / n);
        for (const v of [-ROAD.width / 2, ROAD.width / 2]) {
          const q = point(u, v);
          pos.push(q.x - P.x, roadY(u, v) - P.y, q.z - P.z);
        }
        if (k) {
          const a = base + (k - 1) * 2;
          // wound so the face is up whichever side
          if (side < 0) idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3); else idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
        }
      }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setIndex(idx);
    geo.computeVertexNormals();
    const strip = new THREE.Mesh(geo, roadMat);
    strip.position.set(P.x, P.y, P.z);
    strip.name = 'crossing road';
    strip.receiveShadow = true;
    strip.userData.own = true;
    group.add(strip);
  }

  // the waiting cars: two each side, 8 m and 14 m back from the boom, keeping left, facing the line
  const [carKit, carKeys] = CARS[leg] ?? CARS['city-ocean'];
  const cars = [];
  for (const side of [1, -1]) {
    for (const [k, back] of WAIT.entries()) {
      await slicer.frame();
      const key = carKeys[side > 0 ? k : 1 - k];
      // the cars are optional: one that can't be made is left out, and the crossing works without it
      let obj;
      try { obj = await kit(carKit, key, {}); } catch (err) {
        console.warn(`The ${key} at the ${def.id} along ${leg} was left out: ${err?.url ? `could not load ${err.url}` : err?.message ?? err}`);
        continue;
      }
      obj.visible = false;
      group.add(obj);
      cars.push({ obj, side, u0: side * (Math.max(...lanes) + POST + back), v: side * KEEP_LEFT });
    }
  }
  const heading = (side) => Math.atan2(-side * L.x, -side * L.z);
  const placeCar = (c, u) => {
    const q = point(u, c.v), ahead = u - c.side * 2, behind = u + c.side * 2;
    c.obj.position.set(q.x, roadY(u, c.v), q.z);
    c.obj.rotation.set(-Math.atan2(roadY(ahead, c.v) - roadY(behind, c.v), 4), heading(c.side), 0, 'YXZ');
  };

  let phase = 'wait', closed = false, t = 0, bell = 0, shown = 0;   // shown: how far down the booms are drawn
  const centre = new THREE.Vector3(P.x, P.y, P.z);
  const setGates = (g) => { for (const b of booms) b.rotation.x = -(1 - g) * Math.PI / 2; };
  setGates(0);

  return {
    group,
    update(f) {
      if (!f.on) {   // the event's over (or you got out): booms up, the cars gone, back in place next time
        setGates(0); shown = 0;
        for (const c of cars) c.obj.visible = false;
        phase = 'wait'; closed = false; t = 0; bell = 0;
        return;
      }
      const gates = f.react?.gates ?? 0;
      // the booms swing at the gates' own pace (react.js), so gates already down when the event starts (the train set
      // off from Oceanside, 245 m short, before its window) are seen coming down
      shown = gates > shown ? Math.min(gates, shown + GATE_RATE * f.dt) : Math.max(gates, shown - GATE_RATE * f.dt);
      setGates(shown);
      if (shown > 0.5) closed = true;
      // the bell, once a second, while the booms are down and the train is near
      if (gates > 0 && f.train.front.distanceTo(centre) <= BELL_NEAR) {
        bell -= f.dt;
        if (bell <= 0) { sound('bell'); bell = 1; }
      } else bell = 0;
      if (phase === 'wait' && closed && shown === 0) { phase = 'go'; t = 0; }   // once the booms are up again
      if (phase === 'go') t += f.dt;
      for (const c of cars) {
        const u = phase === 'go' ? c.u0 - c.side * CAR_SPEED * t : c.u0;
        c.obj.visible = Math.abs(u) <= ROAD.length;
        if (c.obj.visible) placeCar(c, u);
      }
    },
    dispose() { for (const c of cars) c.obj.visible = false; },
  };
}

export const crossings = { crossing: buildCrossing };
