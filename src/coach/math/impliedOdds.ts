/**
 * Implied odds and reverse implied odds, with EXPLICIT caller-supplied assumptions.
 *
 * There is no universal implied-odds value: it depends on how much the villain will pay later, how often,
 * and how much stack is left. So every input below is an assumption provided by the caller. When a needed
 * assumption is missing the function returns `status: 'indeterminate'` and lists what is missing; it never
 * substitutes a default.
 *
 * Model (heads-up, extra chips only move on later streets):
 *   hero invests `callAmount` now.
 *   If hero ends up with the best hand he also wins `expectedFutureWin` extra chips:
 *        expectedFutureWin = min(futureWinWhenHit, stackBehind) x payoffProbability
 *   If hero ends up behind he also loses `expectedFutureLoss` extra chips (reverse implied odds):
 *        expectedFutureLoss = min(futureLossWhenBeaten, stackBehind) x reverseProbability
 *   EV = equity x (potBeforeCall + expectedFutureWin) - (1 - equity) x (callAmount + expectedFutureLoss)
 *   requiredEquity = (call + loss) / (potBeforeCall + call + win + loss)
 * "Equity" here is the probability of ending with the best hand (ties counted half, as elsewhere).
 */
import { potOdds } from './potOdds';

export interface FutureWinAssumption {
  /** Extra chips the villain would pay on later streets when the hero hits (before the stack cap). */
  futureWinWhenHit: number;
  /** Probability that the villain actually pays that amount when the hero hits, in [0, 1]. */
  payoffProbability: number;
}

export interface FutureLossAssumption {
  /** Extra chips the hero would lose on later streets when he completes a hand that is still second best. */
  futureLossWhenBeaten: number;
  /** Probability of that happening (conditional on losing the hand), in [0, 1]. */
  reverseProbability: number;
}

export interface ImpliedOddsInput {
  potBeforeCall: number;
  callAmount: number;
  /** Hero equity estimate (win + tie / 2). Optional: without it only the required equity is returned. */
  equity?: number;
  /** Chips left behind after the call: caps what can still be won or lost. Required whenever an assumption is used. */
  stackBehind?: number;
  implied?: Partial<FutureWinAssumption>;
  reverse?: Partial<FutureLossAssumption>;
}

export type ImpliedOddsResult =
  | {
      status: 'complete';
      /** Required equity from the immediate pot odds alone. */
      immediateRequiredEquity: number;
      /** Required equity once the stated implied / reverse-implied assumptions are included. */
      requiredEquity: number;
      expectedFutureWin: number;
      expectedFutureLoss: number;
      /** Present only when `equity` was provided. */
      ev?: number;
      /** equity >= requiredEquity (undefined without equity). */
      profitable?: boolean;
      assumptions: string[];
    }
  | { status: 'indeterminate'; missing: string[]; immediateRequiredEquity: number };

const in01 = (p: number): boolean => p >= 0 && p <= 1;

export function impliedOdds(input: ImpliedOddsInput): ImpliedOddsResult {
  const base = potOdds(input.potBeforeCall, input.callAmount);
  const missing: string[] = [];
  const assumptions: string[] = ['Heads-up; extra chips move only on later streets.'];

  let win = 0;
  let loss = 0;
  const wantsAny = input.implied !== undefined || input.reverse !== undefined;
  if (!wantsAny) missing.push('implied or reverse assumptions (none provided)');

  if (wantsAny && input.stackBehind === undefined) missing.push('stackBehind');
  if (input.stackBehind !== undefined && !(input.stackBehind >= 0)) throw new RangeError('stackBehind must be >= 0');
  const cap = input.stackBehind ?? 0;

  if (input.implied) {
    const { futureWinWhenHit: amt, payoffProbability: p } = input.implied;
    if (amt === undefined) missing.push('implied.futureWinWhenHit');
    if (p === undefined) missing.push('implied.payoffProbability');
    if (amt !== undefined && p !== undefined) {
      if (amt < 0 || !in01(p)) throw new RangeError('invalid implied assumption');
      win = Math.min(amt, cap) * p;
      assumptions.push(`If hero hits, villain pays ${amt} more (capped by ${cap} behind) with probability ${p}.`);
    }
  }
  if (input.reverse) {
    const { futureLossWhenBeaten: amt, reverseProbability: p } = input.reverse;
    if (amt === undefined) missing.push('reverse.futureLossWhenBeaten');
    if (p === undefined) missing.push('reverse.reverseProbability');
    if (amt !== undefined && p !== undefined) {
      if (amt < 0 || !in01(p)) throw new RangeError('invalid reverse assumption');
      loss = Math.min(amt, cap) * p;
      assumptions.push(`If hero is second best, he loses ${amt} more (capped by ${cap} behind) with probability ${p}.`);
    }
  }

  if (missing.length) return { status: 'indeterminate', missing, immediateRequiredEquity: base.requiredEquity };

  const requiredEquity = (base.callAmount + loss) / (base.potBeforeCall + base.callAmount + win + loss);
  const result: ImpliedOddsResult = {
    status: 'complete',
    immediateRequiredEquity: base.requiredEquity,
    requiredEquity,
    expectedFutureWin: win,
    expectedFutureLoss: loss,
    assumptions,
  };
  if (input.equity !== undefined) {
    if (!in01(input.equity)) throw new RangeError('equity must be in [0, 1]');
    result.ev = input.equity * (base.potBeforeCall + win) - (1 - input.equity) * (base.callAmount + loss);
    result.profitable = input.equity >= requiredEquity;
  }
  return result;
}

/** Reverse implied odds only (no implied winnings). Same rules: missing assumptions -> indeterminate. */
export function reverseImpliedOdds(input: Omit<ImpliedOddsInput, 'implied'> & { reverse?: Partial<FutureLossAssumption> }): ImpliedOddsResult {
  return impliedOdds({ ...input, implied: undefined });
}
