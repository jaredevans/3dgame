// The world as the walker sees it at a place: what's solid, how high the ground is, and where you may go.
// place: { def.centre, blocked(x, z, r), onLand(x, z), groundAt(x, z) } — onLand is the kit's actual land, not its
// bounding box (an island kit's box reaches past its land to its underside). terminus.walk: platforms and the track.
export function makeWalkWorld({ place, terminus, terrain, seaLevel, radius }) {
  const heightAt = (x, z) => terminus.walk.platformY(x, z) ?? (place.onLand(x, z) ? place.groundAt(x, z) : terrain.heightAt(x, z));
  return {
    blocked: (x, z, r) => place.blocked(x, z, r) || terminus.walk.blocked(x, z, r),
    heightAt,
    inBounds: (x, z) => {
      if (terminus.walk.onTrack(x, z)) return false;
      if (heightAt(x, z) < seaLevel + 0.2) return false;   // the sea, wherever it is
      return Math.hypot(x - place.def.centre.x, z - place.def.centre.z) < radius || terminus.walk.inStation(x, z);
    },
  };
}
