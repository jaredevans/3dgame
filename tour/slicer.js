// Work done a slice at a time, so no frame waits on it: jobs (generators that yield between small steps) run for up to a
// budget of milliseconds each time tick() is called (once a frame), in turn. Pure, no three.js.
// While `sync` (at boot, behind the loading screen) a job runs straight through when it is given.
export function makeSlicer({ now = () => performance.now() } = {}) {
  const queue = [];   // { job, done, fail } or { wake } (a wait for the next tick)
  let sync = true;
  const drain = (job) => { for (;;) { const r = job.next(); if (r.done) return r.value; } };
  return {
    get sync() { return sync; },
    set sync(v) { sync = v; },
    get busy() { return queue.length > 0; },
    // run a job: resolves with what it returns (or rejects with what it throws)
    run(job) {
      if (sync) { try { return Promise.resolve(drain(job)); } catch (err) { return Promise.reject(err); } }
      return new Promise((done, fail) => queue.push({ job, done, fail }));
    },
    // resolves at the next tick: one such wait is let go each tick, so work between them (a part made by a kit, which
    // can't itself be sliced) comes one piece a frame
    frame() { return sync ? Promise.resolve() : new Promise((wake) => queue.push({ wake })); },
    // work for up to `ms` (once a frame); returns the milliseconds used
    tick(ms) {
      const t0 = now();
      let woke = false;
      while (queue.length && now() - t0 < ms) {
        const q = queue[0];
        if (q.wake) { if (woke) break; queue.shift(); woke = true; q.wake(); continue; }
        try {
          const r = q.job.next();
          if (r.done) { queue.shift(); q.done(r.value); }
        } catch (err) { queue.shift(); q.fail(err); }
      }
      return now() - t0;
    },
  };
}

// optional scenery built in the background beside something that doesn't wait for it: build() -> a promise of { group,
// dispose() }; add(group) shows it once it's ready. If it fails, warn(err) and carry on without it; if what it belongs to
// is let go first, it is freed as soon as it's ready, never added. If it isn't in after `deadline` seconds of frames
// (tick(dt), once a frame: a hidden tab runs none, and builds none of its slices either), it's left out (warned about)
// and let go if it lands after all. -> { dispose(), tick(dt), settled (in, or left out), ready: promise (true if added) }
export function scenery(build, { add, warn = console.warn, deadline = Infinity }) {
  let gone = false, built = null, settled = false, waited = 0;
  const ready = (async () => {
    try {
      const s = await build();
      if (gone) { s?.dispose?.(); return false; }
      built = s;
      if (s) add(s.group);
      return !!s;
    } catch (err) { if (!gone) warn(err); return false; } finally { settled = true; }
  })();
  const dispose = () => { gone = true; built?.dispose?.(); built = null; };
  return {
    ready, dispose,
    get settled() { return settled; },
    tick(dt) {
      if (settled || gone) return;
      waited += dt;
      if (waited < deadline) return;
      warn(new Error(`not in after ${deadline} s`));
      dispose(); settled = true;
    },
  };
}
