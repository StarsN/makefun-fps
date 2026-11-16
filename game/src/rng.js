// rng.js — one seeded random source for the whole game (mulberry32).
// A match built from a seed plays out the same way every time, which keeps
// the screenshot scenes reproducible and bot behaviour testable. Everything
// random in the game draws from here, never from Math.random.

let s = 123456789;

export function seedRng(seed) {
  s = (seed >>> 0) || 1;
}

export function rnd() {
  s = (s + 0x6d2b79f5) | 0;
  let t = Math.imul(s ^ (s >>> 15), 1 | s);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

/** Random float in [a, b). */
export const rr = (a, b) => a + rnd() * (b - a);
/** Random integer in [a, b] inclusive. */
export const ri = (a, b) => Math.floor(rr(a, b + 1));
/** True with probability p. */
export const chance = (p) => rnd() < p;
/** A random element of arr. */
export const pick = (arr) => arr[Math.floor(rnd() * arr.length)];
