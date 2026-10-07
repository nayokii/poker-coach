/**
 * Two-card combos and the 169 starting-hand classes.
 *
 * A combo is an unordered pair of distinct cards, stored as two card indices (a < b) with the
 * engine's index = (rank - 2) * 4 + suit (suit order s,h,d,c). 1326 combos exist.
 */
import {
  RANKS, SUITS, cardFromIndex, cardIndex, cardToString, parseCard, rankChar,
  type Card, type Rank, type Suit,
} from '../../engine';

export interface Combo {
  readonly a: number;
  readonly b: number;
}

export type HandClassKind = 'pair' | 'suited' | 'offsuit';

/** One of the 169 starting-hand categories: AA, AKs, AKo... `high >= low`; pairs have high === low. */
export interface HandClass {
  readonly kind: HandClassKind;
  readonly high: Rank;
  readonly low: Rank;
}

export const COMBOS_PER_CLASS: Record<HandClassKind, number> = { pair: 6, suited: 4, offsuit: 12 };

export function makeCombo(x: number, y: number): Combo {
  if (x === y) throw new Error('A combo needs two different cards');
  return x < y ? { a: x, b: y } : { a: y, b: x };
}

export const comboFromCards = (c1: Card, c2: Card): Combo => makeCombo(cardIndex(c1), cardIndex(c2));
export const comboCards = (c: Combo): [Card, Card] => [cardFromIndex(c.a), cardFromIndex(c.b)];

/** Unique integer id of a combo (0..2703), handy as a Map/Set key. */
export const comboKey = (c: Combo): number => c.a * 52 + c.b;

/** Higher rank first, then suit order: "AsKd", "7h7c". */
export function comboToString(c: Combo): string {
  const [x, y] = comboCards(c);
  const [hi, lo] = x.rank > y.rank || (x.rank === y.rank && SUITS.indexOf(x.suit) <= SUITS.indexOf(y.suit)) ? [x, y] : [y, x];
  return `${cardToString(hi)}${cardToString(lo)}`;
}

/** "AsKd" -> combo. */
export function parseCombo(text: string): Combo {
  const t = text.replace(/\s+/g, '');
  if (t.length !== 4) throw new Error(`Invalid combo: "${text}"`);
  return comboFromCards(parseCard(t.slice(0, 2)), parseCard(t.slice(2)));
}

export function allCombos(): Combo[] {
  const out: Combo[] = [];
  for (let a = 0; a < 52; a++) for (let b = a + 1; b < 52; b++) out.push({ a, b });
  return out;
}

export function handClassOf(c: Combo): HandClass {
  const [x, y] = comboCards(c);
  const high = Math.max(x.rank, y.rank) as Rank;
  const low = Math.min(x.rank, y.rank) as Rank;
  if (high === low) return { kind: 'pair', high, low };
  return { kind: x.suit === y.suit ? 'suited' : 'offsuit', high, low };
}

export function handClassToString(h: HandClass): string {
  const base = `${rankChar(h.high)}${rankChar(h.low)}`;
  return h.kind === 'pair' ? base : `${base}${h.kind === 'suited' ? 's' : 'o'}`;
}

const RANK_CHARS = '23456789TJQKA';
export function parseRankChar(ch: string): Rank {
  const i = RANK_CHARS.indexOf(ch.toUpperCase());
  if (i < 0 || ch.length !== 1) throw new Error(`Invalid rank: "${ch}"`);
  return (i + 2) as Rank;
}

/** "AKs" | "77" | "T9o" -> HandClass. */
export function parseHandClass(text: string): HandClass {
  const m = /^([2-9TJQKA])([2-9TJQKA])([so])?$/i.exec(text.trim());
  if (!m) throw new Error(`Invalid hand class: "${text}"`);
  const r1 = parseRankChar(m[1] as string);
  const r2 = parseRankChar(m[2] as string);
  const suffix = m[3]?.toLowerCase();
  if (r1 === r2) {
    if (suffix) throw new Error(`A pair cannot be suited or offsuit: "${text}"`);
    return { kind: 'pair', high: r1, low: r2 };
  }
  if (!suffix) throw new Error(`Non-pair hand class needs s or o: "${text}"`);
  return { kind: suffix === 's' ? 'suited' : 'offsuit', high: Math.max(r1, r2) as Rank, low: Math.min(r1, r2) as Rank };
}

/** The 6 / 4 / 12 combos of a hand class. */
export function handClassCombos(h: HandClass): Combo[] {
  const out: Combo[] = [];
  const idx = (rank: Rank, suit: Suit): number => cardIndex({ rank, suit });
  if (h.kind === 'pair') {
    for (let i = 0; i < 4; i++) for (let j = i + 1; j < 4; j++) out.push(makeCombo(idx(h.high, SUITS[i] as Suit), idx(h.low, SUITS[j] as Suit)));
  } else if (h.kind === 'suited') {
    for (const s of SUITS) out.push(makeCombo(idx(h.high, s), idx(h.low, s)));
  } else {
    for (const s1 of SUITS) for (const s2 of SUITS) if (s1 !== s2) out.push(makeCombo(idx(h.high, s1), idx(h.low, s2)));
  }
  return out;
}

/** Class at a cell of the 13x13 matrix: pairs on the diagonal, suited above it, offsuit below. */
export function handClassAt(rowRank: Rank, colRank: Rank): HandClass {
  if (rowRank === colRank) return { kind: 'pair', high: rowRank, low: colRank };
  return rowRank > colRank
    ? { kind: 'suited', high: rowRank, low: colRank }
    : { kind: 'offsuit', high: colRank, low: rowRank };
}

/** All 169 classes in matrix order (row A..2, column A..2). */
export const ALL_HAND_CLASSES: readonly HandClass[] = (() => {
  const out: HandClass[] = [];
  for (let row = 14; row >= 2; row--) for (let col = 14; col >= 2; col--) out.push(handClassAt(row as Rank, col as Rank));
  return out;
})();

export const handClassEquals = (x: HandClass, y: HandClass): boolean => x.kind === y.kind && x.high === y.high && x.low === y.low;

export { RANKS };
