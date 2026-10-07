import { describe, expect, it } from 'vitest';
import { cardIndex, createDeck, evaluateHand, seededRng, shuffle, type Card } from '../../../engine';
import { categoryOf, fastScore } from '../fastEval';

const deck = createDeck();
const idx = (cs: readonly Card[]) => cs.map(cardIndex);

describe('fastScore is interchangeable with the engine evaluator', () => {
  it('matches evaluateHand on 50,000 random 5/6/7-card hands', () => {
    const rng = seededRng(2024);
    for (let i = 0; i < 50_000; i++) {
      const n = 5 + (i % 3);
      const hand = shuffle(deck, rng).slice(0, n);
      expect(fastScore(idx(hand), n)).toBe(evaluateHand(hand).score);
    }
  });

  it('reproduces the textbook distribution of all 2,598,960 five-card hands', () => {
    const counts = new Array<number>(9).fill(0);
    const h = new Int32Array(5);
    for (let a = 0; a < 48; a++)
      for (let b = a + 1; b < 49; b++)
        for (let c = b + 1; c < 50; c++)
          for (let d = c + 1; d < 51; d++)
            for (let e = d + 1; e < 52; e++) {
              h[0] = a; h[1] = b; h[2] = c; h[3] = d; h[4] = e;
              counts[categoryOf(fastScore(h, 5))]!++;
            }
    expect(counts).toEqual([1302540, 1098240, 123552, 54912, 10200, 5108, 3744, 624, 40]);
  }, 120_000);

  it('handles the special cases: wheel, steel wheel, three pairs, two trips, quads kicker', () => {
    const s = (txt: string) => fastScore(idx(txt.split(' ').map((t) => deck.find((c) => c.rank === '23456789TJQKA'.indexOf(t[0]!) + 2 && c.suit === t[1])!)));
    expect(s('Ah 2d 3s 4c 5d Kh Kd')).toBe(evaluateHandOf('Ah 2d 3s 4c 5d Kh Kd'));
    expect(s('Ah 2h 3h 4h 5h Kd Kc')).toBe(evaluateHandOf('Ah 2h 3h 4h 5h Kd Kc'));
    expect(s('Ah Ad Kh Kd Qh Qd 2s')).toBe(evaluateHandOf('Ah Ad Kh Kd Qh Qd 2s'));
    expect(s('Ah Ad As Kh Kd Kc 2s')).toBe(evaluateHandOf('Ah Ad As Kh Kd Kc 2s'));
    expect(s('9h 9d 9s 9c Ad Ah Kd')).toBe(evaluateHandOf('9h 9d 9s 9c Ad Ah Kd'));
    expect(categoryOf(s('Ah 2d 3s 4c 5d Kh Kd'))).toBe(4);
  });
});

function evaluateHandOf(txt: string): number {
  const cards = txt.split(' ').map((t) => deck.find((c) => c.rank === '23456789TJQKA'.indexOf(t[0]!) + 2 && c.suit === t[1])!);
  return evaluateHand(cards).score;
}
