import { describe, expect, it } from 'vitest';
import {
  applyAction, checkInvariants, createGame, getLegalActions, isHandOver, seededRng, startHand, validateAction,
  type GameState,
} from '../../engine';
import { MAX_BOTS, PROFILES, botRoster } from '../profiles';
import { chooseBotAction, playBotTurn } from '../runBot';
import { SimpleBot } from '../simpleBot';
import type { DecisionProvider } from '../types';

function table(n: number, stack = 2000): GameState {
  return createGame({
    players: Array.from({ length: n }, (_, i) => ({ id: `p${i}`, name: `P${i}`, stack })),
    smallBlind: 10,
    bigBlind: 20,
  });
}

const profiles = Object.values(PROFILES);

describe('SimpleBot', () => {
  it('only ever produces legal actions, and every hand terminates consistently', () => {
    for (let seed = 1; seed <= 40; seed++) {
      const rng = seededRng(seed);
      const n = 2 + (seed % 5);
      const total = n * 2000;
      let g = table(n);
      const bot = new SimpleBot((i) => profiles[i % profiles.length]!);
      for (let hand = 0; hand < 8 && g.players.filter((p) => p.stack > 0).length > 1; hand++) {
        g = startHand(g, rng);
        let guard = 0;
        while (!isHandOver(g)) {
          const legal = getLegalActions(g)!;
          const action = bot.decide({ state: g, playerIndex: legal.player, legal, rng });
          expect(validateAction(g, action, legal.player), `seed ${seed}: ${JSON.stringify(action)}`).toBeNull();
          g = applyAction(g, action);
          expect(checkInvariants(g, total)).toEqual([]);
          if (++guard > 300) throw new Error('hand did not end');
        }
      }
    }
  });

  it('is reproducible with the same seed', () => {
    const run = (): string[] => {
      const rng = seededRng(11);
      let g = startHand(table(4), rng);
      const bot = new SimpleBot();
      const log: string[] = [];
      while (!isHandOver(g)) {
        const legal = getLegalActions(g)!;
        const a = bot.decide({ state: g, playerIndex: legal.player, legal, rng });
        log.push(JSON.stringify(a));
        g = applyAction(g, a);
      }
      return log;
    };
    expect(run()).toEqual(run());
  });

  it('plays differently depending on its profile (nit folds more, maniac raises more)', () => {
    const count = (profile: (typeof profiles)[number]) => {
      let folds = 0;
      let raises = 0;
      for (let seed = 1; seed <= 400; seed++) {
        const rng = seededRng(seed);
        const g = startHand(table(3), rng);
        const legal = getLegalActions(g)!;
        const a = new SimpleBot(() => profile).decide({ state: g, playerIndex: legal.player, legal, rng });
        if (a.type === 'fold') folds++;
        if (a.type === 'raise' || a.type === 'allin') raises++;
      }
      return { folds, raises };
    };
    const nit = count(PROFILES.nit);
    const maniac = count(PROFILES.maniac);
    expect(nit.folds).toBeGreaterThan(maniac.folds);
    expect(maniac.raises).toBeGreaterThan(nit.raises);
  });

  it('raises premium hands and folds trash to a raise', () => {
    const rng = seededRng(5);
    const base = startHand(table(3), rng);
    const toAct = base.toAct!;
    const withHole = (aces: boolean): GameState => {
      const g = structuredClone(base);
      g.players[toAct]!.holeCards = aces
        ? [{ rank: 14, suit: 's' }, { rank: 14, suit: 'h' }]
        : [{ rank: 7, suit: 's' }, { rank: 2, suit: 'd' }];
      return g;
    };
    let raisedWithAces = 0;
    for (let i = 0; i < 20; i++) {
      const g = withHole(true);
      const a = new SimpleBot(() => PROFILES.maniac).decide({ state: g, playerIndex: toAct, legal: getLegalActions(g)!, rng: seededRng(i) });
      if (a.type === 'raise' || a.type === 'allin') raisedWithAces++;
    }
    expect(raisedWithAces).toBeGreaterThanOrEqual(15);
    const trash = withHole(false);
    const decision = new SimpleBot(() => PROFILES.nit).decide({ state: trash, playerIndex: toAct, legal: getLegalActions(trash)!, rng: seededRng(1) });
    expect(decision.type).toBe('fold');
  });
});

describe('runBot', () => {
  it('falls back to a safe action when a provider returns an illegal one', async () => {
    const rng = seededRng(3);
    const g = startHand(table(3), rng);
    const bad: DecisionProvider = { decide: () => ({ type: 'check' }) }; // illegal: facing the big blind
    expect(await chooseBotAction(g, bad, rng)).toEqual({ type: 'fold' });
    const next = await playBotTurn(g, bad, rng);
    expect(next.history.length).toBe(g.history.length + 1);
  });

  it('accepts async providers', async () => {
    const rng = seededRng(3);
    const g = startHand(table(3), rng);
    const slow: DecisionProvider = { decide: async () => ({ type: 'call' }) };
    expect((await chooseBotAction(g, slow, rng)).type).toBe('call');
  });
});

describe('roster', () => {
  it('provides up to MAX_BOTS distinct bots', () => {
    expect(MAX_BOTS).toBe(5);
    const r = botRoster(5);
    expect(new Set(r.map((b) => b.name)).size).toBe(5);
    expect(botRoster(2)).toHaveLength(2);
    expect(botRoster(99)).toHaveLength(5);
  });
});
