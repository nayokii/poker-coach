/**
 * Output of the Explanation Engine: short, typed, traceable sentences built ONLY from a CoachAnalysis.
 *
 * Guarantees (enforced by construction in `Reader` and checked by tests):
 *  - a sentence exists only if every datum it uses exists in the analysis (otherwise it is not emitted);
 *  - every sentence lists the analysis paths it was built from (`sources`);
 *  - every number written in a sentence is registered in `values` with its source path.
 */
export type ExplanationLevel = 1 | 2 | 3;

export type ExplanationCategory =
  | 'situation'
  | 'made_hand'
  | 'draw'
  | 'outs'
  | 'equity'
  | 'pot_odds'
  | 'spr'
  | 'ev'
  | 'blockers'
  | 'range'
  | 'confidence'
  | 'missing_data'
  | 'decision'
  | 'limitation';

export type ExplanationTone = 'neutral' | 'positive' | 'negative' | 'caution';

/** A figure written in a sentence, with the CoachAnalysis path it comes from. */
export interface ExplanationValue {
  source: string;
  /** Exactly what is printed in the sentence ("31,0 %", "9", "A♥"). */
  display: string;
}

export interface ExplanationItem {
  /** Stable identifier, e.g. "pot_odds.need". */
  id: string;
  /** Lowest level at which the sentence is shown: 1 = Simple, 2 = Approfondi, 3 = Avancé (levels are cumulative). */
  level: ExplanationLevel;
  category: ExplanationCategory;
  text: string;
  tone: ExplanationTone;
  /** CoachAnalysis paths the sentence is built from (never empty). */
  sources: string[];
  values: ExplanationValue[];
}

/** Reading of the comparison the analysis already contains (no new decision logic). */
export type DecisionVerdict = 'favorable' | 'unfavorable' | 'close' | 'undetermined';

export interface VerdictInfo {
  verdict: DecisionVerdict;
  /** Paths the verdict was read from; empty when undetermined. */
  sources: string[];
}

export interface Explanation {
  version: 1;
  language: 'fr';
  items: ExplanationItem[];
  verdict: VerdictInfo;
  confidence: 'high' | 'medium' | 'low';
}

/** How chips are written ("3 BB", "60"). Provided by the caller; the engine never knows the blind size. */
export type AmountFormatter = (chips: number) => string;

export interface ExplainOptions {
  formatAmount?: AmountFormatter;
}
