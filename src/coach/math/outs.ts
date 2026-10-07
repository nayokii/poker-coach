/**
 * Outs: unseen cards that improve the hero's hand on the NEXT card.
 *
 * Definition (all computed by evaluating the real hand, nothing hard-coded):
 *   an unseen card is an out when, after it is added, the hero's best hand
 *     (1) is in a strictly higher category than the hero's current hand, AND
 *     (2) is in a strictly higher category than the BOARD ALONE would make with that card
 *         (so a card that only pairs the board for everyone is not an out for the hero).
 * Each card is listed once, under the best category it reaches. Known cards (hero, board and any `dead`
 * cards the caller has seen) are excluded, and the number of unknown cards is computed, never assumed.
 *
 * Quality (clean / dirty / unknown) is about whether completing the out really gives the hero the best
 * hand. The engine only states what it can prove:
 *   - no villain range given: `clean` if no possible two-card hand beats the completed hand (hero has the
 *     nuts), otherwise `unknown` (it depends on what the villain holds, which is not known).
 *   - with a villain range: share of the (weighted, blocker-adjusted) range that beats the completed hand;
 *     `clean` if <= cleanMaxBeatenShare, `dirty` if >= dirtyMinBeatenShare, else `unknown`.
 * The thresholds are explicit, overridable heuristics; the measured share is returned as evidence.
 */
import { HandCategory, cardFromIndex, cardIndex, cardToString, type Card, type Rank } from '../../engine';
import { straightTop, fastScore, rankMaskOf, categoryOf } from './fastEval';
import { drawProbabilities, type DrawProbabilities } from './probabilities';
import type { Range } from './ranges';

export type OutQuality = 'clean' | 'dirty' | 'unknown';
export type DrawKind = 'flush-draw' | 'open-ended-straight-draw' | 'gutshot' | 'double-gutshot';

export interface OutEvidence {
  method: 'nuts-check' | 'range';
  /** nuts-check only: no possible two-card hand beats the completed hand. */
  nuts?: boolean;
  /** range only: weighted share of the villain range that beats the completed hand (0..1). */
  beatenShare?: number;
  /** Combos (after blockers) that were tested. */
  combosConsidered: number;
}

export interface Out {
  card: Card;
  /** Best hand category reached with this card. */
  improvesTo: HandCategory;
  quality: OutQuality;
  evidence: OutEvidence;
  /**
   * True when the card improves the hero only by pairing a board rank the hero does not hold
   * (e.g. a pocket pair becoming two pair through a board pair). Such outs are real but shared
   * with every opponent who holds that rank, so the coach should treat them with care.
   */
  viaBoardPair: boolean;
}

export interface Draw {
  kind: DrawKind;
  /** The outs that complete this draw. A card can belong to two draws (e.g. a flush card that also makes a straight). */
  cards: Card[];
  outs: number;
  /** Straight draws: the ranks that complete the straight. */
  completingRanks?: Rank[];
}

export interface OutsOptions {
  /** Other cards known to be out of the deck (e.g. cards shown by opponents). */
  dead?: readonly Card[];
  /** Villain range used to judge out quality. Optional. */
  villainRange?: Range;
  thresholds?: Partial<OutQualityThresholds>;
  /** Keep only outs reaching one of these categories (default: every improvement). */
  targets?: readonly HandCategory[];
}

export interface OutQualityThresholds {
  /** Share of the villain range beating the completed hand at or below which the out is `clean`. */
  cleanMaxBeatenShare: number;
  /** Share at or above which the out is `dirty`. In between the quality is `unknown`. */
  dirtyMinBeatenShare: number;
}

export const OUT_QUALITY_THRESHOLDS: Readonly<OutQualityThresholds> = { cleanMaxBeatenShare: 0.05, dirtyMinBeatenShare: 0.3 };

export interface OutsAnalysis {
  hero: Card[];
  board: Card[];
  /** Cards known to the hero: own cards + board + dead cards. */
  knownCards: number;
  /** 52 - knownCards. */
  unknownCards: number;
  /** Cards still to be dealt (2 on the flop, 1 on the turn). */
  cardsToCome: number;
  currentCategory: HandCategory;
  /** Unique outs (every card appears once). */
  outs: Out[];
  /** Same cards grouped by the best category they reach. */
  byCategory: Partial<Record<HandCategory, Card[]>>;
  draws: Draw[];
  /** Exact probabilities for the unique outs (cards to come: 2 on the flop, 1 on the turn). */
  probabilities: DrawProbabilities;
  /** Number of distinct outs the quality check could not call (informational). */
  unknownQuality: number;
}

const HEARTS_ORDER = ['s', 'h', 'd', 'c'] as const;

/** Category of the board alone (any length >= 3): counts for pairs/trips/quads, full evaluation from 5 cards. */
function boardOnlyCategory(boardIdx: readonly number[]): number {
  if (boardIdx.length >= 5) return categoryOf(fastScore(boardIdx, boardIdx.length));
  const counts = new Map<number, number>();
  for (const c of boardIdx) counts.set(c >> 2, (counts.get(c >> 2) ?? 0) + 1);
  const ks = [...counts.values()].sort((a, b) => b - a);
  if (ks[0] === 4) return HandCategory.FourOfAKind;
  if (ks[0] === 3 && ks[1] === 2) return HandCategory.FullHouse;
  if (ks[0] === 3) return HandCategory.ThreeOfAKind;
  if (ks[0] === 2 && ks[1] === 2) return HandCategory.TwoPair;
  if (ks[0] === 2) return HandCategory.Pair;
  return HandCategory.HighCard;
}

function classifyStraightDraw(ranks: readonly Rank[]): DrawKind {
  if (ranks.length === 1) return 'gutshot';
  if (ranks.length === 2) {
    const [a, b] = [...ranks].sort((x, y) => x - y) as [Rank, Rank];
    if (b - a === 5 || (b === 14 && a - 1 === 5)) return 'open-ended-straight-draw';
  }
  return 'double-gutshot';
}

export function analyzeOuts(hero: readonly Card[], board: readonly Card[], opts: OutsOptions = {}): OutsAnalysis {
  if (hero.length !== 2) throw new RangeError('hero needs exactly 2 cards');
  if (board.length < 3 || board.length > 4) throw new RangeError('outs need a flop or a turn board (3 or 4 cards)');
  const dead = opts.dead ?? [];
  const known = [...hero, ...board, ...dead];
  const names = known.map(cardToString);
  if (new Set(names).size !== names.length) throw new RangeError('duplicate known card');

  const th = { ...OUT_QUALITY_THRESHOLDS, ...opts.thresholds };
  const heroIdx = hero.map(cardIndex);
  const boardIdx = board.map(cardIndex);
  const knownSet = new Set(known.map(cardIndex));
  const unseen: number[] = [];
  for (let i = 0; i < 52; i++) if (!knownSet.has(i)) unseen.push(i);

  const cardsToCome = 5 - board.length;
  const currentScore = fastScore([...heroIdx, ...boardIdx]);
  const currentCategory = categoryOf(currentScore) as HandCategory;
  const heroBoardMask = rankMaskOf([...heroIdx, ...boardIdx]);
  const boardMask = rankMaskOf(boardIdx);
  const targets = opts.targets ? new Set<number>(opts.targets) : null;

  // Possible villain hands: the supplied range (minus known cards) or every unseen pair.
  const rangeCombos = opts.villainRange
    ? opts.villainRange.entries.filter((e) => !knownSet.has(e.combo.a) && !knownSet.has(e.combo.b))
    : null;

  const outs: Out[] = [];
  const straightCards: Card[] = [];
  const heroBuf = new Int32Array(8);
  const villBuf = new Int32Array(8);

  for (const c of unseen) {
    const withCard = [...heroIdx, ...boardIdx, c];
    const score = fastScore(withCard);
    const cat = categoryOf(score);
    if (cat <= currentCategory) continue;
    if (cat <= boardOnlyCategory([...boardIdx, c])) continue;
    if (targets && !targets.has(cat)) continue;

    const bit = 1 << (c >> 2);
    const completesStraight =
      straightTop(heroBoardMask) < 0 && straightTop(heroBoardMask | bit) >= 0 && straightTop(boardMask | bit) < 0;
    if (completesStraight) straightCards.push(cardFromIndex(c));

    // --- quality ---
    for (let i = 0; i < withCard.length; i++) heroBuf[i] = withCard[i] as number;
    const nBoardWithOut = boardIdx.length + 1;
    for (let j = 0; j < boardIdx.length; j++) villBuf[2 + j] = boardIdx[j] as number;
    villBuf[2 + boardIdx.length] = c;

    let evidence: OutEvidence;
    let quality: OutQuality;
    if (rangeCombos) {
      let beat = 0;
      let total = 0;
      let considered = 0;
      for (const e of rangeCombos) {
        if (e.combo.a === c || e.combo.b === c) continue;
        villBuf[0] = e.combo.a;
        villBuf[1] = e.combo.b;
        total += e.weight;
        considered++;
        if (fastScore(villBuf, 2 + nBoardWithOut) > score) beat += e.weight;
      }
      if (total === 0) {
        quality = 'unknown';
        evidence = { method: 'range', combosConsidered: 0 };
      } else {
        const share = beat / total;
        quality = share <= th.cleanMaxBeatenShare ? 'clean' : share >= th.dirtyMinBeatenShare ? 'dirty' : 'unknown';
        evidence = { method: 'range', beatenShare: share, combosConsidered: considered };
      }
    } else {
      let beaten = false;
      let considered = 0;
      outer: for (let x = 0; x < unseen.length; x++) {
        const ux = unseen[x] as number;
        if (ux === c) continue;
        for (let y = x + 1; y < unseen.length; y++) {
          const uy = unseen[y] as number;
          if (uy === c) continue;
          villBuf[0] = ux;
          villBuf[1] = uy;
          considered++;
          if (fastScore(villBuf, 2 + nBoardWithOut) > score) {
            beaten = true;
            break outer;
          }
        }
      }
      quality = beaten ? 'unknown' : 'clean';
      evidence = { method: 'nuts-check', nuts: !beaten, combosConsidered: considered };
    }
    const rank = c >> 2;
    const viaBoardPair = boardIdx.some((b) => b >> 2 === rank) && !heroIdx.some((h) => h >> 2 === rank);
    outs.push({ card: cardFromIndex(c), improvesTo: cat as HandCategory, quality, evidence, viaBoardPair });
  }

  const outSet = new Set(outs.map((o) => cardToString(o.card)));
  const byCategory: Partial<Record<HandCategory, Card[]>> = {};
  for (const o of outs) (byCategory[o.improvesTo] ??= []).push(o.card);

  // --- named draws (labels over the outs; cards may belong to several draws) ---
  const draws: Draw[] = [];
  const all = [...hero, ...board];
  for (const suit of HEARTS_ORDER) {
    const n = all.filter((x) => x.suit === suit).length;
    if (n === 4 && hero.some((x) => x.suit === suit)) {
      const cards = outs
        .filter((o) => o.card.suit === suit && (o.improvesTo === HandCategory.Flush || o.improvesTo === HandCategory.StraightFlush))
        .map((o) => o.card);
      if (cards.length) draws.push({ kind: 'flush-draw', cards, outs: cards.length });
    }
  }
  const sCards = straightCards.filter((c) => outSet.has(cardToString(c)));
  // With a flush already made, the straight cards are straight-flush outs, not a straight draw.
  if (sCards.length && currentCategory < HandCategory.Straight) {
    const ranks = [...new Set(sCards.map((c) => c.rank))].sort((a, b) => a - b) as Rank[];
    draws.push({ kind: classifyStraightDraw(ranks), cards: sCards, outs: sCards.length, completingRanks: ranks });
  }

  return {
    hero: [...hero],
    board: [...board],
    knownCards: known.length,
    unknownCards: unseen.length,
    cardsToCome,
    currentCategory,
    outs,
    byCategory,
    draws,
    probabilities: drawProbabilities(outs.length, unseen.length, cardsToCome),
    unknownQuality: outs.filter((o) => o.quality === 'unknown').length,
  };
}
