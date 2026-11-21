// The daylight dimmed inside a tunnel, without losing it. Pure: lights are anything with an `intensity`.
// getLights() lists the lights now in the scene; it is asked only when something is written, so lights added later count.
// A light's base is its strength when the dimming began (or when the time of day last set it); coming out of the tunnel
// puts every light back to exactly that.
export function makeDimmer(getLights) {
  const base = new Map();   // light -> its undimmed strength, only while dimmed
  let dark = 0;
  function write() {
    for (const l of getLights()) {
      if (!base.has(l)) base.set(l, l.intensity);
      l.intensity = base.get(l) * (1 - dark);
    }
  }
  function restore() {
    for (const [l, v] of base) l.intensity = v;
    base.clear();
  }
  return {
    get dark() { return dark; },
    // how dark it is now, 0 (daylight) to 1; lights are written only when it changes
    update(d) {
      if (d === dark) return;
      dark = d;
      if (dark > 0) write(); else restore();
    },
    // run the time of day's change (look.setTime) on undimmed lights, then dim from what it leaves
    setTime(apply) {
      if (dark > 0) restore();
      apply();
      if (dark > 0) write();
    },
  };
}
