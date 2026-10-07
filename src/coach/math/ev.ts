/**
 * Expected value helpers. EV is always measured relative to folding (fold = 0), in the caller's unit.
 * Every result carries the list of assumptions it depends on: do not display an EV without them.
 */

const EPS = 1e-9;

export interface Outcome {
  /** Probability of this outcome. */
  probability: number;
  /** Net chips gained (positive) or lost (negative) versus folding. */
  value: number;
}

export interface EVResult {
  /** Expected net chips versus folding. */
  ev: number;
  assumptions: string[];
}

/** Probabilities must sum to 1 (tolerance 1e-9). */
export function expectedValue(outcomes: readonly Outcome[], assumptions: string[] = []): EVResult {
  const total = outcomes.reduce((s, o) => s + o.probability, 0);
  if (outcomes.some((o) => o.probability < -EPS || !Number.isFinite(o.value))) throw new RangeError('invalid outcome');
  if (Math.abs(total - 1) > 1e-6) throw new RangeError(`probabilities must sum to 1, got ${total}`);
  return { ev: outcomes.reduce((s, o) => s + o.probability * o.value, 0), assumptions };
}

export interface CallEVInput {
  /** Chips in the pot right now, including the bet being called. */
  potBeforeCall: number;
  callAmount: number;
  winProbability: number;
  tieProbability: number;
  lossProbability: number;
}

export interface CallEV extends EVResult {
  /** Net chips if the hand is won: + potBeforeCall. */
  netWhenWin: number;
  /** Net chips on a tie (pot split with one opponent): (potBeforeCall - callAmount) / 2. */
  netWhenTie: number;
  /** Net chips if the hand is lost: - callAmount. */
  netWhenLoss: number;
  /** win + tie / 2. */
  equity: number;
  /** Equity at which EV = 0. */
  breakEvenEquity: number;
}

/**
 * EV of calling, heads-up, ending the hand at showdown (no more betting).
 *   win  -> +potBeforeCall            tie -> (potBeforeCall - callAmount) / 2        loss -> -callAmount
 * Equivalent closed form: EV = equity x (potBeforeCall + callAmount) - callAmount, equity = win + tie / 2.
 */
export function callEV(i: CallEVInput): CallEV {
  const { potBeforeCall, callAmount, winProbability: w, tieProbability: t, lossProbability: l } = i;
  if (potBeforeCall < 0 || callAmount < 0) throw new RangeError('pot and call must be non-negative');
  const netWhenWin = potBeforeCall;
  const netWhenTie = (potBeforeCall - callAmount) / 2;
  const netWhenLoss = -callAmount;
  const { ev, assumptions } = expectedValue(
    [
      { probability: w, value: netWhenWin },
      { probability: t, value: netWhenTie },
      { probability: l, value: netWhenLoss },
    ],
    [
      'Heads-up: one opponent, ties split the pot in two.',
      'The hand is decided at showdown after the call: no further betting, no implied odds, no folds.',
      'Win/tie/loss probabilities are given by the caller (their own assumptions about the villain range).',
    ],
  );
  const equity = w + t / 2;
  const potAfterCall = potBeforeCall + callAmount;
  return {
    ev,
    assumptions,
    netWhenWin,
    netWhenTie,
    netWhenLoss,
    equity,
    breakEvenEquity: potAfterCall === 0 ? 0 : callAmount / potAfterCall,
  };
}

export interface BetEVInput {
  /** Chips in the pot before the bet. */
  potBeforeBet: number;
  betAmount: number;
  /** P(villain folds to the bet). */
  foldEquity: number;
  /** Outcome probabilities when the villain calls (must sum to 1). */
  winWhenCalled: number;
  tieWhenCalled: number;
  lossWhenCalled: number;
}

export interface BetEV extends EVResult {
  /** Net chips when the villain folds: + potBeforeBet. */
  netWhenFold: number;
  netWhenCalledWin: number;
  netWhenCalledTie: number;
  netWhenCalledLoss: number;
  /** EV of the part of the tree where the villain calls (before weighting by 1 - foldEquity). */
  evWhenCalled: number;
}

/**
 * EV of a bet, heads-up, one street, called bets end the hand at showdown.
 *   fold            -> +potBeforeBet
 *   call, win       -> +(potBeforeBet + betAmount)
 *   call, tie       -> +potBeforeBet / 2
 *   call, loss      -> -betAmount
 * EV = f x pot + (1 - f) x [ W x (pot + bet) + T x pot / 2 - L x bet ]
 */
export function betEV(i: BetEVInput): BetEV {
  const { potBeforeBet: pot, betAmount: bet, foldEquity: f } = i;
  if (pot < 0 || bet < 0) throw new RangeError('pot and bet must be non-negative');
  if (f < 0 || f > 1) throw new RangeError('foldEquity must be in [0, 1]');
  const netWhenFold = pot;
  const netWhenCalledWin = pot + bet;
  const netWhenCalledTie = pot / 2;
  const netWhenCalledLoss = -bet;
  const called = expectedValue([
    { probability: i.winWhenCalled, value: netWhenCalledWin },
    { probability: i.tieWhenCalled, value: netWhenCalledTie },
    { probability: i.lossWhenCalled, value: netWhenCalledLoss },
  ]);
  const ev = f * netWhenFold + (1 - f) * called.ev;
  return {
    ev,
    evWhenCalled: called.ev,
    netWhenFold,
    netWhenCalledWin,
    netWhenCalledTie,
    netWhenCalledLoss,
    assumptions: [
      'Heads-up, a single bet on this street; when called the hand goes to showdown with no more betting.',
      'Fold equity is an input (an assumption about the villain), not something the engine knows.',
      'Win/tie/loss probabilities when called are inputs; they should be conditional on the villain calling (a calling range is stronger than a full range).',
    ],
  };
}

export interface CallEVFromEquity extends EVResult {
  equity: number;
  breakEvenEquity: number;
  /** Expected share of the final pot, in chips: equity x (potBeforeCall + callAmount). */
  expectedPotShare: number;
}

/**
 * EV of calling from a single equity number (win + tie share), valid for any number of opponents:
 *   EV = equity x (potBeforeCall + callAmount) - callAmount
 * Assumes the hand is decided at showdown after the call (no further betting, no side pots) and that the
 * pot is exactly potBeforeCall + callAmount (players still to act are assumed to neither fold nor add chips).
 */
export function callEVFromEquity(potBeforeCall: number, callAmount: number, equity: number): CallEVFromEquity {
  if (potBeforeCall < 0 || callAmount < 0) throw new RangeError('pot and call must be non-negative');
  if (!(equity >= 0 && equity <= 1)) throw new RangeError('equity must be in [0, 1]');
  const potAfterCall = potBeforeCall + callAmount;
  return {
    ev: equity * potAfterCall - callAmount,
    equity,
    breakEvenEquity: potAfterCall === 0 ? 0 : callAmount / potAfterCall,
    expectedPotShare: equity * potAfterCall,
    assumptions: [
      'The hand is decided at showdown right after the call: no further betting and no side pots.',
      'The pot is exactly potBeforeCall + callAmount: players still to act neither fold nor add chips.',
      'Equity is win + tie share and comes from the stated opponent hands/ranges.',
    ],
  };
}
