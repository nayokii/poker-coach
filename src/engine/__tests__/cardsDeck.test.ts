import { describe, expect, it } from 'vitest';
import {
  Deck, cardFromIndex, cardIndex, cardToPretty, cardToString, cardsToString, createDeck,
  parseCard, parseCards, remainingDeck, seededRng, shuffle,
} from '..';

describe('cards', () => {
  it('parses and prints', () => {
    expect(parseCard('As')).toEqual({ rank: 14, suit: 's' });
    expect(parseCard('td')).toEqual({ rank: 10, suit: 'd' });
    expect(cardToString(parseCard('9c'))).toBe('9c');
    expect(cardToPretty(parseCard('Qh'))).toBe('Q♥');
    expect(cardsToString(parseCards('AsKd7c'))).toBe('As Kd 7c');
  });
  it('rejects garbage', () => {
    expect(() => parseCard('1s')).toThrow();
    expect(() => parseCard('Ax')).toThrow();
    expect(() => parseCards('AsK')).toThrow();
  });
  it('index round-trips and is unique', () => {
    const idx = createDeck().map(cardIndex);
    expect(new Set(idx).size).toBe(52);
    for (const c of createDeck()) expect(cardFromIndex(cardIndex(c))).toEqual(c);
  });
});

describe('deck', () => {
  it('has 52 unique cards', () => {
    const d = createDeck();
    expect(d).toHaveLength(52);
    expect(new Set(d.map(cardToString)).size).toBe(52);
  });
  it('shuffle is a permutation and deterministic with a seed', () => {
    const a = shuffle(createDeck(), seededRng(42));
    const b = shuffle(createDeck(), seededRng(42));
    const c = shuffle(createDeck(), seededRng(43));
    expect(a).toEqual(b);
    expect(a).not.toEqual(c);
    expect([...a].map(cardToString).sort()).toEqual(createDeck().map(cardToString).sort());
  });
  it('does not mutate its input', () => {
    const d = createDeck();
    shuffle(d, seededRng(1));
    expect(d).toEqual(createDeck());
  });
  it('shuffle is roughly uniform (first-card position of the Ace of spades)', () => {
    const rng = seededRng(7);
    const buckets = new Array<number>(52).fill(0);
    const N = 52_000;
    for (let i = 0; i < N; i++) {
      buckets[shuffle(createDeck(), rng).findIndex((c) => cardToString(c) === 'As')]!++;
    }
    for (const b of buckets) expect(Math.abs(b - 1000)).toBeLessThan(150); // ~4.7 sigma
  });
  it('draws without repeating and throws when empty', () => {
    const d = new Deck(seededRng(3));
    const drawn = d.drawN(52);
    expect(new Set(drawn.map(cardToString)).size).toBe(52);
    expect(d.remaining).toBe(0);
    expect(() => d.draw()).toThrow();
  });
  it('remainingDeck removes dead cards', () => {
    const r = remainingDeck(parseCards('As Kd 7c'));
    expect(r).toHaveLength(49);
    expect(r.map(cardToString)).not.toContain('As');
  });
});
