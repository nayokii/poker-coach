import { createDeck, shuffle, type Rng } from './deck';
import { evaluateHand, type EvaluatedHand } from './handEvaluator';
import { buildPots, splitPot } from './pots';
import { IllegalActionError, getLegalActions, targetBet, validateAction } from './betting';
import {
  positionLabels,
  type ActionRecord,
  type GameState,
  type HandResult,
  type PlayerAction,
  type PlayerState,
  type PotResult,
  type RecordType,
  type Street,
} from './gameState';

export interface CreateGameOptions {
  players: { id: string; name: string; stack: number }[];
  smallBlind: number;
  bigBlind: number;
  /** Seat of the button for the first hand (default 0). */
  button?: number;
}

export function createGame(opts: CreateGameOptions): GameState {
  const { players, smallBlind, bigBlind } = opts;
  if (players.length < 2) throw new Error('At least 2 players are required');
  if (!Number.isInteger(smallBlind) || !Number.isInteger(bigBlind) || smallBlind <= 0 || bigBlind < smallBlind) {
    throw new Error('Blinds must be positive integers with bigBlind >= smallBlind');
  }
  if (new Set(players.map((p) => p.id)).size !== players.length) throw new Error('Player ids must be unique');
  for (const p of players) {
    if (!Number.isInteger(p.stack) || p.stack < 0) throw new Error('Stacks must be non-negative integers');
  }
  const button = opts.button ?? 0;
  if (!Number.isInteger(button) || button < 0 || button >= players.length) throw new Error('Invalid button seat');
  return {
    config: { smallBlind, bigBlind },
    players: players.map((p) => ({
      id: p.id,
      name: p.name,
      stack: p.stack,
      status: p.stack > 0 ? 'active' : 'out',
      holeCards: [],
      bet: 0,
      totalContribution: 0,
      hasActed: false,
      position: '',
    })),
    button,
    smallBlindIndex: -1,
    bigBlindIndex: -1,
    handNumber: 0,
    handStatus: 'idle',
    street: 'preflop',
    board: [],
    deck: [],
    pot: 0,
    currentBet: 0,
    minRaise: bigBlind,
    lastFullRaiseLevel: 0,
    toAct: null,
    history: [],
    result: null,
  };
}

export function isHandOver(state: GameState): boolean {
  return state.handStatus === 'complete';
}

export function getResult(state: GameState): HandResult | null {
  return state.result;
}

export { getLegalActions, validateAction, IllegalActionError };

/** Next seat clockwise from `from` (exclusive) matching the predicate. */
function nextSeat(s: GameState, from: number, pred: (p: PlayerState, i: number) => boolean): number {
  const n = s.players.length;
  for (let k = 1; k <= n; k++) {
    const i = (from + k) % n;
    if (pred(s.players[i] as PlayerState, i)) return i;
  }
  return -1;
}

function player(s: GameState, i: number): PlayerState {
  const p = s.players[i];
  if (!p) throw new Error(`Unknown player ${i}`);
  return p;
}

/** Starts a new hand: rotates the button, posts blinds, deals hole cards. Pure (returns a new state). */
export function startHand(state: GameState, rng: Rng): GameState {
  if (state.handStatus === 'inProgress') throw new Error('A hand is already in progress');
  const s = structuredClone(state);
  if (s.players.filter((p) => p.stack > 0).length < 2) throw new Error('Need at least 2 players with chips');

  const funded = (p: PlayerState): boolean => p.stack > 0;
  if (s.handNumber > 0 || !funded(player(s, s.button))) s.button = nextSeat(s, s.button, funded);
  s.handNumber += 1;

  for (const p of s.players) {
    p.status = p.stack > 0 ? 'active' : 'out';
    p.holeCards = [];
    p.bet = 0;
    p.totalContribution = 0;
    p.hasActed = false;
    p.position = '';
  }

  // Seats in the hand, clockwise starting at the button.
  const order: number[] = [s.button];
  for (let i = nextSeat(s, s.button, funded); i !== s.button; i = nextSeat(s, i, funded)) order.push(i);
  const n = order.length;
  const sb = n === 2 ? (order[0] as number) : (order[1] as number);
  const bb = n === 2 ? (order[1] as number) : (order[2] as number);
  s.smallBlindIndex = sb;
  s.bigBlindIndex = bb;
  const labels = positionLabels(n);
  order.forEach((seat, k) => {
    player(s, seat).position = labels[k] as string;
  });

  s.deck = shuffle(createDeck(), rng);
  s.board = [];
  s.street = 'preflop';
  s.history = [];
  s.result = null;
  s.pot = 0;
  s.currentBet = 0;
  s.toAct = null;
  s.handStatus = 'inProgress';

  // Deal two rounds starting with the small blind.
  const dealOrder = n === 2 ? order : [...order.slice(1), order[0] as number];
  for (let round = 0; round < 2; round++) {
    for (const seat of dealOrder) player(s, seat).holeCards.push(draw(s));
  }

  postBlind(s, sb, s.config.smallBlind, 'postSmallBlind');
  postBlind(s, bb, s.config.bigBlind, 'postBigBlind');
  // Even if the big blind is short (all-in for less), the price to play stays a full big blind.
  s.currentBet = Math.max(s.currentBet, s.config.bigBlind);
  s.minRaise = s.config.bigBlind;
  s.lastFullRaiseLevel = s.currentBet;

  progress(s, bb);
  return s;
}

function draw(s: GameState) {
  const c = s.deck.shift();
  if (!c) throw new Error('Deck is empty');
  return c;
}

function record(s: GameState, i: number, type: RecordType, before: { pot: number; stack: number }): void {
  const p = player(s, i);
  s.history.push({
    seq: s.history.length,
    handNumber: s.handNumber,
    player: i,
    playerId: p.id,
    street: s.street,
    type,
    amount: before.stack - p.stack,
    toAmount: p.bet,
    potBefore: before.pot,
    potAfter: s.pot,
    stackBefore: before.stack,
    stackAfter: p.stack,
    allIn: p.status === 'allin',
  } satisfies ActionRecord);
}

/** Moves chips so the player's street bet becomes `to` (capped by the stack). */
function putChips(s: GameState, i: number, to: number): void {
  const p = player(s, i);
  const chips = Math.min(to - p.bet, p.stack);
  p.stack -= chips;
  p.bet += chips;
  p.totalContribution += chips;
  s.pot += chips;
  if (p.stack === 0) p.status = 'allin';
}

function postBlind(s: GameState, i: number, amount: number, type: RecordType): void {
  const p = player(s, i);
  const before = { pot: s.pot, stack: p.stack };
  putChips(s, i, amount);
  s.currentBet = Math.max(s.currentBet, p.bet);
  record(s, i, type, before);
}

/** Applies a validated action. Returns a new state; throws IllegalActionError otherwise. */
export function applyAction(state: GameState, action: PlayerAction, playerIndex?: number): GameState {
  const idx = playerIndex ?? state.toAct ?? -1;
  const err = validateAction(state, action, idx);
  if (err) throw new IllegalActionError(err);

  const s = structuredClone(state);
  const p = player(s, idx);
  const before = { pot: s.pot, stack: p.stack };

  if (action.type === 'fold') {
    p.status = 'folded';
  } else if (action.type !== 'check') {
    const to = targetBet(s, action, idx);
    putChips(s, idx, to);
    if (p.bet > s.currentBet) {
      // Full raise (cumulative since the last full raise) re-opens the action; a short all-in does not.
      const increment = p.bet - s.lastFullRaiseLevel;
      const isFull = increment >= s.minRaise;
      s.currentBet = p.bet;
      if (isFull) {
        s.minRaise = increment;
        s.lastFullRaiseLevel = p.bet;
        for (const o of s.players) if (o !== p && o.status === 'active') o.hasActed = false;
      }
    }
  }
  p.hasActed = true;
  record(s, idx, action.type, before);
  progress(s, idx);
  return s;
}

function needsAction(s: GameState, p: PlayerState): boolean {
  return p.status === 'active' && (!p.hasActed || p.bet < s.currentBet);
}

function bettingClosed(s: GameState): boolean {
  const active = s.players.filter((p) => p.status === 'active');
  if (!active.some((p) => needsAction(s, p))) return true;
  // A lone player with chips has nobody left to bet against once he has matched the bet.
  return active.length <= 1 && active.every((p) => p.bet >= s.currentBet);
}

/** Advances turn / street / hand end until a player has to act or the hand is over. */
function progress(s: GameState, from: number): void {
  for (;;) {
    const live = s.players.filter((p) => p.status === 'active' || p.status === 'allin');
    if (live.length === 1) return finish(s, 'fold');
    if (bettingClosed(s)) {
      if (s.street === 'river') {
        s.street = 'showdown';
        return finish(s, 'showdown');
      }
      advanceStreet(s);
      from = s.button;
      continue;
    }
    s.toAct = nextSeat(s, from, (p) => needsAction(s, p));
    return;
  }
}

const NEXT_STREET: Record<string, { street: Street; cards: number }> = {
  preflop: { street: 'flop', cards: 3 },
  flop: { street: 'turn', cards: 1 },
  turn: { street: 'river', cards: 1 },
};

function advanceStreet(s: GameState): void {
  const next = NEXT_STREET[s.street];
  if (!next) throw new Error(`Cannot advance from ${s.street}`);
  s.street = next.street;
  for (let k = 0; k < next.cards; k++) s.board.push(draw(s));
  for (const p of s.players) {
    p.bet = 0;
    p.hasActed = false;
  }
  s.currentBet = 0;
  s.minRaise = s.config.bigBlind;
  s.lastFullRaiseLevel = 0;
}

function finish(s: GameState, endedBy: 'fold' | 'showdown'): void {
  s.toAct = null;
  const live = s.players.map((p, i) => ({ p, i })).filter(({ p }) => p.status === 'active' || p.status === 'allin');
  const { pots, refunds } = buildPots(
    s.players.map((p, i) => ({
      player: i,
      amount: p.totalContribution,
      folded: p.status === 'folded' || p.status === 'out',
    })),
  );

  const hands = new Map<number, EvaluatedHand>();
  if (endedBy === 'showdown') {
    if (s.board.length !== 5) throw new Error('Showdown requires a complete board');
    for (const { p, i } of live) hands.set(i, evaluateHand([...p.holeCards, ...s.board]));
  }

  // Odd chips go to the first winners clockwise from the left of the button.
  const n = s.players.length;
  const clockwise = Array.from({ length: n }, (_, k) => (s.button + 1 + k) % n);
  const payouts = new Array<number>(n).fill(0);
  const potResults: PotResult[] = pots.map((pot) => {
    let winners = pot.eligible;
    if (winners.length > 1) {
      if (endedBy !== 'showdown') throw new Error('Multiple eligible players without a showdown');
      const best = Math.max(...winners.map((i) => (hands.get(i) as EvaluatedHand).score));
      winners = winners.filter((i) => (hands.get(i) as EvaluatedHand).score === best);
    }
    const ordered = clockwise.filter((i) => winners.includes(i));
    const shares = splitPot(pot.amount, ordered);
    ordered.forEach((w, k) => {
      payouts[w] = (payouts[w] as number) + (shares[k] as number);
    });
    return { amount: pot.amount, eligible: pot.eligible, winners: ordered, shares };
  });
  for (const r of refunds) payouts[r.player] = (payouts[r.player] as number) + r.amount;

  s.players.forEach((p, i) => {
    p.stack += payouts[i] as number;
  });
  s.pot = 0;
  s.handStatus = 'complete';
  s.result = {
    endedBy,
    board: s.board.slice(),
    pots: potResults,
    refunds,
    payouts,
    netChange: s.players.map((p, i) => (payouts[i] as number) - p.totalContribution),
    showdownHands: [...hands.entries()].map(([player, hand]) => ({ player, hand })),
  };
}
