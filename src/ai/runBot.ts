import { applyAction, getLegalActions, validateAction, type GameState, type PlayerAction, type Rng } from '../engine';
import type { DecisionProvider } from './types';

/** Asks the provider for the current player's decision, with a safe fallback if it is illegal. */
export async function chooseBotAction(state: GameState, provider: DecisionProvider, rng: Rng): Promise<PlayerAction> {
  const legal = getLegalActions(state);
  if (!legal) throw new Error('No player to act');
  const action = await provider.decide({ state, playerIndex: legal.player, legal, rng });
  if (validateAction(state, action, legal.player) === null) return action;
  return legal.check ? { type: 'check' } : { type: 'fold' };
}

/** AI → DecisionProvider → engine.applyAction(): plays one bot decision. */
export async function playBotTurn(state: GameState, provider: DecisionProvider, rng: Rng): Promise<GameState> {
  return applyAction(state, await chooseBotAction(state, provider, rng));
}
