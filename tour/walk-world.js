// The world as the walker sees it at a place: what's solid, how high the ground is, and where you may go.
// place: { blocked(x, z, r), onLand(x, z), inTown(x, z)?, groundAt(x, z) } — onLand is the kit's actual land, not its
// bounding box (an island kit's box reaches past its land to its underside); inTown is its land and the ground round
// its extra parts (onLand if not given). termini: the place's stations (both, or just those built so far; missing ones
// are skipped), each with walk (station-walk.js): platforms, the track and each one's approach.
// You may walk in the town and on each station's town-side platform and approach, nowhere else: so the only way from
// one station to the other is through the town. And on the place's walkways (its data's `walkways`: the City's path
// to the speedboat's jetty, Oceanside's jetty where it lands), each a strip `width` wide along its points, its ground the
// land's, or the jetty's deck WALKWAY_DECK over the sea where the land is lower than that.
// vehicles: the rides' vehicles standing here (waiting at their pads, or on the one they landed on), each solid over
// its own footprint (vehicleBlocks); the pads round them stay walkable.
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

// A ride's vehicle as the walker meets it: { foot: { min: { x, z }, max: { x, z } } (its footprint in its holder's frame,
// +z forward: the vehicle's own body where it stands on the ground, not a balloon's envelope overhead), holder: { position:
// { x, z }, rotation: { y } } (where it stands now: waiting, or landed) }. A body r round (x, z) touches it: within r of
// that turned rectangle
export function vehicleBlocks(v, x, z, r) {
  const f = v.foot, h = v.holder, c = Math.cos(h.rotation.y), s = Math.sin(h.rotation.y);
  const dx = x - h.position.x, dz = z - h.position.z;
  // into the holder's frame (its +x is (cos yaw, -sin yaw), its +z (sin yaw, cos yaw))
  const lx = dx * c - dz * s, lz = dx * s + dz * c;
  const ex = Math.max(f.min.x - lx, 0, lx - f.max.x), ez = Math.max(f.min.z - lz, 0, lz - f.max.z);
  return ex * ex + ez * ez <= r * r;
}
// the vehicles that are solid to a walker at (x, z): into out (emptied first; the same array each frame), every one
// but any the walker already stands in (one built round you as you stood on its pad, or one you were put down beside
// by hand), which stays open to you till you're out of it, so you're never shut inside it
export function solidVehicles(vehicles, x, z, r, out) {
  out.length = 0;
  for (let i = 0; i < vehicles.length; i++) if (!vehicleBlocks(vehicles[i], x, z, r)) out.push(vehicles[i]);
  return out;
}

// each town's stations' approaches, worked out once for the stations it has (they change only as one is built)
const cache = new WeakMap();
function approachesFor(walks, inTown) {
  const c = cache.get(inTown);
  if (c && c.walks.length === walks.length && c.walks.every((w, i) => w === walks[i])) return c.reaches;
  const reaches = approaches(walks, inTown);
  cache.set(inTown, { walks, reaches });
  return reaches;
}

export function makeWalkWorld({ place, termini, terrain, seaLevel, vehicles = [] }) {
  const walks = termini.filter(Boolean).map((t) => t.walk);
  const platformY = (x, z) => { for (const w of walks) { const y = w.platformY(x, z); if (y !== null && y !== undefined) return y; } return null; };
  const ways = place.def?.walkways ?? [], onWay = (x, z) => ways.some((w) => onWalkway(w, x, z));
  const heightAt = (x, z) => platformY(x, z) ?? (place.onLand(x, z) ? place.groundAt(x, z)
    : onWay(x, z) ? walkwayLevel(terrain.heightAt(x, z), seaLevel) : terrain.heightAt(x, z));
  const inTown = place.inTown ?? place.onLand, reaches = approachesFor(walks, inTown);
  return {
    blocked: (x, z, r) => {
      const hit = place.blocked(x, z, r) || walks.reduce((at, w) => at || w.blocked(x, z, r), null);
      if (hit) return hit;
      for (let i = 0; i < vehicles.length; i++) if (vehicleBlocks(vehicles[i], x, z, r)) return 'ride-vehicle';
      return null;
    },
    heightAt,
    inBounds: (x, z) => {
      if (walks.some((w) => w.onTrack(x, z))) return false;
      if (onWay(x, z)) return true;   // (over the sea too: the jetty)
      if (heightAt(x, z) < seaLevel + 0.2) return false;   // the sea, wherever it is
      return inTown(x, z) || walks.some((w, i) => w.townSide(x, z, reaches[i]));
    },
  };
}
