// A seeded random source and three small angle helpers.
//
// The city layout, the traffic placement, the crowd's faces and the paint on every facade are
// all drawn from a seed, so `?seed=7` builds the same town twice and a staged screenshot lands
// in exactly the pose it was staged in.
//
// The generator is mulberry32: a 32-bit counter, a shift-xor scramble and a divide by 2^32. It
// is not cryptographic and is not meant to be; it is fast, it is deterministic and it has no
// state visible outside the closure.

/** Returns a function that yields floats in [0,1), with range/int/pick/chance helpers. */
export function makeRandom(seed = 1) {
  let state = (Math.imul(seed | 0, 0x9e3779b1) ^ 0x85ebca6b) >>> 0;
  if (state === 0) state = 0x6d2b79f5;

  function next() {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  next.range = (lo, hi) => lo + next() * (hi - lo);
  next.int = (lo, hi) => Math.floor(lo + next() * (hi - lo + 1));
  next.pick = (list) => list[Math.min(list.length - 1, Math.floor(next() * list.length))];
  next.chance = (p = 0.5) => next() < p;
  // One of four cardinal axes: [[1,0],[-1,0],[0,1],[0,-1]].
  next.axis = () => {
    const side = next() < 0.5 ? -1 : 1;
    return next() < 0.5 ? { dx: side, dz: 0 } : { dx: 0, dz: side };
  };
  return next;
}

/** Straight interpolation. */

/** An angle folded into (-PI, PI]. */
export function foldAngle(a) {
  let r = a % (Math.PI * 2);
  if (r > Math.PI) r -= Math.PI * 2;
  if (r <= -Math.PI) r += Math.PI * 2;
  return r;
}

/**
 * Ease an angle toward a target by no more than `step` radians, walking the short way round.
 * Returns the new angle.
 */
export function stepAngle(current, target, step) {
  const gap = foldAngle(target - current);
  const bounded = Math.max(-step, Math.min(step, gap));
  return current + bounded;
}
