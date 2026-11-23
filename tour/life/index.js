// A place's living things, by place id: built (at a standstill) after its extra parts, updated each frame while the
// place is in, and freed with it.
//   PLACE_LIFE[id]({ place, terrain, still }) -> Promise<{ group, update(dt, time) }>
// One that can't be built is warned about and left out; the place goes on without it.
import { buildOceansideLife } from './oceanside.js';

export const PLACE_LIFE = { ocean: buildOceansideLife };
