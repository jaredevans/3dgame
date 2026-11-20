// Loads and unloads places and legs by id, in the background, one at a time so a frame never waits on a build.
// builders: { [id]: async () => ({ dispose() }) }.
export function makeStreamer(builders, { onError = console.error } = {}) {
  const live = new Map();      // id -> built thing
  const pending = new Set();   // ids queued or building
  let wanted = new Set(), busy = null;

  async function pump() {
    if (busy) return busy;
    busy = (async () => {
      for (;;) {
        const next = [...wanted].find((id) => !live.has(id) && builders[id]);
        if (!next) break;
        pending.add(next);
        try { live.set(next, await builders[next]()); } catch (err) { onError(err); wanted.delete(next); }
        pending.delete(next);
      }
      // let go of what's no longer near
      for (const [id, thing] of live) if (!wanted.has(id)) { thing.dispose?.(); live.delete(id); }
    })();
    try { await busy; } finally { busy = null; }
    if ([...wanted].some((id) => !live.has(id) && builders[id])) return pump();
  }

  return {
    // ask for a set of ids; returns a promise that settles once they are all built
    want(set) { wanted = new Set(set); return pump(); },
    has: (id) => live.has(id),
    get: (id) => live.get(id),
    get loading() { return [...pending]; },
  };
}
