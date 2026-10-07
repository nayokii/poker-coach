/**
 * Coach analysis: CoachSnapshot (+ explicit assumptions) -> structured CoachAnalysis.
 *
 *   Game State -> Math Engine -> Coach Analysis (this file) -> future explanation engine -> future UI
 *
 * Every number comes from the math engine. Anything that cannot be justified by the snapshot or by the
 * supplied assumptions is returned as unknown / insufficient_data with the reason, never as a guess.
 */
import {
  CATEGORY_NAMES, HandCategory, cardToString, describeHand, evaluateHand, type Card, type GameState, type Rank,
} from '../../engine';
import {
  analyzeBlockers, analyzeOuts, betEV, callEV, callEVFromEquity, comboFromCards, equityMultiway, handClassOf, handClassToString,
  impliedOdds, mergeRanges, potOdds, rangeFromCombos, spr as computeSpr, summarizeByClass,
  type EquityOptions, type MultiwayPlayer, type MultiwayResult, type OutsAnalysis, type Range,
} from '../math';
import { snapshotForCoach, type CoachSnapshot } from './snapshot';
import type {
  BlockersInfo, CoachAnalysis, CoachAssumptions, CoachDrawKind, ConfidenceInfo, ConfidenceReasonCode, DrawInfo, DrawsInfo,
  EquityInfo, EquityOpponent, EVInfo, Facing, HandStrengthInfo, OpponentAssumption, OutsInfo, PotOddsInfo, Situation,
} from './types';

const names = (cs: readonly Card[]): string[] => cs.map(cardToString);

function buildSituation(s: CoachSnapshot): Situation {
  const heroInHand = s.heroStatus === 'active' || s.heroStatus === 'allin';
  const eff = heroInHand && s.opponents.length > 0 ? Math.min(s.heroStack, Math.max(...s.opponents.map((o) => o.stack))) : null;
  const callAmount = heroInHand ? Math.min(Math.max(0, s.currentBet - s.heroBet), s.heroStack) : 0;
  const potExcludingBets = s.pot - s.streetBets;
  const facing: Facing =
    callAmount > 0
      ? {
          kind: 'bet',
          callAmount,
          currentBet: s.currentBet,
          betToPotRatio: potExcludingBets > 0 ? s.currentBet / potExcludingBets : null,
          callIsAllIn: callAmount >= s.heroStack,
        }
      : { kind: 'none' };
  const known = s.hero.length + s.board.length;
  return {
    street: s.street,
    handNumber: s.handNumber,
    heroSeat: s.heroSeat,
    heroInHand,
    heroToAct: s.heroToAct,
    heroPosition: s.heroPosition,
    heroStack: s.heroStack,
    pot: s.pot,
    effectiveStack: eff,
    spr: eff === null ? null : computeSpr(eff, s.pot),
    playersInHand: s.opponents.length + (heroInHand ? 1 : 0),
    opponents: s.opponents.map((o) => ({ seat: o.seat, name: o.name, position: o.position, stack: o.stack, status: o.status })),
    facing,
    hero: s.hero.slice(),
    board: s.board.slice(),
    knownCards: known,
    unknownCards: 52 - known,
  };
}

function buildHandStrength(s: CoachSnapshot): HandStrengthInfo {
  if (s.hero.length !== 2) return { kind: 'not_available', reason: 'NO_HOLE_CARDS' };
  if (s.board.length === 0) {
    const hc = handClassOf(comboFromCards(s.hero[0] as Card, s.hero[1] as Card));
    return { kind: 'preflop', handClass: handClassToString(hc), combos: hc.kind === 'pair' ? 6 : hc.kind === 'suited' ? 4 : 12 };
  }
  const best = evaluateHand([...s.hero, ...s.board]);
  const used = best.cards.filter((c) => s.hero.some((h) => h.rank === c.rank && h.suit === c.suit));
  return {
    kind: 'made',
    category: best.category,
    categoryName: CATEGORY_NAMES[best.category],
    description: describeHand(best),
    bestFive: best.cards,
    tiebreak: best.tiebreak,
    holeCardsUsed: used,
    boardPlays: used.length === 0,
  };
}

function opponentRange(a: OpponentAssumption): Range {
  return a.kind === 'exact-hand' ? rangeFromCombos([comboFromCards(a.hand[0] as Card, a.hand[1] as Card)]) : a.range;
}

function equityOptions(a: CoachAssumptions): EquityOptions {
  return { ...(a.equity ?? {}) };
}

const DRAW_FROM_CATEGORY: Partial<Record<HandCategory, { kind: CoachDrawKind; relevance: DrawInfo['relevance'] }>> = {
  [HandCategory.StraightFlush]: { kind: 'straight-flush-draw', relevance: 'major' },
  [HandCategory.FourOfAKind]: { kind: 'quads-draw', relevance: 'major' },
  [HandCategory.FullHouse]: { kind: 'full-house-draw', relevance: 'major' },
  [HandCategory.ThreeOfAKind]: { kind: 'trips-draw', relevance: 'moderate' },
  [HandCategory.TwoPair]: { kind: 'two-pair-draw', relevance: 'moderate' },
  [HandCategory.Pair]: { kind: 'pair-draw', relevance: 'minor' },
};

function buildDraws(s: CoachSnapshot, outs: OutsAnalysis | null, notApplicable: 'PREFLOP' | 'RIVER' | 'NO_HOLE_CARDS' | null): DrawsInfo {
  if (notApplicable || !outs) return { status: 'not_applicable', reason: notApplicable ?? 'RIVER' };
  const draws: DrawInfo[] = [];
  const heroRanks = [...new Set(s.hero.map((c) => c.rank))] as Rank[];
  const boardRanks = [...new Set(s.board.map((c) => c.rank))] as Rank[];
  for (const d of outs.draws) {
    if (d.kind === 'flush-draw') {
      const suit = (d.cards[0] as Card).suit;
      draws.push({
        kind: d.kind, outs: d.outs, cards: d.cards, relevance: 'major',
        reason: { code: 'FOUR_TO_FLUSH', suit, holeCards: s.hero.filter((c) => c.suit === suit), boardCards: s.board.filter((c) => c.suit === suit) },
      });
    } else {
      draws.push({
        kind: d.kind, outs: d.outs, cards: d.cards, relevance: 'major',
        reason: { code: 'STRAIGHT_COMPLETING_RANKS', completingRanks: d.completingRanks ?? [], heroRanks, boardRanks },
      });
    }
  }
  for (const [catKey, cards] of Object.entries(outs.byCategory)) {
    const cat = Number(catKey) as HandCategory;
    const meta = DRAW_FROM_CATEGORY[cat];
    if (!meta || !cards || cards.length === 0) continue;
    draws.push({
      kind: meta.kind, outs: cards.length, cards, relevance: meta.relevance,
      reason: { code: 'IMPROVES_CATEGORY', from: outs.currentCategory, to: cat },
    });
  }
  return { status: 'available', draws };
}

interface Resolved {
  seat: number;
  name: string;
  assumption: OpponentAssumption;
}

function describeSource(a: OpponentAssumption): EquityOpponent['source'] {
  if (a.kind === 'exact-hand') return 'exact-hand';
  return a.certainty === 'known' ? 'known-range' : 'hypothetical-range';
}

export function analyzeCoach(s: CoachSnapshot, assumptions: CoachAssumptions = {}): CoachAnalysis {
  const situation = buildSituation(s);
  const handStrength = buildHandStrength(s);
  const used: string[] = [];
  const heroInHand = situation.heroInHand;
  const hasCards = s.hero.length === 2;

  // ---- opponents' hands / ranges ----
  const resolved: Resolved[] = [];
  const missing: number[] = [];
  for (const o of s.opponents) {
    const a = assumptions.opponents?.[o.seat];
    if (a) resolved.push({ seat: o.seat, name: o.name, assumption: a });
    else missing.push(o.seat);
  }

  // ---- outs and draws (flop and turn only) ----
  const notApplicable: 'PREFLOP' | 'RIVER' | 'NO_HOLE_CARDS' | null = !hasCards ? 'NO_HOLE_CARDS' : s.board.length === 0 ? 'PREFLOP' : s.board.length >= 5 ? 'RIVER' : null;
  let outsAnalysis: OutsAnalysis | null = null;
  let outs: OutsInfo;
  if (notApplicable) {
    outs = { status: 'not_applicable', reason: notApplicable };
  } else {
    const villainRange = resolved.length ? mergeRanges(...resolved.map((r) => opponentRange(r.assumption))) : undefined;
    outsAnalysis = analyzeOuts(s.hero, s.board, villainRange ? { villainRange } : {});
    const q = (k: 'clean' | 'dirty' | 'unknown'): Card[] => outsAnalysis!.outs.filter((o) => o.quality === k).map((o) => o.card);
    const qualityOf: Record<string, 'clean' | 'dirty' | 'unknown'> = {};
    for (const o of outsAnalysis.outs) qualityOf[cardToString(o.card)] = o.quality;
    outs = {
      status: 'available',
      total: outsAnalysis.outs.length,
      clean: q('clean'),
      dirty: q('dirty'),
      unknown: q('unknown'),
      viaBoardPair: outsAnalysis.outs.filter((o) => o.viaBoardPair).map((o) => o.card),
      byCategory: Object.entries(outsAnalysis.byCategory).map(([k, cards]) => ({ category: Number(k) as HandCategory, cards: cards ?? [] })),
      probabilities: outsAnalysis.probabilities,
      qualityBasis: villainRange ? 'opponent-ranges' : 'nuts-check',
      qualityOf,
    };
    used.push(villainRange ? 'Out quality is judged against the assumed opponent range(s) (union when several).' : 'Out quality: clean only if the completed hand is the nuts; otherwise unknown (no opponent range assumed).');
  }
  const draws = buildDraws(s, outsAnalysis, notApplicable);

  // ---- equity ----
  let equity: EquityInfo;
  let mw: MultiwayResult | null = null;
  if (!hasCards) equity = { status: 'not_applicable', reason: 'NO_HOLE_CARDS' };
  else if (!heroInHand) equity = { status: 'not_applicable', reason: 'HERO_NOT_IN_HAND' };
  else if (s.opponents.length === 0) equity = { status: 'not_applicable', reason: 'NO_OPPONENTS' };
  else if (missing.length > 0) equity = { status: 'unknown_opponent_range', missingSeats: missing };
  else {
    const players: MultiwayPlayer[] = [
      { label: s.heroName, hand: s.hero },
      ...resolved.map((r): MultiwayPlayer => ({
        label: r.name,
        ...(r.assumption.kind === 'exact-hand' ? { hand: r.assumption.hand } : { range: r.assumption.range }),
      })),
    ];
    mw = equityMultiway(players, s.board, equityOptions(assumptions));
    const hero = mw.players[0]!;
    const opponents: EquityOpponent[] = resolved.map((r, i) => ({
      seat: r.seat,
      name: r.name,
      source: describeSource(r.assumption),
      ...(r.assumption.kind === 'range' && r.assumption.label ? { label: r.assumption.label } : {}),
      combos: mw!.players[i + 1]!.combosConsidered,
    }));
    equity = {
      status: 'computed',
      equity: hero.equity,
      winProbability: hero.winProbability,
      tieProbability: hero.tieProbability,
      lossProbability: Math.max(0, 1 - hero.winProbability - hero.tieProbability),
      opponents,
      opponentEquities: mw.players.slice(1).map((p) => p.equity),
      method: mw.method,
      ...(mw.samples !== undefined ? { samples: mw.samples } : {}),
      ...(mw.seed !== undefined ? { seed: mw.seed } : {}),
      ...(hero.standardError !== undefined ? { standardError: hero.standardError } : {}),
    };
    for (const r of resolved) {
      const a = r.assumption;
      used.push(
        a.kind === 'exact-hand'
          ? `${r.name}: exact hand ${names(a.hand).join(' ')}`
          : `${r.name}: ${a.certainty} range${a.label ? ` (${a.label})` : ''}, ${mw.players[resolved.indexOf(r) + 1]!.combosConsidered} combos`,
      );
    }
    used.push(`Equity method: ${mw.method}${mw.method === 'monte-carlo' ? ` (${mw.samples} samples)` : ''}.`);
  }

  // ---- pot odds ----
  let potOddsInfo: PotOddsInfo = { status: 'no_call_decision' };
  if (situation.facing.kind === 'bet') {
    const odds = potOdds(s.pot, situation.facing.callAmount);
    const comparison =
      equity.status === 'computed'
        ? { equity: equity.equity, requiredEquity: odds.requiredEquity, margin: equity.equity - odds.requiredEquity, meetsRequirement: equity.equity >= odds.requiredEquity }
        : null;
    let implied = null;
    const im = assumptions.implied;
    if (im && Object.values(im).some((v) => v !== undefined)) {
      implied = impliedOdds({
        potBeforeCall: s.pot,
        callAmount: situation.facing.callAmount,
        ...(equity.status === 'computed' ? { equity: equity.equity } : {}),
        ...(im.stackBehind !== undefined ? { stackBehind: im.stackBehind } : {}),
        ...(im.futureWinWhenHit !== undefined || im.payoffProbability !== undefined
          ? { implied: { ...(im.futureWinWhenHit !== undefined ? { futureWinWhenHit: im.futureWinWhenHit } : {}), ...(im.payoffProbability !== undefined ? { payoffProbability: im.payoffProbability } : {}) } }
          : {}),
        ...(im.futureLossWhenBeaten !== undefined || im.reverseProbability !== undefined
          ? { reverse: { ...(im.futureLossWhenBeaten !== undefined ? { futureLossWhenBeaten: im.futureLossWhenBeaten } : {}), ...(im.reverseProbability !== undefined ? { reverseProbability: im.reverseProbability } : {}) } }
          : {}),
      });
    }
    potOddsInfo = { status: 'available', odds, comparison, implied };
  }

  // ---- EV ----
  let ev: EVInfo;
  if (!heroInHand) ev = { status: 'insufficient_data', missing: ['hero is not in the hand'] };
  else if (situation.facing.kind === 'bet') {
    if (equity.status !== 'computed' || !mw) ev = { status: 'insufficient_data', missing: ['opponent hand or range (needed for equity)'] };
    else if (s.opponents.length === 1) {
      const h = mw.players[0]!;
      const r = callEV({
        potBeforeCall: s.pot, callAmount: situation.facing.callAmount,
        winProbability: h.winProbability, tieProbability: h.tieProbability, lossProbability: Math.max(0, 1 - h.winProbability - h.tieProbability),
      });
      ev = { status: 'complete', kind: 'call', ev: r.ev, assumptions: r.assumptions, breakEvenEquity: r.breakEvenEquity, equity: r.equity };
    } else {
      const r = callEVFromEquity(s.pot, situation.facing.callAmount, equity.equity);
      ev = { status: 'complete', kind: 'call', ev: r.ev, assumptions: r.assumptions, breakEvenEquity: r.breakEvenEquity, equity: r.equity };
    }
  } else {
    const b = assumptions.bet;
    const need: [keyof NonNullable<typeof b>, string][] = [
      ['betAmount', 'bet size'], ['foldEquity', 'fold equity'], ['winWhenCalled', 'win probability when called'],
      ['tieWhenCalled', 'tie probability when called'], ['lossWhenCalled', 'loss probability when called'],
    ];
    const lacking = need.filter(([k]) => b?.[k] === undefined).map(([, label]) => label);
    if (lacking.length > 0) ev = { status: 'insufficient_data', missing: ['no call to evaluate; a bet needs these assumptions: ' + lacking.join(', ')] };
    else {
      const r = betEV({
        potBeforeBet: s.pot, betAmount: b!.betAmount!, foldEquity: b!.foldEquity!,
        winWhenCalled: b!.winWhenCalled!, tieWhenCalled: b!.tieWhenCalled!, lossWhenCalled: b!.lossWhenCalled!,
      });
      ev = { status: 'complete', kind: 'bet', ev: r.ev, assumptions: r.assumptions };
    }
  }

  // ---- blockers (only from ranges that were actually assumed) ----
  const rangeAssumptions = resolved.filter((r) => r.assumption.kind === 'range');
  let blockers: BlockersInfo = { status: 'no_range_assumed' };
  if (hasCards && rangeAssumptions.length > 0) {
    const dead = [...s.hero, ...s.board];
    blockers = {
      status: 'available',
      ranges: rangeAssumptions.map((r) => {
        const a = r.assumption as Extract<OpponentAssumption, { kind: 'range' }>;
        const rep = analyzeBlockers(a.range, dead);
        const total = new Map(summarizeByClass(a.range).map((c) => [handClassToString(c.handClass), c.combos]));
        const left = new Map(summarizeByClass({ entries: rep.remaining }).map((c) => [handClassToString(c.handClass), c.combos]));
        const affected = [...total.entries()]
          .map(([handClass, t]) => ({ handClass, blocked: t - (left.get(handClass) ?? 0), total: t }))
          .filter((x) => x.blocked > 0)
          .sort((x, y) => y.blocked - x.blocked || y.total - x.total || x.handClass.localeCompare(y.handClass))
          .slice(0, 5);
        return {
          seat: r.seat,
          ...(a.label ? { label: a.label } : {}),
          totalCombos: rep.totalCombos,
          remainingCombos: rep.remainingCombos,
          blockedCombos: rep.blockedCombos,
          blockedByCard: rep.blockedByCard,
          mostAffected: affected,
        };
      }),
    };
  }

  // ---- confidence (from the data available, not a score) ----
  const reasons: ConfidenceInfo['reasons'] = [];
  const push = (code: ConfidenceReasonCode, detail?: string): void => void reasons.push(detail ? { code, detail } : { code });
  let level: ConfidenceInfo['level'];
  if (!heroInHand || !hasCards) {
    level = 'low';
    push('NO_OPPONENTS', 'hero is not in the hand');
  } else if (s.opponents.length === 0) {
    level = 'low';
    push('NO_OPPONENTS');
  } else if (resolved.length === 0) {
    level = 'low';
    push('NO_OPPONENT_INFO');
  } else if (missing.length > 0) {
    level = 'low';
    push('OPPONENT_INFO_MISSING', `seats ${missing.join(', ')}`);
  } else if (resolved.every((r) => r.assumption.kind === 'exact-hand' || r.assumption.certainty === 'known')) {
    level = 'high';
    push('ALL_OPPONENTS_EXACT_OR_KNOWN_RANGE');
  } else {
    level = 'medium';
    push('HYPOTHETICAL_RANGES');
  }
  if (equity.status === 'computed' && equity.method === 'monte-carlo') push('ESTIMATED_BY_SIMULATION', `${equity.samples} samples`);
  if (rangeAssumptions.length >= 2) push('MULTIWAY_INDEPENDENT_RANGES');

  return {
    version: 1,
    situation,
    handStrength,
    draws,
    outs,
    equity,
    potOdds: potOddsInfo,
    spr: situation.spr ?? { status: 'not_available' },
    ev,
    blockers,
    confidence: { level, reasons },
    assumptionsUsed: used,
  };
}

/** Convenience: analyse a live engine state from the hero's seat. */
export function analyzeGameState(state: GameState, heroSeat: number, assumptions: CoachAssumptions = {}): CoachAnalysis {
  return analyzeCoach(snapshotForCoach(state, heroSeat), assumptions);
}
