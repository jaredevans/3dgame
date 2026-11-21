// Which of an animal's own clips (Polyfork's CDN animals: Idle, Walk, Run; a swimmer's Swim and Swim fast; a bird's
// Fly) plays at a speed, and how fast. Pure, no three.js, so Node can test it.
const IDLE_BELOW = 0.2;   // m/s
const AIRBORNE = 2;       // a bird faster than this is flying
const clamp = (v) => Math.min(2, Math.max(0.5, v));

// speed in m/s; clips the animal's clip names; walk and run its natural paces (its clips' own speeds)
export function clipFor(speed, clips, { walk = 1.4, run = 6 } = {}) {
  const v = Math.abs(speed);
  const has = (n) => clips.includes(n);
  if (has('Fly') && v > AIRBORNE) return { name: 'Fly', timeScale: 1 };
  if (v < IDLE_BELOW) return { name: 'Idle', timeScale: 1 };
  const swimmer = !has('Walk') && has('Swim');
  if (v <= (walk + run) / 2) return { name: swimmer ? 'Swim' : 'Walk', timeScale: clamp(v / walk) };
  return { name: swimmer ? 'Swim fast' : 'Run', timeScale: clamp(v / run) };
}
