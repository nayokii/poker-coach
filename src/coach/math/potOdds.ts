/**
 * Pot odds.
 *
 * CONVENTIONS (all amounts in the same unit, usually chips):
 *  - `potBeforeCall` is every chip in the middle right now, INCLUDING the bet being called.
 *    Example: pot 20, villain bets 10 -> potBeforeCall = 30, callAmount = 10.
 *    (The engine's `state.pot` already follows this convention.)
 *  - `callAmount` is what the hero must still put in. If the stack is shorter, pass the capped amount
 *    (`getLegalActions().callAmount` already is).
 *  - potAfterCall = potBeforeCall + callAmount.
 *  - requiredEquity = callAmount / potAfterCall, the equity needed to break even on the call alone
 *    (ignoring implied odds and future streets). Equity is win + tie / 2.
 *  - ratio = potBeforeCall / callAmount, read "getting `ratio` to 1".
 */
import type { GameState } from '../../engine';
import { getLegalActions } from '../../engine';

export interface PotOdds {
  potBeforeCall: number;
  callAmount: number;
  potAfterCall: number;
  /** callAmount / potAfterCall, in [0, 1). 0 when the call is free. */
  requiredEquity: number;
  /** requiredEquity x 100. */
  percentage: number;
  /** potBeforeCall / callAmount ("X to 1"); Infinity when the call is free. */
  ratio: number;
}

export function potOdds(potBeforeCall: number, callAmount: number): PotOdds {
  if (!(potBeforeCall >= 0) || !(callAmount >= 0) || !Number.isFinite(potBeforeCall) || !Number.isFinite(callAmount)) {
    throw new RangeError('pot and call amount must be finite and non-negative');
  }
  const potAfterCall = potBeforeCall + callAmount;
  const requiredEquity = potAfterCall === 0 ? 0 : callAmount / potAfterCall;
  return {
    potBeforeCall,
    callAmount,
    potAfterCall,
    requiredEquity,
    percentage: requiredEquity * 100,
    ratio: callAmount === 0 ? Infinity : potBeforeCall / callAmount,
  };
}

/** Same thing when the pot is given WITHOUT the bet: pot 20, villain bet 10 -> potOddsFromBet(20, 10). */
export function potOddsFromBet(potWithoutBet: number, bet: number, callAmount = bet): PotOdds {
  return potOdds(potWithoutBet + bet, callAmount);
}

/** Pot odds for a seat of a live engine state, or null when nothing is owed / it is not that seat's turn. */
export function potOddsFromState(state: GameState, playerIndex: number): PotOdds | null {
  const legal = getLegalActions(state);
  if (!legal || legal.player !== playerIndex || legal.toCall <= 0) return null;
  return potOdds(state.pot, legal.callAmount);
}
