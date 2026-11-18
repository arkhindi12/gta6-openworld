// A seeded random source.
//
// The plan, the fleet, the faces in the crowd and the lights in every window all come out of one
// number, so `?seed=7` builds the same town twice and a staged photograph lands in the same pose
// every time it is taken.
//
// mulberry32: a counter, a shift-xor scramble, a divide by 2^32. Its whole state is one integer in
// this closure, which is why a seed can be handed to a module and reproduced later.

export function seeded(seed = 1) {
  let state = (Math.imul(seed | 0, 0x9e3779b1) ^ 0x85ebca6b) >>> 0;
  if (state === 0) state = 0x6d2b79f5;

  function next() {
    state = (state + 0x6d2b79f5) >>> 0;
    let x = state;
    x = Math.imul(x ^ (x >>> 15), x | 1);
    x ^= x + Math.imul(x ^ (x >>> 7), x | 61);
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
  }

  /** A float between lo and hi. */
  next.span = (lo, hi) => lo + next() * (hi - lo);
  /** A whole number from lo to hi, both ends included. */
  next.whole = (lo, hi) => Math.floor(lo + next() * (hi - lo + 1));
  /** One member of a list. */
  next.oneOf = (list) => list[Math.min(list.length - 1, Math.floor(next() * list.length))];
  /** True with probability p. */
  next.odds = (p = 0.5) => next() < p;
  /** -1 or 1. */
  next.sign = () => (next() < 0.5 ? -1 : 1);

  return next;
}