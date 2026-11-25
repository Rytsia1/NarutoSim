import { describe, expect, it } from 'vitest';
import { ShinobiSim } from '../src/sim/engine';
import { hashRand, SeededRng } from '../src/sim/rng';

describe('SeededRng and save/reload determinism', () => {
  it('produces identical sequences from the same seed', () => {
    const a = new SeededRng(424242);
    const b = new SeededRng(424242);
    for (let i = 0; i < 50; i++) {
      expect(a.next()).toBe(b.next());
    }
  });

  it('preserves exact RNG stream across snapshot and restore (prevents save-scumming)', () => {
    const simA = new ShinobiSim();
    simA.newLife(987654321);

    // Advance until first pending decision
    for (let i = 0; i < 15 && !simA.getState().pending; i++) {
      simA.stepYear();
    }

    const snap = simA.snapshot();
    const simB = new ShinobiSim();
    simB.load(snap);

    // Resolve identical options across 15 more years and assert identical states
    for (let i = 0; i < 15; i++) {
      if (simA.getState().pending) {
        const opt = simA.getState().pending!.options.find((o) => !o.disabled)!;
        simA.resolve(opt.id);
        simB.resolve(opt.id);
      } else {
        simA.stepYear();
        simB.stepYear();
      }
      if (simA.getState().phase === 'posthumous') break;
    }

    expect(simA.getState().stats).toEqual(simB.getState().stats);
    expect(simA.getState().age).toBe(simB.getState().age);
    expect(simA.getState().rng).toEqual(simB.getState().rng);
  });

  it('keeps hashRand deterministic and independent of stream calls', () => {
    const h1 = hashRand(12345, 7, 'bloodline_chance');
    const h2 = hashRand(12345, 7, 'bloodline_chance');
    const h3 = hashRand(12345, 8, 'bloodline_chance');
    expect(h1).toBe(h2);
    expect(h1).not.toBe(h3);
    expect(h1).toBeGreaterThanOrEqual(0);
    expect(h1).toBeLessThan(1);
  });
});
