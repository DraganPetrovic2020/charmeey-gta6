// A small seeded random generator (mulberry32), so the city is laid out the same way on every visit.
export function createRandom(seed) {
  let state = seed >>> 0;
  const next = () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return {
    next,
    range: (lo, hi) => lo + (hi - lo) * next(),
    int: (lo, hi) => lo + Math.floor(next() * (hi - lo + 1)),
    pick: (list) => list[Math.floor(next() * list.length)],
    chance: (p) => next() < p,
  };
}

/** Random helpers for the live simulation, where repeatability does not matter. */
export const rand = createRandom((Math.random() * 4294967296) >>> 0);

export function reseedLive(seed) {
  const fresh = createRandom(seed);
  Object.assign(rand, fresh);
}
