import type { Card } from './cards';
import type { EvaluatedHand } from './handEvaluator';

export type Street = 'preflop' | 'flop' | 'turn' | 'river' | 'showdown';
/** 'out' = no chips at the start of the hand (sitting out). */
export type PlayerStatus = 'active' | 'folded' | 'allin' | 'out';
export type HandStatus = 'idle' | 'inProgress' | 'complete';
export type ActionType = 'fold' | 'check' | 'call' | 'bet' | 'raise' | 'allin';

/**
 * An action requested by a player. For `bet` / `raise`, `amount` is the TOTAL
 * the player will have in front of him on this street ("raise to"), not the increment.
 */
export interface PlayerAction {
  type: ActionType;
  amount?: number;
}

export type RecordType = ActionType | 'postSmallBlind' | 'postBigBlind';

/** One entry of the hand history: enough to replay and analyse the hand. */
export interface ActionRecord {
  seq: number;
  handNumber: number;
  player: number;
  playerId: string;
  street: Street;
  type: RecordType;
  /** Chips moved from the stack to the pot by this action. */
  amount: number;
  /** The player's total bet on this street after the action. */
  toAmount: number;
  potBefore: number;
  potAfter: number;
  stackBefore: number;
  stackAfter: number;
  allIn: boolean;
}

export interface PlayerState {
  id: string;
  name: string;
  stack: number;
  status: PlayerStatus;
  holeCards: Card[];
  /** Chips committed on the current street. */
  bet: number;
  /** Chips committed during the whole hand. */
  totalContribution: number;
  /** Has acted since the last full raise (cannot raise again unless action is reopened). */
  hasActed: boolean;
  /** BTN, SB, BB, UTG, ... ('' when out). */
  position: string;
}

export interface GameConfig {
  smallBlind: number;
  bigBlind: number;
}

export interface PotResult {
  amount: number;
  /** Player indexes allowed to win this pot. */
  eligible: number[];
  winners: number[];
  /** Chips won, indexed like `winners`. */
  shares: number[];
}

export interface HandResult {
  endedBy: 'fold' | 'showdown';
  board: Card[];
  /** Main pot first, then side pots in order. */
  pots: PotResult[];
  /** Uncalled bets returned to their owner. */
  refunds: { player: number; amount: number }[];
  /** Total chips received per player (pots + refunds). */
  payouts: number[];
  /** payouts - totalContribution, per player. */
  netChange: number[];
  /** Evaluated hands of the players who reached showdown (empty if ended by folds). */
  showdownHands: { player: number; hand: EvaluatedHand }[];
}

export interface GameState {
  config: GameConfig;
  players: PlayerState[];
  /** Seat index of the dealer button. */
  button: number;
  smallBlindIndex: number;
  bigBlindIndex: number;
  handNumber: number;
  handStatus: HandStatus;
  street: Street;
  board: Card[];
  /** Undealt cards, next card first. */
  deck: Card[];
  /** Total chips in the middle (sum of contributions). */
  pot: number;
  /** Highest bet on the current street. */
  currentBet: number;
  /** Size of the last full raise (min raise increment). */
  minRaise: number;
  /** Bet level reached by the last full raise/bet (used to detect re-opening all-ins). */
  lastFullRaiseLevel: number;
  /** Player to act, or null when nobody can act. */
  toAct: number | null;
  history: ActionRecord[];
  result: HandResult | null;
}

export function totalChips(state: GameState): number {
  return state.players.reduce((sum, p) => sum + p.stack, 0) + state.pot;
}

/** Position labels for the seats after the big blind, UTG first. */
function tailPositions(k: number): string[] {
  const out: string[] = [];
  for (let i = 0; i < k; i++) {
    if (i === k - 1 && k >= 2) out.push('CO');
    else if (i === k - 2 && k >= 3) out.push('HJ');
    else if (i === 0) out.push('UTG');
    else out.push(`UTG+${i}`);
  }
  return out;
}

/** Labels in clockwise order starting from the button. */
export function positionLabels(n: number): string[] {
  if (n === 2) return ['BTN', 'BB']; // the button is also the small blind
  if (n === 3) return ['BTN', 'SB', 'BB'];
  return ['BTN', 'SB', 'BB', ...tailPositions(n - 3)];
}
