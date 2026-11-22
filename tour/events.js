// The Scenic Tour's event schedule: what happens where on each leg, in leg-s metres (distance along the leg from its
// first place). Pure data and a tiny clock, no three.js, so Node can test it. Actors (Tasks 3-8) play the events, the
// director (Task 9) cuts to their shots.
//
// EventDef = { id, s0, s1, dirs?: ('out'|'back')[], actor?, react?: ReactDef, shot?: ShotSpec, always?: boolean }
//   dirs    which ways the train must be running for it; both if not given
//   actor   the actor that plays it; a showpiece has a shot and no actor
//   always  the actor is shown and updated wherever you are on the leg (static scenery)
// ReactDef = { kind: 'crossing'|'signal'|'cattle'|'speed', at?: { out, back }, s0?, s1? }
// ShotSpec = { kind, at?: leg-s, lateral?: metres (+ left of the leg's out direction), height?: metres, fov? }
// Values marked ~ in the plan are first guesses, adjusted by the actor's task to suit the land.

const ev = (id, s0, s1, extra = {}) => ({ id, s0, s1, actor: id, ...extra });
const showpiece = (id, s0, s1, shot, extra = {}) => ({ id, s0, s1, shot, ...extra });

export const EVENTS = {
  'city-ocean': [
    ev('lighthouse', 0, 1927, { always: true }),
    ev('gulls', 400, 1850, { shot: { kind: 'heli', at: 1100, lateral: 60 } }),
    ev('freight', 600, 1150, { shot: { kind: 'trackside', at: 875, lateral: -8 } }),
    ev('dolphins', 900, 1300, { shot: { kind: 'heli', at: 1100, lateral: 90 } }),
    ev('boats', 0, 1927, { always: true }),
    // (at: the one stretch near the Oceanside end where both lines lie within 1.5 m of the natural ground for 15 m
    // either side; the window runs 400 m before it, for the gates closing ahead, and on to 1800 for the cars crossing
    // after, short of Oceanside's platform)
    ev('crossing', 1210, 1800, {
      react: { kind: 'crossing', at: { out: 1610, back: 1610 } },
      shot: { kind: 'trackside', at: 1610, lateral: -10 },
    }),
    showpiece('cliffs', 900, 1300, { kind: 'wide', at: 1100, lateral: 120 }),
  ],
  'ocean-mountain': [
    ev('deer', 150, 420, { shot: { kind: 'heli', at: 285, lateral: -50 } }),
    ev('rain', 80, 520, { shot: { kind: 'high-wide', at: 300, lateral: 80 } }),
    ev('rainbow', 520, 1000, { shot: { kind: 'high-wide', at: 760, lateral: -150 } }),
    ev('signal', 200, 760, {
      dirs: ['out'], always: true,
      react: { kind: 'signal', at: { out: 400 } },
      shot: { kind: 'below', at: 771 },
    }),
    ev('eagle', 640, 1000, { shot: { kind: 'heli', at: 820, lateral: 70 } }),
    showpiece('portal', 434, 700, { kind: 'portal', at: 642 }, { dirs: ['out'] }),
    showpiece('portal-back', 380, 642, { kind: 'portal', at: 434 }, { dirs: ['back'] }),
    showpiece('viaduct', 646, 896, { kind: 'below', at: 771 }),
  ],
  'mountain-west': [
    ev('snow', 250, 750, { shot: { kind: 'high-wide', at: 500, lateral: 80 } }),
    ev('rockfall', 450, 650, { shot: { kind: 'chase', at: 550 } }),
    showpiece('trestle', 690, 870, { kind: 'below', at: 780 }),
    ev('riders', 950, 1300, { shot: { kind: 'heli', at: 1125, lateral: 60 } }),
    ev('horses', 1100, 1400, { shot: { kind: 'heli', at: 1250, lateral: -60 } }),
    // (at: the canyon's mouth, the one place in the window with open land beside the line, its walls still standing 20 m
    // and more high 25 m out until about 1120; and no nearer the Wild West, so it's 300 m from the back run's start)
    ev('cattle', 700, 1300, {
      react: { kind: 'cattle', at: { out: 1126, back: 1126 } },
      shot: { kind: 'trackside', at: 1126, lateral: 8 },
    }),
    ev('tumbleweeds', 1100, 1427, { shot: { kind: 'heli', at: 1260, lateral: 50 } }),
    ev('stagecoach', 1150, 1427, { shot: { kind: 'heli', at: 1290, lateral: -50 } }),
  ],
  'west-future': [
    ev('farm', 0, 4144, { always: true }),
    ev('speed', 700, 3400, { react: { kind: 'speed', s0: 800, s1: 3300 }, shot: { kind: 'chase', at: 2050 } }),
    ev('bullet', 1500, 2300, { shot: { kind: 'trackside', at: 1900, lateral: -8 } }),
    // (always: the rocket lifts off as you enter its window and flies its whole minute, past the window's end)
    ev('rocket', 1900, 2900, { always: true, shot: { kind: 'wide', at: 2400, lateral: 200 } }),
    ev('drones', 3000, 3700, { shot: { kind: 'heli', at: 3350, lateral: 60 } }),
    showpiece('guideway', 400, 3800, { kind: 'arc' }),
  ],
  'future-city': [
    ev('fliers', 0, 2083, { always: true }),
    showpiece('bridge', 495, 705, { kind: 'below', at: 600 }),
    ev('traffic', 780, 1800, { shot: { kind: 'high-wide', at: 1290, lateral: 100 } }),
    ev('plane', 1100, 1500, { shot: { kind: 'trackside', at: 1300, lateral: -8, height: 1.2, fov: 60 } }),
    // (at: the only stretch of the leg where both lines lie within 1.5 m of the natural ground for 15 m either side;
    // the line runs 3-6 m up on its bank further on. The suburbs keep off its road: suburbs.js ROAD)
    ev('crossing', 715, 1515, {
      react: { kind: 'crossing', at: { out: 1115, back: 1115 } },
      shot: { kind: 'trackside', at: 1115, lateral: -10 },
    }),
    showpiece('skyline', 1700, 2083, { kind: 'wide', at: 1900, lateral: 120 }),
  ],
};

const BOTH = ['out', 'back'];

// the defs that run when the train goes this way on the leg
export const eventsFor = (leg, dir) => (EVENTS[leg] ?? []).filter((e) => (e.dirs ?? BOTH).includes(dir));

// metres the front of a train going `dir` has to go to reach leg-s `at`; negative once passed
export const aheadOf = (legS, at, dir) => (dir === 'out' ? at - legS : legS - at);

const T_STEP_MAX = 0.1;

// follows the train through a set of defs: which are active, how long, and which began or ended this step
export function makeEventTrack(defs) {
  const running = new Map();   // id -> seconds since it started
  return {
    step({ legS, dt }) {
      const active = new Map(), started = [], ended = [];
      for (const e of defs) {
        if (legS >= e.s0 && legS <= e.s1) {
          let t = running.get(e.id);
          if (t === undefined) { t = 0; started.push(e.id); }
          t += Math.min(dt, T_STEP_MAX);
          running.set(e.id, t);
          active.set(e.id, { t, u: (legS - e.s0) / (e.s1 - e.s0) });
        } else if (running.delete(e.id)) ended.push(e.id);
      }
      return { active, started, ended };
    },
  };
}
