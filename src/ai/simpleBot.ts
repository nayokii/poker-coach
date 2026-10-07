import type { LegalActions, PlayerAction } from '../engine';
import { handStrength } from './handStrength';
import { PROFILES, type BotProfile } from './profiles';
import type { DecisionContext, DecisionProvider } from './types';

const clamp = (v: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, v));

/** Picks a legal bet/raise "to" amount from a pot fraction, shoving when the stack is nearly committed. */
function sizedRaise(ctx: DecisionContext, legal: LegalActions, fraction: number): PlayerAction {
  const { state } = ctx;
  const raw = state.currentBet + fraction * (state.pot + legal.toCall);
  const to = Math.round(clamp(raw, legal.minRaiseTo ?? legal.maxRaiseTo, legal.maxRaiseTo));
  if (to >= legal.maxRaiseTo * 0.7 && legal.allIn) return { type: 'allin' };
  return { type: legal.bet ? 'bet' : 'raise', amount: to };
}

/**
 * Heuristic bot: hand strength + a personality profile.
 * Deliberately simple and fully driven by the injected RNG (reproducible).
 */
export class SimpleBot implements DecisionProvider {
  constructor(private readonly profileFor: (playerIndex: number) => BotProfile = () => PROFILES.tag) {}

  decide(ctx: DecisionContext): PlayerAction {
    const { state, playerIndex, legal, rng } = ctx;
    const prof = this.profileFor(playerIndex);
    const s = clamp(handStrength(state, playerIndex) + (rng() - 0.5) * 0.12, 0, 1);
    const preflop = state.street === 'preflop';
    const me = state.players[playerIndex];
    const bb = state.config.bigBlind;
    const stackBB = me ? (me.stack + me.bet) / bb : 100;
    const myStack = me?.stack ?? 0;

    const canRaise = legal.bet || legal.raise;
    const strongBar = 0.72 - 0.18 * prof.aggression;
    const playBar = 0.5 - 0.28 * prof.looseness;

    // Short stacks: shove or fold with decent hands.
    if (stackBB <= 10 && legal.allIn && s > playBar + 0.05) return { type: 'allin' };

    if (legal.toCall === 0) {
      if (canRaise) {
        const value = s >= strongBar && rng() < 0.45 + 0.5 * prof.aggression;
        const semi = s >= playBar + 0.1 && rng() < 0.2 + 0.5 * prof.aggression;
        const bluff = !preflop && s < 0.3 && rng() < prof.bluff * 0.5;
        if (value) return sizedRaise(ctx, legal, 0.5 + 0.5 * s);
        if (semi || bluff) return sizedRaise(ctx, legal, bluff ? 0.55 : 0.4);
      }
      return { type: 'check' };
    }

    const callCost = legal.callAmount;
    const potOdds = callCost / (state.pot + callCost);
    const bigCall = callCost > myStack * 0.5;
    const bar = potOdds + 0.12 - 0.12 * prof.looseness - 0.2 * prof.stickiness + (bigCall ? 0.12 : 0);

    if (canRaise && s >= strongBar + 0.05 && rng() < 0.35 + 0.55 * prof.aggression) {
      return sizedRaise(ctx, legal, preflop ? 0.9 : 0.75);
    }
    if (canRaise && !preflop && s < 0.28 && rng() < prof.bluff * 0.25) return sizedRaise(ctx, legal, 0.8);
    if (canRaise && preflop && s >= playBar && state.currentBet <= bb && rng() < 0.3 + 0.6 * prof.aggression) {
      return sizedRaise(ctx, legal, 1);
    }
    if (s >= bar && legal.call) return { type: 'call' };
    return { type: 'fold' };
  }
}
