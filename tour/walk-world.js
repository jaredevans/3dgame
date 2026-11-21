// The world as the walker sees it at a place: what's solid, how high the ground is, and where you may go.
// place: { blocked(x, z, r), onLand(x, z), inTown(x, z)?, groundAt(x, z) } — onLand is the kit's actual land, not its
// bounding box (an island kit's box reaches past its land to its underside); inTown is its land and the ground round
// its extra parts (onLand if not given). termini: the place's stations (both, or just those built so far; missing ones
// are skipped), each with walk (station-walk.js): platforms, the track and each one's approach.
// You may walk in the town and on each station's town-side platform and approach, nowhere else: so the only way from
// one station to the other is through the town.
import { approaches } from './station-walk.js';

// each town's stations' approaches, worked out once for the stations it has (they change only as one is built)
const cache = new WeakMap();
function approachesFor(walks, inTown) {
  const c = cache.get(inTown);
  if (c && c.walks.length === walks.length && c.walks.every((w, i) => w === walks[i])) return c.reaches;
  const reaches = approaches(walks, inTown);
  cache.set(inTown, { walks, reaches });
  return reaches;
}

export function makeWalkWorld({ place, termini, terrain, seaLevel }) {
  const walks = termini.filter(Boolean).map((t) => t.walk);
  const platformY = (x, z) => { for (const w of walks) { const y = w.platformY(x, z); if (y !== null && y !== undefined) return y; } return null; };
  const heightAt = (x, z) => platformY(x, z) ?? (place.onLand(x, z) ? place.groundAt(x, z) : terrain.heightAt(x, z));
  const inTown = place.inTown ?? place.onLand, reaches = approachesFor(walks, inTown);
  return {
    blocked: (x, z, r) => place.blocked(x, z, r) || walks.reduce((hit, w) => hit || w.blocked(x, z, r), null),
    heightAt,
    inBounds: (x, z) => {
      if (walks.some((w) => w.onTrack(x, z))) return false;
      if (heightAt(x, z) < seaLevel + 0.2) return false;   // the sea, wherever it is
      return inTown(x, z) || walks.some((w, i) => w.townSide(x, z, reaches[i]));
    },
  };
}
