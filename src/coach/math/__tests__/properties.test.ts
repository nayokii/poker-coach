import { describe, expect, it } from 'vitest';
import { cardToString, createDeck, evaluateHand, seededRng, shuffle, type Card } from '../../../engine';
import {
  analyzeBlockers, analyzeOuts, comboCards, comboToString, drawProbabilities, equityVsHand, equityVsRange, parseRange, potOdds,
  withoutDeadCards, totalWeight, type Range,
} from '..';

const deal = (rng: () => number, n: number): Card[] => shuffle(createDeck(), rng).slice(0, n);
const key = (cs: readonly Card[]) => cs.map(cardToString);

describe('property: equity', () => {
  it('win + tie + loss = 1, equity = win + tie/2 in [0, 1], and mirror matchups sum to 1 (exact, 120 random spots)', () => {
    const rng = seededRng(77);
    for (let i = 0; i < 120; i++) {
      const boardLen = [3, 4, 5][i % 3] as number;
      const cards = deal(rng, 4 + boardLen);
      const hero = cards.slice(0, 2);
      const vill = cards.slice(2, 4);
      const board = cards.slice(4);
      const r = equityVsHand(hero, vill, board);
      expect(r.method).toBe('exact');
      expect(r.winProbability + r.tieProbability + r.lossProbability).toBeCloseTo(1, 12);
      expect(r.equity).toBeCloseTo(r.winProbability + r.tieProbability / 2, 12);
      expect(r.equity).toBeGreaterThanOrEqual(0);
      expect(r.equity).toBeLessThanOrEqual(1);
      const m = equityVsHand(vill, hero, board);
      expect(r.equity + m.equity).toBeCloseTo(1, 12);
      expect(r.winProbability).toBeCloseTo(m.lossProbability, 12);
    }
  });

  it('exact results equal the engine evaluator on every runout of random turn spots', () => {
    const rng = seededRng(5);
    for (let i = 0; i < 25; i++) {
      const cards = deal(rng, 8);
      const hero = cards.slice(0, 2);
      const vill = cards.slice(2, 4);
      const board = cards.slice(4, 8);
      const known = new Set(key(cards));
      let win = 0;
      let tie = 0;
      let n = 0;
      for (const c of createDeck()) {
        if (known.has(cardToString(c))) continue;
        const hs = evaluateHand([...hero, ...board, c]).score;
        const vs = evaluateHand([...vill, ...board, c]).score;
        n++;
        if (hs > vs) win++;
        else if (hs === vs) tie++;
      }
      const r = equityVsHand(hero, vill, board);
      expect(r.winProbability).toBeCloseTo(win / n, 12);
      expect(r.tieProbability).toBeCloseTo(tie / n, 12);
    }
  });

  it('Monte Carlo outputs are valid probabilities and reproducible for a seed (60 random spots)', () => {
    const rng = seededRng(31);
    for (let i = 0; i < 60; i++) {
      const cards = deal(rng, 5);
      const hero = cards.slice(0, 2);
      const board = cards.slice(2, 5);
      const range = parseRange('55+, A9s+, KTs+, QJs, AJo+, KQo');
      const opts = { method: 'monte-carlo' as const, samples: 300, seed: i };
      const a = equityVsRange(hero, range, board, opts);
      const b = equityVsRange(hero, range, board, opts);
      expect(a).toEqual(b);
      expect(a.winProbability + a.tieProbability + a.lossProbability).toBeCloseTo(1, 12);
      expect(a.equity).toBeGreaterThanOrEqual(0);
      expect(a.equity).toBeLessThanOrEqual(1);
      expect(a.samples).toBe(300);
    }
  });

  it('scaling every weight by the same factor does not change the equity', () => {
    const rng = seededRng(2);
    for (let i = 0; i < 10; i++) {
      const cards = deal(rng, 5);
      const hero = cards.slice(0, 2);
      const board = cards.slice(2, 5);
      const full = parseRange('QQ+, AKs, AKo');
      const half: Range = { entries: full.entries.map((e) => ({ combo: e.combo, weight: e.weight / 2 })) };
      expect(totalWeight(half)).toBeCloseTo(totalWeight(full) / 2, 12);
      const a = equityVsRange(hero, full, board, { method: 'exact' });
      const b = equityVsRange(hero, half, board, { method: 'exact' });
      expect(a.equity).toBeCloseTo(b.equity, 12);
    }
  });

  it('never considers a combo that uses a known card', () => {
    const rng = seededRng(8);
    for (let i = 0; i < 40; i++) {
      const cards = deal(rng, 5);
      const known = new Set(key(cards));
      const range = parseRange('22+, A2s+, K9s+, ATo+');
      const alive = withoutDeadCards(range, cards);
      for (const e of alive.entries) for (const c of comboCards(e.combo)) expect(known.has(cardToString(c))).toBe(false);
      const r = equityVsRange(cards.slice(0, 2), range, cards.slice(2, 5), { method: 'monte-carlo', samples: 100 });
      expect(r.combosConsidered).toBe(alive.entries.length);
    }
  });
});

describe('property: combos and blockers are consistent', () => {
  const pool = ['22+', 'A2s+', 'KTs+, QJs', 'AQo+, KQo', 'JTs-54s', 'AA:0.5, KK', 'AKs, AsKd'];

  it('remaining + blocked = total, no remaining combo contains a dead card, every blocked one does', () => {
    const rng = seededRng(13);
    for (let i = 0; i < 300; i++) {
      const range = parseRange(pool[i % pool.length] as string);
      const dead = deal(rng, 1 + Math.floor(rng() * 8));
      const deadSet = new Set(key(dead));
      const rep = analyzeBlockers(range, dead);
      expect(rep.remainingCombos + rep.blockedCombos).toBe(rep.totalCombos);
      expect(rep.totalCombos).toBe(range.entries.length);
      expect(rep.remainingWeight + rep.blockedWeight).toBeCloseTo(rep.totalWeight, 10);
      for (const e of rep.remaining) for (const c of comboCards(e.combo)) expect(deadSet.has(cardToString(c))).toBe(false);
      for (const e of rep.blocked) expect(comboCards(e.combo).some((c) => deadSet.has(cardToString(c)))).toBe(true);
      expect(withoutDeadCards(range, dead).entries.map((e) => comboToString(e.combo))).toEqual(rep.remaining.map((e) => comboToString(e.combo)));
    }
  });

  it('a range never contains the same combo twice', () => {
    for (const text of pool) {
      const names = parseRange(`${text}, ${text}`).entries.map((e) => comboToString(e.combo));
      expect(new Set(names).size).toBe(names.length);
    }
  });
});

describe('property: outs', () => {
  it('outs are unique, never known cards, real improvements, and complete (random flops and turns)', () => {
    const rng = seededRng(99);
    for (let i = 0; i < 150; i++) {
      const boardLen = 3 + (i % 2);
      const deadCount = i % 4;
      const cards = deal(rng, 2 + boardLen + deadCount);
      const hero = cards.slice(0, 2);
      const board = cards.slice(2, 2 + boardLen);
      const dead = cards.slice(2 + boardLen);
      const a = analyzeOuts(hero, board, { dead });
      const known = new Set(key(cards));
      const names = a.outs.map((o) => cardToString(o.card));

      expect(new Set(names).size).toBe(names.length);
      for (const n of names) expect(known.has(n)).toBe(false);
      expect(a.unknownCards).toBe(52 - cards.length);
      expect(a.knownCards).toBe(cards.length);
      expect(a.probabilities).toEqual(drawProbabilities(a.outs.length, a.unknownCards, 5 - boardLen));
      expect(Object.values(a.byCategory).reduce((s, cs) => s + cs.length, 0)).toBe(a.outs.length);

      const current = evaluateHand([...hero, ...board]).category;
      for (const o of a.outs) {
        const next = evaluateHand([...hero, ...board, o.card]);
        expect(next.category).toBe(o.improvesTo);
        expect(next.category).toBeGreaterThan(current);
        expect(['clean', 'dirty', 'unknown']).toContain(o.quality);
      }

      // converse on the turn (board + card has 5 cards, so the engine can evaluate the board alone)
      if (boardLen === 4) {
        const outSet = new Set(names);
        for (const c of createDeck()) {
          const n = cardToString(c);
          if (known.has(n) || outSet.has(n)) continue;
          const heroCat = evaluateHand([...hero, ...board, c]).category;
          const boardCat = evaluateHand([...board, c]).category;
          expect(heroCat <= current || heroCat <= boardCat).toBe(true);
        }
      }
    }
  });
});

describe('property: pot odds', () => {
  it('required equity is call / (pot + call) = 1 / (1 + ratio) and lies in [0, 1)', () => {
    const rng = seededRng(4);
    for (let i = 0; i < 500; i++) {
      const pot = Math.floor(rng() * 5000);
      const call = 1 + Math.floor(rng() * 5000);
      const o = potOdds(pot, call);
      expect(o.requiredEquity).toBeCloseTo(call / (pot + call), 12);
      expect(o.requiredEquity).toBeCloseTo(1 / (1 + o.ratio), 12);
      expect(o.requiredEquity).toBeGreaterThan(0);
      expect(o.requiredEquity).toBeLessThan(1);
    }
  });
});
