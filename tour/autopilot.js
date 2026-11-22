// Auto mode (Z): what a driver would press. The throttle and brake that take a train from wherever it is to its
// stopping point, the views it cycles through while it drives, and when it sounds the horn. Pure, no three.js: the page
// feeds these into the same stepTrain and key handling a player's keys go through.

const STEP = 0.05;   // one throttle step (drive.js), one key press
export const AUTOPILOT = {
  brakeShare: 0.85,  // the stop is planned on this much of the train's brake, so there's always some in hand
  closeAhead: 2,     // s: the throttle is shut this long before the brake would come on
  tol: 0.4,          // m: this close to the mark (or past it) it brakes to a stand
  creep: 2,          // m/s: below this, short of the mark, it takes the throttle's first step again
};

// drive { s, v, throttle }; to { stopS, spec } -> out { throttleSteps (-1, 0 or 1: a key press a frame), brake }. The
// stop is planned on AUTOPILOT.brakeShare of the brake, and the brake comes on whenever the stopping distance on that
// reaches the distance left: on the full brake the train sheds speed faster than planned and the brake comes off again,
// so it rides the planned curve down to the mark. Stateless, so whatever else held it (the guard, a platform's hold)
// it picks up from where the train is
export function autoThrottle(drive, { stopS, spec }, out) {
  const { s, v, throttle } = drive;
  const d = stopS - s;
  const stopping = v > 0 ? (v * v) / (2 * spec.brake * AUTOPILOT.brakeShare) : 0;
  let target = 1, brake = false;
  if (v < -0.05 || d <= AUTOPILOT.tol || stopping >= d) { brake = true; target = 0; }
  else if (stopping + v * AUTOPILOT.closeAhead >= d) target = v < AUTOPILOT.creep ? STEP : 0;
  const gap = target - throttle;
  out.throttleSteps = Math.abs(gap) < STEP / 2 ? 0 : Math.sign(gap);
  out.brake = brake;
  return out;
}

// where to stop: the run's stopping point, or short of it where the guard wants the train stopped (react.js brakeTo, m
// on from the front: a red signal, cattle on the line), so it draws up there and waits rather than creeping on each
// time the guard lets the brake off
export const autoMark = (stopS, s, brakeTo) => (brakeTo === null || brakeTo === undefined ? stopS : Math.min(stopS, s + Math.max(0, brakeTo)));

// the driving views auto cycles through, each held for min..max s (random()); start(current) -> the first view: the one
// showing if it's in the cycle, else the first; step(dt) -> the next view when it's time to change, else null
export function makeViewCycle({ order = ['nose', 'drone', 'director'], min = 20, max = 30, random = Math.random } = {}) {
  let i = 0, left = 0;
  const hold = () => min + (max - min) * random();
  return {
    start(current) {
      i = Math.max(0, order.indexOf(current));
      left = hold();
      return order[i];
    },
    step(dt) {
      left -= dt;
      if (left > 0) return null;
      i = (i + 1) % order.length;
      left = hold();
      return order[i];
    },
  };
}

// a reaction's prompt asking for the horn (react.js: the level crossings, the cattle)
export const asksForHorn = (prompt) => typeof prompt === 'string' && prompt.includes('(H)');

// when auto sounds the horn: `delay` s after a prompt first asks for it, once; again only if it's still asking `again`
// s later (it wasn't heard), or once a new prompt asks
export function makeHornCue({ delay = 0.5, again = 6 } = {}) {
  let asking = 0, sounded = false;
  return {
    step(prompt, dt) {
      if (!asksForHorn(prompt)) { asking = 0; sounded = false; return false; }
      asking += dt;
      if (!sounded ? asking >= delay : asking >= again) { sounded = true; asking = 0; return true; }
      return false;
    },
  };
}
