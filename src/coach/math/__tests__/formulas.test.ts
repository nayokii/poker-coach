import { describe, expect, it } from 'vitest';
import { applyAction, getLegalActions, seededRng, startHand } from '../../../engine';
import { newGame, play } from '../../../engine/__tests__/helpers';
import {
  SPR_THRESHOLDS, betEV, callEV, effectiveStackFromState, expectedValue, impliedOdds, potOdds, potOddsFromBet, potOddsFromState,
  reverseImpliedOdds, snapshotFromState, spr, sprCategory, sprFromState,
} from '..';

describe('pot odds', () => {
  it('the spec example: pot 20, villain bets 10, call 10 -> 25%', () => {
    const o = potOddsFromBet(20, 10);
    expect(o).toMatchObject({ potBeforeCall: 30, callAmount: 10, potAfterCall: 40, requiredEquity: 0.25, percentage: 25 });
    expect(o.ratio).toBe(3);
    expect(potOdds(30, 10)).toEqual(o);
  });

  it.each([
    [100, 50, 50 / 150, 2], // half-pot bet: pot incl. bet = 100? no: potBeforeCall = 100, call 50 -> 33.3%
    [30, 30, 0.5, 1],
    [90, 30, 0.25, 3],
    [60, 100, 100 / 160, 0.6], // overbet
    [1000, 10, 10 / 1010, 100],
  ])('pot %d, call %d', (pot, call, req, ratio) => {
    const o = potOdds(pot, call);
    expect(o.requiredEquity).toBeCloseTo(req, 12);
    expect(o.ratio).toBeCloseTo(ratio, 12);
    expect(o.potAfterCall).toBe(pot + call);
    expect(o.percentage).toBeCloseTo(req * 100, 10);
  });

  it('a pot-sized bet always needs 1/3', () => {
    for (const pot of [10, 37, 200, 1234]) expect(potOddsFromBet(pot, pot).requiredEquity).toBeCloseTo(1 / 3, 12);
  });

  it('a free call needs no equity', () => {
    expect(potOdds(50, 0)).toMatchObject({ requiredEquity: 0, ratio: Infinity });
    expect(potOdds(0, 0).requiredEquity).toBe(0);
  });

  it('a call capped by the stack uses the capped amount', () => {
    expect(potOddsFromBet(20, 100, 15)).toMatchObject({ potBeforeCall: 120, callAmount: 15, requiredEquity: 15 / 135 });
  });

  it('rejects invalid input', () => {
    expect(() => potOdds(-1, 5)).toThrow(RangeError);
    expect(() => potOdds(5, NaN)).toThrow(RangeError);
  });

  it('reads the engine state: pot includes the bet being called', () => {
    // 3-handed: blinds 5/10, button raises to 30, small blind folds -> big blind faces 20 more into 55 chips
    let s = startHand(newGame([1000, 1000, 1000]), seededRng(1));
    s = play(s, ['raise', 30], ['fold']);
    const legal = getLegalActions(s)!;
    expect(legal.player).toBe(2);
    expect(potOddsFromState(s, 2)).toMatchObject({ potBeforeCall: 45, callAmount: 20, potAfterCall: 65 });
    expect(potOddsFromState(s, 0)).toBeNull(); // not his turn
    const fresh = startHand(newGame([1000, 1000, 1000]), seededRng(1));
    expect(potOddsFromState(fresh, 0)).toMatchObject({ potBeforeCall: 15, callAmount: 10 });
    void applyAction;
  });
});

describe('SPR', () => {
  it.each([
    [100, 100, 1, 'low'],
    [100, 200, 0.5, 'very-low'],
    [300, 100, 3, 'medium'],
    [250, 100, 2.5, 'low'],
    [500, 100, 5, 'medium'],
    [600, 100, 6, 'high'],
    [1000, 100, 10, 'high'],
    [1300, 100, 13, 'very-high'],
    [5000, 100, 50, 'very-high'],
  ])('stack %d / pot %d = %d (%s)', (stack, pot, ratio, cat) => {
    const r = spr(stack, pot);
    expect(r).toEqual({ effectiveStack: stack, pot, spr: ratio, category: cat });
  });

  it('centralises the thresholds', () => {
    expect(SPR_THRESHOLDS).toEqual({ veryLow: 1, low: 3, medium: 6, high: 13 });
    expect(sprCategory(0.99)).toBe('very-low');
    expect(sprCategory(1)).toBe('low');
    expect(sprCategory(2.999)).toBe('low');
    expect(sprCategory(3)).toBe('medium');
    expect(sprCategory(6)).toBe('high');
    expect(sprCategory(13)).toBe('very-high');
  });

  it('handles empty pots and stacks', () => {
    expect(spr(100, 0).spr).toBe(Infinity);
    expect(spr(100, 0).category).toBe('very-high');
    expect(spr(0, 0).spr).toBe(0);
    expect(() => spr(-1, 10)).toThrow(RangeError);
  });

  it('derives the effective stack from the engine state (shorter of hero and biggest live opponent)', () => {
    let s = startHand(newGame([500, 1000, 200]), seededRng(1));
    s = play(s, ['call'], ['call'], ['check']); // flop, 3 players
    const hero = s.players.findIndex((p) => p.stack === 490);
    expect(hero).toBe(0);
    expect(effectiveStackFromState(s, 0)).toBe(490); // hero 490 < opponent 990
    expect(effectiveStackFromState(s, 1)).toBe(490); // 990 vs the biggest opponent behind: hero 0 (490)
    const r = sprFromState(s, 0)!;
    expect(r.pot).toBe(30);
    expect(r.spr).toBeCloseTo(490 / 30, 12);
  });

  it('ignores folded opponents', () => {
    let s = startHand(newGame([1000, 1000, 50]), seededRng(1));
    s = play(s, ['raise', 100], ['fold'], ['fold']);
    expect(effectiveStackFromState(s, 0)).toBeNull(); // everyone folded
  });
});

describe('EV of a call', () => {
  it('positive: 40% equity vs 25% required', () => {
    const e = callEV({ potBeforeCall: 30, callAmount: 10, winProbability: 0.4, tieProbability: 0, lossProbability: 0.6 });
    expect(e.ev).toBeCloseTo(0.4 * 30 - 0.6 * 10, 12);
    expect(e.ev).toBeCloseTo(0.4 * 40 - 10, 12);
    expect(e.ev).toBeGreaterThan(0);
    expect(e.breakEvenEquity).toBe(0.25);
  });

  it('negative: 20% equity vs 25% required', () => {
    const e = callEV({ potBeforeCall: 30, callAmount: 10, winProbability: 0.2, tieProbability: 0, lossProbability: 0.8 });
    expect(e.ev).toBeCloseTo(0.2 * 40 - 10, 12);
    expect(e.ev).toBeLessThan(0);
  });

  it('breakeven exactly at the pot-odds equity', () => {
    const e = callEV({ potBeforeCall: 30, callAmount: 10, winProbability: 0.25, tieProbability: 0, lossProbability: 0.75 });
    expect(e.ev).toBeCloseTo(0, 12);
  });

  it('ties are worth half: the closed form win + tie/2 agrees', () => {
    const e = callEV({ potBeforeCall: 30, callAmount: 10, winProbability: 0.3, tieProbability: 0.2, lossProbability: 0.5 });
    expect(e.equity).toBeCloseTo(0.4, 12);
    expect(e.ev).toBeCloseTo(0.4 * 40 - 10, 12);
    expect(e.netWhenTie).toBe(10); // (30 - 10) / 2
  });

  it('a certain tie wins half the pot minus nothing extra: net (pot - call) / 2', () => {
    const e = callEV({ potBeforeCall: 100, callAmount: 40, winProbability: 0, tieProbability: 1, lossProbability: 0 });
    expect(e.ev).toBe(30);
  });

  it('a certain loss costs the call, a certain win gains the pot', () => {
    expect(callEV({ potBeforeCall: 50, callAmount: 20, winProbability: 0, tieProbability: 0, lossProbability: 1 }).ev).toBe(-20);
    expect(callEV({ potBeforeCall: 50, callAmount: 20, winProbability: 1, tieProbability: 0, lossProbability: 0 }).ev).toBe(50);
  });

  it('always states its assumptions and rejects inconsistent probabilities', () => {
    const e = callEV({ potBeforeCall: 30, callAmount: 10, winProbability: 0.4, tieProbability: 0, lossProbability: 0.6 });
    expect(e.assumptions.length).toBeGreaterThanOrEqual(2);
    expect(() => callEV({ potBeforeCall: 30, callAmount: 10, winProbability: 0.5, tieProbability: 0.5, lossProbability: 0.5 })).toThrow(RangeError);
    expect(() => callEV({ potBeforeCall: -1, callAmount: 10, winProbability: 1, tieProbability: 0, lossProbability: 0 })).toThrow(RangeError);
  });

  it('EV positive <=> equity above the pot-odds requirement (sweep)', () => {
    for (let eq = 0; eq <= 1; eq += 0.05) {
      const e = callEV({ potBeforeCall: 80, callAmount: 40, winProbability: eq, tieProbability: 0, lossProbability: 1 - eq });
      expect(Math.sign(Math.round(e.ev * 1e9))).toBe(Math.sign(Math.round((eq - e.breakEvenEquity) * 1e9)));
    }
  });
});

describe('EV of a bet (fold equity + value when called)', () => {
  it('a bet that always folds wins the pot', () => {
    const e = betEV({ potBeforeBet: 100, betAmount: 50, foldEquity: 1, winWhenCalled: 0, tieWhenCalled: 0, lossWhenCalled: 1 });
    expect(e.ev).toBe(100);
  });

  it('a bet that is always called is a showdown with extra chips in', () => {
    const e = betEV({ potBeforeBet: 100, betAmount: 50, foldEquity: 0, winWhenCalled: 0.6, tieWhenCalled: 0, lossWhenCalled: 0.4 });
    expect(e.ev).toBeCloseTo(0.6 * 150 - 0.4 * 50, 12);
  });

  it('mixes fold equity and showdown value', () => {
    const e = betEV({ potBeforeBet: 100, betAmount: 50, foldEquity: 0.4, winWhenCalled: 0.3, tieWhenCalled: 0.1, lossWhenCalled: 0.6 });
    const called = 0.3 * 150 + 0.1 * 50 - 0.6 * 50;
    expect(e.evWhenCalled).toBeCloseTo(called, 12);
    expect(e.ev).toBeCloseTo(0.4 * 100 + 0.6 * called, 12);
    expect(e.assumptions.length).toBeGreaterThan(1);
  });

  it('a bluff is profitable when fold equity exceeds bet / (pot + bet)', () => {
    // pure bluff (never wins when called): EV = f * pot - (1 - f) * bet -> breakeven f = bet / (pot + bet)
    const be = 50 / 150;
    const at = betEV({ potBeforeBet: 100, betAmount: 50, foldEquity: be, winWhenCalled: 0, tieWhenCalled: 0, lossWhenCalled: 1 });
    expect(at.ev).toBeCloseTo(0, 12);
    expect(betEV({ potBeforeBet: 100, betAmount: 50, foldEquity: be + 0.1, winWhenCalled: 0, tieWhenCalled: 0, lossWhenCalled: 1 }).ev).toBeGreaterThan(0);
    expect(betEV({ potBeforeBet: 100, betAmount: 50, foldEquity: be - 0.1, winWhenCalled: 0, tieWhenCalled: 0, lossWhenCalled: 1 }).ev).toBeLessThan(0);
  });

  it('validates its inputs', () => {
    expect(() => betEV({ potBeforeBet: 100, betAmount: 50, foldEquity: 1.2, winWhenCalled: 1, tieWhenCalled: 0, lossWhenCalled: 0 })).toThrow(RangeError);
    expect(() => betEV({ potBeforeBet: 100, betAmount: 50, foldEquity: 0.5, winWhenCalled: 0.5, tieWhenCalled: 0, lossWhenCalled: 0.2 })).toThrow(RangeError);
  });
});

describe('generic EV', () => {
  it('weights arbitrary outcomes', () => {
    expect(expectedValue([{ probability: 0.5, value: 10 }, { probability: 0.5, value: -4 }]).ev).toBe(3);
  });
  it('rejects probabilities that do not sum to one', () => {
    expect(() => expectedValue([{ probability: 0.5, value: 10 }])).toThrow(RangeError);
  });
});

describe('implied odds (explicit assumptions, never invented)', () => {
  const base = { potBeforeCall: 30, callAmount: 10 };

  it('without assumptions the result is indeterminate and names what is missing', () => {
    const r = impliedOdds(base);
    expect(r.status).toBe('indeterminate');
    expect(r.immediateRequiredEquity).toBe(0.25);
    if (r.status === 'indeterminate') expect(r.missing.length).toBeGreaterThan(0);
  });

  it('missing fields are reported one by one', () => {
    const r = impliedOdds({ ...base, implied: { futureWinWhenHit: 50 } });
    expect(r.status).toBe('indeterminate');
    if (r.status === 'indeterminate') expect(r.missing).toEqual(expect.arrayContaining(['stackBehind', 'implied.payoffProbability']));
  });

  it('computes the required equity with implied winnings', () => {
    const r = impliedOdds({ ...base, stackBehind: 200, implied: { futureWinWhenHit: 60, payoffProbability: 0.5 }, equity: 0.2 });
    expect(r.status).toBe('complete');
    if (r.status !== 'complete') return;
    expect(r.expectedFutureWin).toBe(30);
    expect(r.immediateRequiredEquity).toBe(0.25);
    expect(r.requiredEquity).toBeCloseTo(10 / (30 + 10 + 30), 12); // 14.3%
    expect(r.profitable).toBe(true); // 20% > 14.3% while 20% < 25% immediate odds
    expect(r.ev).toBeCloseTo(0.2 * (30 + 30) - 0.8 * 10, 12);
    expect(r.assumptions.length).toBeGreaterThan(1);
  });

  it('caps the implied winnings by the stack behind', () => {
    const r = impliedOdds({ ...base, stackBehind: 20, implied: { futureWinWhenHit: 500, payoffProbability: 1 } });
    if (r.status !== 'complete') throw new Error('expected complete');
    expect(r.expectedFutureWin).toBe(20);
  });

  it('implied odds can turn a losing call into a winning one, but only on stated assumptions', () => {
    const noImplied = impliedOdds({ ...base, stackBehind: 100, implied: { futureWinWhenHit: 0, payoffProbability: 0 }, equity: 0.2 });
    const withImplied = impliedOdds({ ...base, stackBehind: 100, implied: { futureWinWhenHit: 100, payoffProbability: 0.6 }, equity: 0.2 });
    if (noImplied.status !== 'complete' || withImplied.status !== 'complete') throw new Error('expected complete');
    expect(noImplied.profitable).toBe(false);
    expect(withImplied.profitable).toBe(true);
  });

  it('reverse implied odds raise the requirement', () => {
    const r = reverseImpliedOdds({ ...base, stackBehind: 100, reverse: { futureLossWhenBeaten: 40, reverseProbability: 0.5 }, equity: 0.3 });
    if (r.status !== 'complete') throw new Error('expected complete');
    expect(r.expectedFutureLoss).toBe(20);
    expect(r.requiredEquity).toBeCloseTo(30 / (30 + 10 + 20), 12); // 50%
    expect(r.requiredEquity).toBeGreaterThan(r.immediateRequiredEquity);
    expect(r.profitable).toBe(false);
  });

  it('reverse implied odds without assumptions are indeterminate', () => {
    expect(reverseImpliedOdds(base).status).toBe('indeterminate');
  });

  it('combines both and validates ranges', () => {
    const r = impliedOdds({
      ...base, stackBehind: 100,
      implied: { futureWinWhenHit: 50, payoffProbability: 0.5 },
      reverse: { futureLossWhenBeaten: 20, reverseProbability: 0.25 },
    });
    if (r.status !== 'complete') throw new Error('expected complete');
    expect(r.requiredEquity).toBeCloseTo((10 + 5) / (30 + 10 + 25 + 5), 12);
    expect(() => impliedOdds({ ...base, stackBehind: 100, implied: { futureWinWhenHit: 50, payoffProbability: 1.5 } })).toThrow(RangeError);
    expect(() => impliedOdds({ ...base, stackBehind: -5, implied: { futureWinWhenHit: 1, payoffProbability: 1 } })).toThrow(RangeError);
  });
});

describe('game state -> math snapshot', () => {
  it('exposes only what the hero knows and derives the numbers', () => {
    let s = startHand(newGame([2000, 2000, 2000], { sb: 10, bb: 20 }), seededRng(4));
    s = play(s, ['call'], ['call'], ['check']); // flop
    const snap = snapshotFromState(s, 0);
    expect(snap.board).toHaveLength(3);
    expect(snap.hero).toEqual(s.players[0]!.holeCards);
    expect(snap.unknownCards).toBe(47);
    expect(snap.pot).toBe(60);
    expect(snap.opponentsInHand).toBe(2);
    expect(snap.callAmount).toBe(0);
    expect(snap.potOdds).toBeNull();
    expect(snap.spr!.spr).toBeCloseTo(1980 / 60, 12);
    expect(snap.outs!.unknownCards).toBe(47);
    expect(JSON.stringify(snap)).not.toContain(JSON.stringify(s.players[1]!.holeCards));
  });

  it('computes pot odds and has no outs preflop', () => {
    const s = startHand(newGame([2000, 2000, 2000], { sb: 10, bb: 20 }), seededRng(4));
    const snap = snapshotFromState(s, 0);
    expect(snap.outs).toBeNull();
    expect(snap.unknownCards).toBe(50);
    expect(snap.potOdds).toMatchObject({ potBeforeCall: 30, callAmount: 20 });
  });

  it('rejects a seat without cards', () => {
    expect(() => snapshotFromState(newGame([100, 100]), 0)).toThrow(RangeError);
  });
});
