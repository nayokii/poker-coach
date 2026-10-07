import type { GameState, LegalActions, PlayerAction, Rng } from '../engine';

/** Everything a decision maker is allowed to look at when it is a bot's turn. */
export interface DecisionContext {
  state: GameState;
  playerIndex: number;
  legal: LegalActions;
  rng: Rng;
}

/**
 * Pluggable decision maker. SimpleBot is the first implementation; a
 * range/equity-based bot or an external model can replace it without touching the UI.
 */
export interface DecisionProvider {
  decide(ctx: DecisionContext): PlayerAction | Promise<PlayerAction>;
}
