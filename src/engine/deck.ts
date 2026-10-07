import { type Card, RANKS, SUITS, cardEquals } from './cards';

/** RNG returns a float in [0, 1). Injectable for reproducible tests. */
export type Rng = () => number;

/** Small deterministic PRNG (mulberry32). */
export function seededRng(seed: number): Rng {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function createDeck(): Card[] {
  const deck: Card[] = [];
  for (const suit of SUITS) for (const rank of RANKS) deck.push({ rank, suit });
  return deck;
}

/** Fisher-Yates shuffle; returns a new array. */
export function shuffle<T>(items: readonly T[], rng: Rng): T[] {
  const a = items.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j] as T, a[i] as T];
  }
  return a;
}

/** Deck minus the given dead cards (known hole cards, board...). */
export function remainingDeck(dead: readonly Card[]): Card[] {
  return createDeck().filter((c) => !dead.some((d) => cardEquals(c, d)));
}

/** Draws from the top of a shuffled deck. Mutable on purpose: one per hand. */
export class Deck {
  private cards: Card[];
  constructor(rng: Rng, cards?: Card[]) {
    this.cards = cards ? cards.slice() : shuffle(createDeck(), rng);
  }
  get remaining(): number {
    return this.cards.length;
  }
  draw(): Card {
    const c = this.cards.pop();
    if (!c) throw new Error('Deck is empty');
    return c;
  }
  drawN(n: number): Card[] {
    return Array.from({ length: n }, () => this.draw());
  }
}
