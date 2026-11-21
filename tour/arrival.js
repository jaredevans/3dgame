// Stopping at a platform, decided frame by frame. Pure, no three.js or DOM.
// While the train is in the platform window it last stood still in, what lies beyond that place stays wanted (`at`), so
// creeping along the platform, or stopping and starting in it, drops nothing. If any of it is still to be built, a
// cover goes up at the standstill, and only once it's up (coverUp s: its fade done) may it be built (`build`): a
// place's kit is built in one go, and the freeze is behind the cover. It lifts once all is in, or after coverMax s
// whatever happens, so you can always get out. Meanwhile the train is held at the standstill; held too while it isn't
// free to leave (something still building), but never for more than holdMax s at a stop, cover and all, however often
// it stops again in the window. Both caps are a few seconds (streaming.js WAIT_MAX), not the long stall time that says
// a build couldn't be loaded. On foot, `waited` is how long you've waited on what's still building (at the stop you got
// out at too): boarding waits on it only so long (streaming.js readyToLeave), and once you have waited that long, the
// train you board isn't held, nor covered, at the platform you leave from.
import { WAIT_MAX } from './streaming.js';

export const COVER_UP = 0.3, COVER_MAX = WAIT_MAX, HOLD_MAX = WAIT_MAX;

export function makeArrival({ coverUp = COVER_UP, coverMax = COVER_MAX, holdMax = HOLD_MAX } = {}) {
  let keep = null;       // the place whose platform window you stopped in
  let cover = null;      // { place, t }
  let capped = false;    // the cover reached its longest at this stop: not put up again here
  let heldFor = 0;       // s held at this stop, cover and all
  let waited = 0;        // on foot: s waited on what's still building
  let wasFoot = false;
  return {
    // frame: { foot, window (the place whose platform window the train is in, moving or not; null between them),
    //   destination (the run's), stopped (|v| ~ 0), missing(place) (something beyond it is still to be built: never
    //   what failed), busy (anything still building), ready (free to leave), retry() (what failed, tried again: called
    //   on arriving at the destination, before the cover is decided), dt }
    // -> { at, build, cover: { place, arriving } | null, hold, getOut, fresh, waited }
    step({ foot = false, window = null, destination = null, stopped = false, missing = () => false, busy = false, ready = true, retry = () => {}, dt = 0 }) {
      if (foot) {
        // (just got out: what you waited at the stop, held or under the cover, counts too)
        waited = busy ? (wasFoot ? waited : heldFor) + dt : 0;
        keep = null; cover = null; capped = false; heldFor = 0; wasFoot = true;
        return { at: null, build: true, cover: null, hold: false, getOut: false, fresh: false, waited };
      }
      let fresh = false;
      if (!window) { keep = null; cover = null; capped = false; heldFor = 0; }
      else if (stopped && keep !== window) {
        keep = window; fresh = true;
        // boarded after waiting your longest on foot: not kept waiting again here
        capped = wasFoot && waited >= coverMax; heldFor = wasFoot ? waited : 0;
        if (keep === destination) retry();
      }
      wasFoot = false; waited = 0;
      if (keep && stopped && !cover && !capped && missing(keep)) cover = { place: keep, t: 0 };
      if (cover) {
        cover.t += dt;
        if (cover.t >= coverMax) { cover = null; capped = true; }
        else if (cover.t >= coverUp && !busy && !missing(cover.place)) cover = null;
      }
      const up = !cover || cover.t >= coverUp;
      // what's missing is built only at the standstill, behind a cover that's up (or once a timed-out one is down)
      const build = !!keep && up && (!!cover || stopped || !missing(keep));
      const holding = !!window && stopped && (!!cover || !ready);
      if (holding) heldFor += dt;
      const hold = holding && heldFor < holdMax;
      return {
        at: keep, build, fresh, hold, getOut: !cover, waited: 0,
        cover: cover && { place: cover.place, arriving: cover.place === destination },
      };
    },
  };
}
