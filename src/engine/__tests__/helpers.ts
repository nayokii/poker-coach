import {
  applyAction, checkInvariants, createDeck, createGame, getLegalActions, parseCards, remainingDeck, seededRng,
  startHand, totalChips, cardToString,
  type ActionType, type GameState, type PlayerState,
} from '..';

export function newGame(stacks: number[], opts: { sb?: number; bb?: number; button?: number } = {}): GameState {
  return createGame({
    players: stacks.map((stack, i) => ({ id: `P${i}`, name: `Player ${i}`, stack })),
    smallBlind: opts.sb ?? 5,
    bigBlind: opts.bb ?? 10,
    button: opts.button ?? 0,
  });
}

/**
 * Starts a hand then overrides the cards: `holes[i]` is player i's hole cards
 * ("As Kd"), `board` is the 5-card runout dealt in order. Remaining deck is the rest.
 */
export function rigged(state: GameState, holes: string[], board: string, seed = 1): GameState {
  const s = startHand(state, seededRng(seed));
  const used = [...holes.flatMap((h) => parseCards(h)), ...parseCards(board)];
  const usedStr = new Set(used.map(cardToString));
  if (usedStr.size !== used.length) throw new Error('rigged: duplicate cards');
  holes.forEach((h, i) => {
    (s.players[i] as PlayerState).holeCards = parseCards(h);
  });
  s.deck = [...parseCards(board), ...remainingDeck(used)];
  return s;
}

/** Applies a list of [type, amount?] actions to whoever is to act. */
export function play(state: GameState, ...actions: [ActionType, number?][]): GameState {
  let s = state;
  for (const [type, amount] of actions) {
    s = applyAction(s, amount === undefined ? { type } : { type, amount });
  }
  return s;
}

export function assertConsistent(s: GameState, total: number): void {
  const errs = checkInvariants(s, total);
  if (errs.length) throw new Error(errs.join('; '));
}

export { totalChips, getLegalActions, createDeck };
