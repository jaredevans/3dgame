// Teleport (T): you fizz out where you stand, a beam holds the view while the place you chose is built, and you fizz in
// on its arrival platform. This is the timing, pure, no three.js or DOM: the phases, how much of the figure is gone
// (dissolved from the feet up) and how bright the sparkle column and the beam are at each moment, and the beam's
// bounded wait. teleport-fx.js draws it; main.js moves you.
//
// Phases: 'out' (FIZZ s) -> 'beam' (until the place is in, then until the rest has settled, or WAIT_MAX s of beam at
// most) -> 'in' (FIZZ s) -> 'idle'. Nothing changes where you are until the place is in: the frame it is, `swap` says
// so (you're moved there behind the beam). If it can't be built (failed), you fizz back in where you stood (`back`).
import { WAIT_MAX } from './streaming.js';

export const FIZZ = 1.5;       // s, each way
export const BEAM_MIN = 0.4;   // s the beam shows at least, between the two
const STILL = 0.05;            // m/s: a train this slow is standing still (as getting out)

const clamp01 = (v) => Math.min(1, Math.max(0, v));
const smooth = (a, b, x) => { const k = clamp01((x - a) / (b - a)); return k * k * (3 - 2 * k); };

// how much of the figure is gone at u (0..1) through the fizz out, from its feet up: 0 whole, 1 gone. The sparkles rise
// a moment first. The fizz in is the same in reverse (dissolveAt(1 - u))
export const dissolveAt = (u) => smooth(0.15, 0.9, u);
// the sparkle column's brightness through the fizz out: up quickly, full once the figure is going
export const glowAt = (u) => smooth(0, 0.2, u);
// the beam's cover over the view: coming up at the end of the fizz out; going at the start of the fizz in
const beamOut = (u) => smooth(0.7, 1, u);
const beamIn = (u) => 1 - smooth(0, 0.25, u);

// the list T opens: the places round the ring, numbered from 1, the one you're at (here; null between stations) shown
// but not offered
export const teleportChoices = (places, here) => places.map((id, i) => ({ n: i + 1, id, offered: id !== here }));

// whether T works now: on foot, or in the cab standing still and not under the arrival cover; never while a teleport is
// under way
export function canTeleport({ mode, v = 0, covered = false, busy = false }) {
  if (busy) return false;
  return mode === 'foot' || (Math.abs(v) < STILL && !covered);
}

export function makeTeleport({ fizz = FIZZ, beamMin = BEAM_MIN, waitMax = WAIT_MAX } = {}) {
  let phase = 'idle', t = 0, to = null, from = null, swapped = false;
  // the answer, one object written each frame (no allocation in the loop): phase; gone (0..1, the figure dissolved from
  // its feet up); glow (0..1, the sparkle column); beam (0..1, its cover over the view); waited (s under the beam);
  // back (fizzing in where you stood: the place failed); and this frame's events: swap (the place is in: move there
  // now), land (the fizz in starts), done (it's over)
  const out = { phase, gone: 0, glow: 0, beam: 0, waited: 0, back: false, swap: false, land: false, done: false };
  const set = (gone, glow, beam) => { out.gone = gone; out.glow = glow; out.beam = beam; };
  return {
    get active() { return phase !== 'idle'; },
    get phase() { return phase; },
    get to() { return to; },
    get from() { return from; },
    get swapped() { return swapped; },
    // to: the place chosen; here: the place you're at (null between stations) -> whether it started
    start(place, here = null) {
      if (phase !== 'idle' || place === here) return false;
      phase = 'out'; t = 0; to = place; from = here; swapped = false;
      out.waited = 0; out.back = false;
      return true;
    },
    // a frame: placeIn (the place and its stations are built), settled (the rest you land among is in: its trains, the
    // ground under you), failed (the place couldn't be built) -> out
    step(dt, placeIn, settled, failed) {
      out.swap = out.land = out.done = false;
      if (phase === 'out') {
        t += dt;
        const u = Math.min(1, t / fizz);
        set(dissolveAt(u), glowAt(u), beamOut(u));
        if (t >= fizz) { phase = 'beam'; t = 0; out.waited = 0; }
      } else if (phase === 'beam') {
        t += dt; out.waited += dt;
        set(1, 1, 1);
        if (!swapped && placeIn) { swapped = true; out.swap = true; }
        const land = swapped ? t >= beamMin && (settled || out.waited >= waitMax) : failed;
        if (land) {
          phase = 'in'; t = 0;
          out.land = true; out.back = !swapped;
        }
      } else if (phase === 'in') {
        t += dt;
        const u = Math.min(1, t / fizz);
        set(dissolveAt(1 - u), glowAt(1 - u), beamIn(u));
        if (t >= fizz) { phase = 'idle'; out.done = true; set(0, 0, 0); }
      } else set(0, 0, 0);
      out.phase = phase;
      return out;
    },
  };
}
