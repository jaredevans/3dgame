// The world as the walker sees it at a place: what's solid, how high the ground is, and where you may go.
// place: { blocked(x, z, r), onLand(x, z), inTown(x, z)?, groundAt(x, z) } — onLand is the kit's actual land, not its
// bounding box (an island kit's box reaches past its land to its underside); inTown is its land and the ground round
// its extra parts (onLand if not given). termini: the place's stations (both, or just those built so far; missing ones
// are skipped), each with walk (station-walk.js): platforms, the track and each one's approach.
// You may walk in the town and on each station's town-side platform and approach, nowhere else: so the only way from
// one station to the other is through the town. And on the place's walkways (its data's `walkways`: the City's path
// to the speedboat's jetty, Oceanside's jetty where it lands), each a strip `width` wide along its points, its ground the
// land's, or the jetty's deck WALKWAY_DECK over the sea where the land is lower than that.
import { approaches } from './station-walk.js';

export const WALKWAY_DECK = 1.2;   // m over the sea: the coast kit's boardwalk height, a jetty's deck

// (x, z) on the walkway { points: [{ x, z }], width }: within half its width of the line through its points
export function onWalkway(w, x, z) {
  const P = w.points, r = w.width / 2;
  for (let i = 0; i < P.length - 1; i++) {
    const a = P[i], b = P[i + 1], dx = b.x - a.x, dz = b.z - a.z;
    const t = Math.min(1, Math.max(0, ((x - a.x) * dx + (z - a.z) * dz) / (dx * dx + dz * dz)));
    if (Math.hypot(x - a.x - dx * t, z - a.z - dz * t) <= r) return true;
  }
  return false;
}
// a walkway's level where the land is `ground` high
export const walkwayLevel = (ground, seaLevel) => Math.max(ground, seaLevel + WALKWAY_DECK);

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
  const ways = place.def?.walkways ?? [], onWay = (x, z) => ways.some((w) => onWalkway(w, x, z));
  const heightAt = (x, z) => platformY(x, z) ?? (place.onLand(x, z) ? place.groundAt(x, z)
    : onWay(x, z) ? walkwayLevel(terrain.heightAt(x, z), seaLevel) : terrain.heightAt(x, z));
  const inTown = place.inTown ?? place.onLand, reaches = approachesFor(walks, inTown);
  return {
    blocked: (x, z, r) => place.blocked(x, z, r) || walks.reduce((hit, w) => hit || w.blocked(x, z, r), null),
    heightAt,
    inBounds: (x, z) => {
      if (walks.some((w) => w.onTrack(x, z))) return false;
      if (onWay(x, z)) return true;   // (over the sea too: the jetty)
      if (heightAt(x, z) < seaLevel + 0.2) return false;   // the sea, wherever it is
      return inTown(x, z) || walks.some((w, i) => w.townSide(x, z, reaches[i]));
    },
  };
}
