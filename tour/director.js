// The director's shot planner: pure (no three.js), so Node can test it. It decides when to cut and to what; the camera
// view (cameras.js, Task 10) frames each shot.
//
// step({ dt, legS, dir, v, showpieces, started, length, tunnels }) -> { shot, cut }   (the same object every step)
//   showpieces  EventDefs with a shot (and no actor) running on this run
//   started     EventDefs with a shot that began this frame (an `always` one starts when the train enters its window)
//   tunnels     [{ s0, s1 }] the leg's tunnels (leg-s), kept clear of general shots; none if not given
//   shot        { kind, id: string|null, at: leg-s|null, lateral, height, fov, hold }
//   lateral     metres, + left of the leg's out direction
// Leg-s grows going out and shrinks going back, so "ahead" is sign * (+1 out, -1 back).
//
// A started event is queued, and cuts in once the front is within its lead of the shot's `at` (at once with no `at`),
// after the current shot has had EVENT_DELAY s; not into a portal or below showpiece's long hold, nor into another
// event's shot: those finish first, then the queue is served in order. It may cut into the arrival shot once that has
// had HOLD_MIN s (the last ARRIVE m of a line are full of events), which is picked again after it. An event's fixed shot (trackside, below,
// wide, high-wide) holds until the train's middle has passed its `at` (up to LONG_HOLD s), so it sees the train go by;
// one still queued when the train's middle passes its `at` is dropped, as it would only show where the train has been.

import { aheadOf } from './events.js';

const HOLD_MIN = 5, HOLD_MAX = 8;
const EVENT_DELAY = 1.5;        // s a shot is kept at the least before an event cuts in
const EVENT_LEAD = 150, EVENT_LEAD_TIME = 5;   // a queued event cuts in within max(150 m, |v| * 5 s) of its `at`
const LONG_HOLD = 20;           // s a portal/below showpiece shot, or an event's fixed shot, may hold
const LEAD_TIME = 4;            // s ahead of a showpiece's window it starts to count
const MIN_LEFT = 3;             // s: a showpiece with less of its window left than this, at this speed, isn't picked
const GENERAL = ['trackside', 'chase', 'high-wide', 'heli'];
const STILL = 0.05, TRACKSIDE_MIN_V = 3;
const WIDE_LEAD = 20;           // m: a general high-wide stands where the front will be half way through it, and this on
const TUNNEL_CLEAR = { before: 15, after: 30, ahead: 30 };   // m: a fixed general shot moved off a tunnel
const FIXED = new Set(['trackside', 'below', 'wide', 'high-wide', 'portal', 'arrival']);
const QUEUE = 8;
// the arrival shot (from the line's end, the train coming in head-on: owner, 2026-11-21) holds until the train has stood
// still this long at the platform (its front within ARRIVAL_NEAR m of the line's end: a platform's length and a little,
// so a stop for the guard further up the line doesn't end it), and the shot has had HOLD_MIN s, up to ARRIVAL_HOLD s (a
// slow train takes ~40 s over its window's last 450 m). It isn't picked while the train stands still that long, so it's
// not cut back to for a moment at the platform each time it drops out of the last two shots; nor while an event waits
// in the queue, which would cut into it moments later: the event's shot first, then the arrival's
const ARRIVAL_HOLD = 60, ARRIVAL_STOPPED = 2, ARRIVAL_NEAR = 150;

// per kind: fov, height and lateral (metres; `side` = random sign, mirrored either side) used where the spec gives none
const DEFAULTS = {
  trackside: { fov: 45, height: 1.2, lateral: 0 },
  chase: { fov: 55, height: 8, lateral: 0 },
  'high-wide': { fov: 40, height: 60, lateral: 150, side: true },
  heli: { fov: 50, height: 18, lateral: 35, side: true },
  wide: { fov: 28, height: 10, lateral: 100, side: true },
  below: { fov: 50, height: 1.5, lateral: 0 },
  portal: { fov: 45, height: 2.5, lateral: 12, side: true },
  arc: { fov: 42, height: 1.5, lateral: 0 },   // about level with the nose, not looking down on it
  arrival: { fov: 40, height: 3, lateral: 0 },
};

// the tunnel (of `tunnels`) leg-s `s` lies in, or null
export function tunnelAt(tunnels, s) {
  if (!tunnels) return null;
  for (let i = 0; i < tunnels.length; i++) if (s > tunnels[i].s0 && s < tunnels[i].s1) return tunnels[i];
  return null;
}
// true if a tunnel starts within `reach` m ahead of the front, or the front is in one
function tunnelWithin(tunnels, legS, dir, reach) {
  if (!tunnels) return false;
  for (let i = 0; i < tunnels.length; i++) {
    const t = tunnels[i], near = dir === 'out' ? t.s0 : t.s1, ahead = aheadOf(legS, near, dir);
    if ((legS > t.s0 && legS < t.s1) || (ahead >= 0 && ahead <= reach)) return true;
  }
  return false;
}

// never a close look steeply down on the train (owner, 2026-11-22: a wide shot drawn in over the line looked straight
// down on it): how far (m) a camera at p ({ x, y, z }) stands too high to see the stretch of `route` from s0 to s1
// (either way round; the train `aim` m over it) at no more than STEEP.down below level, anywhere within STEEP.near of
// it, sampled every STEEP.step m -> into out { over (0: fine), d (the worst point's distance across the ground) }.
// STEEP.out: how far from the line a camera that would stand over it is stood out first (cameras.js)
export const STEEP = { down: 35 * Math.PI / 180, near: 120, out: 20, step: 5 };
const RP = {}, TAN_DOWN = Math.tan(STEEP.down);
export function steepOver(p, route, s0, s1, aim, out = { over: 0, d: Infinity }) {
  out.over = 0; out.d = Infinity;
  const lo = Math.max(0, Math.min(s0, s1)), hi = Math.min(route.length, Math.max(s0, s1));
  for (let s = lo; s <= hi + 1e-6; s += STEEP.step) {
    route.at(Math.min(s, hi), RP);
    const d = Math.hypot(RP.x - p.x, RP.z - p.z), h = p.y - (RP.y + aim);
    if (h <= 0 || Math.hypot(d, h) > STEEP.near) continue;
    const over = h - d * TAN_DOWN;
    if (over > out.over) { out.over = over; out.d = d; }
  }
  return out;
}

export function makeDirector({ rand = Math.random } = {}) {
  let cur = null, age = 0, recent = [], general = -1;
  let win = null, entered = false;   // the window a long-hold showpiece shot lasts for
  let stoodFor = 0;                   // s the train has stood still (for the arrival shot)
  let event = null;                  // the event the current shot is for, while it is one
  const queue = [];                  // started events waiting for their cut, in order
  const passing = new Set();         // those queued with a fixed shot whose `at` was ahead of the train's middle then
  const out = { shot: null, cut: false };

  const reset = () => { cur = null; age = 0; recent = []; general = -1; win = null; entered = false; stoodFor = 0; event = null; queue.length = 0; passing.clear(); };

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
    // tilt: degrees the camera looks further down than at the train (the whales' shot: the sea below it in frame);
    // look: a fixed shot looks at the line at this leg-s, not following the train (the crossing's: the train goes
    // through the frame past the waiting cars)
    return { kind, id, at, lateral, height: given?.height ?? d.height, fov: given?.fov ?? d.fov, tilt: given?.tilt ?? 0, look: given?.look ?? null, from: given?.from ?? null, push: given?.push ?? 0, hold: 0 };
  };

  // seconds of a window left ahead of the front at this speed (Infinity standing still)
  const leftOf = (p, input) => {
    const v = Math.abs(input.v);
    if (v < STILL) return Infinity;
    return Math.max(0, input.dir === 'out' ? p.s1 - input.legS : input.legS - p.s0) / v;
  };

  const pickShowpiece = (input) => {
    const reach = Math.abs(input.v) * LEAD_TIME, list = input.showpieces;
    if (!list) return null;
    for (let i = 0; i < list.length; i++) {
      const p = list[i];
      if (!p.shot || recent.includes(p.id) || leftOf(p, input) < MIN_LEFT) continue;
      if (p.shot.kind === 'arrival' && (stoodFor >= ARRIVAL_STOPPED || queue.length)) continue;
      const inside = input.legS >= p.s0 && input.legS <= p.s1;
      const edge = input.dir === 'out' ? p.s0 : p.s1;
      const ahead = aheadOf(input.legS, edge, input.dir);
      if (inside || (ahead > 0 && ahead <= reach)) return p;
    }
    return null;
  };

  // a general kind is kept off tunnels: one riding with the front isn't used while it's in one or about to be
  const nextGeneral = (input) => {
    const still = Math.abs(input.v) < STILL;
    const dark = tunnelWithin(input.tunnels, input.legS, input.dir, Math.abs(input.v) * HOLD_MAX);
    for (let i = 1; i <= GENERAL.length; i++) {
      const idx = (general + i) % GENERAL.length;
      const k = GENERAL[idx];
      if (k === cur?.kind) continue;
      if (k === 'trackside' && (still || Math.abs(input.v) <= TRACKSIDE_MIN_V)) continue;
      if (dark && (k === 'chase' || k === 'heli')) continue;
      general = idx;
      return k;
    }
    return dark ? 'high-wide' : 'chase';
  };

  // a fixed general shot standing over a tunnel moves off it: before its mouth if that's still well ahead of the
  // front, else past its far mouth
  const offTunnels = (s, input) => {
    const t = tunnelAt(input.tunnels, s.at);
    if (!t) return;
    const sign = input.dir === 'out' ? 1 : -1, near = sign > 0 ? t.s0 : t.s1, far = sign > 0 ? t.s1 : t.s0;
    const before = near - sign * TUNNEL_CLEAR.before;
    s.at = aheadOf(input.legS, before, input.dir) >= TUNNEL_CLEAR.ahead ? before : far + sign * TUNNEL_CLEAR.after;
  };

  const cutTo = (shot, input, longWin, ev) => {
    // an event cutting into the arrival shot: that's picked again after it
    if (ev && cur?.kind === 'arrival') recent = recent.filter((id) => id !== cur.id);
    cur = shot; age = 0; event = ev;
    recent.push(shot.id);
    if (recent.length > 2) recent.shift();
    win = longWin; entered = !!longWin && input.legS >= longWin.s0 && input.legS <= longWin.s1;
    out.shot = shot; out.cut = true;
    return out;
  };

  // the lead within which a queued event's shot cuts in
  const ready = (e, input) => {
    const at = e.shot.at;
    if (at === undefined || at === null) return true;
    return aheadOf(input.legS, at, input.dir) <= Math.max(EVENT_LEAD, Math.abs(input.v) * EVENT_LEAD_TIME);
  };
  // an event's fixed shot holds on until the train's middle is past its `at`
  const waiting = (input) => {
    if (!event || !FIXED.has(cur.kind) || cur.at === null || age >= LONG_HOLD) return false;
    return aheadOf(input.legS, cur.at, input.dir) > -(input.length ?? 0) / 2;
  };
  // how far ahead of the train's middle a fixed event shot's `at` is (negative once the middle has passed it), or null
  const pastMiddle = (e, input) => {
    const at = e.shot.at;
    if (!FIXED.has(e.shot.kind) || at === undefined || at === null) return null;
    return aheadOf(input.legS, at, input.dir) + (input.length ?? 0) / 2;
  };
  // a queued event whose window the train has left (and isn't `always`, flying on past it) no longer comes; nor one
  // whose fixed shot's `at` the train's middle has passed since it was queued (`always` too). (One whose `at` was
  // already behind the train when it started, as the rocket's from behind its window, is meant to be)
  const gone = (e, input) => (!e.always && aheadOf(input.legS, input.dir === 'out' ? e.s1 : e.s0, input.dir) < 0)
    || (passing.has(e) && pastMiddle(e, input) < 0);
  const dequeue = (i) => {
    passing.delete(queue[i]);
    for (let j = i; j < queue.length - 1; j++) queue[j] = queue[j + 1];
    queue.length--;
  };

  const step = (input) => {
    age += input.dt;
    const started = input.started;
    if (started) {
      for (let i = 0; i < started.length; i++) {
        const e = started[i];
        if (!e.shot || queue.length >= QUEUE || queue.includes(e)) continue;
        queue.push(e);
        if (pastMiddle(e, input) >= 0) passing.add(e);
      }
    }
    for (let i = queue.length - 1; i >= 0; i--) if (gone(queue[i], input)) dequeue(i);

    if (cur && win && !entered && input.legS >= win.s0 && input.legS <= win.s1) entered = true;
    const leftWin = win && entered && !(input.legS >= win.s0 && input.legS <= win.s1);
    stoodFor = Math.abs(input.v) < STILL ? stoodFor + input.dt : 0;
    const arrived = cur && cur.kind === 'arrival' && stoodFor >= ARRIVAL_STOPPED && age >= HOLD_MIN
      && Math.abs(aheadOf(input.legS, cur.at, input.dir)) <= ARRIVAL_NEAR;
    const expired = cur && ((age >= cur.hold && !waiting(input)) || leftWin || arrived);
    // what may be cut into: anything once it's expired; a general or short showpiece shot after EVENT_DELAY, the arrival
    // shot after HOLD_MIN (an event starting just after it's picked doesn't make it a blink)
    const open = !cur || expired || (!event && (win ? cur.kind === 'arrival' && age >= HOLD_MIN : age >= EVENT_DELAY));

    if (open) {
      for (let i = 0; i < queue.length; i++) {
        const e = queue[i];
        if (!ready(e, input)) continue;
        dequeue(i);
        const s = specFor(e.shot.kind, e.id, e.shot, input);
        s.hold = e.shot.hold ?? Math.max(HOLD_MIN + rand() * (HOLD_MAX - HOLD_MIN), HOLD_MIN);   // (an event may set its own)
        return cutTo(s, input, null, e);
      }
    }

    if (!cur || expired) {
      const p = pickShowpiece(input);
      if (p) {
        const s = specFor(p.shot.kind, p.id, p.shot, input);
        const long = p.shot.kind === 'portal' || p.shot.kind === 'below' || p.shot.kind === 'arrival';
        s.hold = p.shot.hold ?? (p.shot.kind === 'arrival' ? ARRIVAL_HOLD : long ? LONG_HOLD : HOLD_MIN + rand() * (HOLD_MAX - HOLD_MIN));   // (a showpiece may set its own)
        return cutTo(s, input, long ? { s0: p.s0, s1: p.s1 } : null, null);
      }
      const s = specFor(nextGeneral(input), null, null, input);
      s.hold = HOLD_MIN + rand() * (HOLD_MAX - HOLD_MIN);
      if (s.kind === 'high-wide' && s.at === null) {
        s.at = input.legS + (input.dir === 'out' ? 1 : -1) * (Math.abs(input.v) * s.hold / 2 + WIDE_LEAD);
      }
      if (s.at !== null) offTunnels(s, input);
      return cutTo(s, input, null, null);
    }
    out.shot = cur; out.cut = false;
    return out;
  };

  return { step, reset };
}
