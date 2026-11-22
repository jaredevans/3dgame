// The rides' vehicles and set pieces, by ride id (rides.js): what main.js builds as `ride:<leg>` while you stand at the
// ride's departure place (streaming.js wants it there). A ride with no builder here isn't offered (no prompt, nothing
// built); each later ride registers its own.
//
//   RIDE_BUILDERS[id](ctx) -> Promise<RideKit> (RideKit: ride-run.js)
//   ctx = { ride (rideFor(leg)), slicer (await slicer.frame() before each part: one a frame), still() (resolves once the
//     build may land: at a standstill; await it before any step of more than a few ms, and it rejects if the build was
//     let go meanwhile), terrain (the land, its places' patches on it), kit(kitKey, key, params) (a kit part: config.js
//     KITS' keys), cdnPart(id, params), loadAnimal(id), check() (throws if the build was let go meanwhile),
//     warn(what, err) (something optional left out) }
// The page builds a kit only at a standstill, adds its holder, pads and set pieces' groups to the scene hidden, warms
// them and shows them once all are in; the vehicle is posed at the start of the ride's path. A vehicle that can't be
// loaded fails the build (the ride isn't offered; warned); a set piece that can't be should be left out of `actors`
// with warn(), the ride going on without it.
import { buildCar } from './car.js';
import { buildBoat } from './boat.js';
import { buildBalloon } from './balloon.js';

export const RIDE_BUILDERS = {
  boat: buildBoat,
  balloon: buildBalloon,
  car: buildCar,
};
