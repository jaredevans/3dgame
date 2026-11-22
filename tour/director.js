// The director's shot planner: pure (no three.js), so Node can test it. It decides when to cut and to what; the camera
// view (cameras.js, Task 10) frames each shot.
//
// step({ dt, legS, dir, v, showpieces, started, length }) -> { shot, cut }
//   showpieces  EventDefs with a shot (and no actor) running on this run
//   started     EventDefs with a shot that began this frame (an `always` one starts when the train enters its window)
//   shot        { kind, id: string|null, at: leg-s|null, lateral, height, fov, hold }
//   lateral     metres, + left of the leg's out direction
// Leg-s grows going out and shrinks going back, so "ahead" is sign * (+1 out, -1 back).

import { aheadOf } from './events.js';

const HOLD_MIN = 5, HOLD_MAX = 8;
const EVENT_DELAY = 1.5;        // s a shot is kept at the least before an event cuts in
const LONG_HOLD = 20;           // s a portal/below showpiece shot may hold
const LEAD_TIME = 4;            // s ahead of a showpiece's window it starts to count
const GENERAL = ['trackside', 'chase', 'high-wide', 'heli'];
const STILL = 0.05, TRACKSIDE_MIN_V = 3;

// per kind: fov, height and lateral (metres; `side` = random sign, mirrored either side) used where the spec gives none
const DEFAULTS = {
  trackside: { fov: 45, height: 1.2, lateral: 0 },
  chase: { fov: 55, height: 8, lateral: 0 },
  'high-wide': { fov: 40, height: 60, lateral: 150, side: true },
  heli: { fov: 50, height: 18, lateral: 35, side: true },
  wide: { fov: 28, height: 10, lateral: 100, side: true },
  below: { fov: 50, height: 1.5, lateral: 0 },
  portal: { fov: 45, height: 2.5, lateral: 12, side: true },
  arc: { fov: 50, height: 6, lateral: 0 },
};

export function makeDirector({ rand = Math.random } = {}) {
  let cur = null, age = 0, pending = null, recent = [], general = -1;
  let win = null, entered = false;   // the window a long-hold showpiece shot lasts for

  const reset = () => { cur = null; age = 0; pending = null; recent = []; general = -1; win = null; entered = false; };

  const specFor = (kind, id, given, input) => {
    const d = DEFAULTS[kind] ?? DEFAULTS.chase;
    const side = () => (rand() < 0.5 ? -1 : 1);
    let at = given?.at ?? null;
    let lateral = given?.lateral;
    if (kind === 'trackside') {
      const sign = input.dir === 'out' ? 1 : -1;
      if (at === null) at = input.legS + sign * (Math.abs(input.v) * 3 + 40);
      if (lateral === undefined) lateral = side() * (4.5 + rand() * 3);
    }
    if (lateral === undefined) lateral = d.side ? side() * d.lateral : d.lateral;
    return { kind, id, at, lateral, height: given?.height ?? d.height, fov: given?.fov ?? d.fov, hold: 0 };
  };

  const pickShowpiece = (input) => {
    const reach = Math.abs(input.v) * LEAD_TIME;
    for (const p of input.showpieces ?? []) {
      if (!p.shot || recent.includes(p.id)) continue;
      const inside = input.legS >= p.s0 && input.legS <= p.s1;
      const edge = input.dir === 'out' ? p.s0 : p.s1;
      const ahead = aheadOf(input.legS, edge, input.dir);
      if (inside || (ahead > 0 && ahead <= reach)) return p;
    }
    return null;
  };

  const nextGeneral = (input) => {
    const still = Math.abs(input.v) < STILL;
    for (let i = 1; i <= GENERAL.length; i++) {
      const idx = (general + i) % GENERAL.length;
      const k = GENERAL[idx];
      if (k === cur?.kind) continue;
      if (k === 'trackside' && (still || Math.abs(input.v) <= TRACKSIDE_MIN_V)) continue;
      general = idx;
      return k;
    }
    return 'chase';
  };

  const cutTo = (shot, input, longWin) => {
    cur = shot; age = 0; pending = null;
    recent = [...recent, shot.id].slice(-2);
    win = longWin; entered = !!longWin && input.legS >= longWin.s0 && input.legS <= longWin.s1;
    return { shot, cut: true };
  };

  const step = (input) => {
    age += input.dt;
    const event = (input.started ?? []).find((e) => e.shot);
    if (event && !pending) pending = event;

    if (cur && win && !entered && input.legS >= win.s0 && input.legS <= win.s1) entered = true;

    if (pending && (!cur || age >= EVENT_DELAY)) {
      const s = specFor(pending.shot.kind, pending.id, pending.shot, input);
      s.hold = Math.max(HOLD_MIN + rand() * (HOLD_MAX - HOLD_MIN), HOLD_MIN);
      return cutTo(s, input, null);
    }

    const expired = cur && (age >= cur.hold || (win && entered && !(input.legS >= win.s0 && input.legS <= win.s1)));
    if (!cur || expired) {
      const p = pickShowpiece(input);
      if (p) {
        const s = specFor(p.shot.kind, p.id, p.shot, input);
        const long = p.shot.kind === 'portal' || p.shot.kind === 'below';
        s.hold = long ? LONG_HOLD : HOLD_MIN + rand() * (HOLD_MAX - HOLD_MIN);
        return cutTo(s, input, long ? { s0: p.s0, s1: p.s1 } : null);
      }
      const s = specFor(nextGeneral(input), null, null, input);
      s.hold = HOLD_MIN + rand() * (HOLD_MAX - HOLD_MIN);
      return cutTo(s, input, null);
    }
    return { shot: cur, cut: false };
  };

  return { step, reset };
}
