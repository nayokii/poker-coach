import { cardToString } from './cards';
import type { GameState } from './gameState';
import { totalChips } from './gameState';

/**
 * Returns a list of violated invariants (empty = consistent).
 * `expectedTotal` is the total chip count at game creation.
 */
export function checkInvariants(state: GameState, expectedTotal: number): string[] {
  const errors: string[] = [];
  if (totalChips(state) !== expectedTotal) errors.push(`chips: ${totalChips(state)} != ${expectedTotal}`);

  const contributions = state.players.reduce((a, p) => a + p.totalContribution, 0);
  if (state.handStatus === 'inProgress' && state.pot !== contributions) {
    errors.push(`pot ${state.pot} != contributions ${contributions}`);
  }
  if (state.handStatus === 'complete' && state.pot !== 0) errors.push('pot not empty after the hand');
  if (state.players.some((p) => p.stack < 0 || p.bet < 0)) errors.push('negative chips');

  if (state.handStatus !== 'idle') {
    const all = [...state.board, ...state.deck, ...state.players.flatMap((p) => p.holeCards)].map(cardToString);
    if (new Set(all).size !== all.length) errors.push('duplicate card');
    if (all.length !== 52) errors.push(`card count ${all.length} != 52`);
  }

  if (state.handStatus === 'inProgress') {
    if (state.toAct === null) errors.push('in progress without a player to act');
    else if ((state.players[state.toAct]?.status ?? 'x') !== 'active') errors.push('player to act cannot act');
  }
  if (state.handStatus === 'complete') {
    if (state.toAct !== null) errors.push('toAct set after the hand');
    if (!state.result) errors.push('missing result');
    else {
      const paid = state.result.payouts.reduce((a, b) => a + b, 0);
      if (paid !== contributions) errors.push(`payouts ${paid} != contributions ${contributions}`);
      for (const pot of state.result.pots) {
        for (const w of pot.winners) {
          if (state.players[w]?.status === 'folded') errors.push('folded player won a pot');
        }
      }
    }
  }
  return errors;
}
