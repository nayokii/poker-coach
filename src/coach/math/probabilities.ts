/**
 * Draw probabilities from the REAL number of unknown cards (never a hard-coded 47 or 46).
 *
 * "Unknown cards" = 52 minus every card the hero knows about (own hole cards, board, any other
 * cards seen). The opponents' hole cards are among the unknown cards from the hero's point of view.
 * Exact hypergeometric formulas are used; the x4 / x2 shortcuts are provided only for comparison.
 */

export interface DrawProbabilities {
  outs: number;
  unknownCards: number;
  /** Board cards still to be dealt (2 on the flop, 1 on the turn). */
  cardsToCome: number;
  /** P(the very next card is an out) = outs / unknown. On the flop this is "hit on the turn". */
  hitNextCard: number;
  /** P(miss on all earlier cards and hit on the last one). On the flop: "hit on the river only". */
  hitOnLastCardOnly: number;
  /** P(hit on the last card | missed every earlier card) = outs / (unknown - (cardsToCome - 1)). */
  hitOnLastCardGivenMiss: number;
  /** P(at least one out among all cards to come). On the flop: "hit by the river". */
  hitByLastCard: number;
  /** 1 - hitByLastCard. */
  missByLastCard: number;
}

/** C(n, k) as a float (exact up to 2^53, plenty for k <= 5 and n <= 52). */
export function choose(n: number, k: number): number {
  if (k < 0 || k > n) return 0;
  let r = 1;
  for (let i = 1; i <= Math.min(k, n - k); i++) r = (r * (n - i + 1)) / i;
  return Math.round(r);
}

function validate(outs: number, unknown: number, toCome: number): void {
  if (!Number.isInteger(outs) || !Number.isInteger(unknown) || !Number.isInteger(toCome)) throw new RangeError('outs, unknown cards and cards to come must be integers');
  if (outs < 0 || toCome < 1) throw new RangeError('outs must be >= 0 and cardsToCome >= 1');
  if (outs > unknown) throw new RangeError(`outs (${outs}) cannot exceed unknown cards (${unknown})`);
  if (toCome > unknown) throw new RangeError('not enough unknown cards to deal');
}

/** P(at least one out in `draws` cards drawn without replacement from `unknown` cards). */
export function hitAtLeastOnce(outs: number, unknown: number, draws: number): number {
  validate(outs, unknown, draws);
  return 1 - choose(unknown - outs, draws) / choose(unknown, draws);
}

export function drawProbabilities(outs: number, unknownCards: number, cardsToCome = 2): DrawProbabilities {
  validate(outs, unknownCards, cardsToCome);
  const earlier = cardsToCome - 1;
  const missEarlier = earlier === 0 ? 1 : choose(unknownCards - outs, earlier) / choose(unknownCards, earlier);
  const lastGivenMiss = outs / (unknownCards - earlier);
  const hitBy = hitAtLeastOnce(outs, unknownCards, cardsToCome);
  return {
    outs,
    unknownCards,
    cardsToCome,
    hitNextCard: outs / unknownCards,
    hitOnLastCardOnly: missEarlier * lastGivenMiss,
    hitOnLastCardGivenMiss: lastGivenMiss,
    hitByLastCard: hitBy,
    missByLastCard: 1 - hitBy,
  };
}

/** The classic shortcut (outs x 4 with two cards to come, x 2 with one). Approximation, for comparison only. */
export function ruleOfTwoAndFour(outs: number, cardsToCome: 1 | 2): number {
  return Math.min(1, (outs * (cardsToCome === 2 ? 4 : 2)) / 100);
}
