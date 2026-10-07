/**
 * Multiway equity and range-vs-range.
 *
 * Every player holds either one exact hand or a weighted range. The engine considers every way of giving each
 * player one combo of his range with no card used twice (a joint "assignment", weighted by the product of the
 * combo weights), then every runout. A pot that several players share on the best hand is split equally:
 *   share_i = 1 / (number of players tied for best)   when player i is among the best, else 0
 *   equity_i = E[share_i]            (the equities of all players sum to exactly 1)
 *   winProbability_i  = P(player i is the single best hand)
 *   tieProbability_i  = P(player i is tied for best with at least one other player)
 *
 * Method selection (configurable threshold):
 *   1. exact enumeration when  (product of the players' combo counts) x (runouts)  <= maxExactEvaluations
 *      (an upper bound: conflicting combos only make the real work smaller);
 *   2. otherwise Monte Carlo with an injectable RNG / seed. The result always says which one was used.
 * Monte Carlo draws whole assignments and rejects those that reuse a card, which keeps the distribution
 * identical to the exact one.
 */
import { cardIndex, cardToString, type Card } from '../../engine';
import { choose } from './probabilities';
import {
  DEFAULT_MAX_EXACT_EVALUATIONS, DEFAULT_SAMPLES, forEachCombination, makeRng, remaining, type EquityOptions,
} from './equity';
import { fastScore } from './fastEval';
import type { Range } from './ranges';

export interface MultiwayPlayer {
  label?: string;
  /** Exactly one of `hand` (2 cards) or `range`. */
  hand?: readonly Card[];
  range?: Range;
}

export interface MultiwayPlayerResult {
  label: string;
  equity: number;
  winProbability: number;
  tieProbability: number;
  /** Combos this player can hold after removing known cards (1 for an exact hand). */
  combosConsidered: number;
  /** Monte Carlo only. */
  standardError?: number;
}

export interface MultiwayResult {
  players: MultiwayPlayerResult[];
  method: 'exact' | 'monte-carlo';
  /** Upper bound of the exact work: product of combo counts x runouts. */
  evaluationsEstimate: number;
  /** Exact only: runouts per assignment. */
  boardsPerAssignment?: number;
  /** Exact only: number of valid card-disjoint assignments enumerated. */
  assignments?: number;
  samples?: number;
  seed?: number;
}

export const MAX_PLAYERS = 9;

/** Upper bound of evaluations for exact multiway enumeration. */
export function estimateMultiwayEvaluations(comboCounts: readonly number[], boardCards: number): number {
  const n = 52 - boardCards - 2 * comboCounts.length;
  if (n < 5 - boardCards) return 0;
  return comboCounts.reduce((p, c) => p * c, 1) * choose(n, 5 - boardCards);
}

interface Entry {
  a: number;
  b: number;
  w: number;
}

function prepare(players: readonly MultiwayPlayer[], board: readonly Card[]): { lists: Entry[][]; labels: string[] } {
  if (players.length < 2 || players.length > MAX_PLAYERS) throw new RangeError(`2 to ${MAX_PLAYERS} players are supported`);
  if (![0, 3, 4, 5].includes(board.length)) throw new RangeError('board must have 0, 3, 4 or 5 cards');
  const known = [...board];
  for (const p of players) {
    if ((p.hand === undefined) === (p.range === undefined)) throw new RangeError('each player needs exactly one of hand or range');
    if (p.hand) {
      if (p.hand.length !== 2) throw new RangeError('an exact hand needs 2 cards');
      known.push(...p.hand);
    }
  }
  const names = known.map(cardToString);
  if (new Set(names).size !== names.length) throw new RangeError('duplicate card among board and exact hands');
  const dead = new Set(known.map(cardIndex));
  const boardSet = new Set(board.map(cardIndex));

  const lists = players.map((p, i): Entry[] => {
    if (p.hand) {
      const [x, y] = p.hand.map(cardIndex) as [number, number];
      return [{ a: Math.min(x, y), b: Math.max(x, y), w: 1 }];
    }
    // ranges lose combos that use the board or ANY exact hand (they are known to be elsewhere)
    const exactCards = new Set<number>([...boardSet]);
    players.forEach((q) => q.hand?.forEach((c) => exactCards.add(cardIndex(c))));
    const alive = (p.range as Range).entries.filter((e) => !exactCards.has(e.combo.a) && !exactCards.has(e.combo.b));
    if (alive.length === 0) throw new RangeError(`player ${i + 1} has no possible combo with the known cards`);
    return alive.map((e) => ({ a: e.combo.a, b: e.combo.b, w: e.weight }));
  });
  void dead;
  return { lists, labels: players.map((p, i) => p.label ?? `Player ${i + 1}`) };
}

export function equityMultiway(players: readonly MultiwayPlayer[], board: readonly Card[] = [], opts: EquityOptions = {}): MultiwayResult {
  const { lists, labels } = prepare(players, board);
  const n = players.length;
  const m = board.length;
  const k = 5 - m;
  const estimate = estimateMultiwayEvaluations(lists.map((l) => l.length), m);
  const requested = opts.method ?? 'auto';
  const method = requested !== 'auto' ? requested : estimate <= (opts.maxExactEvaluations ?? DEFAULT_MAX_EXACT_EVALUATIONS) ? 'exact' : 'monte-carlo';
  const boardIdx = board.map(cardIndex);

  // 7-card buffers: [hole a, hole b, board 0..4]
  const bufs = Array.from({ length: n }, () => new Int32Array(7));
  const scores = new Float64Array(n);
  for (const b of bufs) boardIdx.forEach((c, j) => (b[2 + j] = c));

  const evalBoard = (winOut: Float64Array, tieOut: Float64Array, eqOut: Float64Array, weight: number): void => {
    let best = -1;
    for (let i = 0; i < n; i++) {
      scores[i] = fastScore(bufs[i] as Int32Array, 7);
      if ((scores[i] as number) > best) best = scores[i] as number;
    }
    let cnt = 0;
    for (let i = 0; i < n; i++) if (scores[i] === best) cnt++;
    for (let i = 0; i < n; i++) {
      if (scores[i] !== best) continue;
      if (cnt === 1) winOut[i] = (winOut[i] as number) + weight;
      else tieOut[i] = (tieOut[i] as number) + weight;
      eqOut[i] = (eqOut[i] as number) + weight / cnt;
    }
  };

  if (method === 'exact') {
    const win = new Float64Array(n);
    const tie = new Float64Array(n);
    const eq = new Float64Array(n);
    const used = new Uint8Array(52);
    boardIdx.forEach((c) => (used[c] = 1));
    let totalWeight = 0;
    let assignments = 0;
    const boardsPer = choose(52 - m - 2 * n, k);
    const pick = new Int32Array(Math.max(k, 1));

    const leaf = (weight: number): void => {
      assignments++;
      const deckList: number[] = [];
      for (let c = 0; c < 52; c++) if (!used[c]) deckList.push(c);
      const deck = Int32Array.from(deckList);
      forEachCombination(deck, k, pick, () => {
        for (let i = 0; i < n; i++) for (let j = 0; j < k; j++) (bufs[i] as Int32Array)[2 + m + j] = pick[j] as number;
        evalBoard(win, tie, eq, weight);
      });
      totalWeight += weight * boardsPer;
    };
    const recurse = (i: number, weight: number): void => {
      if (i === n) return leaf(weight);
      for (const e of lists[i] as Entry[]) {
        if (used[e.a] || used[e.b]) continue;
        used[e.a] = used[e.b] = 1;
        (bufs[i] as Int32Array)[0] = e.a;
        (bufs[i] as Int32Array)[1] = e.b;
        recurse(i + 1, weight * e.w);
        used[e.a] = used[e.b] = 0;
      }
    };
    recurse(0, 1);
    if (assignments === 0) throw new RangeError('no card-disjoint assignment of hands exists');
    return {
      players: labels.map((label, i) => ({
        label,
        equity: (eq[i] as number) / totalWeight,
        winProbability: (win[i] as number) / totalWeight,
        tieProbability: (tie[i] as number) / totalWeight,
        combosConsidered: (lists[i] as Entry[]).length,
      })),
      method: 'exact',
      evaluationsEstimate: estimate,
      boardsPerAssignment: boardsPer,
      assignments,
    };
  }

  // ---- Monte Carlo ----
  const samples = opts.samples ?? DEFAULT_SAMPLES;
  if (!Number.isInteger(samples) || samples < 1) throw new RangeError('samples must be a positive integer');
  const state = makeRng(opts);
  const rng = state.rng;
  const cums = lists.map((l) => {
    const c = new Float64Array(l.length);
    let acc = 0;
    l.forEach((e, i) => ((acc += e.w), (c[i] = acc)));
    return c;
  });
  const pickCombo = (i: number): Entry => {
    const l = lists[i] as Entry[];
    if (l.length === 1) return l[0] as Entry;
    const cum = cums[i] as Float64Array;
    const r = rng() * (cum[cum.length - 1] as number);
    let lo = 0;
    let hi = l.length - 1;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if ((cum[mid] as number) < r) lo = mid + 1;
      else hi = mid;
    }
    return l[lo] as Entry;
  };
  const avail = remaining(new Set(boardIdx));
  const used = new Uint8Array(52);
  const win = new Float64Array(n);
  const tie = new Float64Array(n);
  const eq = new Float64Array(n);
  const sumSq = new Float64Array(n);
  const before = new Float64Array(n);

  for (let s = 0; s < samples; s++) {
    // draw an assignment; reject it entirely if a card is used twice
    let attempts = 0;
    for (;;) {
      used.fill(0);
      boardIdx.forEach((c) => (used[c] = 1));
      let ok = true;
      for (let i = 0; i < n && ok; i++) {
        const e = pickCombo(i);
        if (used[e.a] || used[e.b]) ok = false;
        else {
          used[e.a] = used[e.b] = 1;
          (bufs[i] as Int32Array)[0] = e.a;
          (bufs[i] as Int32Array)[1] = e.b;
        }
      }
      if (ok) break;
      if (++attempts > 10_000) throw new RangeError('the ranges almost never fit together without sharing a card');
    }
    for (let j = 0; j < k; j++) {
      let card: number;
      let pos: number;
      do {
        pos = j + Math.floor(rng() * (avail.length - j));
        card = avail[pos] as number;
      } while (used[card]);
      avail[pos] = avail[j] as number;
      avail[j] = card;
      for (let i = 0; i < n; i++) (bufs[i] as Int32Array)[2 + m + j] = card;
    }
    before.set(eq);
    evalBoard(win, tie, eq, 1);
    for (let i = 0; i < n; i++) {
      const d = (eq[i] as number) - (before[i] as number);
      sumSq[i] = (sumSq[i] as number) + d * d;
    }
  }
  return {
    players: labels.map((label, i) => {
      const mean = (eq[i] as number) / samples;
      const variance = Math.max(0, (sumSq[i] as number) / samples - mean * mean);
      return {
        label,
        equity: mean,
        winProbability: (win[i] as number) / samples,
        tieProbability: (tie[i] as number) / samples,
        combosConsidered: (lists[i] as Entry[]).length,
        standardError: Math.sqrt(variance / samples),
      };
    }),
    method: 'monte-carlo',
    evaluationsEstimate: estimate,
    samples,
    ...(state.seed !== undefined ? { seed: state.seed } : {}),
  };
}

export interface RangeVsRangeResult extends MultiwayResult {
  a: MultiwayPlayerResult;
  b: MultiwayPlayerResult;
  /** Pairs (combo of A, combo of B) that do not share a card: the matchups that can actually happen. */
  validMatchups: number;
}

/** Range A against range B (heads-up). Board cards and shared cards remove combos from both ranges. */
export function equityRangeVsRange(a: Range, b: Range, board: readonly Card[] = [], opts: EquityOptions = {}): RangeVsRangeResult {
  const r = equityMultiway([{ label: 'Range A', range: a }, { label: 'Range B', range: b }], board, opts);
  const boardSet = new Set(board.map(cardIndex));
  const la = a.entries.filter((e) => !boardSet.has(e.combo.a) && !boardSet.has(e.combo.b));
  const lb = b.entries.filter((e) => !boardSet.has(e.combo.a) && !boardSet.has(e.combo.b));
  let valid = 0;
  for (const x of la) {
    for (const y of lb) {
      if (x.combo.a !== y.combo.a && x.combo.a !== y.combo.b && x.combo.b !== y.combo.a && x.combo.b !== y.combo.b) valid++;
    }
  }
  return { ...r, a: r.players[0] as MultiwayPlayerResult, b: r.players[1] as MultiwayPlayerResult, validMatchups: valid };
}
