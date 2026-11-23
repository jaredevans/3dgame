// How the whales and the stingrays off the cliffs move (whales.js): pure, no three.js, so Node can test it. Heights are
// over the sea's surface, of the animal's middle; pitch is radians nose-up, roll radians about its length.

// a humpback's breach: up out of the water nose first, thrown over onto its side and back as it falls, a great splash
// as it goes in. Its middle leaves `deep` m down and rises to `high` m over the sea (13.5 m long, two thirds of it is
// out at the top), going on `drift` m/s
export const BREACH = { deep: 4, high: 3.5, g: 9.8, tilt: 75, back: -15, roll: 110, drift: 3 };
const DEG = Math.PI / 180;
const breachV = () => Math.sqrt(2 * BREACH.g * (BREACH.high + BREACH.deep));
// how long a breach takes, s: up from `deep` and back down to it
export const breachSecs = () => 2 * breachV() / BREACH.g;
const smooth = (a, b, x) => { const u = Math.min(1, Math.max(0, (x - a) / (b - a))); return u * u * (3 - 2 * u); };

// t s since it began -> out, filled ({ on: still breaching, u: 0..1 through it, y, pitch, roll, along: metres on })
export function breachAt(t, out = {}) {
  const T = breachSecs(), v = breachV();
  out.on = t >= 0 && t <= T;
  const tc = Math.min(T, Math.max(0, t)), u = tc / T;
  out.u = u;
  out.y = -BREACH.deep + v * tc - BREACH.g * tc * tc / 2;
  out.pitch = (BREACH.tilt + (BREACH.back - BREACH.tilt) * u) * DEG;
  out.roll = BREACH.roll * smooth(0.3, 0.9, u) * DEG;
  out.along = BREACH.drift * tc;
  return out;
}

// a whale's round at the surface, `period` s: it comes up (`rise` s) and lies with its back out, blowing as it comes up
// (`blow` s after it reaches the top) and again `again` s later; then it arches and dives, its flukes thrown up out
// of the water as its head goes down, and stays down. `top`: its middle's height lying at the surface (its back just
// out); `down`: how deep it goes
export const SURFACE = { period: 18, rise: 2, lie: 7, dive: 4, top: -0.9, down: -8, blow: 0.2, again: 4, arch: 40 };

// t s, `phase` s into its round -> out, filled ({ y, pitch, blow: true in the frame a blow starts (given the last
// frame's t, `prev`), under: true while it's down (hidden) })
export function swimAt(t, phase, prev, out = {}) {
  const S = SURFACE, P = S.period, at = (x) => (((x + phase) % P) + P) % P;
  const tau = at(t), was = prev === null || prev === undefined ? null : at(prev);
  const lieEnd = S.rise + S.lie, diveEnd = lieEnd + S.dive;
  if (tau < S.rise) {
    const u = smooth(0, 1, tau / S.rise);
    out.y = S.down + (S.top - S.down) * u; out.pitch = 12 * DEG * (1 - u);
  } else if (tau < lieEnd) {
    out.y = S.top; out.pitch = 0;
  } else if (tau < diveEnd) {
    // arching down: the head goes under first, so the flukes come up behind it; then it slides on under
    const u = (tau - lieEnd) / S.dive;
    out.pitch = -S.arch * DEG * Math.sin(Math.PI * Math.min(1, u * 1.3) / 2) * (u < 0.75 ? 1 : 1 - (u - 0.75) / 0.25 * 0.5);
    out.y = S.top + (S.down - S.top) * smooth(0.1, 1, u);
  } else {
    out.y = S.down; out.pitch = 0;
  }
  out.under = out.y <= S.down + 0.5;
  // a blow starts as the frame crosses its moment (not before the first frame: prev null)
  const blows = [S.rise + S.blow, S.rise + S.blow + S.again];
  out.blow = was !== null && blows.some((b) => (was < b && tau >= b) || (was > tau && tau >= b));
  return out;
}

// a stingray's leap: up out of the water nose first and over in a somersault, back in nose first `secs` later; each
// of n leaps in turn, `gap` s apart (ray i first at i * gap). Between, it swims `deep` m under. It goes `drift` m/s
export const FLIP = { secs: 1.35, gap: 1.2, deep: 0.6, rise: 45, turn: 450, drift: 2.5 };

// t s, ray i of n -> out, filled ({ air, u: 0..1 through its leap, y, pitch })
export function flipAt(t, i, n, out = {}) {
  const period = n * FLIP.gap * 1.6, tau = (((t - i * FLIP.gap) % period) + period) % period;
  out.air = t >= i * FLIP.gap && tau < FLIP.secs;
  if (!out.air) { out.u = 0; out.y = -FLIP.deep; out.pitch = 0; return out; }
  const u = tau / FLIP.secs, g = 9.8, T = FLIP.secs, v = g * T / 2;
  out.u = u;
  // a throw from `deep` under that comes back to it: up at v, the top v² / 2g over the start
  out.y = -FLIP.deep + v * tau - g * tau * tau / 2;
  out.pitch = (FLIP.rise - FLIP.turn * u) * DEG;
  return out;
}

// the crabs' fight on Oceanside's beach (owner, 2026-11-22): the shore crab and the hermit crab facing each other
// CRAB.gap m apart across a point, a round of CRAB.round s: they circle it side-stepping (as crabs go), claws up;
// the shore crab lunges, pincers snapping, the hermit rearing back; they part; the hermit lunges, the crab skittering
// back; they part, and circle the other way.
export const CRAB = { round: 7, gap: 0.45, circle: 0.6, lunge: 0.14, back: 0.06 };
const bump = (t, a, b) => (t <= a || t >= b ? 0 : Math.sin(Math.PI * (t - a) / (b - a)));
// t s -> out, filled ({ turn: radians round the point, a: how far the shore crab has come in (m), b: the hermit's,
// snapA, snapB: 0..1 how open each one's pincers are, raise: 0..1 how high the claws are up })
export function crabFightAt(t, out = {}) {
  const C = CRAB, u = ((t % C.round) + C.round) % C.round, lap = Math.floor(t / C.round);
  // circling over 0-2 s one way, 5-7 s the other, the turn kept where it got to between
  const dir = lap % 2 ? -1 : 1, circled = (x0, x1) => smooth(x0, x1, u);
  out.turn = C.circle * (lap % 2 ? 1 : 0) + dir * C.circle * (circled(0, 2) - circled(5, 7)) * 0.5;
  // the lunges: in, and the other giving ground
  const lungeA = bump(u, 2, 2.7), lungeB = bump(u, 3.6, 4.3);
  out.a = C.lunge * lungeA - C.back * lungeB;
  out.b = C.lunge * lungeB - C.back * lungeA;
  // pincers snapping fast in a lunge, flexing slowly between; claws up throughout, highest in a lunge
  out.snapA = lungeA > 0 ? 0.5 + 0.5 * Math.sin(u * 38) : 0.25 + 0.25 * Math.sin(u * 3);
  out.snapB = lungeB > 0 ? 0.5 + 0.5 * Math.sin(u * 38) : 0.25 + 0.25 * Math.sin(u * 3 + 1);
  out.raise = 0.6 + 0.4 * Math.max(lungeA, lungeB);
  return out;
}
