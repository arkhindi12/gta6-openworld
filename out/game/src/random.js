// A seeded random source and the two angle helpers the world turns on.
//
// The layout, the fleet, the faces in the crowd and the paint on every facade all come out of a
// seed, so ?seed=7 builds the same town twice and a staged screenshot lands in exactly the pose it
// was staged in.
//
// The generator is mulberry32: a 32-bit counter, a shift-xor scramble, a divide by 2^32. Fast,
// deterministic, not cryptographic, and its whole state lives in this closure.

/** A float in [0,1) with range/int/pick/chance/axis helpers bolted on. */
export function rngFrom(seed = 1) {
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
  // One of the four cardinal axes.
  next.axis = () => {
    const side = next() < 0.5 ? -1 : 1;
    return next() < 0.5 ? { dx: side, dz: 0 } : { dx: 0, dz: side };
  };
  return next;
}

/** Fold an angle into (-PI, PI]. */
export function wrap(a) {
  let r = a % (Math.PI * 2);
  if (r > Math.PI) r -= Math.PI * 2;
  if (r <= -Math.PI) r += Math.PI * 2;
  return r;
}

/** Turn `from` toward `to` by at most `step` radians, the short way round. */
export function turnToward(from, to, step) {
  const gap = wrap(to - from);
  return from + Math.max(-step, Math.min(step, gap));
}