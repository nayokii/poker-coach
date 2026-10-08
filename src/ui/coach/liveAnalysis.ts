import type { Card, GameState, Street } from '../../engine';
import { analyzeCoach, snapshotForCoach, type CoachAnalysis, type CoachAssumptions, type OpponentAssumption } from '../../coach/analysis';
import { BOT_RANGE_PROFILES, botRange } from '../../coach/ranges';

/** What the Coach assumes about the opponents: nothing, or the preflop range of each bot's profile (a hypothesis). */
export type AssumeMode = 'none' | 'profiles';

const streetOf = (n: number): Street => (n === 0 ? 'preflop' : n === 3 ? 'flop' : n === 4 ? 'turn' : 'river');

/** The live analysis of the hand: the existing snapshot + CoachAnalysis, fed with what the player can see. Pure. */
export function buildCoachAnalysis(game: GameState, visibleBoard: readonly Card[], heroSeat: number, botProfiles: Record<number, string>, mode: AssumeMode): CoachAnalysis | null {
  if (game.handStatus !== 'inProgress') return null;
  const base = snapshotForCoach(game, heroSeat);
  const snap = { ...base, board: visibleBoard.slice(), street: streetOf(visibleBoard.length) };
  const assumptions: CoachAssumptions = { equity: { seed: 1 } };
  if (mode === 'profiles') {
    const opponents: Record<number, OpponentAssumption> = {};
    for (const o of snap.opponents) {
      const id = botProfiles[o.seat];
      if (!id || !BOT_RANGE_PROFILES[id]) continue;
      opponents[o.seat] = { kind: 'range', range: botRange(id), certainty: 'hypothetical', source: 'bot-profile', label: `${BOT_RANGE_PROFILES[id].label} preflop range` };
    }
    assumptions.opponents = opponents;
  }
  return analyzeCoach(snap, assumptions);
}

export interface OpponentProfile {
  id: string;
  label: string;
}

/** The distinct bot profiles still in the hand: what "Range adverse : TAG" can refer to. */
export function opponentProfiles(game: GameState, heroSeat: number, botProfiles: Record<number, string>): OpponentProfile[] {
  if (game.handStatus !== 'inProgress') return [];
  const seen = new Map<string, OpponentProfile>();
  for (const o of snapshotForCoach(game, heroSeat).opponents) {
    const id = botProfiles[o.seat];
    const profile = id ? BOT_RANGE_PROFILES[id] : undefined;
    if (id && profile && !seen.has(id)) seen.set(id, { id, label: profile.label });
  }
  return [...seen.values()];
}

/** Changes when a NEW analysis is available (new hand or new street), not at every action. */
export const analysisKey = (game: GameState, visibleBoard: readonly Card[]): string => `${game.handNumber}:${visibleBoard.length}`;

/** Changes at every decision point (street, pot, bet to call): the verdict is hidden again each time. */
export const decisionKey = (game: GameState, visibleBoard: readonly Card[]): string => `${game.handNumber}:${visibleBoard.length}:${game.pot}:${game.currentBet}:${game.toAct}`;
