// Loads and unloads things by id, in the background, one at a time so a frame never waits on a build.
// builders: { [id]: async (ctx) => ({ show?(), dispose() }) }, or a function id -> such a builder (undefined: no such thing).
// A build that fails is reported once and not tried again until retry() (a few times at most; a success forgets its
// failures). A thing with show() is shown when it may be seen (below).
//
// Stalling. A build that has made no progress for `stall` seconds (an import or fetch that hangs) counts as failed, so it
// never holds up the rest, and is let go if it lands after all. The clock is frame time, tick(dt) (a hidden tab runs no
// frames, so nothing there is given up on), and it starts again whenever the build makes progress: ctx.progress() or
// progress() (the page's signal that anything came in). By default there is no stall time: behind the boot loading
// screen, which shows how it's going, a slow connection is waited for; the page sets one after boot (`stall`).
//
// ctx, given to each build: current() (still the build of its id the streamer goes by: one that stalled, or was
// dropped, isn't, and must not write to the page's shared state any more: own / disown below); check() (throws if not);
// progress(); still() (resolves once the build may land, `landing`: the page sets that at a standstill, so a kit built in
// one go, or an upload, never lands on a moving frame; waiting there isn't stalling. If by then the id is no longer
// wanted, or the build isn't current, it rejects and the build is dropped: not a failure, built again when next wanted);
// landNow() (throws, dropped, unless it may land at this very moment: for the last step before a long task that has
// awaits of its own on the way, as a kit's build has its fetches).
//
// standIn(id) -> group: things in a group replace one another (the land's pieces of one tile at another detail). A
// group's new things show together once every wanted thing in it is in, and in that same step what they replace (things
// no longer wanted, or the old one a redo rebuilt) is let go; until then the old ones stand in.
export const STALL = 90;   // s with nothing coming in: the page's stall time after boot (see main.js)

const dropped = (id) => Object.assign(new Error(`${id}: no longer the build wanted`), { dropped: true });

export function makeStreamer(builders, { onError = console.error, standIn = null, stall = Infinity, retries = 2 } = {}) {
  const builderOf = typeof builders === 'function' ? builders : (id) => builders[id];
  const live = new Map();      // id -> built thing
  const failed = new Set();    // ids whose build failed
  const tries = new Map();     // id -> how many times its build has failed since it last succeeded
  const pending = new Set();   // ids building
  const stale = new Set();     // live ids to build again (redo)
  const shown = new Set();     // live ids shown
  const retired = [];          // [group, thing]: replaced by a redo, let go when their group shows
  const current = new Map();   // id -> the build it goes by (in flight, or the live thing's)
  const gates = [];            // builds waiting in still(): { build, done, fail }
  let wanted = new Set(), busy = null, landing = true, inFlight = null;
  const needs = (id) => (!live.has(id) || stale.has(id)) && !failed.has(id) && !!builderOf(id);
  const next = () => { for (const id of wanted) if (needs(id)) return id; return undefined; };
  const groupOf = (id) => (standIn ? standIn(id) : id);

  // let through the builds waiting in still() that may land now, and drop those no longer wanted or current
  function gate() {
    for (let k = gates.length - 1; k >= 0; k--) {
      const g = gates[k], ok = current.get(g.build.id) === g.build;
      if (ok && !landing) continue;
      gates.splice(k, 1); g.build.waiting--;
      if (ok && wanted.has(g.build.id)) g.done(); else g.fail(dropped(g.build.id));
    }
  }

  function sweep() {
    const waiting = new Set();
    if (standIn) for (const id of wanted) if (needs(id)) waiting.add(standIn(id));
    const ready = (id) => !waiting.has(groupOf(id));
    for (const [id, thing] of live) if (wanted.has(id) && !shown.has(id) && ready(id)) { thing.show?.(); shown.add(id); }
    for (let k = retired.length - 1; k >= 0; k--) if (!waiting.has(retired[k][0])) { retired[k][1].dispose?.(); retired.splice(k, 1); }
    for (const [id, thing] of live) {
      if (wanted.has(id) || !ready(id)) continue;
      if (!pending.has(id)) current.delete(id);
      thing.dispose?.(); live.delete(id); shown.delete(id); stale.delete(id);
    }
  }

  async function pump() {
    if (busy) return busy;
    busy = (async () => {
      sweep();
      for (let id; (id = next()) !== undefined;) {
        pending.add(id); stale.delete(id);
        const build = { id, idle: 0, waiting: 0, stalled: null };
        current.set(id, build);
        const ctx = {
          id,
          current: () => current.get(id) === build,
          check() { if (current.get(id) !== build) throw dropped(id); },
          progress() { build.idle = 0; },
          // the last moment before a long task with awaits of its own before it (a kit's build, after its own fetches):
          // throws (dropped) unless the build may land right now, and is current and wanted
          landNow() { if (current.get(id) !== build || !landing || !wanted.has(id)) throw dropped(id); },
          still() {
            if (current.get(id) !== build) return Promise.reject(dropped(id));
            return new Promise((done, fail) => { build.waiting++; gates.push({ build, done, fail }); gate(); });
          },
        };
        let work;
        try { work = Promise.resolve(builderOf(id)(ctx)); } catch (err) { work = Promise.reject(err); }
        const stalled = new Promise((_, fail) => { build.stalled = fail; });
        inFlight = build;
        try {
          const thing = await Promise.race([work, stalled]), old = live.get(id);
          live.set(id, thing); shown.delete(id); tries.delete(id);
          if (old && old !== thing) retired.push([groupOf(id), old]);
        } catch (err) {
          if (current.get(id) === build) current.delete(id);
          if (err?.dropped && !err.stalled) { /* dropped at its gate (or it saw it was): nothing failed */ }
          else { failed.add(id); tries.set(id, (tries.get(id) ?? 0) + 1); onError(err); }
          // a build that stalled goes on in the background: if it lands after all, let it go (it isn't current, so it
          // has written nothing of its own into the page's shared state since, and takes out only what it put in)
          if (err?.stalled) work.then((thing) => thing?.dispose?.(), () => {});
        } finally { inFlight = null; build.stalled = null; }
        pending.delete(id);
        sweep();
      }
    })();
    try { await busy; } finally { busy = null; }
    if (next() !== undefined) return pump();
  }

  return {
    // ask for a set of ids; settles once they are all built, with the ids among them that failed
    async want(set) {
      wanted = new Set(set);
      gate();
      await pump();
      return { failed: [...wanted].filter((id) => failed.has(id)) };
    },
    // build these live ids again (what they stand on changed)
    async redo(ids) {
      for (const id of ids) if (live.has(id)) stale.add(id);
      await pump();
    },
    // a frame of dt seconds: the build in flight comes dt nearer its stall time, unless it's waiting to land
    tick(dt) {
      const b = inFlight;
      if (!b || b.waiting > 0 || !(dt > 0)) return;
      b.idle += dt;
      if (b.idle < stall) return;
      current.delete(b.id);   // from now on it isn't the build its id goes by
      b.stalled?.(Object.assign(new Error(`${b.id}: nothing came in for ${stall} s`), { stalled: true }));
      gate();
    },
    // something came in (a module, a file): the build in flight isn't stalled
    progress() { if (inFlight) inFlight.idle = 0; },
    get stall() { return stall; },
    set stall(s) { stall = s; },
    // whether what's built may land now (the page: at a standstill); builds waiting in still() go on once it may
    get landing() { return landing; },
    set landing(v) { landing = !!v; if (landing) gate(); },
    has: (id) => live.has(id),
    failed: (id) => failed.has(id),
    // whether an id is still to be built: never one without a builder, nor one that failed
    toBuild: (id) => needs(id),
    // try the failed builds again (each at most `retries` times more): the page does when you next stop at a platform
    retry() { for (const id of failed) if ((tries.get(id) ?? 0) <= retries) failed.delete(id); },
    get: (id) => live.get(id),
    shown: (id) => shown.has(id),
    get ids() { return [...live.keys()]; },
    get loading() { return [...pending]; },
    // something is building, or still to be built: a build in flight can't be stopped, and finishes (to be let go, if
    // it's no longer wanted) whatever is wanted meanwhile
    get busy() { return pending.size > 0 || next() !== undefined; },
  };
}

// a page's shared map written by builds (places[id], termini[key], trains[leg]): a build puts in its own thing, and when
// it's let go takes out only that, never one a newer build of the same id has put there since
export function own(map, key, value) { map[key] = value; }
export function disown(map, key, value) {
  if (map[key] !== value) return false;
  delete map[key];
  return true;
}
