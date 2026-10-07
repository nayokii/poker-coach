import { describe, expect, it } from 'vitest';
import { choose, drawProbabilities, hitAtLeastOnce, ruleOfTwoAndFour } from '..';

describe('choose', () => {
  it('computes binomials', () => {
    expect(choose(47, 2)).toBe(1081);
    expect(choose(52, 5)).toBe(2598960);
    expect(choose(5, 0)).toBe(1);
    expect(choose(3, 5)).toBe(0);
  });
});

describe('drawProbabilities (exact, flop, two cards to come)', () => {
  it('9 outs among 47: turn 19.15%, by river 34.97%', () => {
    const p = drawProbabilities(9, 47, 2);
    expect(p.hitNextCard).toBeCloseTo(9 / 47, 12);
    expect(p.hitOnLastCardGivenMiss).toBeCloseTo(9 / 46, 12);
    expect(p.hitOnLastCardOnly).toBeCloseTo((38 / 47) * (9 / 46), 12);
    expect(p.hitByLastCard).toBeCloseTo(1 - (38 * 37) / (47 * 46), 12);
    expect(p.hitByLastCard).toBeCloseTo(0.3497, 4);
    expect(p.missByLastCard).toBeCloseTo(1 - 0.3497, 4);
  });

  it('8 outs: turn 17.02%, by river 31.45%', () => {
    const p = drawProbabilities(8, 47, 2);
    expect(p.hitNextCard).toBeCloseTo(0.1702, 4);
    expect(p.hitByLastCard).toBeCloseTo(0.3145, 4);
  });

  it('4 outs: turn 8.51%, by river 16.47%', () => {
    const p = drawProbabilities(4, 47, 2);
    expect(p.hitNextCard).toBeCloseTo(0.0851, 4);
    expect(p.hitByLastCard).toBeCloseTo(0.1647, 4);
  });

  it('the pieces add up: hit on turn + hit only on river = hit by river', () => {
    for (const outs of [1, 2, 4, 6, 8, 9, 12, 15, 20]) {
      const p = drawProbabilities(outs, 47, 2);
      expect(p.hitNextCard + p.hitOnLastCardOnly).toBeCloseTo(p.hitByLastCard, 12);
      expect(p.hitByLastCard + p.missByLastCard).toBeCloseTo(1, 12);
    }
  });
});

describe('drawProbabilities (turn, one card to come)', () => {
  it('uses 46 unknown cards: 9 outs -> 19.57%', () => {
    const p = drawProbabilities(9, 46, 1);
    expect(p.hitNextCard).toBeCloseTo(9 / 46, 12);
    expect(p.hitByLastCard).toBeCloseTo(9 / 46, 12);
    expect(p.hitOnLastCardOnly).toBeCloseTo(9 / 46, 12);
  });
});

describe('the number of unknown cards is a parameter, never a constant', () => {
  it('changes with dead cards', () => {
    expect(drawProbabilities(9, 45, 2).hitNextCard).toBeCloseTo(0.2, 12);
    expect(drawProbabilities(9, 45, 2).hitByLastCard).toBeCloseTo(1 - (36 * 35) / (45 * 44), 12);
    expect(drawProbabilities(3, 10, 2).hitByLastCard).toBeCloseTo(1 - (7 * 6) / (10 * 9), 12);
  });

  it('supports any number of cards to come (preflop: five)', () => {
    expect(hitAtLeastOnce(4, 50, 5)).toBeCloseTo(1 - choose(46, 5) / choose(50, 5), 12);
  });

  it('edge cases', () => {
    expect(drawProbabilities(0, 47, 2).hitByLastCard).toBe(0);
    expect(drawProbabilities(47, 47, 2).hitByLastCard).toBe(1);
    expect(drawProbabilities(0, 47, 2).missByLastCard).toBe(1);
  });

  it('rejects impossible inputs', () => {
    expect(() => drawProbabilities(48, 47, 2)).toThrow(RangeError);
    expect(() => drawProbabilities(-1, 47, 2)).toThrow(RangeError);
    expect(() => drawProbabilities(2.5, 47, 2)).toThrow(RangeError);
    expect(() => drawProbabilities(2, 47, 0)).toThrow(RangeError);
    expect(() => drawProbabilities(2, 1, 2)).toThrow(RangeError);
  });
});

describe('rule of 2 and 4 (approximation only)', () => {
  it('is close to the exact value but not equal', () => {
    expect(ruleOfTwoAndFour(9, 2)).toBeCloseTo(0.36, 12);
    expect(ruleOfTwoAndFour(9, 1)).toBeCloseTo(0.18, 12);
    expect(Math.abs(ruleOfTwoAndFour(9, 2) - drawProbabilities(9, 47, 2).hitByLastCard)).toBeLessThan(0.02);
    expect(ruleOfTwoAndFour(9, 2)).not.toBe(drawProbabilities(9, 47, 2).hitByLastCard);
    expect(ruleOfTwoAndFour(30, 2)).toBe(1);
  });
});
