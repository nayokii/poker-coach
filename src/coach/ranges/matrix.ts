/**
 * Range matrix model: pure functions behind the 13x13 grid and the range editor.
 *
 * A selection IS a math-engine `Range` (weighted combos): the grid never keeps a second representation.
 * Percent brushes set a uniform weight on every combo of a cell, so "QQ 50%" is a real weight of 0.5 per
 * combo (3 of the 6 combos' worth), which the equity engine then uses. Individual combos can also be set,
 * which is what makes a cell "partial". Dead (known) cards never edit the range: they only change what a
 * cell reports (available combos) and the engine ignores blocked combos when it computes anything.
 *
 * Parsing and printing text is NOT done here: use the engine's `parseRange` / `rangeToString`.
 */
import { cardIndex, rankChar, type Card, type Rank } from '../../engine';
import {
  ALL_HAND_CLASSES, COMBOS_PER_CLASS, comboKey, handClassAt, handClassCombos, handClassToString, makeCombo,
  type Combo, type HandClass,
} from '../math/combos';
import { allCombos } from '../math/combos';
import { comboCount, totalWeight, withoutDeadCards, type Range, type WeightedCombo } from '../math/ranges';

export type CellState = 'none' | 'partial' | 'full' | 'disabled';

export interface MatrixCell {
  handClass: HandClass;
  /** "AKs", "77", "T9o". */
  label: string;
  row: number;
  col: number;
  /** 6, 4 or 12. */
  totalCombos: number;
  /** Combos not blocked by known cards. */
  availableCombos: number;
  blockedCombos: number;
  /** Available combos with weight > 0. */
  presentCombos: number;
  /** Sum of the weights of the available combos. */
  weight: number;
  /** weight / availableCombos in [0, 1] (0 when nothing is available): how filled the cell looks. */
  fraction: number;
  state: CellState;
}

/** Weights offered by the percent buttons. */
export const WEIGHT_PRESETS = [1, 0.75, 0.5, 0.25, 0] as const;
export const TOTAL_COMBOS = 1326;

/** Rank order of rows and columns: A, K, Q ... 2. */
export const MATRIX_RANKS: readonly Rank[] = [14, 13, 12, 11, 10, 9, 8, 7, 6, 5, 4, 3, 2];

const weightOf = (m: ReadonlyMap<number, WeightedCombo>, c: Combo): number => m.get(comboKey(c))?.weight ?? 0;
const toMap = (r: Range): Map<number, WeightedCombo> => new Map(r.entries.map((e) => [comboKey(e.combo), e]));
function fromMap(m: Map<number, WeightedCombo>): Range {
  return { entries: [...m.values()].filter((e) => e.weight > 0).sort((x, y) => comboKey(x.combo) - comboKey(y.combo)) };
}

export const cellLabel = (h: HandClass): string => handClassToString(h);

/** The 13x13 grid for a range, with blockers applied to what each cell reports. */
export function buildMatrix(range: Range, dead: readonly Card[] = []): MatrixCell[][] {
  const deadSet = new Set(dead.map(cardIndex));
  const map = toMap(range);
  return MATRIX_RANKS.map((rowRank, row) =>
    MATRIX_RANKS.map((colRank, col): MatrixCell => {
      const handClass = handClassAt(rowRank, colRank);
      const combos = handClassCombos(handClass);
      const available = combos.filter((c) => !deadSet.has(c.a) && !deadSet.has(c.b));
      const weights = available.map((c) => weightOf(map, c));
      const weight = weights.reduce((s, w) => s + w, 0);
      const present = weights.filter((w) => w > 0).length;
      const state: CellState =
        available.length === 0 ? 'disabled' : present === 0 ? 'none' : weights.every((w) => w === 1) ? 'full' : 'partial';
      return {
        handClass,
        label: cellLabel(handClass),
        row,
        col,
        totalCombos: COMBOS_PER_CLASS[handClass.kind],
        availableCombos: available.length,
        blockedCombos: combos.length - available.length,
        presentCombos: present,
        weight,
        fraction: available.length === 0 ? 0 : weight / available.length,
        state,
      };
    }),
  );
}

/** Sets every combo of a hand class to `weight` (0 removes them). Does not look at dead cards. */
export function setCellWeight(range: Range, h: HandClass, weight: number): Range {
  if (!(weight >= 0 && weight <= 1)) throw new RangeError('weight must be in [0, 1]');
  const m = toMap(range);
  for (const c of handClassCombos(h)) m.set(comboKey(c), { combo: c, weight });
  return fromMap(m);
}

export const isCellUniform = (range: Range, h: HandClass, weight: number): boolean => {
  const m = toMap(range);
  return handClassCombos(h).every((c) => weightOf(m, c) === weight);
};

/**
 * What a tap does with the current brush: if the cell already holds exactly the brush weight it is
 * cleared, otherwise it is set to the brush weight. A 0 brush always clears.
 */
export function nextCellWeight(range: Range, h: HandClass, brush: number): number {
  return brush === 0 || isCellUniform(range, h, brush) ? 0 : brush;
}

export function toggleCell(range: Range, h: HandClass, brush = 1): Range {
  return setCellWeight(range, h, nextCellWeight(range, h, brush));
}

/** Weight of one exact combo (for the per-combo chips of the cell inspector). */
export function comboWeight(range: Range, c: Combo): number {
  return weightOf(toMap(range), c);
}

export function setComboWeight(range: Range, c: Combo, weight: number): Range {
  if (!(weight >= 0 && weight <= 1)) throw new RangeError('weight must be in [0, 1]');
  const m = toMap(range);
  m.set(comboKey(c), { combo: c, weight });
  return fromMap(m);
}

export const emptyRange = (): Range => ({ entries: [] });
export const fullRange = (): Range => ({ entries: allCombos().map((combo) => ({ combo, weight: 1 })) });

/** Every combo's weight w becomes 1 - w (absent combos become 1). */
export function invertRange(range: Range): Range {
  const m = toMap(range);
  const out = new Map<number, WeightedCombo>();
  for (const combo of allCombos()) {
    const w = 1 - weightOf(m, combo);
    if (w > 1e-12) out.set(comboKey(combo), { combo, weight: Math.round(w * 1e9) / 1e9 });
  }
  return fromMap(out);
}

/** Share of all 1326 starting hands the range covers, as a percentage (weights count). */
export const rangePercent = (range: Range): number => (totalWeight(range) / TOTAL_COMBOS) * 100;

/** Applies one weight to many cells at once (drag painting). */
export function paintCells(range: Range, cells: readonly HandClass[], weight: number): Range {
  const m = toMap(range);
  for (const h of cells) for (const c of handClassCombos(h)) m.set(comboKey(c), { combo: c, weight });
  return fromMap(m);
}

/** How a cell is selected, in terms a person can read. */
export type SelectionKind =
  | 'disabled' // every combo is blocked by a known card
  | 'none' // nothing selected
  | 'full' // every available combo at 100%
  | 'uniform' // every available combo at the same weight below 100% ("50 % of this hand")
  | 'subset' // some combos at 100%, the others absent ("6 of 12 combos")
  | 'mixed'; // anything else

export interface CellSelection {
  kind: SelectionKind;
  totalCombos: number;
  availableCombos: number;
  blockedCombos: number;
  /** Available combos with a weight above 0. */
  selectedCombos: number;
  /** Frequency of every selected combo when `kind` is 'uniform' or 'full' (1 for full). */
  weightEach: number | null;
  /** fraction x 100, rounded: the number shown to the user. */
  percent: number;
}

/** Plain-language description data of one cell (built from the same combos and weights as the matrix). */
export function cellSelection(range: Range, dead: readonly Card[], h: HandClass): CellSelection {
  const deadSet = new Set(dead.map(cardIndex));
  const map = toMap(range);
  const combos = handClassCombos(h);
  const available = combos.filter((c) => !deadSet.has(c.a) && !deadSet.has(c.b));
  const weights = available.map((c) => weightOf(map, c));
  const present = weights.filter((w) => w > 0);
  const total = COMBOS_PER_CLASS[h.kind];
  const sum = weights.reduce((s, w) => s + w, 0);
  const base = {
    totalCombos: total,
    availableCombos: available.length,
    blockedCombos: total - available.length,
    selectedCombos: present.length,
    percent: available.length === 0 ? 0 : Math.round((sum / available.length) * 100),
  };
  if (available.length === 0) return { ...base, kind: 'disabled', weightEach: null };
  if (present.length === 0) return { ...base, kind: 'none', weightEach: null };
  if (weights.every((w) => w === 1)) return { ...base, kind: 'full', weightEach: 1 };
  const first = present[0] as number;
  if (present.length === available.length && present.every((w) => w === first)) return { ...base, kind: 'uniform', weightEach: first };
  if (present.every((w) => w === 1)) return { ...base, kind: 'subset', weightEach: null };
  return { ...base, kind: 'mixed', weightEach: null };
}

export interface RangeSummary {
  /** Distinct combos in the range (engine comboCount). */
  combos: number;
  /** Sum of the combo weights = the effective number of combos (engine totalWeight). */
  effectiveCombos: number;
  /** Share of the 1326 starting hands, in percent. */
  percent: number;
  /** Distinct combos still possible once the known cards are removed (engine withoutDeadCards). */
  possibleCombos: number;
}

/** Headline numbers of a range: every figure comes from the engine's own functions. */
export function summarizeRange(range: Range, dead: readonly Card[] = []): RangeSummary {
  return {
    combos: comboCount(range),
    effectiveCombos: totalWeight(range),
    percent: rangePercent(range),
    possibleCombos: comboCount(withoutDeadCards(range, dead)),
  };
}

export { ALL_HAND_CLASSES, makeCombo, rankChar };
