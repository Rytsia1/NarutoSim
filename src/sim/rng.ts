export interface RngSnapshot {
  seed: number;
  state: number;
}

/**
 * Deterministic mulberry32 PRNG whose internal 32-bit state can be snapshotted
 * and restored directly inside save files, preventing mid-decision reload rerolls.
 */
export class SeededRng {
  readonly seed: number;
  private state: number;

  constructor(seed: number, state?: number) {
    this.seed = seed >>> 0;
    this.state = (state ?? seed) >>> 0;
  }

  next(): number {
    this.state = (this.state + 0x6d2b79f5) >>> 0;
    let t = Math.imul(this.state ^ (this.state >>> 15), 1 | this.state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  int(min: number, max: number): number {
    if (max <= min) return min;
    return min + Math.floor(this.next() * (max - min + 1));
  }

  float(min: number, max: number): number {
    return min + this.next() * (max - min);
  }

  chance(probability: number): boolean {
    if (probability <= 0) return false;
    if (probability >= 1) return true;
    return this.next() < probability;
  }

  pick<T>(items: readonly T[]): T {
    if (items.length === 0) {
      throw new Error('Cannot pick from an empty array');
    }
    return items[Math.floor(this.next() * items.length)];
  }

  weighted<T>(items: readonly { item: T; weight: number }[]): T {
    const valid = items.filter((entry) => entry.weight > 0);
    if (valid.length === 0) {
      throw new Error('Cannot pick from empty weighted list');
    }
    const total = valid.reduce((sum, entry) => sum + entry.weight, 0);
    let roll = this.next() * total;
    for (const entry of valid) {
      roll -= entry.weight;
      if (roll <= 0) return entry.item;
    }
    return valid[valid.length - 1].item;
  }

  snapshot(): RngSnapshot {
    return { seed: this.seed, state: this.state };
  }
}

/**
 * Independent deterministic hash-based float in [0, 1) keyed by seed + salt.
 * Used for side rolls (birth bloodline, discipline advancement) so adding new
 * content never shifts the primary yearly RNG stream.
 */
export function hashRand(seed: number, saltA: number, saltB: string): number {
  let h = (seed ^ Math.imul(saltA + 1, 0x9e3779b1)) >>> 0;
  for (let i = 0; i < saltB.length; i++) {
    h = Math.imul(h ^ saltB.charCodeAt(i), 0x85ebca6b) >>> 0;
    h = ((h << 13) | (h >>> 19)) >>> 0;
  }
  h = Math.imul(h ^ (h >>> 16), 0xc2b2ae35) >>> 0;
  h = (h ^ (h >>> 15)) >>> 0;
  return h / 4294967296;
}
