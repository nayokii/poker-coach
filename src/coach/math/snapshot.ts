/**
 * Game State -> Math Engine adapter.
 *
 * Reads ONLY what the hero legitimately knows (own hole cards, visible board, stacks, pot, bets) and
 * derives the numeric facts the future coach will explain. It never looks at opponents' hole cards.
 */
import type { Card, GameState, Street } from '../../engine';
import { analyzeOuts, type OutsAnalysis, type OutsOptions } from './outs';
import { potOdds, type PotOdds } from './potOdds';
import { effectiveStackFromState, spr, type SprResult } from './spr';

export interface MathSnapshot {
  heroIndex: number;
  hero: Card[];
  board: Card[];
  street: Street;
  /** 52 minus the hero's own cards and the board. */
  unknownCards: number;
  pot: number;
  /** Chips the hero still has to add to match the highest bet (capped by his stack). */
  callAmount: number;
  /** Null when nothing is owed. */
  potOdds: PotOdds | null;
  opponentsInHand: number;
  effectiveStack: number | null;
  spr: SprResult | null;
  /** Null preflop and on the river (no card to come). */
  outs: OutsAnalysis | null;
}

export function snapshotFromState(state: GameState, heroIndex: number, opts: OutsOptions = {}): MathSnapshot {
  const hero = state.players[heroIndex];
  if (!hero || hero.holeCards.length !== 2) throw new RangeError('hero has no hole cards');
  const callAmount = Math.min(Math.max(0, state.currentBet - hero.bet), hero.stack);
  const eff = effectiveStackFromState(state, heroIndex);
  const board = state.board.slice();
  return {
    heroIndex,
    hero: hero.holeCards.slice(),
    board,
    street: state.street,
    unknownCards: 52 - 2 - board.length,
    pot: state.pot,
    callAmount,
    potOdds: callAmount > 0 ? potOdds(state.pot, callAmount) : null,
    opponentsInHand: state.players.filter((p, i) => i !== heroIndex && (p.status === 'active' || p.status === 'allin')).length,
    effectiveStack: eff,
    spr: eff === null ? null : spr(eff, state.pot),
    outs: board.length === 3 || board.length === 4 ? analyzeOuts(hero.holeCards, board, opts) : null,
  };
}
