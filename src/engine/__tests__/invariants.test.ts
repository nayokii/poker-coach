import { describe, expect, it } from 'vitest';
import {
  applyAction, checkInvariants, getLegalActions, isHandOver, seededRng, startHand, totalChips,
  type GameState, type PlayerAction, type Rng,
} from '..';
import { newGame } from './helpers';

function randomAction(s: GameState, rng: Rng): PlayerAction {
  const l = getLegalActions(s)!;
  const roll = rng();
  if (roll < 0.12) return { type: 'fold' };
  if (roll < 0.2 && l.allIn) return { type: 'allin' };
  if (roll < 0.45 && (l.bet || l.raise) && l.minRaiseTo !== null) {
    const span = l.maxRaiseTo - l.minRaiseTo;
    const amount = l.minRaiseTo + Math.floor(rng() * (span + 1));
    return { type: l.bet ? 'bet' : 'raise', amount };
  }
  return l.check ? { type: 'check' } : { type: 'call' };
}

function playRandomHands(seed: number, nPlayers: number, hands: number): void {
  const rng = seededRng(seed);
  const stacks = Array.from({ length: nPlayers }, () => 200 + Math.floor(rng() * 20) * 50);
  const total = stacks.reduce((a, b) => a + b, 0);
  let g = newGame(stacks, { sb: 5, bb: 10 });

  for (let h = 0; h < hands; h++) {
    if (g.players.filter((p) => p.stack > 0).length < 2) break;
    g = startHand(g, rng);
    expect(checkInvariants(g, total)).toEqual([]);
    let steps = 0;
    while (!isHandOver(g)) {
      const toAct = g.toAct!;
      const before = g;
      g = applyAction(g, randomAction(g, rng));
      expect(checkInvariants(g, total)).toEqual([]);
      // the actor can never act again if folded / all-in
      const st = g.players[toAct]!.status;
      if (st === 'folded' || st === 'allin') expect(g.toAct).not.toBe(toAct);
      expect(totalChips(g)).toBe(totalChips(before));
      if (++steps > 200) throw new Error('hand did not terminate');
    }
    const r = g.result!;
    // winners hold the best hand among eligible players (showdown only)
    if (r.endedBy === 'showdown') {
      const score = new Map(r.showdownHands.map((x) => [x.player, x.hand.score]));
      for (const pot of r.pots) {
        const best = Math.max(...pot.eligible.map((i) => score.get(i)!));
        for (const w of pot.winners) expect(score.get(w)).toBe(best);
        expect(pot.shares.reduce((a, b) => a + b, 0)).toBe(pot.amount);
      }
      expect(g.board).toHaveLength(5);
    }
    for (const p of g.players) expect(p.stack).toBeGreaterThanOrEqual(0);
  }
}

describe('invariants over random play', () => {
  for (const n of [2, 3, 4, 6, 9]) {
    it(`${n} players: chips conserved, cards unique, hands always terminate`, () => {
      for (let seed = 1; seed <= 6; seed++) playRandomHands(seed * 100 + n, n, 60);
    });
  }

  it('replays identically from the same seeds', () => {
    const run = (): GameState => {
      const rng = seededRng(2024);
      let g = startHand(newGame([500, 500, 500]), rng);
      const actRng = seededRng(5);
      while (!isHandOver(g)) g = applyAction(g, randomAction(g, actRng));
      return g;
    };
    expect(run()).toEqual(run());
  });
});
