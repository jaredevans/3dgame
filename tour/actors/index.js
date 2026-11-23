// The actors that play a leg's events (events.js): each EventDef's `actor` names a builder in ACTORS, which each leg's
// file (or a shared one, as the level crossing) registers into by its own map.
//   builder(ctx) -> Promise<Actor>, ctx = { leg, route (legRoute(leg), in leg-s), def, terrain, slicer, kit }
//   Actor = { group, update(f), weather?(f), dispose?() }, update called each frame only while its event is active (or always, for
//   an `always` one), with f = { legS, dir, here, dt, time, on: { t, u } | null, react, camera, train: { front, v,
//   length }, night, sunDir }. `here` is true while you're driving a run on the actor's leg (legS, dir and react are
//   null otherwise); `on` is its event's progress while that's active on your run, else null.
//   The contract: `on: null` hides only the event-driven moving parts (the waiting cars, a passing train); the group
//   itself stays in the scene. An `always` actor keeps its static parts shown whatever `on` and `here` are (it is
//   updated on foot and from other legs too, with on: null and here: false).
//   weather(f) -> { cloudCover?, haze? } | null: what an active event adds to the sky this frame (a shower's clouds), asked
//   before the sky is drawn, with the same f.
import * as THREE from 'three';
import { KITS } from '../config.js';
import { part } from '../parts.js';
import { legRoute } from '../world-data.js';
import { EVENTS } from '../events.js';
import { crossings } from './crossing.js';
import { climb } from './climb.js';
import { canyon } from './canyon.js';
import { desert } from './desert.js';
import { coast } from './coast.js';
import { metro } from './metro.js';
import { sea } from './whales.js';

export const ACTORS = { ...crossings, ...climb, ...canyon, ...desert, ...coast, ...metro, ...sea };

// -> { group, actors: Map<id, Actor>, dispose() }: the actors of a leg's events, built one after another a frame apart
// (slicer.frame()). One whose build fails is warned about and left out; one not yet written (a later task's) is skipped.
// gone(): the leg was let go meanwhile, so no more are built
export async function buildEventActors(leg, { terrain, slicer, gone = () => false }) {
  const group = new THREE.Group();
  group.name = `events ${leg}`;
  const actors = new Map();
  const route = legRoute(leg);
  const kit = (kitKey, key, params) => part(KITS[kitKey], key, params);
  for (const def of EVENTS[leg] ?? []) {
    const build = def.actor && ACTORS[def.actor];
    if (!build) continue;
    await slicer.frame();
    if (gone()) break;
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
