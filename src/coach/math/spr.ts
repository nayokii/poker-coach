/**
 * Stack-to-pot ratio.  SPR = effective stack / pot.
 *
 * "Effective stack" = the chips that can still be bet between the hero and the opponent he can lose the
 * most to: min(hero stack, largest stack among the opponents still in the hand), measured BEHIND (after
 * the current bets). The pot is everything in the middle at the time of the decision.
 */
import type { GameState } from '../../engine';

/**
 * Category boundaries (upper bounds, exclusive), centralised so that tuning them changes every consumer.
 * They are conventional rules of thumb from poker literature, not mathematical constants:
 *   SPR < 1       very low : any decent hand is effectively committed
 *   1  <= SPR < 3 low      : top pair or better is usually happy to stack off
 *   3  <= SPR < 6 medium
 *   6  <= SPR < 13 high    : strong hands are needed to commit; draws gain implied odds
 *   SPR >= 13     very high
 */
export const SPR_THRESHOLDS = { veryLow: 1, low: 3, medium: 6, high: 13 } as const;

export type SprCategory = 'very-low' | 'low' | 'medium' | 'high' | 'very-high';

export interface SprResult {
  effectiveStack: number;
  pot: number;
  /** Infinity when the pot is empty and a stack remains. */
  spr: number;
  category: SprCategory;
}

export function sprCategory(spr: number): SprCategory {
  if (spr < SPR_THRESHOLDS.veryLow) return 'very-low';
  if (spr < SPR_THRESHOLDS.low) return 'low';
  if (spr < SPR_THRESHOLDS.medium) return 'medium';
  if (spr < SPR_THRESHOLDS.high) return 'high';
  return 'very-high';
}

export function spr(effectiveStack: number, pot: number): SprResult {
  if (!(effectiveStack >= 0) || !(pot >= 0)) throw new RangeError('stack and pot must be non-negative');
  const ratio = pot === 0 ? (effectiveStack === 0 ? 0 : Infinity) : effectiveStack / pot;
  return { effectiveStack, pot, spr: ratio, category: sprCategory(ratio) };
}

/** min(hero stack, biggest stack among opponents still in the hand), or null if the hero has no opponent left. */
export function effectiveStackFromState(state: GameState, heroIndex: number): number | null {
  const hero = state.players[heroIndex];
  if (!hero) return null;
  const opp = state.players.filter((p, i) => i !== heroIndex && (p.status === 'active' || p.status === 'allin'));
  if (opp.length === 0) return null;
  return Math.min(hero.stack, Math.max(...opp.map((p) => p.stack)));
}

export function sprFromState(state: GameState, heroIndex: number): SprResult | null {
  const eff = effectiveStackFromState(state, heroIndex);
  return eff === null ? null : spr(eff, state.pot);
}
