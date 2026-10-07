import { describe, expect, it } from 'vitest';
import { buildPots, splitPot, seededRng, type Contribution } from '..';

const c = (player: number, amount: number, folded = false): Contribution => ({ player, amount, folded });

describe('buildPots', () => {
  it('builds main + side pot + refund for 20 / 50 / 100 all-ins', () => {
    const { pots, refunds } = buildPots([c(0, 20), c(1, 50), c(2, 100)]);
    expect(pots).toEqual([
      { amount: 60, eligible: [0, 1, 2] },
      { amount: 60, eligible: [1, 2] },
    ]);
    expect(refunds).toEqual([{ player: 2, amount: 50 }]);
  });

  it('builds one pot when everyone contributed equally', () => {
    expect(buildPots([c(0, 40), c(1, 40), c(2, 40)])).toEqual({
      pots: [{ amount: 120, eligible: [0, 1, 2] }],
      refunds: [],
    });
  });

  it('builds several side pots from four different stacks', () => {
    const { pots, refunds } = buildPots([c(0, 10), c(1, 20), c(2, 30), c(3, 40)]);
    expect(pots).toEqual([
      { amount: 40, eligible: [0, 1, 2, 3] },
      { amount: 30, eligible: [1, 2, 3] },
      { amount: 20, eligible: [2, 3] },
    ]);
    expect(refunds).toEqual([{ player: 3, amount: 10 }]);
  });

  it('keeps folded money in the pots but never makes the folder eligible', () => {
    const { pots, refunds } = buildPots([c(0, 20), c(1, 50), c(2, 50), c(3, 30, true)]);
    expect(pots).toEqual([
      { amount: 80, eligible: [0, 1, 2] },
      { amount: 70, eligible: [1, 2] }, // 30-level and 50-level layers merge
    ]);
    expect(refunds).toEqual([]);
  });

  it('handles heads-up fold with an uncalled raise', () => {
    const { pots, refunds } = buildPots([c(0, 100), c(1, 10, true)]);
    expect(pots).toEqual([{ amount: 20, eligible: [0] }]);
    expect(refunds).toEqual([{ player: 0, amount: 90 }]);
  });

  it('ignores players with no contribution', () => {
    const { pots } = buildPots([c(0, 0, true), c(1, 10), c(2, 10)]);
    expect(pots).toEqual([{ amount: 20, eligible: [1, 2] }]);
  });

  it('property: chips are conserved and folded players are never eligible', () => {
    const rng = seededRng(99);
    for (let t = 0; t < 2000; t++) {
      const n = 2 + Math.floor(rng() * 7);
      const cs = Array.from({ length: n }, (_, i) => c(i, Math.floor(rng() * 6) * 10, rng() < 0.3));
      // a hand always has at least one live player with a contribution
      if (!cs.some((x) => !x.folded && x.amount > 0)) continue;
      const { pots, refunds } = buildPots(cs);
      const total = cs.reduce((a, x) => a + x.amount, 0);
      const out = pots.reduce((a, p) => a + p.amount, 0) + refunds.reduce((a, r) => a + r.amount, 0);
      expect(out).toBe(total);
      for (const p of pots) {
        for (const e of p.eligible) expect(cs[e]!.folded).toBe(false);
        expect(p.eligible.length).toBeGreaterThan(0);
      }
    }
  });
});

describe('splitPot', () => {
  it('splits evenly', () => expect(splitPot(100, [3, 5])).toEqual([50, 50]));
  it('gives odd chips to the first winners in order', () => {
    expect(splitPot(100, [4, 1, 2])).toEqual([34, 33, 33]);
    expect(splitPot(101, [4, 1, 2])).toEqual([34, 34, 33]);
    expect(splitPot(1, [7, 8])).toEqual([1, 0]);
  });
  it('conserves chips', () => {
    for (let amt = 0; amt < 50; amt++) {
      for (let w = 1; w <= 6; w++) {
        expect(splitPot(amt, Array.from({ length: w }, (_, i) => i)).reduce((a, b) => a + b, 0)).toBe(amt);
      }
    }
  });
});
