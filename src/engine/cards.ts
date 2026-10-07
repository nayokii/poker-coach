/** Card primitives. Ranks are 2..14 (14 = Ace); suits are s,h,d,c. */
export type Rank = 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12 | 13 | 14;
export type Suit = 's' | 'h' | 'd' | 'c';

export interface Card {
  readonly rank: Rank;
  readonly suit: Suit;
}

export const RANKS: readonly Rank[] = [2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14];
export const SUITS: readonly Suit[] = ['s', 'h', 'd', 'c'];

const RANK_CHARS = '23456789TJQKA';
const SUIT_SYMBOLS: Record<Suit, string> = { s: '♠', h: '♥', d: '♦', c: '♣' };

export function card(rank: Rank, suit: Suit): Card {
  return { rank, suit };
}

export function rankChar(rank: Rank): string {
  return RANK_CHARS[rank - 2] as string;
}

/** "As" -> { rank: 14, suit: 's' }. Throws on invalid input. */
export function parseCard(text: string): Card {
  if (text.length !== 2) throw new Error(`Invalid card: "${text}"`);
  const r = RANK_CHARS.indexOf((text[0] as string).toUpperCase());
  const suit = (text[1] as string).toLowerCase();
  if (r < 0 || !(SUITS as readonly string[]).includes(suit)) {
    throw new Error(`Invalid card: "${text}"`);
  }
  return { rank: (r + 2) as Rank, suit: suit as Suit };
}

/** "As Kd 7c" or "AsKd7c" -> Card[] */
export function parseCards(text: string): Card[] {
  const compact = text.replace(/\s+/g, '');
  if (compact.length % 2 !== 0) throw new Error(`Invalid card list: "${text}"`);
  const out: Card[] = [];
  for (let i = 0; i < compact.length; i += 2) out.push(parseCard(compact.slice(i, i + 2)));
  return out;
}

export function cardToString(c: Card): string {
  return `${rankChar(c.rank)}${c.suit}`;
}

export function cardsToString(cs: readonly Card[]): string {
  return cs.map(cardToString).join(' ');
}

export function cardToPretty(c: Card): string {
  return `${rankChar(c.rank)}${SUIT_SYMBOLS[c.suit]}`;
}

export function cardEquals(a: Card, b: Card): boolean {
  return a.rank === b.rank && a.suit === b.suit;
}

/** Unique index 0..51, useful for bitsets / dead-card masks. */
export function cardIndex(c: Card): number {
  return (c.rank - 2) * 4 + SUITS.indexOf(c.suit);
}

export function cardFromIndex(i: number): Card {
  return { rank: (Math.floor(i / 4) + 2) as Rank, suit: SUITS[i % 4] as Suit };
}
