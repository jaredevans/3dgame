// Which places and legs should be in memory, given where you are. Pure, no three.js.
// A leg's id is "<from>-<to>"; ring = { places, legs }.
// where = { place } | { leg, s, back?, at? }: s is distance along the leg from its first place; back = travelling towards
// it; at = the place whose platform you're stopped at, if you are.
//
// A place's kit is built in one go (its buildKit() can't be split across frames, and takes a second or two), so nothing
// new is asked for while you're moving: driving a leg wants only what you needed to set off along it. What lies beyond
// is built while you stand still: stopped at a platform, or on foot there, you want everything you could take from that
// place, and you can't board a train until its leg's two places are in (neededToDrive).

const ends = (id) => { const i = id.indexOf('-'); return [id.slice(0, i), id.slice(i + 1)]; };

// what must be in before you set off along a leg: the leg and the places at both its ends
export const neededToDrive = (leg) => new Set([leg, ...ends(leg)]);

// whether a train may leave along a leg (boarded, or setting off from a platform): what it needs is in (the train too),
// its leg is settled (its suburbs built or left out), and nothing else is still being built, since a build can't be
// stopped once begun and what's left of it (and letting it go, if it's no longer wanted) would land on a moving frame.
// has(id): built; busy: anything still building; settled(leg)
export function readyToLeave(leg, { has, busy, settled = () => true }) {
  return [...neededToDrive(leg), `train:${leg}`].every(has) && settled(leg) && !busy;
}

export function wantedSet(where, ring) {
  if (where.place) {
    const want = new Set([where.place]);
    for (const l of ring.legs) if (ends(l).includes(where.place)) for (const id of neededToDrive(l)) want.add(id);
    return want;
  }
  const want = neededToDrive(where.leg);
  if (where.at) for (const id of wantedSet({ place: where.at }, ring)) want.add(id);
  return want;
}
