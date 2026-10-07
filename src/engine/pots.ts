/** Generic, contribution-based pot construction. No scenario-specific logic. */

export interface Contribution {
  player: number;
  /** Total chips this player put in during the hand. */
  amount: number;
  /** Folded (or otherwise ineligible) players still fund pots but cannot win them. */
  folded: boolean;
}

export interface Pot {
  amount: number;
  /** Players who may win this pot, ascending by index. */
  eligible: number[];
}

export interface PotBuild {
  pots: Pot[];
  /** Uncalled excess returned to its owner. */
  refunds: { player: number; amount: number }[];
}

/**
 * Slices contributions into layers at every distinct contribution level.
 * Each layer is a pot whose eligible players are the non-folded players who
 * covered that level. A layer funded only by its single eligible player is an
 * uncalled bet and is refunded. Adjacent layers with the same eligible set merge.
 */
export function buildPots(contributions: readonly Contribution[]): PotBuild {
  const levels = [...new Set(contributions.map((c) => c.amount).filter((a) => a > 0))].sort((a, b) => a - b);
  const pots: Pot[] = [];
  const refunds: { player: number; amount: number }[] = [];
  let prev = 0;

  for (const level of levels) {
    let amount = 0;
    const contributors: number[] = [];
    for (const c of contributions) {
      const part = Math.min(c.amount, level) - Math.min(c.amount, prev);
      if (part > 0) {
        amount += part;
        contributors.push(c.player);
      }
    }
    const eligible = contributions
      .filter((c) => !c.folded && c.amount >= level)
      .map((c) => c.player)
      .sort((a, b) => a - b);
    prev = level;

    const only = contributors[0];
    if (only !== undefined && eligible.length === 1 && contributors.length === 1 && only === eligible[0]) {
      refunds.push({ player: only, amount });
      continue;
    }
    const last = pots[pots.length - 1];
    if (eligible.length === 0) {
      // Dead money above every live player's level: attach to the previous pot.
      if (!last) throw new Error('Dead money with no eligible player');
      last.amount += amount;
    } else if (last && sameSet(last.eligible, eligible)) {
      last.amount += amount;
    } else {
      pots.push({ amount, eligible });
    }
  }
  return { pots, refunds };
}

function sameSet(a: readonly number[], b: readonly number[]): boolean {
  return a.length === b.length && a.every((v, i) => v === b[i]);
}

/**
 * Splits `amount` among winners. The remainder (indivisible chips) goes one chip
 * at a time to the first winners in the given order, so callers pass winners
 * ordered clockwise from the left of the button. Returns shares aligned with `winners`.
 */
export function splitPot(amount: number, winners: readonly number[]): number[] {
  if (winners.length === 0) throw new Error('No winners');
  const base = Math.floor(amount / winners.length);
  const rem = amount - base * winners.length;
  return winners.map((_, i) => base + (i < rem ? 1 : 0));
}
