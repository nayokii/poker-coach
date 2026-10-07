/**
 * Game State -> Coach snapshot. Contains ONLY what the hero legitimately knows: his own hole cards, the
 * visible board, stacks, bets, pot and statuses. Opponents' hole cards are never copied.
 */
import type { Card, GameState, Street } from '../../engine';

export interface SnapshotOpponent {
  seat: number;
  name: string;
  position: string;
  stack: number;
  bet: number;
  status: 'active' | 'allin';
}

export interface CoachSnapshot {
  handNumber: number;
  street: Street;
  heroSeat: number;
  heroName: string;
  heroStatus: 'active' | 'allin' | 'folded' | 'out';
  heroPosition: string;
  heroStack: number;
  heroBet: number;
  hero: Card[];
  board: Card[];
  pot: number;
  /** Sum of the bets currently on the table (this street). */
  streetBets: number;
  currentBet: number;
  heroToAct: boolean;
  opponents: SnapshotOpponent[];
}

export function snapshotForCoach(state: GameState, heroSeat: number): CoachSnapshot {
  const hero = state.players[heroSeat];
  if (!hero) throw new RangeError(`no player at seat ${heroSeat}`);
  return {
    handNumber: state.handNumber,
    street: state.street,
    heroSeat,
    heroName: hero.name,
    heroStatus: hero.status,
    heroPosition: hero.position,
    heroStack: hero.stack,
    heroBet: hero.bet,
    hero: hero.holeCards.slice(),
    board: state.board.slice(),
    pot: state.pot,
    streetBets: state.players.reduce((s, p) => s + p.bet, 0),
    currentBet: state.currentBet,
    heroToAct: state.handStatus === 'inProgress' && state.toAct === heroSeat,
    opponents: state.players
      .map((p, seat) => ({ p, seat }))
      .filter(({ p, seat }) => seat !== heroSeat && (p.status === 'active' || p.status === 'allin'))
      .map(({ p, seat }) => ({
        seat,
        name: p.name,
        position: p.position,
        stack: p.stack,
        bet: p.bet,
        status: p.status as 'active' | 'allin',
      })),
  };
}
