// Stopping at a platform, decided frame by frame. Pure, no three.js or DOM.
// While the train is in the platform window it last stood still in, what lies beyond that place stays wanted (`at`), so
// creeping along the platform, or stopping and starting in it, drops nothing. If any of it is still to be built, a
// cover goes up at the standstill, and only once it's up (coverUp s: its fade done) may it be built (`build`): a
// place's kit is built in one go, and the freeze is behind the cover. It lifts once all is in, or after coverMax s
// whatever happens, so you can always get out. Meanwhile the train is held; held too while it isn't free to leave
// (something still building), but never for more than holdMax s from the standstill, cover and all.
export const COVER_UP = 0.3, COVER_MAX = 60, HOLD_MAX = 60;

export function makeArrival({ coverUp = COVER_UP, coverMax = COVER_MAX, holdMax = HOLD_MAX } = {}) {
  let keep = null;       // the place whose platform window you stopped in
  let cover = null;      // { place, t }
  let capped = false;    // the cover reached its longest at this stop: not put up again here
  let heldFor = 0;       // s held at this stop, cover and all
  return {
    // frame: { foot, window (the place whose platform window the train is in, moving or not; null between them),
    //   destination (the run's), stopped (|v| ~ 0), missing(place) (something beyond it is still to be built: never
    //   what failed), busy (anything still building), ready (free to leave), dt }
    // -> { at, build, cover: { place, arriving } | null, hold, getOut, fresh }
    step({ foot = false, window = null, destination = null, stopped = false, missing = () => false, busy = false, ready = true, dt = 0 }) {
      if (foot) { keep = null; cover = null; capped = false; heldFor = 0; return { at: null, build: true, cover: null, hold: false, getOut: false, fresh: false }; }
      let fresh = false;
      if (!window) { keep = null; cover = null; capped = false; }
      else if (stopped && keep !== window) { keep = window; fresh = true; capped = false; heldFor = 0; }
      if (keep && stopped && !cover && !capped && missing(keep)) cover = { place: keep, t: 0 };
      if (cover) {
        cover.t += dt;
        if (cover.t >= coverMax) { cover = null; capped = true; }
        else if (cover.t >= coverUp && !busy && !missing(cover.place)) cover = null;
      }
      const up = !cover || cover.t >= coverUp;
      // what's missing is built only at the standstill, behind a cover that's up (or once a timed-out one is down)
      const build = !!keep && up && (!!cover || stopped || !missing(keep));
      const holding = !!window && (!!cover || !ready);
      heldFor = holding ? heldFor + dt : 0;
      const hold = holding && heldFor < holdMax;
      return {
        at: keep, build, fresh, hold, getOut: !cover,
        cover: cover && { place: cover.place, arriving: cover.place === destination },
      };
    },
  };
}
