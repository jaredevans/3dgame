// Which places and legs should be in memory, given where you are. Pure, no three.js.
// A leg's id is "<from>-<to>"; ring = { places, legs, length(legId) }.
// where = { place } | { leg, s, back? }: s is distance along the leg from its first place; back = travelling towards it.

const ends = (id) => { const i = id.indexOf('-'); return [id.slice(0, i), id.slice(i + 1)]; };

export function wantedSet(where, ring) {
  const want = new Set();
  const touching = (place) => ring.legs.filter((l) => ends(l).includes(place));
  const add = (leg, from) => { want.add(leg); for (const p of ends(leg)) if (p !== from) want.add(p); };
  if (where.place) {
    want.add(where.place);
    for (const l of touching(where.place)) add(l, where.place);
    return want;
  }
  const [a, b] = ends(where.leg);
  want.add(where.leg); want.add(a); want.add(b);
  // past halfway, start on what lies beyond the place you're heading for
  if (where.s > ring.length(where.leg) / 2) {
    const ahead = where.back ? a : b;
    for (const l of touching(ahead)) if (l !== where.leg) add(l, ahead);
  }
  return want;
}
