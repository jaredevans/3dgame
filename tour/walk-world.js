// The world as the walker sees it at a place: what's solid, how high the ground is, and where you may go.
// place: { def.centre, blocked(x, z, r), onLand(x, z), groundAt(x, z) } — onLand is the kit's actual land, not its
// bounding box (an island kit's box reaches past its land to its underside). termini: the place's stations (both, or
// just those built so far; missing ones are skipped), each with walk: platforms and the track.
export function makeWalkWorld({ place, termini, terrain, seaLevel, radius }) {
  const walks = termini.filter(Boolean).map((t) => t.walk);
  const platformY = (x, z) => { for (const w of walks) { const y = w.platformY(x, z); if (y !== null && y !== undefined) return y; } return null; };
  const heightAt = (x, z) => platformY(x, z) ?? (place.onLand(x, z) ? place.groundAt(x, z) : terrain.heightAt(x, z));
  return {
    blocked: (x, z, r) => place.blocked(x, z, r) || walks.reduce((hit, w) => hit || w.blocked(x, z, r), null),
    heightAt,
    inBounds: (x, z) => {
      if (walks.some((w) => w.onTrack(x, z))) return false;
      if (heightAt(x, z) < seaLevel + 0.2) return false;   // the sea, wherever it is
      return Math.hypot(x - place.def.centre.x, z - place.def.centre.z) < radius || walks.some((w) => w.inStation(x, z));
    },
  };
}
