// The Canyon Express's leg (mountain-west): a handcar coming the other way on the other line (owner, 2026-11-22), the
// railway kit's handcar with two platelayers on it, facing each other across its pump beam and working it up and down
// between them, its wheels turning with its way. Set off when its window starts so it passes the train about the
// window's middle (paths.js bulletStep, as the coast's freight: it waits, unseen, at the line's end if you're slow);
// hidden once it's well behind you.
import * as THREE from 'three';
import { laneOf } from '../world-data.js';
import { reverseRoute } from '../route.js';
import { sound } from '../audio.js';
import { bulletStep, PLATFORM } from './paths.js';
import { crewFigure } from '../rides/crew.js';

export const HANDCAR = { speed: 5.5, near: 40, behind: 300, length: 2.8, deck: 1.09, stand: 1.05, pump: 1.1, swing: 0.32, wheel: 0.31 };
const MEN = [{ z: HANDCAR.stand, turn: Math.PI, colorway: 'platelayer' }, { z: -HANDCAR.stand, turn: 0, colorway: 'moleskin' }];

async function buildHandcar({ leg, route, def, slicer, kit }) {
  const group = new THREE.Group();
  group.name = `handcar ${leg}`;
  await slicer.frame();
  const car = await kit('railway', 'handcar', { colorway: 'red-wheels', wear: 0.4 });
  car.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  const holder = new THREE.Group();
  holder.name = 'handcar';
  holder.add(car);
  holder.visible = false;
  group.add(holder);
  const beam = car.getObjectByName('beam'), wheels = ['wheel-1', 'wheel-2'].map((n) => car.getObjectByName(n)).filter(Boolean);
  // the two men, standing on its deck at either end of the beam, facing in (optional: it runs on without them)
  const men = [];
  for (const m of MEN) {
    await slicer.frame();
    const man = await crewFigure({ kit, warn: (what, err) => console.warn(`The handcar's ${what} was left out: ${err?.message ?? err}`) },
      { kitKey: 'railway', key: 'platelayer', params: { hammer: false, key: false, colorway: m.colorway }, clip: 'Idle', name: 'handcar man', what: 'man' });
    if (!man) continue;
    man.figure.position.set(0, HANDCAR.deck, m.z);
    man.figure.rotation.y = m.turn;
    holder.add(man.figure);
    men.push({ ...m, ...man });
  }
  const L = route.length, rev = reverseRoute(route), lane = laneOf(leg), meet = (def.s0 + def.s1) / 2;
  const half = HANDCAR.length / 2;
  const bounds = { out: { lo: PLATFORM, hi: L - PLATFORM - HANDCAR.length }, back: { lo: PLATFORM + HANDCAR.length, hi: L - PLATFORM } };
  const how = { speed: HANDCAR.speed, near: HANDCAR.near, behind: HANDCAR.behind };
  const P = {};
  let st = null, t = 0;
  const hide = () => { st = null; holder.visible = false; };
  return {
    group,
    update(f) {
      if (!f.on || f.legS === null) { hide(); return; }
      const { lo, hi } = bounds[f.dir];
      st = bulletStep(st, { legS: f.legS, v: f.train.v, dir: f.dir, dt: f.dt, meet, lo, hi, ...how });
      if (st.whoosh) sound('whoosh');
      holder.visible = st.shown;
      if (!st.shown) return;
      t += f.dt;
      // on the other line (the leg's left-hand one on an out run, coming down the leg reversed), its front at st.s
      if (f.dir === 'out') rev.offsetAt(L - st.s - half, lane, P); else route.offsetAt(st.s - half, -lane, P);
      holder.position.set(P.x, P.y, P.z);
      holder.rotation.set(-P.pitch, P.yaw, 0, 'YXZ');
      // the beam see-sawing, the men working it: each bending as his end goes down, straightening as it comes up
      const a = Math.sin(2 * Math.PI * HANDCAR.pump * t);
      if (beam) beam.rotation.x = HANDCAR.swing * a;
      for (const m of men) {
        const down = m.z > 0 ? Math.max(0, a) : Math.max(0, -a);   // (the +z end goes down as the beam turns +x)
        m.figure.position.y = HANDCAR.deck - 0.14 * down;
        m.figure.rotation.set(0.22 * down, m.turn, 0, 'YXZ');
        m.anim?.update(f.dt);
      }
      for (const w of wheels) w.rotation.x += (HANDCAR.speed * f.dt) / HANDCAR.wheel;
    },
    dispose: hide,
  };
}

export const handcar = { handcar: buildHandcar };
