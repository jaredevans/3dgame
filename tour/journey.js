// The journey: which leg you're on and which way, getting out at a place, and the two trains that wait there.
// Pure, no three.js or DOM.
// state = { mode: 'drive' | 'foot' | 'ride', leg, dir: 'out' | 'back', place }: place is where you are on foot, or the
// place you're leaving; leg and dir are the run you're on (or last got out of). A ride is the trip a leg's departure
// place offers instead of its train: it always goes 'out', and sets you down on foot at the leg's far place.
// A run is a train driving forwards along a route: 'out' along the leg from its first place to its second, 'back' on a
// reversed view of it. Both run on the town-side line (lane laneOf(leg) on the leg, -laneOf(leg) on its reversed view).
import { legRoute, laneOf, platformWindow, BUFFER_GAP } from './world-data.js';
import { reverseRoute } from './route.js';
import { canGetOut } from './walk.js';

const STEP_BACK = 8;       // you step down a little behind the cab
const STEP_ACROSS = 2.6;   // from the line's centre to the platform beside it
const PIECE = 4;           // stay off the platform's end pieces (the ramp, and the one by the buffers)

export function makeJourney({ legs, places }) {
  const station = (placeId, role) => places[placeId].stations.find((s) => s.role === role);
  const ends = (leg) => [legs[leg].from, legs[leg].to];
  const runs = new Map();

  // a run's route, lane, and the platforms it leaves from and arrives at, in the run's own s
  function runRoute(leg, dir) {
    const key = `${leg}:${dir}`;
    if (runs.has(key)) return runs.get(key);
    const route = legRoute(leg), L = route.length, back = dir === 'back';
    const platformAt = (end) => platformWindow(L, end, places[legs[leg][end === 'start' ? 'from' : 'to']].stations
      .find((s) => s.leg === leg)?.platformLength);
    const flip = (p) => ({ sFrom: L - p.sTo, sTo: L - p.sFrom, stopS: L - p.stopS });
    const start = platformAt('start'), end = platformAt('end');
    const [from, to] = back ? [legs[leg].to, legs[leg].from] : ends(leg);
    const run = {
      leg, dir, from, to,
      route: back ? reverseRoute(route) : route,
      lane: back ? -laneOf(leg) : laneOf(leg),
      origin: { place: from, platform: back ? flip(end) : start },
      destination: { place: to, platform: back ? flip(start) : end },
    };
    run.platform = run.destination.platform;
    run.stopS = run.platform.stopS;
    runs.set(key, run);
    return run;
  }

  // the two trains waiting while you're in a place: onwards on its departure leg, back on its arrival leg. Each waits at
  // its own station here, its run starting from this place (so it faces away from the town's buffers). The same two
  // whichever way you came in (`state` is not consulted); the page offers only those on legs it has built.
  function trainsAt(state, placeId) {
    const dep = station(placeId, 'departure'), arr = station(placeId, 'arrival');
    return [
      { leg: dep.leg, dir: 'out', station: 'departure', to: legs[dep.leg].to },
      { leg: arr.leg, dir: 'back', station: 'arrival', to: legs[arr.leg].from },
    ];
  }

  return {
    runRoute,
    trainsAt,
    // you start in the cab, at the place the run leaves from
    start: (leg, dir = 'out') => ({ mode: 'drive', leg, dir, place: runRoute(leg, dir).from }),
    getOut(state, placeId) {
      if (state.mode !== 'drive') throw new Error('not driving');
      if (!ends(state.leg).includes(placeId)) throw new Error(`${placeId} is not an end of ${state.leg}`);
      return { ...state, mode: 'foot', place: placeId };
    },
    // once you've got out (state on foot, leg and dir the run you got out of): what becomes of the two trains here.
    // turn: the train you came on, if it arrived here, turning round for the trip back (null if it hadn't left yet);
    // wait: the other train serving this place, to be put at its own station. Entries as trainsAt's.
    arrive(state) {
      if (state.mode !== 'foot') throw new Error('not on foot');
      const here = trainsAt(state, state.place);
      const mine = here.find((t) => t.leg === state.leg);
      return { turn: mine && mine.dir !== state.dir ? mine : null, wait: here.filter((t) => t.leg !== state.leg) };
    },
    // teleporting (T) to a place, from on foot or a standing train: you're on foot there as if you'd just come in at its
    // arrival station (leg, dir: that train's run), standing where you'd step off it (at: { leg, dir, s, lateral }, as
    // stepOut's). trains: its two trains, each to be put at its own station (entries as trainsAt's)
    teleport(state, placeId) {
      if (!places[placeId]) throw new Error(`no place ${placeId}`);
      if (state.mode === 'foot' && state.place === placeId) throw new Error(`already in ${placeId}`);
      const leg = station(placeId, 'arrival').leg, run = runRoute(leg, 'out');
      const next = { mode: 'foot', leg, dir: 'out', place: placeId };
      return { state: next, trains: trainsAt(next, placeId), at: { leg, dir: 'out', ...this.stepOut(run, run.stopS) } };
    },
    board(state, leg, dir) {
      if (state.mode !== 'foot') throw new Error('not on foot');
      if (!trainsAt(state, state.place).some((t) => t.leg === leg && t.dir === dir)) throw new Error(`no ${leg} ${dir} train waits at ${state.place}`);
      return { mode: 'drive', leg, dir, place: state.place };
    },
    // from on foot at a place, take the ride on its departure leg (there is one ride per leg, leaving from its first place)
    ride(state, leg) {
      if (state.mode !== 'foot') throw new Error('not on foot');
      if (!legs[leg] || legs[leg].from !== state.place || station(state.place, 'departure').leg !== leg) {
        throw new Error(`no ride on ${leg} leaves from ${state.place}`);
      }
      return { mode: 'ride', leg, dir: 'out', place: state.place };
    },
    // the ride is over: you're on foot at the leg's far place, with its two trains to put at their stations as after a train
    landed(state) {
      if (state.mode !== 'ride') throw new Error('not riding');
      const to = legs[state.leg].to, next = { mode: 'foot', leg: state.leg, dir: 'out', place: to };
      return { state: next, trains: trainsAt(next, to) };
    },
    // the place a stopped train lets you out at: the platform it's heading for, or the one it hasn't left yet
    stopAt(run, train) {
      if (canGetOut(train, run.destination.platform)) return run.to;
      if (canGetOut(train, run.origin.platform)) return run.from;
      return null;
    },
    // the place whose platform window a train at s is in, moving or not (null between them)
    windowAt(run, s) {
      const inside = (p) => s >= p.sFrom && s <= p.sTo;
      return inside(run.destination.platform) ? run.to : inside(run.origin.platform) ? run.from : null;
    },
    // where you step down from a cab at s: a little behind it, on the platform beside the line, never past its ends
    stepOut(run, s) {
      const p = canGetOut({ s, v: 0 }, run.destination.platform) ? run.destination.platform : run.origin.platform;
      const along = Math.min(p.sTo - PIECE, Math.max(p.sFrom + PIECE, s - STEP_BACK));
      return { s: along, lateral: run.lane + Math.sign(run.lane) * STEP_ACROSS };
    },
    // the buffers at each end of a run, for a train `length` long driving its front along it
    limits: (run, length) => ({ sMin: length + BUFFER_GAP, sMax: run.route.length - BUFFER_GAP }),
    // where you are, for the streamer and the sky: { place } on foot; driving, the leg, s along it from its first
    // place, whether you're heading back towards it, and the fraction of the leg from that first place.
    // Riding there is no run: s is the leg's own s already (the caller maps the ride's s with rideLegS and passes run null)
    where(state, run, s) {
      if (state.mode === 'foot') return { place: state.place };
      if (state.mode === 'ride') return { leg: state.leg, s, back: false, fraction: s / legRoute(state.leg).length };
      const L = run.route.length, legS = run.dir === 'back' ? L - s : s;
      return { leg: run.leg, s: legS, back: run.dir === 'back', fraction: legS / L };
    },
  };
}
