import { describe, expect, it } from 'vitest';
import { parseCards, seededRng, evaluateHand, remainingDeck, type Card } from '../../../engine';
import { equityMultiway, equityRangeVsRange, equityVsHand, equityVsRange, estimateMultiwayEvaluations, parseRange, callEVFromEquity, callEV } from '..';

const P = parseCards;
const sum = (xs: readonly number[]) => xs.reduce((a, b) => a + b, 0);

/** Independent reference: engine evaluator, every turn+river (flop board), equal split of ties. */
function referenceMultiway(hands: Card[][], board: Card[]): number[] {
  const deck = remainingDeck([...hands.flat(), ...board]);
  const eq = new Array<number>(hands.length).fill(0);
  let n = 0;
  for (let i = 0; i < deck.length; i++) {
    for (let j = i + 1; j < deck.length; j++) {
      const b = [...board, deck[i]!, deck[j]!];
      const scores = hands.map((h) => evaluateHand([...h, ...b]).score);
      const best = Math.max(...scores);
      const winners = scores.filter((s) => s === best).length;
      scores.forEach((s, k) => {
        if (s === best) eq[k]! += 1 / winners;
      });
      n++;
    }
  }
  return eq.map((e) => e / n);
}

describe('multiway equity with exact hands', () => {
  it('3-way flop equals the reference and sums to 1', () => {
    const hands = [P('Ah Kh'), P('Qd Qc'), P('9s 9d')];
    const board = P('Jh 7h 2c');
    const r = equityMultiway(hands.map((hand, i) => ({ label: `P${i}`, hand })), board);
    const ref = referenceMultiway(hands, board);
    expect(r.method).toBe('exact');
    expect(r.players.map((p) => p.equity)).toEqual(ref.map((e) => expect.closeTo(e, 12)));
    expect(sum(r.players.map((p) => p.equity))).toBeCloseTo(1, 12);
    expect(r.assignments).toBe(1);
  });

  it('4-way flop equals the reference', () => {
    const hands = [P('Ah Kh'), P('Qd Qc'), P('9s 9d'), P('Tc Td')];
    const board = P('Jh 7h 2c');
    const r = equityMultiway(hands.map((hand) => ({ hand })), board);
    const ref = referenceMultiway(hands, board);
    r.players.forEach((p, i) => expect(p.equity).toBeCloseTo(ref[i]!, 12));
    expect(sum(r.players.map((p) => p.equity))).toBeCloseTo(1, 12);
  });

  it('heads-up agrees with equityVsHand (win, tie, equity)', () => {
    const a = equityMultiway([{ hand: P('Ah Kh') }, { hand: P('Qs Qd') }], P('7s 2d 9c'));
    const b = equityVsHand(P('Ah Kh'), P('Qs Qd'), P('7s 2d 9c'));
    expect(a.players[0]!.equity).toBeCloseTo(b.equity, 12);
    expect(a.players[0]!.winProbability).toBeCloseTo(b.winProbability, 12);
    expect(a.players[0]!.tieProbability).toBeCloseTo(b.tieProbability, 12);
    expect(a.players[1]!.winProbability).toBeCloseTo(b.lossProbability, 12);
  });

  it('splits ties equally between the tied players only', () => {
    // royal flush on board: all three tie
    const r = equityMultiway([{ hand: P('2c 3c') }, { hand: P('4d 5d') }, { hand: P('6s 7s') }], P('Th Jh Qh Kh Ah'));
    for (const p of r.players) {
      expect(p.equity).toBeCloseTo(1 / 3, 12);
      expect(p.tieProbability).toBe(1);
      expect(p.winProbability).toBe(0);
    }
    // two players tie for best, third loses
    const t = equityMultiway([{ hand: P('Ac Kd') }, { hand: P('As Kh') }, { hand: P('2c 3d') }], P('Ah Ks 9d 7c 4h'));
    expect(t.players[0]!.equity).toBeCloseTo(0.5, 12);
    expect(t.players[1]!.equity).toBeCloseTo(0.5, 12);
    expect(t.players[2]!.equity).toBe(0);
    expect(t.players[0]!.tieProbability).toBe(1);
  });

  it('river: three exact hands, one winner', () => {
    const r = equityMultiway([{ hand: P('Ah Ad') }, { hand: P('Kc Kd') }, { hand: P('Qc Qd') }], P('2s 7d 9c Jh 3s'));
    expect(r.players.map((p) => p.equity)).toEqual([1, 0, 0]);
  });

  it('6-way preflop-free spot (turn): equities sum to one, each in [0,1]', () => {
    const hands = [P('Ah Ad'), P('Kc Kd'), P('Qc Qd'), P('Jh Jd'), P('Ts Td'), P('9c 9d')];
    const r = equityMultiway(hands.map((hand) => ({ hand })), P('2s 7h 4c 3d'));
    expect(r.method).toBe('exact');
    expect(sum(r.players.map((p) => p.equity))).toBeCloseTo(1, 12);
    r.players.forEach((p) => {
      expect(p.equity).toBeGreaterThanOrEqual(0);
      expect(p.equity).toBeLessThanOrEqual(1);
    });
    expect(r.players[0]!.equity).toBeGreaterThan(r.players[5]!.equity);
  });

  it('preflop 3-way exact (aces vs kings vs queens)', () => {
    const r = equityMultiway([{ hand: P('As Ah') }, { hand: P('Kd Kc') }, { hand: P('Qd Qc') }]);
    expect(r.method).toBe('exact');
    expect(sum(r.players.map((p) => p.equity))).toBeCloseTo(1, 12);
    expect(r.players[0]!.equity).toBeGreaterThan(0.65);
    expect(r.players[0]!.equity).toBeLessThan(0.8);
    expect(r.boardsPerAssignment).toBe(1370754); // C(46, 5)
  }, 60_000);
});

describe('multiway with ranges', () => {
  it('hand vs one range equals equityVsRange', () => {
    const range = parseRange('QQ+, AKo');
    const a = equityMultiway([{ hand: P('Ah Kh') }, { range }], P('7s 2d 9c'));
    const b = equityVsRange(P('Ah Kh'), range, P('7s 2d 9c'));
    expect(a.method).toBe('exact');
    expect(a.players[0]!.equity).toBeCloseTo(b.equity, 12);
    expect(a.players[1]!.combosConsidered).toBe(b.combosConsidered);
  });

  it('hero vs two ranges: the ranges never share a card and equities sum to 1', () => {
    const r = equityMultiway([{ hand: P('Ah Kh') }, { range: parseRange('QQ, JJ') }, { range: parseRange('QQ, TT') }], P('7s 2d 9c'));
    expect(r.method).toBe('exact');
    expect(sum(r.players.map((p) => p.equity))).toBeCloseTo(1, 12);
    expect(r.assignments).toBeGreaterThan(0);
    // both villains cannot hold queens of the same suits: fewer assignments than 12 x 12
    expect(r.assignments!).toBeLessThan(12 * 12);
  });

  it('range vs range: reports combos, valid matchups and equities that sum to 1', () => {
    const r = equityRangeVsRange(parseRange('AA'), parseRange('KK'), P('2s 7d 9c'));
    expect(r.a.combosConsidered).toBe(6);
    expect(r.b.combosConsidered).toBe(6);
    expect(r.validMatchups).toBe(36); // AA and KK never share a card
    expect(r.a.equity + r.b.equity).toBeCloseTo(1, 12);
    expect(r.a.equity).toBeGreaterThan(0.8);
    expect(r.method).toBe('exact');
  });

  it('range vs range respects blockers: overlapping ranges lose matchups', () => {
    const r = equityRangeVsRange(parseRange('AKs'), parseRange('AKs'), P('2s 7d 9c'));
    expect(r.a.combosConsidered).toBe(4);
    // AKs vs AKs: a matchup needs two different suits, so 4 x 3 = 12 pairs share no card
    expect(r.validMatchups).toBe(12);
    expect(r.a.equity).toBeCloseTo(0.5, 6);
  });

  it('the spec ranges: wide hero range vs strong villain range', () => {
    const hero = parseRange('22+, A2s+, KTs+, QTs+, JTs, ATo+, KQo');
    const villain = parseRange('77+, AJs+, KQs, AQo+');
    const r = equityRangeVsRange(hero, villain, P('Js 8d 3c'));
    expect(r.a.equity + r.b.equity).toBeCloseTo(1, 10);
    expect(r.a.combosConsidered).toBeGreaterThan(r.b.combosConsidered);
    expect(['exact', 'monte-carlo']).toContain(r.method);
  });

  it('weights are honoured', () => {
    const board = P('2s 7d 9c');
    const half = equityRangeVsRange(parseRange('AA'), parseRange('KK, QQ:0.0001'), board, { method: 'exact' });
    const full = equityRangeVsRange(parseRange('AA'), parseRange('KK, QQ'), board, { method: 'exact' });
    expect(half.a.equity).toBeGreaterThan(full.a.equity);
  });
});

describe('method selection and Monte Carlo', () => {
  it('estimates the exact cost as an upper bound and picks the method from a configurable threshold', () => {
    expect(estimateMultiwayEvaluations([1, 1], 3)).toBe(990);
    expect(estimateMultiwayEvaluations([10, 20, 30], 4)).toBe(10 * 20 * 30 * 42); // C(42, 1)
    const spots = [{ hand: P('Ah Kh') }, { range: parseRange('22+, A2s+, K9s+, ATo+, KJo+') }];
    const auto = equityMultiway(spots, []);
    expect(auto.method).toBe('monte-carlo');
    expect(auto.samples).toBe(20_000);
    expect(auto.seed).toBe(1);
    const forcedExact = equityMultiway([{ hand: P('Ah Kh') }, { range: parseRange('QQ') }], P('7s 2d 9c'), { maxExactEvaluations: 10 });
    expect(forcedExact.method).toBe('monte-carlo');
  });

  it('is reproducible for a seed, differs across seeds, and never uses Math.random', () => {
    const spots = [{ hand: P('Ah Kh') }, { range: parseRange('QQ+, AKo') }, { range: parseRange('TT+') }];
    const opts = { method: 'monte-carlo' as const, samples: 3000 };
    const a = equityMultiway(spots, P('7s 2d 9c'), { ...opts, seed: 4 });
    const b = equityMultiway(spots, P('7s 2d 9c'), { ...opts, seed: 4 });
    const c = equityMultiway(spots, P('7s 2d 9c'), { ...opts, seed: 5 });
    expect(a).toEqual(b);
    expect(c.players[0]!.equity).not.toBe(a.players[0]!.equity);
    const original = Math.random;
    Math.random = () => {
      throw new Error('Math.random must not be used');
    };
    try {
      expect(() => equityMultiway(spots, P('7s 2d 9c'), { ...opts, rng: seededRng(1) })).not.toThrow();
    } finally {
      Math.random = original;
    }
    expect(equityMultiway(spots, P('7s 2d 9c'), { ...opts, rng: seededRng(1) }).seed).toBeUndefined();
  });

  it('Monte Carlo converges to the exact multiway values, equities still sum to 1', () => {
    const spots = [{ hand: P('Ah Kh') }, { range: parseRange('QQ+, AKo') }, { range: parseRange('99-JJ') }];
    const exact = equityMultiway(spots, P('7s 2d 9c'), { method: 'exact' });
    const mc = equityMultiway(spots, P('7s 2d 9c'), { method: 'monte-carlo', samples: 60_000, seed: 9 });
    expect(sum(mc.players.map((p) => p.equity))).toBeCloseTo(1, 9);
    mc.players.forEach((p, i) => {
      expect(Math.abs(p.equity - exact.players[i]!.equity)).toBeLessThan(5 * (p.standardError as number) + 1e-9);
      expect(p.standardError).toBeGreaterThan(0);
    });
  });

  it('weighted ranges converge too', () => {
    const spots = [{ hand: P('Qd Qc') }, { range: parseRange('AKs:0.3, 99, TT:0.7') }];
    const exact = equityMultiway(spots, P('7s 2d 9h'), { method: 'exact' });
    const mc = equityMultiway(spots, P('7s 2d 9h'), { method: 'monte-carlo', samples: 60_000, seed: 2 });
    expect(Math.abs(mc.players[0]!.equity - exact.players[0]!.equity)).toBeLessThan(5 * (mc.players[0]!.standardError as number));
  });
});

describe('validation', () => {
  it('rejects bad player lists, boards, duplicates and impossible spots', () => {
    expect(() => equityMultiway([{ hand: P('Ah Kh') }])).toThrow(RangeError);
    expect(() => equityMultiway(Array.from({ length: 10 }, () => ({ range: parseRange('AA') })))).toThrow(RangeError);
    expect(() => equityMultiway([{ hand: P('Ah Kh') }, { hand: P('Ah Qd') }])).toThrow(/duplicate/);
    expect(() => equityMultiway([{ hand: P('Ah Kh') }, { hand: P('Qs Qd') }], P('Ah 2c 3d'))).toThrow(/duplicate/);
    expect(() => equityMultiway([{ hand: P('Ah Kh') }, { hand: P('Qs Qd') }], P('2c 3d'))).toThrow(/board/);
    expect(() => equityMultiway([{ hand: P('Ah Kh') }, {} as never])).toThrow(RangeError);
    expect(() => equityMultiway([{ hand: P('Ah Ad') }, { range: parseRange('AsAc') }, { hand: P('Ks') }])).toThrow(RangeError);
    expect(() => equityMultiway([{ hand: P('As Ah') }, { range: parseRange('AdAc') }], P('Ac 2c 3d'))).toThrow(/no possible combo/);
  });
});

describe('callEVFromEquity', () => {
  it('equals callEV in heads-up and works multiway', () => {
    const a = callEVFromEquity(30, 10, 0.4);
    const b = callEV({ potBeforeCall: 30, callAmount: 10, winProbability: 0.3, tieProbability: 0.2, lossProbability: 0.5 });
    expect(a.ev).toBeCloseTo(b.ev, 12);
    expect(callEVFromEquity(100, 50, 0.3333333333).ev).toBeCloseTo(0.3333333333 * 150 - 50, 8);
    expect(a.assumptions.length).toBeGreaterThan(1);
    expect(() => callEVFromEquity(10, 5, 1.2)).toThrow(RangeError);
  });
});
