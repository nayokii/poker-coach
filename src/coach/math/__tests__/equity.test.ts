import { describe, expect, it } from 'vitest';
import { evaluateHand, parseCards, remainingDeck, seededRng, type Card } from '../../../engine';
import { equityVsHand, equityVsRange, estimateEvaluations, parseRange, comboCards, comboCount, withoutDeadCards } from '..';

interface Counts {
  win: number;
  tie: number;
  loss: number;
}

/** Slow independent reference: the engine's own evaluator over every runout (1 or 2 cards to come). */
function reference(hero: Card[], villain: Card[], board: Card[], weight = 1): Counts {
  const deck = remainingDeck([...hero, ...villain, ...board]);
  const out: Counts = { win: 0, tie: 0, loss: 0 };
  const score = (h: Card[], b: Card[]) => evaluateHand([...h, ...b]).score;
  const record = (b: Card[]) => {
    const hs = score(hero, b);
    const vs = score(villain, b);
    if (hs > vs) out.win += weight;
    else if (hs === vs) out.tie += weight;
    else out.loss += weight;
  };
  const k = 5 - board.length;
  if (k === 0) record(board);
  else if (k === 1) for (const a of deck) record([...board, a]);
  else if (k === 2) for (let i = 0; i < deck.length; i++) for (let j = i + 1; j < deck.length; j++) record([...board, deck[i]!, deck[j]!]);
  else throw new Error('reference only supports flop/turn/river');
  return out;
}

function referenceRange(hero: Card[], rangeText: string, board: Card[]): Counts {
  const range = parseRange(rangeText);
  const total: Counts = { win: 0, tie: 0, loss: 0 };
  const known = new Set([...hero, ...board].map((c) => `${c.rank}${c.suit}`));
  for (const e of range.entries) {
    const cards = comboCards(e.combo);
    if (cards.some((c) => known.has(`${c.rank}${c.suit}`))) continue;
    const c = reference(hero, cards, board, e.weight);
    total.win += c.win;
    total.tie += c.tie;
    total.loss += c.loss;
  }
  return total;
}

const norm = (c: Counts) => {
  const n = c.win + c.tie + c.loss;
  return { win: c.win / n, tie: c.tie / n, loss: c.loss / n };
};

const P = parseCards;

describe('equity vs an exact hand: exact enumeration matches an independent reference', () => {
  const cases: [string, string, string, string][] = [
    ['pair vs overcards', 'Qd Qc', 'Ah Kh', '7s 4d 2c'],
    ['set vs flush draw', '7c 7d', 'Ah Kh', '7s 8h 2h'],
    ['top pair vs open-ended draw', 'Ad Kc', '9h 8h', '7s 6h 2c'],
    ['made flush vs set on the turn', 'Ah 5h', '9s 9d', '9h 3h Kh 2c'],
    ['nut flush draw vs top pair on the flop', 'Ah Th', 'Kc Qd', 'Kh 7h 2c'],
    ['dominated kicker', 'Ad Kc', 'Ah Qs', '2c 7d 9h'],
  ];

  it.each(cases)('%s', (_name, h, v, b) => {
    const r = equityVsHand(P(h), P(v), P(b));
    const ref = norm(reference(P(h), P(v), P(b)));
    expect(r.method).toBe('exact');
    expect(r.winProbability).toBeCloseTo(ref.win, 12);
    expect(r.tieProbability).toBeCloseTo(ref.tie, 12);
    expect(r.lossProbability).toBeCloseTo(ref.loss, 12);
    expect(r.equity).toBeCloseTo(ref.win + ref.tie / 2, 12);
    expect(r.samples).toBeUndefined();
  });

  it('a pair against two overcards is a small favourite', () => {
    const r = equityVsHand(P('Qd Qc'), P('Ah Kh'), P('7s 4d 2c'));
    expect(r.equity).toBeGreaterThan(0.6);
    expect(r.equity).toBeLessThan(0.8);
  });

  it('a set against a nut flush draw on the flop is a clear favourite', () => {
    const r = equityVsHand(P('7c 7d'), P('Ah Kh'), P('7s 8h 2h'));
    expect(r.equity).toBeGreaterThan(0.6);
    expect(r.equity).toBeLessThan(0.8);
  });

  it('top pair vs a combo draw is close to a coin flip', () => {
    const r = equityVsHand(P('Ad Kc'), P('9h 8h'), P('7s 6h 2c'));
    expect(r.equity).toBeGreaterThan(0.3);
    expect(r.equity).toBeLessThan(0.7);
  });
});

describe('boards that are complete or nearly complete', () => {
  it('river: a single deterministic comparison', () => {
    const win = equityVsHand(P('Ah Ad'), P('Kc Kd'), P('2s 7d 9c Jh 3s'));
    expect(win).toMatchObject({ equity: 1, winProbability: 1, tieProbability: 0, lossProbability: 0, method: 'exact', boardsPerCombo: 1 });
    const lose = equityVsHand(P('Kc Kd'), P('Ah Ad'), P('2s 7d 9c Jh 3s'));
    expect(lose.equity).toBe(0);
  });

  it('board plays: equity is exactly one half and the tie probability is one', () => {
    const r = equityVsHand(P('2c 3c'), P('4d 5d'), P('Th Jh Qh Kh Ah'));
    expect(r).toMatchObject({ equity: 0.5, tieProbability: 1, winProbability: 0, lossProbability: 0 });
  });

  it('split pots count half: same pair, same kicker, board kicker', () => {
    const r = equityVsHand(P('Ac Qd'), P('As Qc'), P('Ah 7c 4d 2s 9h'));
    expect(r.tieProbability).toBe(1);
    expect(r.equity).toBe(0.5);
  });

  it('turn: 44 possible rivers', () => {
    const r = equityVsHand(P('Ah 5h'), P('9s 9d'), P('9h 3h Kh 2c'));
    expect(r.boardsPerCombo).toBe(44);
    expect(r.winProbability + r.tieProbability + r.lossProbability).toBeCloseTo(1, 12);
  });

  it('flop: 990 possible turn+river pairs', () => {
    expect(equityVsHand(P('Ah 5h'), P('9s 9d'), P('Kh 3h 2c')).boardsPerCombo).toBe(C(45, 2));
  });
});

const C = (n: number, k: number): number => {
  let r = 1;
  for (let i = 1; i <= k; i++) r = (r * (n - i + 1)) / i;
  return Math.round(r);
};

describe('preflop exact enumeration (1,712,304 boards)', () => {
  it('AA vs KK is about 81.9% / 18.1% with a tiny split chance', () => {
    const r = equityVsHand(P('As Ah'), P('Kd Kc'));
    expect(r.method).toBe('exact');
    expect(r.boardsPerCombo).toBe(C(48, 5));
    expect(r.equity).toBeGreaterThan(0.81);
    expect(r.equity).toBeLessThan(0.83);
    expect(r.tieProbability).toBeLessThan(0.01);
    expect(r.winProbability + r.tieProbability + r.lossProbability).toBeCloseTo(1, 12);
  }, 60_000);

  it('AKs vs QQ is close to a coin flip (a slight underdog)', () => {
    const r = equityVsHand(P('Ah Kh'), P('Qc Qd'));
    expect(r.equity).toBeGreaterThan(0.44);
    expect(r.equity).toBeLessThan(0.48);
  }, 60_000);

  it('mirror matchups are symmetric', () => {
    const a = equityVsHand(P('As Ah'), P('Kd Kc'), [], { method: 'exact' });
    const b = equityVsHand(P('Kd Kc'), P('As Ah'), [], { method: 'exact' });
    expect(a.equity + b.equity).toBeCloseTo(1, 12);
    expect(a.winProbability).toBeCloseTo(b.lossProbability, 12);
  }, 60_000);
});

describe('equity vs a range', () => {
  it('matches the reference, combo by combo, after removing blockers', () => {
    const hero = P('Ah Kh');
    const board = P('7s 2d 9c');
    const text = 'QQ+, AKo';
    const r = equityVsRange(hero, parseRange(text), board);
    const ref = norm(referenceRange(hero, text, board));
    expect(r.method).toBe('exact');
    expect(r.winProbability).toBeCloseTo(ref.win, 12);
    expect(r.tieProbability).toBeCloseTo(ref.tie, 12);
    expect(r.lossProbability).toBeCloseTo(ref.loss, 12);
    // QQ 6 + KK 3 (Kh dead) + AA 3 (Ah dead) + AKo 12 - 3 (with Ah) - 3 (with Kh) = 6
    expect(r.combosConsidered).toBe(6 + 3 + 3 + 6);
  });

  it('honours weights', () => {
    const hero = P('Qd Qc');
    const board = P('7s 4d 2c');
    const weighted = equityVsRange(hero, parseRange('AKs:0.25, 99'), board);
    const ref = norm(referenceRange(hero, 'AKs:0.25, 99', board));
    expect(weighted.equity).toBeCloseTo(ref.win + ref.tie / 2, 12);
    const all = equityVsRange(hero, parseRange('AKs, 99'), board);
    expect(weighted.equity).not.toBeCloseTo(all.equity, 3);
  });

  it('blockers change the combo count and the equity', () => {
    const range = parseRange('AA, KK');
    const board = P('7s 2d 9c');
    const withBlocker = equityVsRange(P('Ac Qs'), range, board);
    const noBlocker = equityVsRange(P('Jh Qs'), range, board);
    expect(withBlocker.combosConsidered).toBe(3 + 6);
    expect(noBlocker.combosConsidered).toBe(12);
    expect(withBlocker.equity).not.toBeCloseTo(noBlocker.equity, 3);
  });

  it('a range of one hand equals the exact-hand result', () => {
    const a = equityVsRange(P('Ah Kh'), parseRange('QsQd'), P('7s 2d 9c'));
    const b = equityVsHand(P('Ah Kh'), P('Qs Qd'), P('7s 2d 9c'));
    expect(a.equity).toBeCloseTo(b.equity, 12);
    expect(a.winProbability).toBeCloseTo(b.winProbability, 12);
  });

  it('the spec example: wide hero range hand vs a strong range, flop', () => {
    const r = equityVsRange(P('Jh Ts'), parseRange('77+, AJs+, KQs, AQo+'), P('9d 8c 2h'));
    expect(r.method).toBe('exact');
    expect(r.equity).toBeGreaterThan(0.2);
    expect(r.equity).toBeLessThan(0.6);
  });

  it('throws when no combo is possible', () => {
    expect(() => equityVsRange(P('As Ah'), parseRange('AsAh'), [])).toThrow(/no villain combo/);
    const dead = withoutDeadCards(parseRange('AA'), P('As Ah'));
    expect(comboCount(dead)).toBe(1);
  });
});

describe('Monte Carlo is explicit, reproducible and controlled', () => {
  const hero = P('Ah Kh');
  const board = P('7s 2d 9c');

  it('is chosen automatically when exact enumeration is too expensive, and says so', () => {
    const r = equityVsRange(P('As Ah'), parseRange('TT+, AKs'));
    expect(estimateEvaluations(comboCount(parseRange('TT+, AKs')), 0)).toBeGreaterThan(2_000_000);
    expect(r.method).toBe('monte-carlo');
    expect(r.samples).toBe(20_000);
    expect(r.seed).toBe(1);
    expect(r.standardError).toBeGreaterThan(0);
    expect(r.equity).toBeGreaterThan(0.7);
    expect(r.equity).toBeLessThan(0.88);
  });

  it('the same seed gives the same result, another seed a different one', () => {
    const a = equityVsRange(hero, parseRange('QQ+, AKo'), board, { method: 'monte-carlo', seed: 7, samples: 5000 });
    const b = equityVsRange(hero, parseRange('QQ+, AKo'), board, { method: 'monte-carlo', seed: 7, samples: 5000 });
    const c = equityVsRange(hero, parseRange('QQ+, AKo'), board, { method: 'monte-carlo', seed: 8, samples: 5000 });
    expect(a).toEqual(b);
    expect(c.equity).not.toBe(a.equity);
  });

  it('an injected rng is used (and recorded as such: no seed reported)', () => {
    const r = equityVsHand(hero, P('Qs Qd'), board, { method: 'monte-carlo', rng: seededRng(99), samples: 2000 });
    expect(r.seed).toBeUndefined();
    expect(r.samples).toBe(2000);
    const again = equityVsHand(hero, P('Qs Qd'), board, { method: 'monte-carlo', rng: seededRng(99), samples: 2000 });
    expect(again).toEqual(r);
  });

  it('never touches Math.random', () => {
    const original = Math.random;
    Math.random = () => {
      throw new Error('Math.random must not be used');
    };
    try {
      expect(() => equityVsRange(hero, parseRange('QQ+, AKo'), board, { method: 'monte-carlo', samples: 500 })).not.toThrow();
    } finally {
      Math.random = original;
    }
  });

  it('converges to the exact value within a few standard errors', () => {
    const exact = equityVsRange(hero, parseRange('QQ+, AKo'), board);
    const mc = equityVsRange(hero, parseRange('QQ+, AKo'), board, { method: 'monte-carlo', samples: 60_000, seed: 3 });
    expect(Math.abs(mc.equity - exact.equity)).toBeLessThan(5 * (mc.standardError as number));
    expect(mc.method).toBe('monte-carlo');
    expect(exact.method).toBe('exact');
  });

  it('weighted ranges converge too', () => {
    const range = parseRange('QQ:0.3, AKo, 99:0.8');
    const exact = equityVsRange(hero, range, board);
    const mc = equityVsRange(hero, range, board, { method: 'monte-carlo', samples: 60_000, seed: 11 });
    expect(Math.abs(mc.equity - exact.equity)).toBeLessThan(5 * (mc.standardError as number));
  });

  it('hand-vs-hand Monte Carlo converges to the exact value', () => {
    const exact = equityVsHand(P('Ah Kh'), P('Qc Qd'), P('7s 2d 9c'));
    const mc = equityVsHand(P('Ah Kh'), P('Qc Qd'), P('7s 2d 9c'), { method: 'monte-carlo', samples: 50_000, seed: 5 });
    expect(Math.abs(mc.equity - exact.equity)).toBeLessThan(5 * (mc.standardError as number));
  });

  it('respects the exact-evaluation budget option', () => {
    const forcedMc = equityVsHand(hero, P('Qs Qd'), board, { maxExactEvaluations: 10, samples: 1000 });
    expect(forcedMc.method).toBe('monte-carlo');
    const forcedExact = equityVsHand(hero, P('Qs Qd'), board, { maxExactEvaluations: 10_000 });
    expect(forcedExact.method).toBe('exact');
  });

  it('rejects an invalid sample count', () => {
    expect(() => equityVsHand(hero, P('Qs Qd'), board, { method: 'monte-carlo', samples: 0 })).toThrow(RangeError);
  });
});

describe('input validation', () => {
  it('rejects duplicate cards and bad boards', () => {
    expect(() => equityVsHand(P('Ah Kh'), P('Ah Qd'), [])).toThrow(/duplicate/);
    expect(() => equityVsHand(P('Ah Kh'), P('Qs Qd'), P('Ah 2c 3d'))).toThrow(/duplicate/);
    expect(() => equityVsHand(P('Ah Kh'), P('Qs Qd'), P('2c 3d'))).toThrow(/board/);
    expect(() => equityVsHand(P('Ah'), P('Qs Qd'), [])).toThrow(RangeError);
    expect(() => equityVsHand(P('Ah Kh'), P('Qs'), [])).toThrow(RangeError);
  });
});
