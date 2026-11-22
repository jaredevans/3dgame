// Which of an animal's own clips (Polyfork's CDN animals: Idle, Walk, Run; a swimmer's Swim and Swim fast; a bird's
// Fly) plays at a speed, and how fast. Pure, no three.js, so Node can test it.
const IDLE_BELOW = 0.2;   // m/s
const AIRBORNE = 2;       // a bird faster than this is flying
const clamp = (v) => Math.min(2, Math.max(0.5, v));

// a saddled horse's natural paces (its clips' own speeds), for clipFor: the canyon's riders and the stagecoach's team
// and gang
export const HORSE = { walk: 1.6, run: 7 };

// speed in m/s; clips the animal's clip names; walk and run its natural paces (its clips' own speeds) -> { name,
// timeScale }, into `out` if given (so a caller each frame allocates nothing: it may pass that to the animal's play)
export function clipFor(speed, clips, { walk = 1.4, run = 6 } = {}, out = {}) {
  const v = Math.abs(speed);
  const swimmer = !clips.includes('Walk') && clips.includes('Swim');
  if (clips.includes('Fly') && v > AIRBORNE) { out.name = 'Fly'; out.timeScale = 1; }
  else if (v < IDLE_BELOW) { out.name = 'Idle'; out.timeScale = 1; }
  else if (v <= (walk + run) / 2) { out.name = swimmer ? 'Swim' : 'Walk'; out.timeScale = clamp(v / walk); }
  else { out.name = swimmer ? 'Swim fast' : 'Run'; out.timeScale = clamp(v / run); }
  return out;
}
