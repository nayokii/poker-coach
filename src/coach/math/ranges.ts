/**
 * Ranges: weighted sets of combos, with a parser for the usual notation.
 *
 * Supported tokens (comma, semicolon or space separated):
 *   77        pair                       77+      pair and up (77..AA)       77-44    pair span
 *   AKs AKo   suited / offsuit class     AK       both (16 combos)
 *   AJs+      raise the kicker           A5s-A2s  same high card, lows span  T9s-65s same-gap span
 *   AsKd      one exact combo
 *   AKs:0.5   weight suffix, 0 < w <= 1 (a combo that is played half of the time)
 * When the same combo appears twice (e.g. "AA, AKs, AK"), the larger weight wins.
 */
import { cardToString, type Card, type Rank } from '../../engine';
import {
  COMBOS_PER_CLASS, comboCards, comboFromCards, comboKey, comboToString, handClassCombos, handClassOf, handClassToString,
  parseCombo, parseHandClass, parseRankChar, type Combo, type HandClass,
} from './combos';

export interface WeightedCombo {
  readonly combo: Combo;
  /** Fraction of the time this exact combo is in the range, 0 < weight <= 1. */
  readonly weight: number;
}

export interface Range {
  /** Unique combos sorted by combo key. */
  readonly entries: readonly WeightedCombo[];
}

export class RangeParseError extends Error {
  constructor(
    readonly token: string,
    reason: string,
  ) {
    super(`Cannot parse range token "${token}": ${reason}`);
    this.name = 'RangeParseError';
  }
}

function normalise(map: Map<number, WeightedCombo>): Range {
  return { entries: [...map.values()].sort((x, y) => comboKey(x.combo) - comboKey(y.combo)) };
}

function put(map: Map<number, WeightedCombo>, combo: Combo, weight: number): void {
  const key = comboKey(combo);
  const prev = map.get(key);
  if (!prev || prev.weight < weight) map.set(key, { combo, weight });
}

export const EMPTY_RANGE: Range = { entries: [] };

export function rangeFromCombos(combos: readonly (Combo | string)[], weight = 1): Range {
  checkWeight(weight, 'range');
  const map = new Map<number, WeightedCombo>();
  for (const c of combos) put(map, typeof c === 'string' ? parseCombo(c) : c, weight);
  return normalise(map);
}

export function rangeFromHandClasses(classes: readonly (HandClass | string)[], weight = 1): Range {
  checkWeight(weight, 'range');
  const map = new Map<number, WeightedCombo>();
  for (const h of classes) for (const c of handClassCombos(typeof h === 'string' ? parseHandClass(h) : h)) put(map, c, weight);
  return normalise(map);
}

/** Union; for a combo present in several ranges the largest weight is kept. */
export function mergeRanges(...ranges: readonly Range[]): Range {
  const map = new Map<number, WeightedCombo>();
  for (const r of ranges) for (const e of r.entries) put(map, e.combo, e.weight);
  return normalise(map);
}

function checkWeight(w: number, token: string): void {
  if (!(w > 0 && w <= 1)) throw new RangeParseError(token, `weight must be in (0, 1], got ${w}`);
}

const RANK = '[2-9TJQKA]';
const RE_PAIR = new RegExp(`^(${RANK})\\1(\\+)?$`, 'i');
const RE_PAIR_SPAN = new RegExp(`^(${RANK})\\1-(${RANK})\\2$`, 'i');
const RE_NONPAIR = new RegExp(`^(${RANK})(${RANK})([so])?(\\+)?$`, 'i');
const RE_NONPAIR_SPAN = new RegExp(`^(${RANK})(${RANK})([so])?-(${RANK})(${RANK})([so])?$`, 'i');
const RE_COMBO = /^([2-9TJQKA])([shdc])([2-9TJQKA])([shdc])$/i;

const kinds = (suffix: string | undefined): ('suited' | 'offsuit')[] =>
  !suffix ? ['suited', 'offsuit'] : [suffix.toLowerCase() === 's' ? 'suited' : 'offsuit'];

function classesOfToken(token: string): HandClass[] {
  let m: RegExpExecArray | null;

  if ((m = RE_COMBO.exec(token))) return []; // handled by the caller (exact combo)

  if ((m = RE_PAIR.exec(token))) {
    const r = parseRankChar(m[1] as string);
    const top = m[2] ? 14 : r;
    const out: HandClass[] = [];
    for (let x = r; x <= top; x++) out.push({ kind: 'pair', high: x as Rank, low: x as Rank });
    return out;
  }

  if ((m = RE_PAIR_SPAN.exec(token))) {
    const a = parseRankChar(m[1] as string);
    const b = parseRankChar(m[2] as string);
    const out: HandClass[] = [];
    for (let x = Math.min(a, b); x <= Math.max(a, b); x++) out.push({ kind: 'pair', high: x as Rank, low: x as Rank });
    return out;
  }

  if ((m = RE_NONPAIR_SPAN.exec(token))) {
    const h1 = parseRankChar(m[1] as string);
    const l1 = parseRankChar(m[2] as string);
    const h2 = parseRankChar(m[4] as string);
    const l2 = parseRankChar(m[5] as string);
    if (h1 === l1 || h2 === l2) throw new RangeParseError(token, 'a span of non-pairs cannot contain a pair');
    const s1 = m[3]?.toLowerCase();
    const s2 = m[6]?.toLowerCase();
    if (s1 !== s2) throw new RangeParseError(token, 'both ends of a span must use the same suffix (s, o or none)');
    const [hiA, loA] = [Math.max(h1, l1), Math.min(h1, l1)];
    const [hiB, loB] = [Math.max(h2, l2), Math.min(h2, l2)];
    const out: HandClass[] = [];
    const push = (hi: number, lo: number): void => {
      for (const kind of kinds(s1)) out.push({ kind, high: hi as Rank, low: lo as Rank });
    };
    if (hiA === hiB) {
      for (let lo = Math.min(loA, loB); lo <= Math.max(loA, loB); lo++) if (lo < hiA) push(hiA, lo);
    } else if (hiA - loA === hiB - loB) {
      for (let hi = Math.min(hiA, hiB); hi <= Math.max(hiA, hiB); hi++) push(hi, hi - (hiA - loA));
    } else {
      throw new RangeParseError(token, 'a span needs the same high card or the same gap between cards');
    }
    return out;
  }

  if ((m = RE_NONPAIR.exec(token))) {
    const r1 = parseRankChar(m[1] as string);
    const r2 = parseRankChar(m[2] as string);
    if (r1 === r2) throw new RangeParseError(token, 'unexpected pair');
    const hi = Math.max(r1, r2);
    const lo = Math.min(r1, r2);
    const top = m[4] ? hi - 1 : lo;
    const out: HandClass[] = [];
    for (let l = lo; l <= top; l++) for (const kind of kinds(m[3])) out.push({ kind, high: hi as Rank, low: l as Rank });
    return out;
  }

  throw new RangeParseError(token, 'unrecognised notation');
}

/** Parses range notation. Throws RangeParseError with the offending token. */
export function parseRange(text: string): Range {
  const map = new Map<number, WeightedCombo>();
  for (const raw of text.split(/[,;\s]+/).filter(Boolean)) {
    const [body, w, extra] = raw.split(':');
    if (extra !== undefined || !body) throw new RangeParseError(raw, 'malformed weight');
    let weight = 1;
    if (w !== undefined) {
      weight = Number(w);
      if (!Number.isFinite(weight)) throw new RangeParseError(raw, 'weight is not a number');
      checkWeight(weight, raw);
    }
    if (RE_COMBO.test(body)) {
      try {
        put(map, parseCombo(body), weight);
      } catch (e) {
        throw new RangeParseError(raw, (e as Error).message);
      }
      continue;
    }
    for (const h of classesOfToken(body)) for (const c of handClassCombos(h)) put(map, c, weight);
  }
  return normalise(map);
}

/** Number of distinct combos (ignores weights). */
export const comboCount = (r: Range): number => r.entries.length;

/** Sum of weights = the effective number of combos. */
export const totalWeight = (r: Range): number => r.entries.reduce((s, e) => s + e.weight, 0);

/** Removes every combo that uses one of the dead (known) cards. */
export function withoutDeadCards(r: Range, dead: readonly Card[]): Range {
  if (dead.length === 0) return r;
  const set = new Set(dead.map((c) => cardToString(c)));
  return {
    entries: r.entries.filter((e) => {
      const [x, y] = comboCards(e.combo);
      return !set.has(cardToString(x)) && !set.has(cardToString(y));
    }),
  };
}

export interface ClassSummary {
  handClass: HandClass;
  /** Combos of this class present in the range. */
  combos: number;
  /** Sum of their weights. */
  weight: number;
  /** weight / combos in a full class (6, 4 or 12): 1 = the whole class at full frequency. */
  fraction: number;
}

/** Per-class view of a range (the data a 13x13 matrix needs). Only classes present are listed. */
export function summarizeByClass(r: Range): ClassSummary[] {
  const map = new Map<string, ClassSummary>();
  for (const e of r.entries) {
    const hc = handClassOf(e.combo);
    const key = handClassToString(hc);
    const cur = map.get(key) ?? { handClass: hc, combos: 0, weight: 0, fraction: 0 };
    cur.combos += 1;
    cur.weight += e.weight;
    cur.fraction = cur.weight / COMBOS_PER_CLASS[hc.kind];
    map.set(key, cur);
  }
  return [...map.values()];
}

/** Compact text: whole classes as "AKs", partial classes as exact combos. Round-trips through parseRange. */
export function rangeToString(r: Range): string {
  const parts: string[] = [];
  const rest: WeightedCombo[] = [];
  for (const s of summarizeByClass(r)) {
    const entries = r.entries.filter((e) => handClassToString(handClassOf(e.combo)) === handClassToString(s.handClass));
    const w0 = entries[0]?.weight ?? 1;
    const uniform = entries.every((e) => e.weight === w0);
    if (s.combos === COMBOS_PER_CLASS[s.handClass.kind] && uniform) {
      parts.push(handClassToString(s.handClass) + (w0 < 1 ? `:${w0}` : ''));
    } else rest.push(...entries);
  }
  for (const e of rest) parts.push(comboToString(e.combo) + (e.weight < 1 ? `:${e.weight}` : ''));
  return parts.join(', ');
}

export const comboOf = (a: Card, b: Card): Combo => comboFromCards(a, b);
