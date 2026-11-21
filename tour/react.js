// How the world answers the train: the horn at a crossing, the red signal, the cattle on the line, the top-speed
// stretch, and the guard who brakes for the last two. Pure, no three.js. Fed the front's leg-s every frame, it returns
// each reaction's state for its actor, plus what the HUD shows and how far ahead the train has to stop.
//
// def = EventDef with a `react`: { kind: 'crossing'|'signal'|'cattle'|'speed', at?: { out, back }, s0?, s1? }
import { aheadOf } from './events.js';

const DT_MAX = 0.1;
const FAR = 800;            // a reaction forgets the train once it is this far from its place
const MOVING = 1, STOPPED = 0.05;

const CROSSING = { gatesPerSec: 0.5, closeBehind: 350, hornFrom: 80, hornTo: 400 };
const SIGNAL = { arm: 700, standNear: 200, standSecs: 3, gap: 12 };
const CATTLE = { arm: 700, hornTo: 500, standNear: 120, standSecs: 4, clearSecs: 5, stillThere: 0.6, gap: 20 };

// true once the guard has to be braking to stop `brakeTo` metres short at speed v (with a margin: 80% of the brake)
export const mustBrake = (brakeTo, v, spec) => v > STOPPED && brakeTo <= (v * v) / (2 * 0.8 * spec.brake) + v * 0.5;

const fresh = {
  crossing: () => ({ gates: 0, heard: false }),
  signal: () => ({ aspect: 'red', t: 0, armed: false, stopT: 0 }),
  cattle: () => ({ on: true, leaving: 0, armed: false, stopT: 0 }),
  speed: () => ({ inside: false, topKmh: 0 }),
};
const publicState = {
  crossing: (s) => ({ gates: s.gates, heard: s.heard }),
  signal: (s) => ({ aspect: s.aspect, t: s.t }),
  cattle: (s) => ({ on: s.on, leaving: s.leaving }),
  speed: (s) => ({ inside: s.inside, topKmh: s.topKmh }),
};

// defs: the EventDefs (with a react) running this way; `length` the train's length; `spec` (optional) its brakes, for
// the guard's message
export function makeReactions(defs, dir, { length, spec = { brake: 1 } }) {
  const st = new Map(defs.map((e) => [e.id, fresh[e.react.kind]()]));

  function step({ legS, v, dt, horn, have }) {
    dt = Math.min(Math.max(dt, 0), DT_MAX);
    const out = { brakeTo: null, prompt: null, toast: null, message: null, states: new Map() };
    const brake = (to) => { out.brakeTo = out.brakeTo === null ? to : Math.min(out.brakeTo, to); };
    const toast = (t) => { out.toast ??= t; };
    const prompt = (t) => { out.prompt ??= t; };
    const stopping = (to) => Math.abs(v) < STOPPED || mustBrake(to, v, spec);

    for (const e of defs) {
      if (!have(e.id)) continue;
      const r = e.react, s = st.get(e.id);
      const at = r.at?.[dir];
      const d = at === undefined ? 0 : aheadOf(legS, at, dir);
      const far = r.kind === 'speed' ? legS < r.s0 - FAR || legS > r.s1 + FAR : Math.abs(d) > FAR;
      if (far) { st.set(e.id, fresh[r.kind]()); out.states.set(e.id, publicState[r.kind](st.get(e.id))); continue; }
      const still = Math.abs(v) < STOPPED, moving = Math.abs(v) > MOVING;

      if (r.kind === 'crossing') {
        const target = d >= -length && d <= CROSSING.closeBehind ? 1 : 0;
        const dg = CROSSING.gatesPerSec * dt;
        s.gates = target > s.gates ? Math.min(target, s.gates + dg) : Math.max(target, s.gates - dg);
        const inHorn = d >= CROSSING.hornFrom && d <= CROSSING.hornTo;
        if (horn && inHorn && !s.heard) { s.heard = true; toast('Heard at the crossing'); }
        if (inHorn && !s.heard) prompt('Level crossing ahead: sound the horn (H)');
      } else if (r.kind === 'signal') {
        if (!s.armed && moving && d >= 0 && d <= SIGNAL.arm) s.armed = true;
        if (s.armed) s.t += dt;
        if (s.aspect === 'red') {
          if (d < 0) { s.aspect = 'green'; toast('The signal is green'); }
          else if (s.armed && still && d <= SIGNAL.standNear) {
            s.stopT += dt;
            if (s.stopT >= SIGNAL.standSecs) { s.aspect = 'green'; toast('The signal is green'); }
          } else s.stopT = 0;
        }
        if (s.aspect === 'red' && s.armed && d >= 0) {
          brake(d - SIGNAL.gap);
          if (stopping(d - SIGNAL.gap)) out.message ??= 'Red signal: a work train is clearing the viaduct';
        }
      } else if (r.kind === 'cattle') {
        if (!s.armed && moving && d >= 0 && d <= CATTLE.arm) s.armed = true;
        if (s.on) {
          if (s.armed && still && d >= 0 && d <= CATTLE.standNear) s.stopT += dt; else s.stopT = 0;
          if ((horn && d >= 0 && d <= CATTLE.hornTo) || s.stopT >= CATTLE.standSecs || d < 0) s.on = false;
        }
        if (!s.on) s.leaving = d < 0 ? 1 : Math.min(1, s.leaving + dt / CATTLE.clearSecs);
        if (s.on && d <= CATTLE.hornTo) prompt('Cattle on the line: sound the horn (H)');
        if (s.armed && (s.on || s.leaving < CATTLE.stillThere) && d >= 0) {
          brake(d - CATTLE.gap);
          if (stopping(d - CATTLE.gap)) out.message ??= 'Cattle on the line: the train stops for them';
        }
      } else if (r.kind === 'speed') {
        const inside = legS >= r.s0 && legS <= r.s1;
        if (inside) s.topKmh = Math.max(s.topKmh, Math.abs(v) * 3.6);
        else if (s.inside) toast(`Top speed on the high-speed stretch: ${Math.round(s.topKmh)} km/h`);
        s.inside = inside;
      }
      out.states.set(e.id, publicState[r.kind](s));
    }
    return out;
  }
  return { step };
}
