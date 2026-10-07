import type { GameState, PlayerAction } from './gameState';

export class IllegalActionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'IllegalActionError';
  }
}

export interface LegalActions {
  player: number;
  /** Chips missing to match the current bet (before capping by stack). */
  toCall: number;
  fold: boolean;
  check: boolean;
  call: boolean;
  /** Chips a call would cost (capped by the stack: a short call is all-in). */
  callAmount: number;
  /** Opening bet available (no bet yet this street). */
  bet: boolean;
  /** Raise available (a bet is facing and action is open to this player). */
  raise: boolean;
  /** Minimum legal bet/raise as a total "to" amount, or null if neither is available. */
  minRaiseTo: number | null;
  /** Largest possible total bet this street (the all-in amount). */
  maxRaiseTo: number;
  allIn: boolean;
}

/** Legal actions for the player to act, or null if nobody can act. */
export function getLegalActions(state: GameState): LegalActions | null {
  if (state.handStatus !== 'inProgress' || state.toAct === null) return null;
  const p = state.players[state.toAct];
  if (!p) return null;

  const toCall = Math.max(0, state.currentBet - p.bet);
  const maxRaiseTo = p.bet + p.stack;
  // Action is closed for a player who already acted if only a short all-in came after.
  const open = !p.hasActed && p.stack > 0;

  let bet = false;
  let raise = false;
  let minRaiseTo: number | null = null;
  if (open) {
    if (state.currentBet === 0) {
      minRaiseTo = state.config.bigBlind;
      bet = maxRaiseTo >= minRaiseTo;
    } else {
      minRaiseTo = state.currentBet + state.minRaise;
      raise = maxRaiseTo >= minRaiseTo;
    }
    if (!bet && !raise) minRaiseTo = null;
  }

  return {
    player: state.toAct,
    toCall,
    fold: true,
    check: toCall === 0,
    call: toCall > 0,
    callAmount: Math.min(toCall, p.stack),
    bet,
    raise,
    minRaiseTo,
    maxRaiseTo,
    allIn: p.stack > 0 && (maxRaiseTo <= state.currentBet || open),
  };
}

/** Returns null when legal, otherwise a human-readable reason. */
export function validateAction(state: GameState, action: PlayerAction, player?: number): string | null {
  if (state.handStatus !== 'inProgress' || state.toAct === null) return 'No hand in progress';
  if (player !== undefined && player !== state.toAct) {
    const p = state.players[player];
    if (!p) return 'Unknown player';
    if (p.status === 'folded') return 'Folded players cannot act';
    if (p.status === 'allin') return 'All-in players cannot act';
    if (p.status === 'out') return 'Player is out of the hand';
    return 'Not this player\'s turn';
  }
  const legal = getLegalActions(state);
  if (!legal) return 'No legal actions';

  switch (action.type) {
    case 'fold':
      return null;
    case 'check':
      return legal.check ? null : 'Cannot check: a bet must be called';
    case 'call':
      return legal.call ? null : 'Cannot call: nothing to call';
    case 'allin':
      return legal.allIn ? null : 'All-in is not allowed here (action not reopened or no chips)';
    case 'bet':
    case 'raise': {
      const isBet = action.type === 'bet';
      if (isBet && state.currentBet > 0) return 'Cannot bet: a bet already exists, use raise';
      if (!isBet && state.currentBet === 0) return 'Cannot raise: no bet yet, use bet';
      if (!(isBet ? legal.bet : legal.raise) || legal.minRaiseTo === null) {
        return `Cannot ${action.type} here (action not reopened or stack too small, use all-in)`;
      }
      const to = action.amount;
      if (to === undefined || !Number.isInteger(to)) return 'Amount must be an integer';
      if (to > legal.maxRaiseTo) return 'Amount exceeds the player\'s stack';
      if (to < legal.minRaiseTo && to !== legal.maxRaiseTo) return `Below the minimum ${action.type} (${legal.minRaiseTo})`;
      return null;
    }
  }
}

/** Total bet this street the action leads to (assumes the action is valid). */
export function targetBet(state: GameState, action: PlayerAction, player: number): number {
  const p = state.players[player];
  if (!p) throw new IllegalActionError('Unknown player');
  switch (action.type) {
    case 'fold':
    case 'check':
      return p.bet;
    case 'call':
      return p.bet + Math.min(state.currentBet - p.bet, p.stack);
    case 'allin':
      return p.bet + p.stack;
    default:
      return action.amount ?? p.bet;
  }
}
