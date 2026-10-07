/**
 * Equity engine: hero versus one exact hand or versus a range (heads-up).
 *
 * Convention: equity = win + tie / 2.
 * Method: exact enumeration of every possible runout (and every villain combo) when the number of
 * evaluations is at most `maxExactEvaluations`; otherwise Monte Carlo with an injectable RNG. The result
 * ALWAYS states which method produced it: a `monte-carlo` result is an estimate, never to be shown as exact.
 *
 * Performance notes: the hot loops use the allocation-free `fastScore` evaluator and reusable typed
 * arrays; the dominant costs are (1) runout enumeration, C(n, k) boards per matchup, (2) the number of
 * villain combos, (3) Monte Carlo sample count. `estimateEvaluations` exposes the cost model.
 */
import { cardIndex, cardToString, seededRng, type Card, type Rng } from '../../engine';
import { choose } from './probabilities';
import { comboCards, type Combo } from './combos';
import { fastScore } from './fastEval';
import type { Range } from './ranges';

export interface EquityResult {
  /** win + tie / 2 */
  equity: number;
  winProbability: number;
  tieProbability: number;
  lossProbability: number;
  method: 'exact' | 'monte-carlo';
  /** Number of Monte Carlo samples (monte-carlo only). */
  samples?: number;
  /** Seed used when no `rng` was injected (monte-carlo only). */
  seed?: number;
  /** Standard error of `equity` (monte-carlo only): the estimate is roughly equity +/- 2 x this. */
  standardError?: number;
  /** Villain combos that were possible after removing known cards (1 versus an exact hand). */
  combosConsidered: number;
  /** Runouts enumerated per combo (exact only). */
  boardsPerCombo?: number;
}

export interface EquityOptions {
  /** 'auto' (default) chooses exact when affordable. */
  method?: 'auto' | 'exact' | 'monte-carlo';
  /** Exact enumeration is used when (combos x runouts) <= this. Default 2,000,000. */
  maxExactEvaluations?: number;
  /** Monte Carlo sample count. Default 20,000. */
  samples?: number;
  /** Seed for the default RNG (mulberry32). Default 1: results are reproducible, never random. */
  seed?: number;
  /** Custom RNG; overrides `seed`. */
  rng?: Rng;
}

export const DEFAULT_MAX_EXACT_EVALUATIONS = 2_000_000;
export const DEFAULT_SAMPLES = 20_000;

/** Heads-up evaluation count the exact method would need: combos x C(unknown after villain, cards to come). */
export function estimateEvaluations(comboCount: number, knownBoardCards: number): number {
  const toCome = 5 - knownBoardCards;
  const unknownAfterVillain = 52 - 2 - knownBoardCards - 2;
  return comboCount * choose(unknownAfterVillain, toCome);
}

function validate(hero: readonly Card[], board: readonly Card[], extra: readonly Card[] = []): void {
  if (hero.length !== 2) throw new RangeError('hero needs exactly 2 cards');
  if (![0, 3, 4, 5].includes(board.length)) throw new RangeError('board must have 0, 3, 4 or 5 cards');
  const all = [...hero, ...board, ...extra].map(cardToString);
  if (new Set(all).size !== all.length) throw new RangeError('duplicate card among hero, board and villain');
}

function resolveMethod(opts: EquityOptions, evaluations: number): 'exact' | 'monte-carlo' {
  const m = opts.method ?? 'auto';
  if (m !== 'auto') return m;
  return evaluations <= (opts.maxExactEvaluations ?? DEFAULT_MAX_EXACT_EVALUATIONS) ? 'exact' : 'monte-carlo';
}

/** Calls `visit` with every k-subset of `items` (written into a reused buffer). */
export function forEachCombination(items: Int32Array, k: number, pick: Int32Array, visit: () => void): void {
  const n = items.length;
  if (k === 0) {
    visit();
    return;
  }
  const idx = new Int32Array(k);
  for (let i = 0; i < k; i++) idx[i] = i;
  for (;;) {
    for (let i = 0; i < k; i++) pick[i] = items[idx[i] as number] as number;
    visit();
    let i = k - 1;
    while (i >= 0 && (idx[i] as number) === n - k + i) i--;
    if (i < 0) return;
    idx[i] = (idx[i] as number) + 1;
    for (let j = i + 1; j < k; j++) idx[j] = (idx[j - 1] as number) + 1;
  }
}

const idxOf = (cards: readonly Card[]): number[] => cards.map(cardIndex);

export function remaining(excluded: ReadonlySet<number>): Int32Array {
  const out: number[] = [];
  for (let i = 0; i < 52; i++) if (!excluded.has(i)) out.push(i);
  return Int32Array.from(out);
}

interface Tally {
  win: number;
  tie: number;
  loss: number;
}

function finishExact(t: Tally, combos: number, boards: number): EquityResult {
  const total = t.win + t.tie + t.loss;
  const w = t.win / total;
  const ti = t.tie / total;
  return {
    equity: w + ti / 2,
    winProbability: w,
    tieProbability: ti,
    lossProbability: 1 - w - ti,
    method: 'exact',
    combosConsidered: combos,
    boardsPerCombo: boards,
  };
}

/** Exact enumeration of one hero-vs-villain matchup, adding `weight` x outcome counts to the tally. */
function enumerateMatchup(hero: Int32Array, villain: Int32Array, board: Int32Array, t: Tally, weight: number): void {
  const used = new Set<number>([...hero, ...villain, ...board]);
  const deck = remaining(used);
  const m = board.length;
  const k = 5 - m;
  const hb = new Int32Array(7);
  const vb = new Int32Array(7);
  hb[0] = hero[0] as number;
  hb[1] = hero[1] as number;
  vb[0] = villain[0] as number;
  vb[1] = villain[1] as number;
  for (let j = 0; j < m; j++) hb[2 + j] = vb[2 + j] = board[j] as number;
  const pick = new Int32Array(Math.max(k, 1));
  let win = 0;
  let tie = 0;
  let loss = 0;
  forEachCombination(deck, k, pick, () => {
    for (let j = 0; j < k; j++) hb[2 + m + j] = vb[2 + m + j] = pick[j] as number;
    const hs = fastScore(hb, 7);
    const vs = fastScore(vb, 7);
    if (hs > vs) win++;
    else if (hs === vs) tie++;
    else loss++;
  });
  t.win += win * weight;
  t.tie += tie * weight;
  t.loss += loss * weight;
}

export interface McState {
  rng: Rng;
  seed?: number;
}

export function makeRng(opts: EquityOptions): McState {
  if (opts.rng) return { rng: opts.rng };
  const seed = opts.seed ?? 1;
  return { rng: seededRng(seed), seed };
}

function monteCarlo(
  hero: Int32Array,
  board: Int32Array,
  samples: number,
  state: McState,
  drawVillain: () => Combo,
  combosConsidered: number,
): EquityResult {
  if (!Number.isInteger(samples) || samples < 1) throw new RangeError('samples must be a positive integer');
  const { rng } = state;
  const m = board.length;
  const k = 5 - m;
  const excluded = new Set<number>([...hero, ...board]);
  const avail = remaining(excluded);
  const n = avail.length;
  const hb = new Int32Array(7);
  const vb = new Int32Array(7);
  hb[0] = hero[0] as number;
  hb[1] = hero[1] as number;
  for (let j = 0; j < m; j++) hb[2 + j] = vb[2 + j] = board[j] as number;
  let win = 0;
  let tie = 0;
  let loss = 0;
  for (let s = 0; s < samples; s++) {
    const c = drawVillain();
    vb[0] = c.a;
    vb[1] = c.b;
    // partial Fisher-Yates over the cards not in hero/board, skipping the villain's two cards
    for (let j = 0; j < k; j++) {
      let card: number;
      let pos: number;
      do {
        pos = j + Math.floor(rng() * (n - j));
        card = avail[pos] as number;
      } while (card === c.a || card === c.b);
      avail[pos] = avail[j] as number;
      avail[j] = card;
      hb[2 + m + j] = vb[2 + m + j] = card;
    }
    const hs = fastScore(hb, 7);
    const vs = fastScore(vb, 7);
    if (hs > vs) win++;
    else if (hs === vs) tie++;
    else loss++;
  }
  const w = win / samples;
  const ti = tie / samples;
  const eq = w + ti / 2;
  // per-sample payoff is 1, 0.5 or 0
  const meanSq = (win + tie * 0.25) / samples;
  const variance = Math.max(0, meanSq - eq * eq);
  const result: EquityResult = {
    equity: eq,
    winProbability: w,
    tieProbability: ti,
    lossProbability: loss / samples,
    method: 'monte-carlo',
    samples,
    standardError: Math.sqrt(variance / samples),
    combosConsidered,
  };
  if (state.seed !== undefined) result.seed = state.seed;
  return result;
}

/** Hero versus one exact villain hand. Board may be empty (preflop), a flop, a turn or a river. */
export function equityVsHand(hero: readonly Card[], villain: readonly Card[], board: readonly Card[] = [], opts: EquityOptions = {}): EquityResult {
  validate(hero, board, villain);
  if (villain.length !== 2) throw new RangeError('villain needs exactly 2 cards');
  const h = Int32Array.from(idxOf(hero));
  const v = Int32Array.from(idxOf(villain));
  const b = Int32Array.from(idxOf(board));
  const method = resolveMethod(opts, estimateEvaluations(1, board.length));
  if (method === 'exact') {
    const t: Tally = { win: 0, tie: 0, loss: 0 };
    enumerateMatchup(h, v, b, t, 1);
    return finishExact(t, 1, choose(52 - 4 - board.length, 5 - board.length));
  }
  const combo: Combo = { a: Math.min(v[0] as number, v[1] as number), b: Math.max(v[0] as number, v[1] as number) };
  return monteCarlo(h, b, opts.samples ?? DEFAULT_SAMPLES, makeRng(opts), () => combo, 1);
}

/**
 * Hero versus a (weighted) range. Combos that contain a hero or board card are removed first (blockers),
 * the rest are weighted by their range weight. Throws if no combo is left.
 */
export function equityVsRange(hero: readonly Card[], range: Range, board: readonly Card[] = [], opts: EquityOptions = {}): EquityResult {
  validate(hero, board);
  const known = new Set(idxOf([...hero, ...board]));
  const alive = range.entries.filter((e) => !known.has(e.combo.a) && !known.has(e.combo.b));
  if (alive.length === 0) throw new RangeError('no villain combo is possible with the known cards');

  const h = Int32Array.from(idxOf(hero));
  const b = Int32Array.from(idxOf(board));
  const method = resolveMethod(opts, estimateEvaluations(alive.length, board.length));

  if (method === 'exact') {
    const t: Tally = { win: 0, tie: 0, loss: 0 };
    const v = new Int32Array(2);
    for (const e of alive) {
      v[0] = e.combo.a;
      v[1] = e.combo.b;
      enumerateMatchup(h, v, b, t, e.weight);
    }
    return finishExact(t, alive.length, choose(52 - 4 - board.length, 5 - board.length));
  }

  const cumulative = new Float64Array(alive.length);
  let acc = 0;
  alive.forEach((e, i) => {
    acc += e.weight;
    cumulative[i] = acc;
  });
  const state = makeRng(opts);
  const draw = (): Combo => {
    const r = state.rng() * acc;
    let lo = 0;
    let hi = alive.length - 1;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if ((cumulative[mid] as number) < r) lo = mid + 1;
      else hi = mid;
    }
    return (alive[lo] as (typeof alive)[number]).combo;
  };
  return monteCarlo(h, b, opts.samples ?? DEFAULT_SAMPLES, state, draw, alive.length);
}

/** Convenience for tests and callers holding combos: exact cards of a combo. */
export const cardsOfCombo = comboCards;
