/**
 * Poker Math Engine: public API.
 *
 *   Game State -> Math Engine -> (future) Coach analysis -> (future) Coach explanation -> UI
 *
 * Pure TypeScript, deterministic (injected / seeded RNG), no React. Import from here, not from the files.
 */
export {
  ALL_HAND_CLASSES, COMBOS_PER_CLASS, allCombos, comboCards, comboFromCards, comboKey, comboToString, handClassAt,
  handClassCombos, handClassEquals, handClassOf, handClassToString, makeCombo, parseCombo, parseHandClass,
  type Combo, type HandClass, type HandClassKind,
} from './combos';
export {
  EMPTY_RANGE, RangeParseError, comboCount, mergeRanges, parseRange, rangeFromCombos, rangeFromHandClasses, rangeToString,
  summarizeByClass, totalWeight, withoutDeadCards,
  type ClassSummary, type Range, type WeightedCombo,
} from './ranges';
export { analyzeBlockers, blockersFor, isBlocked, type BlockerReport } from './blockers';
export { fastScore } from './fastEval';
export {
  OUT_QUALITY_THRESHOLDS, analyzeOuts,
  type Draw, type DrawKind, type Out, type OutEvidence, type OutQuality, type OutQualityThresholds, type OutsAnalysis, type OutsOptions,
} from './outs';
export { choose, drawProbabilities, hitAtLeastOnce, ruleOfTwoAndFour, type DrawProbabilities } from './probabilities';
export {
  DEFAULT_MAX_EXACT_EVALUATIONS, DEFAULT_SAMPLES, equityVsHand, equityVsRange, estimateEvaluations,
  type EquityOptions, type EquityResult,
} from './equity';
export { potOdds, potOddsFromBet, potOddsFromState, type PotOdds } from './potOdds';
export {
  impliedOdds, reverseImpliedOdds,
  type FutureLossAssumption, type FutureWinAssumption, type ImpliedOddsInput, type ImpliedOddsResult,
} from './impliedOdds';
export {
  SPR_THRESHOLDS, effectiveStackFromState, spr, sprCategory, sprFromState,
  type SprCategory, type SprResult,
} from './spr';
export { betEV, callEV, expectedValue, type BetEV, type BetEVInput, type CallEV, type CallEVInput, type EVResult, type Outcome } from './ev';
export { snapshotFromState, type MathSnapshot } from './snapshot';
export {
  MAX_PLAYERS, equityMultiway, equityRangeVsRange, estimateMultiwayEvaluations,
  type MultiwayPlayer, type MultiwayPlayerResult, type MultiwayResult, type RangeVsRangeResult,
} from './multiway';
export { callEVFromEquity, type CallEVFromEquity } from './ev';
