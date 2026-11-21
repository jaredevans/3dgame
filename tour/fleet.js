// The tour's trains, one per leg, streamed by id `train:<leg>`. Each stands on a run of its leg (journey.js): waiting
// at a station, or wherever you left it. Where each one stands outlives its model, so a train unloaded and loaded again
// comes back where it was.
import { LEGS } from './world-data.js';
import { TRAIN_SPECS } from './trains/specs.js';
import { buildTrain, poseTrain } from './vehicles.js';
import { COUPLING_GAP } from './consist.js';
import { setLoading } from './parts.js';

export function makeFleet({ scene, look, journey }) {
  const trains = {};    // leg -> { leg, spec, model, length, run, limits, s }
  const parked = {};    // leg -> { dir, s } (s null: at the start of its run, waiting at its station)

  // stand a train on its leg's run `dir`, its front at s (by default at the run's start, waiting to leave)
  function park(leg, dir, s = null) {
    parked[leg] = { dir, s };
    const t = trains[leg];
    if (!t) return null;
    t.run = journey.runRoute(leg, dir);
    t.limits = journey.limits(t.run, t.length);
    t.s = s ?? t.limits.sMin;
    poseTrain(t.model, t.run.route, t.s, 0, t.run.lane);
    return t;
  }

  return {
    trains,
    park,
    // the train waiting at its station in this place on run `dir`: one already standing at the start of that run stays
    // where it is (you may have got out of it a few metres along); otherwise it's put there
    wait(leg, dir) {
      const t = trains[leg];
      if (t && t.run.dir === dir && journey.stopAt(t.run, { s: t.s, v: 0 }) === t.run.from) return t;
      return park(leg, dir);
    },
    async build(leg) {
      const spec = TRAIN_SPECS[LEGS[leg].train];
      setLoading(`the ${spec.name}`);
      const model = await buildTrain({ name: spec.name, kit: spec.kit, cars: spec.cars, builder: spec.builder, carCount: spec.carCount });
      scene.add(model.group);
      look.shadows(model.group);
      model.night?.(look.night);   // a train with its own lit windows lights them as the place's lamps are
      const length = model.cars.reduce((a, c) => a + c.length, 0) + COUPLING_GAP * (model.cars.length - 1);
      trains[leg] = { leg, spec, model, length };
      const p = parked[leg] ?? { dir: 'out', s: null };
      park(leg, p.dir, p.s);
      return {
        dispose() {
          const t = trains[leg];
          parked[leg] = { dir: t.run.dir, s: t.s };
          model.group.removeFromParent();
          delete trains[leg];
        },
      };
    },
  };
}
