/**
 * Reader: the only way a sentence can obtain data.
 *
 * Every access is by CoachAnalysis path. A missing / null datum throws `MissingData`, which makes the builder
 * drop the sentence instead of printing a blank or a guess. Every path read is recorded as a source, and every
 * figure formatted through the reader is recorded with the exact text printed, so a test can check that no
 * number in a sentence comes from nowhere.
 */
import { cardToPretty, type Card } from '../../engine';
import type { AmountFormatter, ExplanationValue } from './types';

export class MissingData extends Error {
  constructor(readonly path: string) {
    super(`missing data: ${path}`);
    this.name = 'MissingData';
  }
}

/** Resolves "a.b[0].c" on plain data. Returns undefined when any step is absent. */
export function resolvePath(root: unknown, path: string): unknown {
  let cur: unknown = root;
  for (const part of path.replace(/\[(\d+)\]/g, '.$1').split('.')) {
    if (part === '') continue;
    if (cur === null || typeof cur !== 'object') return undefined;
    cur = (cur as Record<string, unknown>)[part];
  }
  return cur;
}

const NBSP = ' ';

/** French decimal comma. */
export const frNumber = (x: number, digits: number): string => x.toFixed(digits).replace('.', ',');

export class Reader {
  readonly sources: string[] = [];
  readonly values: ExplanationValue[] = [];

  constructor(
    private readonly root: unknown,
    private readonly fmtAmount: AmountFormatter,
  ) {}

  private note(path: string): void {
    if (!this.sources.includes(path)) this.sources.push(path);
  }

  /** Reads a datum (must exist). */
  get<T>(path: string): T {
    const v = resolvePath(this.root, path);
    if (v === undefined || v === null) throw new MissingData(path);
    this.note(path);
    return v as T;
  }

  /** Is the datum present? Does not count as a source. */
  has(path: string): boolean {
    const v = resolvePath(this.root, path);
    return v !== undefined && v !== null;
  }

  /** Reads a datum that is only used to decide between two phrasings (still a source). */
  flag(path: string): boolean {
    return Boolean(this.get<unknown>(path));
  }

  private show(path: string, display: string): string {
    this.values.push({ source: path, display });
    return display;
  }

  int(path: string): string {
    return this.show(path, String(this.get<number>(path)));
  }

  /** Probability as a French percentage: 0.3104 -> "31,0 %". */
  pct(path: string, digits = 1): string {
    return this.show(path, `${frNumber(this.get<number>(path) * 100, digits)}${NBSP}%`);
  }

  /** Absolute difference between two probabilities, in points: 0.146 -> "14,6 points". */
  points(path: string, digits = 1): string {
    return this.show(path, `${frNumber(Math.abs(this.get<number>(path)) * 100, digits)}${NBSP}points`);
  }

  /** Plain decimal: 3 -> "3,0". */
  dec(path: string, digits = 1): string {
    return this.show(path, frNumber(this.get<number>(path), digits));
  }

  /** Chips through the caller's formatter ("3 BB"). Absolute value when `abs` is set. */
  amount(path: string, abs = false): string {
    const v = this.get<number>(path);
    return this.show(path, this.fmtAmount(abs ? Math.abs(v) : v));
  }

  /** Signed amount: "+0,5 BB" / "−0,5 BB". */
  signedAmount(path: string): string {
    const v = this.get<number>(path);
    return this.show(path, `${v >= 0 ? '+' : '−'}${this.fmtAmount(Math.abs(v))}`);
  }

  /** Text that comes from the analysis (names, labels, hand classes). Registered, so any digit in it is traceable. */
  str(path: string): string {
    return this.show(path, String(this.get<string>(path)));
  }

  /** Cards, written "A♥ K♥". Every card is registered as a figure source. */
  cards(path: string): string {
    const cs = this.get<Card[]>(path);
    return cs.map((c) => this.show(path, cardToPretty(c))).join(' ');
  }
}
