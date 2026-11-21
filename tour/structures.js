// Where a line needs a structure: a viaduct where it stands well above the land, a tunnel where it lies well below,
// and any the world asks for by name (a trestle, a guideway). Pure maths, no three.js.
// A section { kind, s0, s1 } runs between those distances along its route. A guideway may be `grade: true`: laid on
// the formation (as through a station), the land kept at the track bed under it, with no piers.

export const VIADUCT_ABOVE = 8, VIADUCT_RUN = 40;   // the formation at least 8 m above the land for at least 40 m
export const TUNNEL_BELOW = 12, TUNNEL_RUN = 60;    // at least 12 m below it for at least 60 m
export const PAD = 10;                              // each found section runs on this far either side
export const TUBE_TOP = 7;                          // a tunnel tube's roof, outside, above the formation (m)
// a guideway's deck above the formation: where the rail tops are off it (0.30), so a train rides at one height on and
// off it (structure-mesh.js stands the beams so)
export const GUIDE_DECK = 0.3;
export const BRIDGES = ['viaduct', 'trestle', 'guideway'];
const STEP = 2;

// sections from the land under the line: natural(x, z) is the ground without beds or pads. `forced` sections stand as
// given and win over found ones (a found one they overlap is cut back, and dropped if little is left); none is found
// within `ends` metres of either end (the platforms).
export function structuresFor(route, natural, { forced = [], ends = 0 } = {}) {
  const L = route.length, p = {};
  const runs = { viaduct: [], tunnel: [] };
  let cur = null;
  const close = (s) => { if (cur) { runs[cur.kind].push([cur.s0, s]); cur = null; } };
  for (let s = 0; s <= L + STEP / 2; s += STEP) {
    const at = Math.min(L, s);
    route.at(at, p);
    const above = p.y - natural(p.x, p.z);
    const kind = above >= VIADUCT_ABOVE ? 'viaduct' : above <= -TUNNEL_BELOW ? 'tunnel' : null;
    if (cur && cur.kind !== kind) close(at);
    if (kind && !cur) cur = { kind, s0: at };
  }
  close(L);
  const lo = Math.min(ends, L / 2), hi = Math.max(L - ends, L / 2);
  let found = [];
  for (const [kind, min] of [['viaduct', VIADUCT_RUN], ['tunnel', TUNNEL_RUN]]) {
    const padded = runs[kind].filter(([a, b]) => b - a >= min)
      .map(([a, b]) => [Math.max(lo, a - PAD), Math.min(hi, b + PAD)]).filter(([a, b]) => b > a);
    for (const [a, b] of merge(padded)) found.push({ kind, s0: a, s1: b });
  }
  // a viaduct and a tunnel padded into each other meet halfway
  found.sort((a, b) => a.s0 - b.s0);
  for (let i = 1; i < found.length; i++) if (found[i].s0 < found[i - 1].s1) {
    const m = (found[i].s0 + found[i - 1].s1) / 2;
    found[i - 1].s1 = m; found[i].s0 = m;
  }
  // forced sections cut back what they overlap
  const given = forced.map((f) => ({ ...f })).sort((a, b) => a.s0 - b.s0);
  for (const f of given) {
    found = found.flatMap((s) => {
      if (s.s1 <= f.s0 || s.s0 >= f.s1) return [s];
      return [{ ...s, s1: f.s0 }, { ...s, s0: f.s1 }].filter((x) => x.s1 - x.s0 >= 20);
    });
  }
  return [...found, ...given].sort((a, b) => a.s0 - b.s0);
}

function merge(spans) {
  const out = [];
  for (const [a, b] of [...spans].sort((x, y) => x[0] - y[0])) {
    const last = out[out.length - 1];
    if (last && a <= last[1]) last[1] = Math.max(last[1], b);
    else out.push([a, b]);
  }
  return out;
}

// the section a distance lies in, or null
export function sectionAt(sections, s) {
  if (!sections) return null;
  for (const sec of sections) if (s >= sec.s0 && s <= sec.s1) return sec;
  return null;
}

// how far into a tunnel a distance lies, from its nearer portal (0 outside every tunnel): how dark it is in there
export function tunnelDepth(sections, s) {
  for (const sec of sections ?? []) if (sec.kind === 'tunnel' && s > sec.s0 && s < sec.s1) return Math.min(s - sec.s0, sec.s1 - s);
  return 0;
}

// where a route's track is laid, as [s0, s1] runs: everywhere but on its guideways, where its train glides on the
// guideway's own deck (viaducts, trestles and tunnels carry the track)
export function trackRuns(length, sections = []) {
  const runs = [];
  let from = 0;
  for (const sec of [...sections].filter((x) => x.kind === 'guideway').sort((a, b) => a.s0 - b.s0)) {
    if (sec.s0 > from) runs.push([from, Math.min(sec.s0, length)]);
    from = Math.max(from, sec.s1);
  }
  if (from < length) runs.push([from, length]);
  return runs;
}
