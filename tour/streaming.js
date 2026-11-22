// Which places and legs should be in memory, given where you are. Pure, no three.js.
// A leg's id is "<from>-<to>"; ring = { places, legs }.
// where = { place } | { leg, s, back?, at?, ride? }: s is distance along the leg from its first place; back = travelling towards
// it; at = the place whose platform you're stopped at, if you are.
//
// A place's kit is built in one go (its buildKit() can't be split across frames, and takes a second or two), so nothing
// new is asked for while you're moving: driving a leg wants only what you needed to set off along it. What lies beyond
// is built while you stand still: stopped at a platform, or on foot there, you want everything you could take from that
// place, and you can't board a train until its leg's two places are in (neededToDrive).

const ends = (id) => { const i = id.indexOf('-'); return [id.slice(0, i), id.slice(i + 1)]; };

// what must be in before you set off along a leg: the leg and the places at both its ends
export const neededToDrive = (leg) => new Set([leg, ...ends(leg)]);

// the longest you're kept waiting at a place on what you don't need to go on: the arrival cover, the hold on the train,
// and boarding while something else is still being built. The cover only has to hide a place's kit being built in one
// go (0.3–1.7 s), with a few seconds over for its last modules to come in; past this you may go, and what's still
// building waits for your next standstill to land (streamer.js still()). The long stall time (streamer.js STALL) only
// says something couldn't be loaded.
export const WAIT_MAX = 8;

// whether a train may leave along a leg (boarded, or setting off from a platform): what it needs is in (the train too),
// and its leg is settled (its suburbs built or left out) and nothing else is still being built, or you've waited
// WAIT_MAX s on them: a build can't be stopped once begun, but what's left of it waits for a standstill (streamer.js
// still()), and what's let go is freed at one; the leg's own suburbs are optional scenery, left out as you board.
// A ride (boat, balloon, ...) is built as 'ride:<leg>' and carries you along the leg its place departs on, so it's
// wanted while you stand at that place, and readyToRide needs it in as well as everything the train would.
// has(id): built; busy: anything still building; settled(leg); waited: s waited on it
export function readyToLeave(leg, { has, busy, settled = () => true, waited = 0 }) {
  return [...neededToDrive(leg), `train:${leg}`].every(has) && ((settled(leg) && !busy) || waited >= WAIT_MAX);
}

export const readyToRide = (leg, opts) => readyToLeave(leg, opts) && opts.has('ride:' + leg);

export function wantedSet(where, ring) {
  if (where.place) {
    const want = new Set([where.place]);
    for (const l of ring.legs) if (ends(l).includes(where.place)) for (const id of neededToDrive(l)) want.add(id);
    const onward = ring.legs.find((l) => ends(l)[0] === where.place);
    if (onward) want.add('ride:' + onward);
    return want;
  }
  const want = neededToDrive(where.leg);
  if (where.ride) want.add('ride:' + where.leg);
  if (where.at) for (const id of wantedSet({ place: where.at }, ring)) want.add(id);
  return want;
}
