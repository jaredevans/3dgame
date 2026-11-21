// The actors that play a leg's events (events.js): each EventDef's `actor` names a builder in ACTORS, which each leg's
// file (or a shared one, as the level crossing) registers into by its own map.
//   builder(ctx) -> Promise<Actor>, ctx = { leg, route (legRoute(leg), in leg-s), def, terrain, slicer, kit }
//   Actor = { group, update(f), dispose?() }, update called each frame only while its event is active (or always, for
//   an `always` one), with f = { legS, dir, dt, time, on: { t, u } | null, react, camera, train: { front, v, length },
//   night, sunDir }. An actor hides its own moving parts when `on` is null.
import * as THREE from 'three';
import { KITS } from '../config.js';
import { part } from '../parts.js';
import { legRoute } from '../world-data.js';
import { EVENTS } from '../events.js';
import { crossings } from './crossing.js';

export const ACTORS = { ...crossings };

// -> { group, actors: Map<id, Actor>, dispose() }: the actors of a leg's events, built one after another a frame apart
// (slicer.frame()). One whose build fails is warned about and left out; one not yet written (a later task's) is skipped
export async function buildEventActors(leg, { terrain, slicer }) {
  const group = new THREE.Group();
  group.name = `events ${leg}`;
  const actors = new Map();
  const route = legRoute(leg);
  const kit = (kitKey, key, params) => part(KITS[kitKey], key, params);
  for (const def of EVENTS[leg] ?? []) {
    const build = def.actor && ACTORS[def.actor];
    if (!build) continue;
    await slicer.frame();
    try {
      const actor = await build({ leg, route, def, terrain, slicer, kit });
      group.add(actor.group);
      actors.set(def.id, actor);
    } catch (err) {
      console.warn(`The ${def.id} along ${leg} was left out: ${err?.url ? `could not load ${err.url}` : err?.message ?? err}`);
    }
  }
  return {
    group, actors,
    dispose() {
      for (const a of actors.values()) a.dispose?.();
      group.removeFromParent();
    },
  };
}
