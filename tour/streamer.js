// Loads and unloads things by id, in the background, one at a time so a frame never waits on a build.
// builders: { [id]: async () => ({ show?(), dispose() }) }, or a function id -> such a builder (undefined: no such thing).
// A build that fails is reported once and not retried. A thing with show() is shown when it may be seen (below).
// standIn(id) -> group: things in a group replace one another (the land's pieces of one tile at another detail). A
// group's new things show together once every wanted thing in it is in, and in that same step what they replace (things
// no longer wanted, or the old one a redo rebuilt) is let go; until then the old ones stand in.
export function makeStreamer(builders, { onError = console.error, standIn = null } = {}) {
  const builderOf = typeof builders === 'function' ? builders : (id) => builders[id];
  const live = new Map();      // id -> built thing
  const failed = new Set();    // ids whose build failed
  const pending = new Set();   // ids building
  const stale = new Set();     // live ids to build again (redo)
  const shown = new Set();     // live ids shown
  const retired = [];          // [group, thing]: replaced by a redo, let go when their group shows
  let wanted = new Set(), busy = null;
  const needs = (id) => (!live.has(id) || stale.has(id)) && !failed.has(id) && !!builderOf(id);
  const next = () => { for (const id of wanted) if (needs(id)) return id; return undefined; };
  const groupOf = (id) => (standIn ? standIn(id) : id);

  function sweep() {
    const waiting = new Set();
    if (standIn) for (const id of wanted) if (needs(id)) waiting.add(standIn(id));
    const ready = (id) => !waiting.has(groupOf(id));
    for (const [id, thing] of live) if (wanted.has(id) && !shown.has(id) && ready(id)) { thing.show?.(); shown.add(id); }
    for (let k = retired.length - 1; k >= 0; k--) if (!waiting.has(retired[k][0])) { retired[k][1].dispose?.(); retired.splice(k, 1); }
    for (const [id, thing] of live) {
      if (wanted.has(id) || !ready(id)) continue;
      thing.dispose?.(); live.delete(id); shown.delete(id); stale.delete(id);
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
          live.set(id, thing); shown.delete(id);
          if (old && old !== thing) retired.push([groupOf(id), old]);
        } catch (err) { failed.add(id); onError(err); }
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
      await pump();
      return { failed: [...wanted].filter((id) => failed.has(id)) };
    },
    // build these live ids again (what they stand on changed)
    async redo(ids) {
      for (const id of ids) if (live.has(id)) stale.add(id);
      await pump();
    },
    has: (id) => live.has(id),
    failed: (id) => failed.has(id),
    get: (id) => live.get(id),
    shown: (id) => shown.has(id),
    get ids() { return [...live.keys()]; },
    get loading() { return [...pending]; },
    // something is building, or still to be built: a build in flight can't be stopped, and finishes (to be let go, if
    // it's no longer wanted) whatever is wanted meanwhile
    get busy() { return pending.size > 0 || next() !== undefined; },
  };
}
