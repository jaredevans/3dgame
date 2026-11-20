// Loads and unloads places and legs by id, in the background, one at a time so a frame never waits on a build.
// builders: { [id]: async () => ({ dispose() }) }. A build that fails is reported once and not retried.
export function makeStreamer(builders, { onError = console.error } = {}) {
  const live = new Map();      // id -> built thing
  const failed = new Set();    // ids whose build failed
  const pending = new Set();   // ids building
  let wanted = new Set(), busy = null;
  const missing = () => [...wanted].filter((id) => !live.has(id) && !failed.has(id) && builders[id]);

  async function pump() {
    if (busy) return busy;
    busy = (async () => {
      for (let next; (next = missing()[0]);) {
        pending.add(next);
        try { live.set(next, await builders[next]()); } catch (err) { failed.add(next); onError(err); }
        pending.delete(next);
      }
      // let go of what's no longer near
      for (const [id, thing] of live) if (!wanted.has(id)) { thing.dispose?.(); live.delete(id); }
    })();
    try { await busy; } finally { busy = null; }
    if (missing().length) return pump();
  }

  return {
    // ask for a set of ids; settles once they are all built, with the ids among them that failed
    async want(set) {
      wanted = new Set(set);
      await pump();
      return { failed: [...wanted].filter((id) => failed.has(id)) };
    },
    has: (id) => live.has(id),
    get: (id) => live.get(id),
    get loading() { return [...pending]; },
  };
}
