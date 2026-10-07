import { type Card, type Rank, cardEquals } from './cards';

export enum HandCategory {
  HighCard = 0,
  Pair = 1,
  TwoPair = 2,
  ThreeOfAKind = 3,
  Straight = 4,
  Flush = 5,
  FullHouse = 6,
  FourOfAKind = 7,
  StraightFlush = 8,
}

export const CATEGORY_NAMES: Record<HandCategory, string> = {
  [HandCategory.HighCard]: 'High card',
  [HandCategory.Pair]: 'Pair',
  [HandCategory.TwoPair]: 'Two pair',
  [HandCategory.ThreeOfAKind]: 'Three of a kind',
  [HandCategory.Straight]: 'Straight',
  [HandCategory.Flush]: 'Flush',
  [HandCategory.FullHouse]: 'Full house',
  [HandCategory.FourOfAKind]: 'Four of a kind',
  [HandCategory.StraightFlush]: 'Straight flush',
};

export interface EvaluatedHand {
  /** Comparable integer: higher always beats lower, equal means a tie. */
  score: number;
  category: HandCategory;
  /** Rank tiebreakers in significance order (e.g. pair rank, then kickers). */
  tiebreak: Rank[];
  /** The 5 cards forming the hand. */
  cards: Card[];
}

function encode(category: number, tiebreak: number[]): number {
  let s = category;
  for (let i = 0; i < 5; i++) s = s * 16 + (tiebreak[i] ?? 0);
  return s;
}

/** Highest straight top-card in a set of distinct ranks, or 0. Ace plays low too (wheel => 5). */
function straightHigh(ranks: number[]): number {
  const set = new Set(ranks);
  if (set.has(14)) set.add(1);
  for (let top = 14; top >= 5; top--) {
    let ok = true;
    for (let k = 0; k < 5; k++) {
      if (!set.has(top - k)) {
        ok = false;
        break;
      }
    }
    if (ok) return top;
  }
  return 0;
}

/** Score of exactly 5 cards. */
function evaluate5(cs: readonly Card[]): { score: number; category: HandCategory; tiebreak: Rank[] } {
  const ranks = cs.map((c) => c.rank).sort((a, b) => b - a);
  const flush = cs.every((c) => c.suit === (cs[0] as Card).suit);
  const distinct = [...new Set(ranks)];
  const sHigh = distinct.length === 5 ? straightHigh(distinct) : 0;

  const counts = new Map<number, number>();
  for (const r of ranks) counts.set(r, (counts.get(r) ?? 0) + 1);
  // groups ordered by (count desc, rank desc)
  const groups = [...counts.entries()].sort((a, b) => b[1] - a[1] || b[0] - a[0]);
  const shape = groups.map((g) => g[1]).join('');
  const byGroup = groups.map((g) => g[0]) as Rank[];

  let category: HandCategory;
  let tiebreak: Rank[];
  if (sHigh && flush) {
    category = HandCategory.StraightFlush;
    tiebreak = [sHigh as Rank];
  } else if (shape === '41') {
    category = HandCategory.FourOfAKind;
    tiebreak = byGroup;
  } else if (shape === '32') {
    category = HandCategory.FullHouse;
    tiebreak = byGroup;
  } else if (flush) {
    category = HandCategory.Flush;
    tiebreak = ranks as Rank[];
  } else if (sHigh) {
    category = HandCategory.Straight;
    tiebreak = [sHigh as Rank];
  } else if (shape === '311') {
    category = HandCategory.ThreeOfAKind;
    tiebreak = byGroup;
  } else if (shape === '221') {
    category = HandCategory.TwoPair;
    tiebreak = byGroup;
  } else if (shape === '2111') {
    category = HandCategory.Pair;
    tiebreak = byGroup;
  } else {
    category = HandCategory.HighCard;
    tiebreak = ranks as Rank[];
  }
  return { score: encode(category, tiebreak), category, tiebreak };
}

/**
 * Best 5-card hand among 5..7 cards (enumerates all 5-card subsets).
 * Throws if the cards are duplicated or the count is out of range.
 */
export function evaluateHand(cards: readonly Card[]): EvaluatedHand {
  const n = cards.length;
  if (n < 5 || n > 7) throw new Error(`evaluateHand needs 5-7 cards, got ${n}`);
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      if (cardEquals(cards[i] as Card, cards[j] as Card)) throw new Error('Duplicate card');
    }
  }

  let best: EvaluatedHand | undefined;
  const pick: Card[] = [];
  const rec = (start: number): void => {
    if (pick.length === 5) {
      const e = evaluate5(pick);
      if (!best || e.score > best.score) best = { ...e, cards: pick.slice() };
      return;
    }
    for (let i = start; i <= n - (5 - pick.length); i++) {
      pick.push(cards[i] as Card);
      rec(i + 1);
      pick.pop();
    }
  };
  rec(0);
  return best as EvaluatedHand;
}

/** Only the comparable score. */
export function handScore(cards: readonly Card[]): number {
  return evaluateHand(cards).score;
}

/** >0 if a beats b, <0 if b beats a, 0 for a tie. */
export function compareHands(a: readonly Card[], b: readonly Card[]): number {
  return handScore(a) - handScore(b);
}

const RANK_NAMES: Record<number, [string, string]> = {
  2: ['two', 'twos'],
  3: ['three', 'threes'],
  4: ['four', 'fours'],
  5: ['five', 'fives'],
  6: ['six', 'sixes'],
  7: ['seven', 'sevens'],
  8: ['eight', 'eights'],
  9: ['nine', 'nines'],
  10: ['ten', 'tens'],
  11: ['jack', 'jacks'],
  12: ['queen', 'queens'],
  13: ['king', 'kings'],
  14: ['ace', 'aces'],
};

/** Human description, e.g. "Full house, kings full of twos". */
export function describeHand(h: EvaluatedHand): string {
  const [t0, t1] = h.tiebreak;
  const sing = (r?: Rank): string => (RANK_NAMES[r as number] as [string, string])[0];
  const plur = (r?: Rank): string => (RANK_NAMES[r as number] as [string, string])[1];
  switch (h.category) {
    case HandCategory.StraightFlush:
      return t0 === 14 ? 'Royal flush' : `Straight flush, ${sing(t0)} high`;
    case HandCategory.FourOfAKind:
      return `Four of a kind, ${plur(t0)}`;
    case HandCategory.FullHouse:
      return `Full house, ${plur(t0)} full of ${plur(t1)}`;
    case HandCategory.Flush:
      return `Flush, ${sing(t0)} high`;
    case HandCategory.Straight:
      return `Straight, ${sing(t0)} high`;
    case HandCategory.ThreeOfAKind:
      return `Three of a kind, ${plur(t0)}`;
    case HandCategory.TwoPair:
      return `Two pair, ${plur(t0)} and ${plur(t1)}`;
    case HandCategory.Pair:
      return `Pair of ${plur(t0)}`;
    default:
      return `High card ${sing(t0)}`;
  }
}
