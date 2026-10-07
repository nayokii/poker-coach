import { describe, expect, it } from 'vitest';
import { HandCategory, cardToString, parseCards, remainingDeck, seededRng, startHand, type GameState } from '../../../engine';
import { newGame, play, rigged } from '../../../engine/__tests__/helpers';
import { callEV, callEVFromEquity, equityVsHand, equityVsRange, parseRange, potOdds } from '../../math';
import { analyzeCoach, analyzeGameState, snapshotForCoach, type CoachAssumptions, type OpponentAssumption } from '..';

const P = parseCards;
const names = (cs: readonly { rank: number; suit: string }[]) => cs.map((c) => cardToString(c as never)).sort();
const range = (text: string, certainty: 'known' | 'hypothetical' = 'hypothetical', label?: string): OpponentAssumption => ({
  kind: 'range', range: parseRange(text), certainty, ...(label ? { label } : {}),
});
const exact = (hand: string): OpponentAssumption => ({ kind: 'exact-hand', hand: P(hand) });

const mk = (stacks = [2000, 2000, 2000]) => newGame(stacks, { sb: 10, bb: 20 });

/** First `n` cards (as text) that are not in `used`. */
const free = (used: string, n: number): string[] => remainingDeck(parseCards(used)).slice(0, n).map(cardToString);

/** Flop: hero (seat 0) with `hero`; the bots get free cards unless given; three players check to the flop. */
function flopState(hero: string, board: string, v1?: string, v2?: string, stacks?: number[]): GameState {
  const base = `${hero} ${board}`;
  const h1 = v1 ?? free(base, 2).join(' ');
  const h2 = v2 ?? free(`${base} ${h1}`, 2).join(' ');
  const runout = free(`${base} ${h1} ${h2}`, 2).join(' ');
  const s = rigged(mk(stacks), [hero, h1, h2], `${board} ${runout}`);
  return play(s, ['call'], ['call'], ['check']);
}

const state = () => flopState('Ah 5h', 'Kh 9h 2c');

describe('situation', () => {
  it('describes street, pot, stacks, position, players and what is owed', () => {
    const s = rigged(mk(), ['As Ks', '7c 2d', '8c 3d'], '2h 9h Jc 4s 5s');
    const a = analyzeGameState(s, 0);
    expect(a.situation).toMatchObject({
      street: 'preflop', handNumber: 1, heroSeat: 0, heroInHand: true, heroToAct: true, heroPosition: 'BTN',
      heroStack: 2000, pot: 30, effectiveStack: 1990, playersInHand: 3, knownCards: 2, unknownCards: 50,
    });
    expect(a.situation.opponents.map((o) => [o.seat, o.position])).toEqual([[1, 'SB'], [2, 'BB']]);
    expect(a.situation.facing).toEqual({ kind: 'bet', callAmount: 20, currentBet: 20, betToPotRatio: null, callIsAllIn: false });
    expect(a.situation.spr!.spr).toBeCloseTo(1990 / 30, 12);
    expect(a.spr).toEqual(a.situation.spr);
  });

  it('computes the bet size relative to the pot before the street bets', () => {
    let s = flopState('As Ks', '2h 9h Jc');
    s = play(s, ['bet', 60]); // seat 1 bets 60 into a 60-chip pot
    const a = analyzeGameState(s, 0);
    expect(a.situation.street).toBe('flop');
    expect(a.situation.pot).toBe(120);
    expect(a.situation.facing).toEqual({ kind: 'bet', callAmount: 60, currentBet: 60, betToPotRatio: 1, callIsAllIn: false });
    expect(a.situation.board).toHaveLength(3);
    expect(a.situation.knownCards).toBe(5);
    expect(a.situation.unknownCards).toBe(47);
  });

  it('reports a call that puts the hero all-in', () => {
    let s = flopState('As Ks', '2h 9h Jc', '7c 2d', '8c 3d', [200, 2000, 2000]);
    s = play(s, ['bet', 500], ['fold']);
    const a = analyzeGameState(s, 0);
    expect(a.situation.facing).toMatchObject({ kind: 'bet', callAmount: 180, callIsAllIn: true });
  });

  it('does not leak opponents hole cards into the snapshot', () => {
    const s = rigged(mk(), ['As Ks', '7c 2d', '8c 3d'], '2h 9h Jc 4s 5s');
    const snap = snapshotForCoach(s, 0);
    const text = JSON.stringify(snap);
    for (const c of ['7c', '2d', '8c', '3d']) expect(text).not.toContain(`"${c}"`);
    expect(Object.keys(snap.opponents[0]!)).not.toContain('holeCards');
    expect(snap.hero.map(cardToString)).toEqual(['As', 'Ks']);
  });

  it('does not mutate the game state', () => {
    const s = flopState('As Ks', '2h 9h Jc');
    const before = structuredClone(s);
    analyzeGameState(s, 0, { opponents: { 1: exact('7c 2d'), 2: exact('8c 3d') } });
    expect(s).toEqual(before);
  });
});

describe('hand strength', () => {
  it('preflop: starting-hand class and combo count', () => {
    const s = startHand(mk(), seededRng(3));
    const a = analyzeGameState(rigged(mk(), ['As Ks', '7c 2d', '8c 3d'], '2h 9h Jc 4s 5s'), 0);
    expect(a.handStrength).toEqual({ kind: 'preflop', handClass: 'AKs', combos: 4 });
    expect(analyzeGameState(rigged(mk(), ['Qs Qh', '7c 2d', '8c 3d'], '2h 9h Jc 4s 5s'), 0).handStrength).toEqual({ kind: 'preflop', handClass: 'QQ', combos: 6 });
    expect(analyzeGameState(rigged(mk(), ['As Kd', '7c 2d', '8c 3d'], '2h 9h Jc 4s 5s'), 0).handStrength).toMatchObject({ handClass: 'AKo', combos: 12 });
    void s;
  });

  it.each([
    ['7s 2d', 'Ah Kc 9h', HandCategory.HighCard],
    ['Ah 9d', 'Ac Kc 7h', HandCategory.Pair],
    ['Ah 9d', 'Ac 9c 7h', HandCategory.TwoPair],
    ['Ah 9d', 'Ac As 7h', HandCategory.ThreeOfAKind],
    ['9s 8d', '7c 6h 5d', HandCategory.Straight],
    ['As 2s', 'Ks 9s 4s', HandCategory.Flush],
    ['Ah 9d', 'Ac As 9h', HandCategory.FullHouse],
    ['Ah Ad', 'Ac As 9h', HandCategory.FourOfAKind],
    ['9s 8s', '7s 6s 5s', HandCategory.StraightFlush],
  ])('%s on %s', (hero, board, category) => {
    const s = flopState(hero, board);
    const a = analyzeGameState(s, 0);
    expect(a.handStrength).toMatchObject({ kind: 'made', category });
  });

  it('keeps what is needed to explain it later: best five, kickers, hole cards used, board plays', () => {
    const a = analyzeGameState(flopState('Ah 9d', 'Ac Kc 7h'), 0);
    expect(a.handStrength).toMatchObject({ kind: 'made', categoryName: 'Pair', description: 'Pair of aces', boardPlays: false });
    if (a.handStrength.kind !== 'made') throw new Error();
    expect(names(a.handStrength.holeCardsUsed)).toEqual(['9d', 'Ah']); // the nine plays as a kicker
    expect(a.handStrength.tiebreak.slice(0, 3)).toEqual([14, 13, 9]);
    expect(a.handStrength.bestFive).toHaveLength(5);

    const b = analyzeGameState(flopState('2s 3d', 'Ah Kc Qh', '4h 5d', '6c 7d'), 0);
    // turn and river do not matter on the flop: hero has high card on the board
    expect(b.handStrength).toMatchObject({ kind: 'made', category: HandCategory.HighCard });
  });

  it('board plays at the river', () => {
    let s = rigged(newGame([1000, 1000]), ['2c 3c', '4d 5d'], 'Th Jh Qh Kh Ah');
    s = play(s, ['call'], ['check'], ['check'], ['check'], ['check'], ['check']);
    const a = analyzeGameState(s, 0);
    expect(a.handStrength).toMatchObject({ kind: 'made', category: HandCategory.StraightFlush, boardPlays: true });
  });
});

describe('draws and outs (from the real game state)', () => {
    it('flush draw: 9 outs with the reason attached', () => {
    const a = analyzeGameState(state(), 0);
    if (a.draws.status !== 'available') throw new Error('draws expected');
    const fd = a.draws.draws.find((d) => d.kind === 'flush-draw')!;
    expect(fd.outs).toBe(9);
    expect(fd.relevance).toBe('major');
    expect(fd.reason).toMatchObject({ code: 'FOUR_TO_FLUSH', suit: 'h' });
    if (fd.reason.code !== 'FOUR_TO_FLUSH') throw new Error();
    expect(names(fd.reason.holeCards)).toEqual(['5h', 'Ah']);
    expect(names(fd.reason.boardCards)).toEqual(['9h', 'Kh']);
    expect(names(fd.cards).every((c) => c.endsWith('h'))).toBe(true);
  });

  it('outs: total, clean + dirty + unknown add up, cards come from the game state', () => {
    const a = analyzeGameState(state(), 0);
    if (a.outs.status !== 'available') throw new Error('outs expected');
    expect(a.outs.total).toBe(15);
    expect(a.outs.clean.length + a.outs.dirty.length + a.outs.unknown.length).toBe(a.outs.total);
    expect(a.outs.dirty).toHaveLength(0); // no opponent range assumed: dirty needs evidence
    expect(a.outs.qualityBasis).toBe('nuts-check');
    expect(a.outs.probabilities.unknownCards).toBe(47);
    expect(a.outs.probabilities.hitByLastCard).toBeCloseTo(1 - (32 * 31) / (47 * 46), 12);
    const known = new Set(['Ah', '5h', 'Kh', '9h', '2c']);
    for (const c of [...a.outs.clean, ...a.outs.dirty, ...a.outs.unknown]) expect(known.has(cardToString(c))).toBe(false);
    expect(Object.keys(a.outs.qualityOf)).toHaveLength(15);
  });

  it('with an opponent hand, out quality comes from that hand', () => {
    // villain 1 holds Qh Jh: a heart that completes hero flush may still lose to a higher heart flush
    const a = analyzeGameState(flopState('7h 6h', 'Kh 2h Qc', 'Ah Jh', '8d 3d'), 0, { opponents: { 1: exact('Ah Jh'), 2: exact('8d 3d') } });
    if (a.outs.status !== 'available') throw new Error();
    expect(a.outs.qualityBasis).toBe('opponent-ranges');
    expect(a.outs.dirty.length).toBeGreaterThan(0);
    const flushOuts = a.outs.byCategory.find((c) => c.category === HandCategory.Flush)!.cards;
    expect(flushOuts.length).toBeGreaterThan(0);
  });

  it('open-ended straight draw and the extra categories (full house draw) are reported with reasons', () => {
    const oe = analyzeGameState(flopState('8h 7d', '6c 5s 2h'), 0);
    if (oe.draws.status !== 'available') throw new Error();
    const d = oe.draws.draws.find((x) => x.kind === 'open-ended-straight-draw')!;
    expect(d.outs).toBe(8);
    expect(d.reason).toMatchObject({ code: 'STRAIGHT_COMPLETING_RANKS', completingRanks: [4, 9] });

    const fh = analyzeGameState(flopState('Ah Kd', 'As Ks 5c'), 0);
    if (fh.draws.status !== 'available') throw new Error();
    const fhd = fh.draws.draws.find((x) => x.kind === 'full-house-draw')!;
    expect(fhd.outs).toBe(4);
    expect(fhd.reason).toEqual({ code: 'IMPROVES_CATEGORY', from: HandCategory.TwoPair, to: HandCategory.FullHouse });
  });

  it('is not applicable preflop or on the river', () => {
    const pre = analyzeGameState(rigged(mk(), ['As Ks', '7c 2d', '8c 3d'], '2h 9h Jc 4s 5s'), 0);
    expect(pre.draws).toEqual({ status: 'not_applicable', reason: 'PREFLOP' });
    expect(pre.outs).toEqual({ status: 'not_applicable', reason: 'PREFLOP' });
    let s = rigged(newGame([1000, 1000]), ['2c 3c', '4d 5d'], 'Th Jh Qh Kh Ah');
    s = play(s, ['call'], ['check'], ['check'], ['check'], ['check'], ['check'], ['check']);
    expect(s.street).toBe('river');
    const river = analyzeGameState(s, 0);
    expect(river.outs).toEqual({ status: 'not_applicable', reason: 'RIVER' });
  });

  it('turn: one card to come and 46 unknown', () => {
    let s = flopState('Ah 5h', 'Kh 9h 2c');
    s = play(s, ['check'], ['check'], ['check']);
    expect(s.street).toBe('turn');
    const a = analyzeGameState(s, 0);
    if (a.outs.status !== 'available') throw new Error();
    expect(a.outs.probabilities.cardsToCome).toBe(1);
    expect(a.outs.probabilities.unknownCards).toBe(46);
  });
});

describe('equity: never invents a range', () => {
  it('without any information about the opponents the equity is unknown, with the seats listed', () => {
    const a = analyzeGameState(state(), 0);
    expect(a.equity).toEqual({ status: 'unknown_opponent_range', missingSeats: [1, 2] });
    expect(a.confidence.level).toBe('low');
    expect(a.confidence.reasons.map((r) => r.code)).toEqual(['NO_OPPONENT_INFO']);
    expect(a.blockers).toEqual({ status: 'no_range_assumed' });
    expect(JSON.stringify(a)).not.toMatch(/"equity":\d/);
  });

  it('partial information is still unknown (nothing is made up for the missing seat)', () => {
    const a = analyzeGameState(state(), 0, { opponents: { 1: range('QQ+') } });
    expect(a.equity).toEqual({ status: 'unknown_opponent_range', missingSeats: [2] });
    expect(a.confidence.level).toBe('low');
    expect(a.confidence.reasons[0]!.code).toBe('OPPONENT_INFO_MISSING');
  });

  it('exact opponent hands give an exact equity and high confidence', () => {
    const s = flopState('Ah Kh', '7s 2d 9c', 'Qs Qd', '5c 5d');
    const a = analyzeGameState(s, 0, { opponents: { 1: exact('Qs Qd'), 2: exact('5c 5d') } });
    if (a.equity.status !== 'computed') throw new Error('equity expected');
    expect(a.equity.method).toBe('exact');
    expect(a.equity.opponents.map((o) => o.source)).toEqual(['exact-hand', 'exact-hand']);
    expect(a.equity.equity + a.equity.opponentEquities.reduce((x, y) => x + y, 0)).toBeCloseTo(1, 12);
    expect(a.confidence.level).toBe('high');
    expect(a.confidence.reasons.map((r) => r.code)).toEqual(['ALL_OPPONENTS_EXACT_OR_KNOWN_RANGE']);
  });

  it('heads-up exact hand equals the math engine', () => {
    let s = rigged(newGame([1000, 1000]), ['Ah Kh', 'Qs Qd'], '7s 2d 9c 4c 3h');
    s = play(s, ['call'], ['check']);
    const a = analyzeGameState(s, 0, { opponents: { 1: exact('Qs Qd') } });
    const ref = equityVsHand(P('Ah Kh'), P('Qs Qd'), P('7s 2d 9c'));
    if (a.equity.status !== 'computed') throw new Error();
    expect(a.equity.equity).toBeCloseTo(ref.equity, 12);
    expect(a.equity.winProbability).toBeCloseTo(ref.winProbability, 12);
    expect(a.equity.tieProbability).toBeCloseTo(ref.tieProbability, 12);
    expect(a.equity.lossProbability).toBeCloseTo(ref.lossProbability, 12);
  });

  it('a hypothetical range gives medium confidence and a labelled assumption; a known range gives high', () => {
    let s = rigged(newGame([1000, 1000]), ['Ah Kh', 'Qs Qd'], '7s 2d 9c 4c 3h');
    s = play(s, ['call'], ['check']);
    const hyp = analyzeGameState(s, 0, { opponents: { 1: range('QQ+, AKo', 'hypothetical', 'TAG') } });
    const known = analyzeGameState(s, 0, { opponents: { 1: range('QQ+, AKo', 'known') } });
    const ref = equityVsRange(P('Ah Kh'), parseRange('QQ+, AKo'), P('7s 2d 9c'));
    if (hyp.equity.status !== 'computed' || known.equity.status !== 'computed') throw new Error();
    expect(hyp.equity.equity).toBeCloseTo(ref.equity, 12);
    expect(hyp.equity.opponents[0]).toMatchObject({ source: 'hypothetical-range', label: 'TAG' });
    expect(known.equity.opponents[0]!.source).toBe('known-range');
    expect(hyp.confidence.level).toBe('medium');
    expect(hyp.confidence.reasons[0]!.code).toBe('HYPOTHETICAL_RANGES');
    expect(known.confidence.level).toBe('high');
    expect(hyp.assumptionsUsed.some((x) => x.includes('hypothetical range') && x.includes('TAG'))).toBe(true);
  });

  it('multiway ranges: hero equity and every opponent equity sum to 1, with the independence caveat', () => {
    const a = analyzeGameState(flopState('Ah Kh', '7s 2d 9c', 'Qs Qd', '5c 5d'), 0, {
      opponents: { 1: range('QQ+'), 2: range('55-99') },
    });
    if (a.equity.status !== 'computed') throw new Error();
    expect(a.equity.opponents).toHaveLength(2);
    expect(a.equity.equity + a.equity.opponentEquities.reduce((x, y) => x + y, 0)).toBeCloseTo(1, 10);
    expect(a.confidence.reasons.map((r) => r.code)).toContain('MULTIWAY_INDEPENDENT_RANGES');
  });

  it('Monte Carlo is flagged as an estimate, reproducible for a seed, and keeps the sample count', () => {
    const s = rigged(mk(), ['Ah Kh', '7c 2d', '8c 3d'], '2h 9h Jc 4s 5s');
    const assume: CoachAssumptions = {
      opponents: { 1: range('22+, A2s+, K9s+, ATo+'), 2: range('22+, A2s+, K9s+, ATo+') },
      equity: { samples: 4000, seed: 5 },
    };
    const a = analyzeGameState(s, 0, assume);
    const b = analyzeGameState(s, 0, assume);
    if (a.equity.status !== 'computed') throw new Error();
    expect(a.equity.method).toBe('monte-carlo');
    expect(a.equity.samples).toBe(4000);
    expect(a.equity.seed).toBe(5);
    expect(a.equity.standardError).toBeGreaterThan(0);
    expect(a.confidence.reasons.map((r) => r.code)).toContain('ESTIMATED_BY_SIMULATION');
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });

  it('is not applicable when the hero folded or nobody is left', () => {
    let s = flopState('As Ks', '2h 9h Jc');
    s = play(s, ['bet', 60], ['fold']);
    s = play(s, ['fold']); // hero folds
    const a = analyzeGameState(s, 0);
    expect(a.equity).toEqual({ status: 'not_applicable', reason: 'HERO_NOT_IN_HAND' });
    expect(a.situation.heroInHand).toBe(false);
    expect(a.situation.facing).toEqual({ kind: 'none' });
    expect(a.ev.status).toBe('insufficient_data');
    const done = analyzeGameState(play(startHand(newGame([1000, 1000]), seededRng(2)), ['fold']), 1);
    expect(done.equity.status).toBe('not_applicable');
  });
});

describe('pot odds', () => {
  it('computes cost, pot, required equity and ratio only when a call is owed', () => {
    const a = analyzeGameState(rigged(mk(), ['As Ks', '7c 2d', '8c 3d'], '2h 9h Jc 4s 5s'), 0);
    if (a.potOdds.status !== 'available') throw new Error();
    expect(a.potOdds.odds).toEqual(potOdds(30, 20));
    expect(a.potOdds.odds.requiredEquity).toBeCloseTo(0.4, 12);
    expect(a.potOdds.comparison).toBeNull(); // no equity known: no comparison invented
    expect(a.potOdds.implied).toBeNull();
  });

  it('says there is no call decision when nothing is owed', () => {
    expect(analyzeGameState(flopState('As Ks', '2h 9h Jc'), 0).potOdds).toEqual({ status: 'no_call_decision' });
  });

  it('compares equity with the requirement when the equity is known', () => {
    let s = flopState('Ah Kh', '7s 2d 9c', 'Qs Qd', '5c 5d');
    s = play(s, ['bet', 60], ['fold']);
    const a = analyzeGameState(s, 0, { opponents: { 1: exact('Qs Qd') } });
    if (a.potOdds.status !== 'available' || a.equity.status !== 'computed') throw new Error();
    expect(a.potOdds.odds).toMatchObject({ potBeforeCall: 120, callAmount: 60, requiredEquity: 60 / 180 });
    expect(a.potOdds.comparison!.equity).toBe(a.equity.equity);
    expect(a.potOdds.comparison!.margin).toBeCloseTo(a.equity.equity - 60 / 180, 12);
    expect(a.potOdds.comparison!.meetsRequirement).toBe(a.equity.equity >= 60 / 180);
  });

  it('adds implied odds only from explicit assumptions, and reports missing ones', () => {
    let s = flopState('Ah Kh', '7s 2d 9c', 'Qs Qd', '5c 5d');
    s = play(s, ['bet', 60], ['fold']);
    const none = analyzeGameState(s, 0, { opponents: { 1: exact('Qs Qd') } });
    if (none.potOdds.status !== 'available') throw new Error();
    expect(none.potOdds.implied).toBeNull();
    const partial = analyzeGameState(s, 0, { opponents: { 1: exact('Qs Qd') }, implied: { futureWinWhenHit: 100 } });
    if (partial.potOdds.status !== 'available') throw new Error();
    expect(partial.potOdds.implied!.status).toBe('indeterminate');
    const full = analyzeGameState(s, 0, { opponents: { 1: exact('Qs Qd') }, implied: { stackBehind: 1000, futureWinWhenHit: 100, payoffProbability: 0.5 } });
    if (full.potOdds.status !== 'available') throw new Error();
    expect(full.potOdds.implied!.status).toBe('complete');
  });
});

describe('EV', () => {
  const facingBet = () => {
    let s = flopState('Ah Kh', '7s 2d 9c', 'Qs Qd', '5c 5d');
    s = play(s, ['bet', 60], ['fold']);
    return s;
  };

  it('is insufficient_data without opponent information, naming what is missing', () => {
    const a = analyzeGameState(facingBet(), 0);
    expect(a.ev).toEqual({ status: 'insufficient_data', missing: ['opponent hand or range (needed for equity)'] });
  });

  it('heads-up call EV matches callEV exactly, with its assumptions', () => {
    const s = facingBet();
    const a = analyzeGameState(s, 0, { opponents: { 1: exact('Qs Qd') } });
    const ref = equityVsHand(P('Ah Kh'), P('Qs Qd'), P('7s 2d 9c'));
    const expected = callEV({
      potBeforeCall: 120, callAmount: 60, winProbability: ref.winProbability, tieProbability: ref.tieProbability, lossProbability: ref.lossProbability,
    });
    if (a.ev.status !== 'complete') throw new Error();
    expect(a.ev.kind).toBe('call');
    expect(a.ev.ev).toBeCloseTo(expected.ev, 10);
    expect(a.ev.breakEvenEquity).toBeCloseTo(60 / 180, 12);
    expect(a.ev.assumptions.length).toBeGreaterThan(1);
  });

  it('multiway call EV uses the equity share formula', () => {
    let s = flopState('Ah Kh', '7s 2d 9c', 'Qs Qd', '5c 5d');
    s = play(s, ['bet', 60]); // seat 2 still to act: hero faces 60 with two opponents in the hand
    s = play(s, ['call']); // seat 2 calls (hero is not to act yet, but the state keeps all three)
    expect(s.players.filter((p) => p.status === 'active')).toHaveLength(3);
    const a = analyzeGameState(s, 0, { opponents: { 1: exact('Qs Qd'), 2: exact('5c 5d') } });
    if (a.equity.status !== 'computed' || a.ev.status !== 'complete') throw new Error();
    expect(a.ev.ev).toBeCloseTo(callEVFromEquity(a.situation.pot, 60, a.equity.equity).ev, 10);
  });

  it('a bet needs explicit assumptions: otherwise insufficient_data lists exactly what is missing', () => {
    const s = flopState('Ah Kh', '7s 2d 9c');
    const none = analyzeGameState(s, 0);
    expect(none.ev.status).toBe('insufficient_data');
    const some = analyzeGameState(s, 0, { bet: { betAmount: 60, foldEquity: 0.4 } });
    if (some.ev.status !== 'insufficient_data') throw new Error();
    expect(some.ev.missing[0]).toContain('win probability when called');
    expect(some.ev.missing[0]).not.toContain('bet size');
    expect(some.ev.missing[0]).not.toContain('fold equity');
  });

  it('computes a bet EV when every assumption is supplied', () => {
    const s = flopState('Ah Kh', '7s 2d 9c');
    const a = analyzeGameState(s, 0, { bet: { betAmount: 40, foldEquity: 0.5, winWhenCalled: 0.5, tieWhenCalled: 0, lossWhenCalled: 0.5 } });
    if (a.ev.status !== 'complete') throw new Error();
    expect(a.ev.kind).toBe('bet');
    expect(a.ev.ev).toBeCloseTo(0.5 * 60 + 0.5 * (0.5 * 100 - 0.5 * 40), 10);
  });
});

describe('blockers', () => {
  it('reports how the hero cards shrink the assumed range', () => {
    const a = analyzeGameState(flopState('As Ks', '2h 9h Jc'), 0, { opponents: { 1: range('AA, KK, AKs', 'hypothetical', 'test'), 2: range('QQ') } });
    if (a.blockers.status !== 'available') throw new Error();
    const r = a.blockers.ranges[0]!;
    expect(r).toMatchObject({ seat: 1, label: 'test', totalCombos: 16, blockedCombos: 3 + 3 + 1, remainingCombos: 9 });
    expect(r.blockedByCard).toMatchObject({ As: 4, Ks: 4 }); // As: AA x3 + AsKs; Ks: KK x3 + AsKs
    expect(r.mostAffected.slice(0, 2).map((x) => [x.handClass, x.blocked, x.total])).toEqual([['AA', 3, 6], ['KK', 3, 6]]);
    const q = a.blockers.ranges[1]!;
    expect(q.blockedCombos).toBe(0);
    expect(q.mostAffected).toEqual([]);
  });

  it('is absent when only exact hands or nothing are assumed', () => {
    const s = flopState('As Ks', '2h 9h Jc');
    expect(analyzeGameState(s, 0, { opponents: { 1: exact('7c 2d'), 2: exact('8c 3d') } }).blockers).toEqual({ status: 'no_range_assumed' });
  });
});

describe('structure and determinism', () => {
  it('always returns every section and a plain-data (JSON-safe) structure', () => {
    const a = analyzeGameState(flopState('Ah 5h', 'Kh 9h 2c'), 0, { opponents: { 1: range('QQ+'), 2: range('TT+') } });
    expect(Object.keys(a).sort()).toEqual(
      ['assumptionsUsed', 'blockers', 'confidence', 'draws', 'equity', 'ev', 'handStrength', 'outs', 'potOdds', 'situation', 'spr', 'version'].sort(),
    );
    expect(a.version).toBe(1);
    expect(JSON.parse(JSON.stringify(a))).toEqual(a);
    expect(analyzeGameState(flopState('Ah 5h', 'Kh 9h 2c'), 0, { opponents: { 1: range('QQ+'), 2: range('TT+') } })).toEqual(a);
  });

  it('analyzeCoach on a snapshot equals analyzeGameState on the state', () => {
    const s = flopState('Ah 5h', 'Kh 9h 2c');
    expect(analyzeCoach(snapshotForCoach(s, 0))).toEqual(analyzeGameState(s, 0));
  });

  it('works from any seat (a bot as the analysed player)', () => {
    const s = flopState('Ah 5h', 'Kh 9h 2c', '7c 7d', '8c 3d');
    const a = analyzeGameState(s, 1);
    expect(a.situation.heroSeat).toBe(1);
    expect(a.handStrength).toMatchObject({ kind: 'made', category: HandCategory.Pair });
    expect(a.situation.opponents.map((o) => o.seat)).toEqual([0, 2]);
  });
});
