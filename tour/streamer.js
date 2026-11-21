// Loads and unloads things by id, in the background, one at a time so a frame never waits on a build.
// builders: { [id]: async () => ({ dispose() }) }, or a function id -> such a builder (undefined: no such thing).
// A build that fails is reported once and not retried.
// standIn(id) -> key: things with the same key replace one another (the land's chunks at another detail): one no longer
// wanted is kept while a wanted one with its key is still to build, and let go once that is in.
export function makeStreamer(builders, { onError = console.error, standIn = null } = {}) {
  const builderOf = typeof builders === 'function' ? builders : (id) => builders[id];
  const live = new Map();      // id -> built thing
  const failed = new Set();    // ids whose build failed
  const pending = new Set();   // ids building
  const stale = new Set();     // live ids to build again (redo)
  let wanted = new Set(), busy = null;
  const needs = (id) => (!live.has(id) || stale.has(id)) && !failed.has(id) && builderOf(id);
  const next = () => { for (const id of wanted) if (needs(id)) return id; return undefined; };

  // let go of what's no longer near, bar what still stands in for a replacement being built
  function sweep() {
    const waiting = new Set();
    if (standIn) for (const id of wanted) if (!live.has(id) && needs(id)) waiting.add(standIn(id));
    for (const [id, thing] of live) {
      if (wanted.has(id) || (standIn && waiting.has(standIn(id)))) continue;
      thing.dispose?.(); live.delete(id); stale.delete(id);
    }
  }

  async function pump() {
    if (busy) return busy;
    busy = (async () => {
      sweep();
      for (let id; (id = next()) !== undefined;) {
        pending.add(id); stale.delete(id);
        try {
          const thing = await builderOf(id)(), old = live.get(id);
          live.set(id, thing);
          if (old && old !== thing) old.dispose?.();
        } catch (err) { failed.add(id); onError(err); }
        pending.delete(id);
        sweep();
      }
      sweep();
    })();
    try { await busy; } finally { busy = null; }
    if (next() !== undefined) return pump();
  }

  return {
    // ask for a set of ids; settles once they are all built, with the ids among them that failed
    async want(set) {
      wanted = new Set(set);
      await pump();
      return { failed: [...wanted].filter((id) => failed.has(id)) };
    },
    // build these live ids again (their ground changed); each old one is let go once its new one is in
    async redo(ids) {
      for (const id of ids) if (live.has(id)) stale.add(id);
      await pump();
    },
    has: (id) => live.has(id),
    get: (id) => live.get(id),
    get ids() { return [...live.keys()]; },
    get loading() { return [...pending]; },
  };
}
