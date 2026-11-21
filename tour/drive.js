// Driving a train: throttle, brake and the buffers at each end. Pure maths, no three.js.

// the trains themselves live in trains/specs.js; re-exported here for Phase 1's callers
export { TRAIN_SPECS } from './trains/specs.js';

const MAX_DT = 0.1;          // a long frame (tab hidden, a loading stall) never moves the train more than this
const EASE_OFF = 0.5;        // m/s² when the throttle is eased back below the current speed
const THROTTLE_STEP = 0.05;

// state { s, v, throttle }; input { throttleDelta: steps, brake: bool }; limits { sMin, sMax } (the buffer stops)
export function stepTrain(state, input, dt, spec, limits) {
  let { s, v, throttle } = state;
  if (input.throttleDelta) throttle = Math.round(Math.min(1, Math.max(-1, throttle + input.throttleDelta * THROTTLE_STEP)) * 20) / 20;
  dt = Math.min(MAX_DT, Math.max(0, dt));
  if (input.brake) {
    v = Math.sign(v) * Math.max(0, Math.abs(v) - spec.brake * dt);
  } else {
    const target = throttle * spec.top;
    // powering: the target is further from standstill than we are, in the direction we're going (or we're stopped)
    const powering = v >= 0 ? target > v : target < v;
    const rate = powering ? spec.accel : EASE_OFF;
    v = v < target ? Math.min(target, v + rate * dt) : Math.max(target, v - rate * dt);
  }
  s += v * dt;
  if (s >= limits.sMax) { s = limits.sMax; v = Math.min(0, v); }
  if (s <= limits.sMin) { s = limits.sMin; v = Math.max(0, v); }
  return { s, v: v === 0 ? 0 : v, throttle };
}

// seconds to drive `length` metres from rest to rest: accelerate to top speed, cruise, brake
export function idealLegTime(length, spec) {
  const dA = spec.top ** 2 / (2 * spec.accel), dB = spec.top ** 2 / (2 * spec.brake);
  if (dA + dB <= length) return spec.top / spec.accel + spec.top / spec.brake + (length - dA - dB) / spec.top;
  // too short to reach top speed: a triangle
  const vPeak = Math.sqrt((2 * length * spec.accel * spec.brake) / (spec.accel + spec.brake));
  return vPeak / spec.accel + vPeak / spec.brake;
}

// getting out: the train is left standing, throttle shut
export function leaveCab(state) { return { s: state.s, v: 0, throttle: 0 }; }

// what the train hears this frame: nobody in the cab means the brake is on and the throttle is left alone
export function trainInput({ driving, brakeKey, throttleSteps }) {
  return driving ? { throttleDelta: throttleSteps, brake: !!brakeKey } : { throttleDelta: 0, brake: true };
}
