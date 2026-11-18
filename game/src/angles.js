// Small pieces of arithmetic that the rest of the game would otherwise repeat: angles folded into
// a sensible range, turns that never overshoot, and the exponential smoothing that the camera and
// the throttle both use so a frame rate change cannot change the feel.

export const TAU = Math.PI * 2;

/** Fold an angle into (-PI, PI]. */
export function wrap(a) {
  let r = a % TAU;
  if (r > Math.PI) r -= TAU;
  if (r <= -Math.PI) r += TAU;
  return r;
}

/** Turn `from` toward `to` by at most `step` radians, the short way round. */
export function turnToward(from, to, step) {
  const gap = wrap(to - from);
  return from + Math.max(-step, Math.min(step, gap));
}

export function clamp(v, lo, hi) {
  return v < lo ? lo : v > hi ? hi : v;
}

/** Move `current` toward `target` at `rate` per second, framerate-independently. */
export function easeTo(current, target, rate, dt) {
  return current + (target - current) * (1 - Math.exp(-rate * dt));
}

/** The heading of a vector, with the degenerate case answered as straight ahead. */
export function headingOf(x, z) {
  return Math.atan2(z, x);
}