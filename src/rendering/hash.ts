// ---------------------------------------------------------------------------
// Tiny deterministic hash helpers for the renderer.
//
// Decorations (trees, flowers, etc.) must be placed deterministically from
// stable keys (district id + index) so they never jump between frames or
// re-renders. We intentionally do NOT use Math.random here.
// ---------------------------------------------------------------------------

/** xmur3-style string hash -> 32-bit unsigned int. */
export function hashString(input: string): number {
  let h = 1779033703 ^ input.length;
  for (let i = 0; i < input.length; i++) {
    h = Math.imul(h ^ input.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  h = Math.imul(h ^ (h >>> 16), 2246822507);
  h = Math.imul(h ^ (h >>> 13), 3266489909);
  return (h ^= h >>> 16) >>> 0;
}

/**
 * Deterministic float in [0, 1) from a string key and an integer salt.
 * Mixing the salt in lets one key produce a stable stream of values.
 */
export function hashFloat(key: string, salt: number): number {
  const h = hashString(`${key}#${salt}`);
  return h / 4294967296;
}

/** Deterministic float in [min, max) from key + salt. */
export function hashRange(key: string, salt: number, min: number, max: number): number {
  return min + hashFloat(key, salt) * (max - min);
}
