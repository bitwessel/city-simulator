// Deterministic seeded RNG (xmur3 string hash + mulberry32 PRNG).
// Every random decision in the game flows through an Rng instance so the
// same seed always produces the same city and the same simulation.

/** Hash a string into a 32-bit unsigned int. */
export function hashSeed(input: string): number {
  let h = 1779033703 ^ input.length;
  for (let i = 0; i < input.length; i++) {
    h = Math.imul(h ^ input.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  h = Math.imul(h ^ (h >>> 16), 2246822507);
  h = Math.imul(h ^ (h >>> 13), 3266489909);
  return (h ^= h >>> 16) >>> 0;
}

export class Rng {
  private state: number;

  constructor(seed: number) {
    this.state = seed >>> 0;
    if (this.state === 0) this.state = 0x9e3779b9;
  }

  static fromString(seed: string): Rng {
    return new Rng(hashSeed(seed));
  }

  /** Derive an independent, deterministic child stream (e.g. per day/topic). */
  fork(label: string): Rng {
    return new Rng(hashSeed(`${label}:${this.next()}`));
  }

  /** Uniform float in [0, 1). */
  next(): number {
    this.state = (this.state + 0x6d2b79f5) >>> 0;
    let t = this.state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  /** Uniform float in [min, max). */
  range(min: number, max: number): number {
    return min + this.next() * (max - min);
  }

  /** Uniform integer in [min, max] (inclusive). */
  int(min: number, max: number): number {
    return Math.floor(this.range(min, max + 1));
  }

  /** True with probability p (0..1). */
  chance(p: number): boolean {
    return this.next() < p;
  }

  pick<T>(items: readonly T[]): T {
    if (items.length === 0) throw new Error('Rng.pick: empty array');
    return items[this.int(0, items.length - 1)];
  }

  /** Pick n distinct items (n clamped to array length). Order is random. */
  pickMany<T>(items: readonly T[], n: number): T[] {
    return this.shuffle(items).slice(0, Math.min(n, items.length));
  }

  /** Returns a new shuffled copy (Fisher–Yates). */
  shuffle<T>(items: readonly T[]): T[] {
    const out = items.slice();
    for (let i = out.length - 1; i > 0; i--) {
      const j = this.int(0, i);
      [out[i], out[j]] = [out[j], out[i]];
    }
    return out;
  }

  /** Weighted pick. Weights <= 0 are never chosen. Throws if all weights <= 0. */
  weighted<T>(items: readonly T[], weightOf: (item: T) => number): T {
    let total = 0;
    for (const item of items) total += Math.max(0, weightOf(item));
    if (total <= 0) throw new Error('Rng.weighted: no positive weights');
    let roll = this.next() * total;
    for (const item of items) {
      const w = Math.max(0, weightOf(item));
      roll -= w;
      if (roll < 0 && w > 0) return item;
    }
    return items[items.length - 1];
  }
}
