import { HandCategory, evaluateHand, type Card, type GameState, type Rank } from '../engine';

/** Chen formula score for a two-card starting hand (AA = 20, 72o = -1). */
export function chenScore(hole: readonly Card[]): number {
  const [a, b] = hole as [Card, Card];
  const hi = a.rank >= b.rank ? a : b;
  const lo = hi === a ? b : a;
  const points = (r: Rank): number => (r === 14 ? 10 : r === 13 ? 8 : r === 12 ? 7 : r === 11 ? 6 : r / 2);

  let score = points(hi.rank);
  if (hi.rank === lo.rank) return Math.ceil(Math.max(5, score * 2));
  if (hi.suit === lo.suit) score += 2;
  const gap = hi.rank - lo.rank - 1;
  score -= gap === 0 ? 0 : gap === 1 ? 1 : gap === 2 ? 2 : gap === 3 ? 4 : 5;
  if (gap <= 1 && hi.rank < 12) score += 1;
  return Math.ceil(score);
}

/** Chen score mapped to 0..1. */
export function preflopStrength(hole: readonly Card[]): number {
  return Math.min(1, Math.max(0, (chenScore(hole) + 1) / 21));
}

/** Ranks that would complete a straight from the given set of ranks (ace counts low and high). */
export function straightOutRanks(ranks: ReadonlySet<number>): number[] {
  const outs: number[] = [];
  for (let r = 2; r <= 14; r++) {
    if (ranks.has(r)) continue;
    const have = (x: number): boolean => x === r || ranks.has(x) || (x === 1 && (ranks.has(14) || r === 14));
    for (let top = 14; top >= 5; top--) {
      let ok = true;
      for (let k = 0; k < 5; k++) if (!have(top - k)) ok = false;
      if (ok) {
        outs.push(r);
        break;
      }
    }
  }
  return outs;
}

/** Bonus for flush / straight draws that depend on a hole card (flop and turn only). */
export function drawBonus(hole: readonly Card[], board: readonly Card[]): number {
  if (board.length < 3 || board.length >= 5) return 0;
  let bonus = 0;
  const all = [...hole, ...board];
  for (const suit of ['s', 'h', 'd', 'c'] as const) {
    const n = all.filter((c) => c.suit === suit).length;
    if (n === 4 && hole.some((c) => c.suit === suit)) bonus = 0.2;
  }
  const outsAll = straightOutRanks(new Set(all.map((c) => c.rank as number)));
  const outsBoard = straightOutRanks(new Set(board.map((c) => c.rank as number)));
  if (outsAll.length > outsBoard.length) bonus = Math.max(bonus, outsAll.length >= 2 ? 0.16 : 0.08);
  return bonus;
}

/** Made-hand strength 0..1 (+ draw bonus). Cheap heuristic, not an equity. */
export function postflopStrength(hole: readonly Card[], board: readonly Card[]): number {
  const best = evaluateHand([...hole, ...board]);
  const holeInBest = best.cards.filter((c) => hole.some((h) => h.rank === c.rank && h.suit === c.suit)).length;
  const boardMax = Math.max(...board.map((c) => c.rank));
  const holeMax = Math.max(...hole.map((c) => c.rank));
  const t0 = best.tiebreak[0] ?? 0;
  let made: number;

  switch (best.category) {
    case HandCategory.StraightFlush:
      made = 1;
      break;
    case HandCategory.FourOfAKind:
      made = holeInBest ? 0.98 : 0.4;
      break;
    case HandCategory.FullHouse:
      made = holeInBest ? 0.94 : 0.5;
      break;
    case HandCategory.Flush:
      made = holeInBest ? 0.88 + (t0 === 14 ? 0.04 : 0) : 0.35;
      break;
    case HandCategory.Straight:
      made = holeInBest ? 0.86 : 0.35;
      break;
    case HandCategory.ThreeOfAKind:
      made = holeInBest === 2 ? 0.85 : holeInBest === 1 ? 0.78 : 0.3;
      break;
    case HandCategory.TwoPair:
      made = holeInBest === 2 ? 0.74 : holeInBest === 1 ? 0.5 : 0.3;
      break;
    case HandCategory.Pair: {
      const pocketPair = hole[0]?.rank === hole[1]?.rank;
      if (!hole.some((h) => h.rank === t0)) made = 0.15 + (holeMax >= 13 ? 0.06 : 0);
      else if (pocketPair && t0 > boardMax) made = 0.66 + (t0 - 9) * 0.01;
      else if (t0 >= boardMax) made = 0.56 + (holeMax >= 11 && holeMax !== t0 ? 0.06 : 0);
      else made = t0 >= boardMax - 3 ? 0.38 : 0.28;
      break;
    }
    default:
      made = 0.1 + (holeMax === 14 ? 0.07 : 0);
  }
  return Math.min(1, made + (best.category < HandCategory.Straight ? drawBonus(hole, board) : 0));
}

/** Strength of a seat's hand in the current game state (0..1). */
export function handStrength(state: GameState, playerIndex: number): number {
  const p = state.players[playerIndex];
  if (!p || p.holeCards.length !== 2) return 0;
  return state.board.length === 0 ? preflopStrength(p.holeCards) : postflopStrength(p.holeCards, state.board);
}
