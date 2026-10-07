/**
 * Blockers: how known (dead) cards remove combos from a hand class or a range.
 * Everything is computed from real combos, nothing is hard-coded per situation.
 */
import { cardIndex, cardToString, type Card } from '../../engine';
import { comboCards, handClassCombos, parseHandClass, type Combo, type HandClass } from './combos';
import { parseRange, type Range, type WeightedCombo } from './ranges';

export interface BlockerReport {
  /** Combos before removing anything. */
  totalCombos: number;
  /** Combos still possible. */
  remainingCombos: number;
  blockedCombos: number;
  remaining: WeightedCombo[];
  blocked: WeightedCombo[];
  /** Same counts but weighted (a combo at 50% frequency counts 0.5). */
  totalWeight: number;
  remainingWeight: number;
  blockedWeight: number;
  /** For every dead card ("As"): how many range combos contain it. A combo with two dead cards counts for both. */
  blockedByCard: Record<string, number>;
}

const deadSet = (dead: readonly Card[]): Set<number> => new Set(dead.map(cardIndex));

export function isBlocked(combo: Combo, dead: ReadonlySet<number>): boolean {
  return dead.has(combo.a) || dead.has(combo.b);
}

/** Splits a range into blocked / remaining combos given the known cards. */
export function analyzeBlockers(range: Range, dead: readonly Card[]): BlockerReport {
  const set = deadSet(dead);
  const remaining: WeightedCombo[] = [];
  const blocked: WeightedCombo[] = [];
  const blockedByCard: Record<string, number> = {};
  for (const c of dead) blockedByCard[cardToString(c)] = 0;
  for (const e of range.entries) {
    if (isBlocked(e.combo, set)) {
      blocked.push(e);
      for (const card of comboCards(e.combo)) {
        const k = cardToString(card);
        if (k in blockedByCard) blockedByCard[k] = (blockedByCard[k] as number) + 1;
      }
    } else remaining.push(e);
  }
  const sum = (xs: WeightedCombo[]): number => xs.reduce((s, e) => s + e.weight, 0);
  return {
    totalCombos: range.entries.length,
    remainingCombos: remaining.length,
    blockedCombos: blocked.length,
    remaining,
    blocked,
    totalWeight: sum(remaining) + sum(blocked),
    remainingWeight: sum(remaining),
    blockedWeight: sum(blocked),
    blockedByCard,
  };
}

/** Blocker report for one hand class ("AKs") or a range string ("AA, KK"). */
export function blockersFor(target: HandClass | string | Range, dead: readonly Card[]): BlockerReport {
  const range: Range =
    typeof target === 'string'
      ? parseRange(target)
      : 'entries' in target
        ? target
        : { entries: handClassCombos(target).map((combo) => ({ combo, weight: 1 })) };
  return analyzeBlockers(range, dead);
}

export { parseHandClass };
