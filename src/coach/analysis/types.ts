/**
 * Structured output of the Coach analysis. Data only: no prose, no advice.
 *
 * Rule of the whole layer: nothing is stated unless it can be justified by the game state or by an
 * assumption the caller supplied explicitly. Whatever is unknown is reported as unknown, with the reason.
 * Future layers (explanations, UI text) read these structures; they must never recompute or invent numbers.
 */
import type { Card, HandCategory, Rank, Street } from '../../engine';
import type {
  DrawKind, DrawProbabilities, EVResult, ImpliedOddsResult, OutQuality, PotOdds, Range, SprResult,
} from '../math';

export type Confidence = 'high' | 'medium' | 'low';

export type ConfidenceReasonCode =
  | 'ALL_OPPONENTS_EXACT_OR_KNOWN_RANGE' // every opponent's hand or range is known
  | 'HYPOTHETICAL_RANGES' // at least one range is an explicit hypothesis, not a fact
  | 'OPPONENT_INFO_MISSING' // some opponents have no hand or range
  | 'NO_OPPONENT_INFO' // nothing is known about any opponent
  | 'NO_OPPONENTS' // nobody left to play against
  | 'ESTIMATED_BY_SIMULATION' // equity is a Monte Carlo estimate
  | 'MULTIWAY_INDEPENDENT_RANGES'; // several ranges are treated as independent

export interface ConfidenceInfo {
  level: Confidence;
  reasons: { code: ConfidenceReasonCode; detail?: string }[];
}

/* ---- assumptions supplied by the caller ---- */

export type OpponentAssumption =
  | { kind: 'exact-hand'; hand: readonly Card[] }
  | {
      kind: 'range';
      range: Range;
      /** `known`: this is the real range (study mode). `hypothetical`: an explicit guess. */
      certainty: 'known' | 'hypothetical';
      label?: string;
      source?: 'user' | 'bot-profile';
    };

export interface BetAssumption {
  betAmount?: number;
  /** P(opponent folds). */
  foldEquity?: number;
  winWhenCalled?: number;
  tieWhenCalled?: number;
  lossWhenCalled?: number;
}

export interface CoachAssumptions {
  /** Keyed by seat index of each opponent. */
  opponents?: Record<number, OpponentAssumption>;
  equity?: { method?: 'auto' | 'exact' | 'monte-carlo'; maxExactEvaluations?: number; samples?: number; seed?: number };
  /** Needed for an EV when the hero is not facing a call. */
  bet?: BetAssumption;
  implied?: { stackBehind?: number; futureWinWhenHit?: number; payoffProbability?: number; futureLossWhenBeaten?: number; reverseProbability?: number };
}

/* ---- situation ---- */

export interface OpponentSummary {
  seat: number;
  name: string;
  position: string;
  stack: number;
  status: 'active' | 'allin';
}

export type Facing =
  | { kind: 'none' }
  | {
      kind: 'bet';
      /** Chips the hero must add (capped by his stack). */
      callAmount: number;
      /** Highest bet on the street. */
      currentBet: number;
      /** currentBet / pot excluding this street's bets; null when that pot is empty (e.g. preflop with blinds only). */
      betToPotRatio: number | null;
      callIsAllIn: boolean;
    };

export interface Situation {
  street: Street;
  handNumber: number;
  heroSeat: number;
  heroInHand: boolean;
  heroToAct: boolean;
  heroPosition: string;
  heroStack: number;
  pot: number;
  /** min(hero stack, largest live opponent stack), chips behind; null without opponents. */
  effectiveStack: number | null;
  spr: SprResult | null;
  playersInHand: number;
  opponents: OpponentSummary[];
  facing: Facing;
  hero: Card[];
  board: Card[];
  knownCards: number;
  unknownCards: number;
}

/* ---- hand strength ---- */

export type HandStrengthInfo =
  | { kind: 'preflop'; handClass: string; combos: number }
  | {
      kind: 'made';
      category: HandCategory;
      categoryName: string;
      description: string;
      bestFive: Card[];
      /** Rank tiebreakers in significance order (pair rank, kickers...). */
      tiebreak: Rank[];
      /** Hero hole cards that are part of the best five. */
      holeCardsUsed: Card[];
      /** True when the best five contain no hole card: the hero plays the board. */
      boardPlays: boolean;
    }
  | { kind: 'not_available'; reason: 'NO_HOLE_CARDS' };

/* ---- draws and outs ---- */

export type CoachDrawKind =
  | DrawKind
  | 'straight-flush-draw'
  | 'quads-draw'
  | 'full-house-draw'
  | 'trips-draw'
  | 'two-pair-draw'
  | 'pair-draw';

export type DrawReason =
  | { code: 'FOUR_TO_FLUSH'; suit: Card['suit']; holeCards: Card[]; boardCards: Card[] }
  | { code: 'STRAIGHT_COMPLETING_RANKS'; completingRanks: Rank[]; heroRanks: Rank[]; boardRanks: Rank[] }
  | { code: 'IMPROVES_CATEGORY'; from: HandCategory; to: HandCategory };

export interface DrawInfo {
  kind: CoachDrawKind;
  outs: number;
  cards: Card[];
  reason: DrawReason;
  relevance: 'major' | 'moderate' | 'minor';
}

export type DrawsInfo =
  | { status: 'available'; draws: DrawInfo[] }
  | { status: 'not_applicable'; reason: 'PREFLOP' | 'RIVER' | 'NO_HOLE_CARDS' };

export type OutsInfo =
  | {
      status: 'available';
      total: number;
      clean: Card[];
      dirty: Card[];
      unknown: Card[];
      /** Outs that only pair the board for the hero. */
      viaBoardPair: Card[];
      byCategory: { category: HandCategory; cards: Card[] }[];
      probabilities: DrawProbabilities;
      /** How quality was judged. */
      qualityBasis: 'nuts-check' | 'opponent-ranges';
      qualityOf: Record<string, OutQuality>;
    }
  | { status: 'not_applicable'; reason: 'PREFLOP' | 'RIVER' | 'NO_HOLE_CARDS' };

/* ---- equity ---- */

export interface EquityOpponent {
  seat: number;
  name: string;
  source: 'exact-hand' | 'known-range' | 'hypothetical-range';
  label?: string;
  combos: number;
}

export type EquityInfo =
  | {
      status: 'computed';
      /** Hero equity = win + tie share. */
      equity: number;
      winProbability: number;
      tieProbability: number;
      lossProbability: number;
      opponents: EquityOpponent[];
      /** Equity of every opponent, same order as `opponents`. */
      opponentEquities: number[];
      method: 'exact' | 'monte-carlo';
      samples?: number;
      seed?: number;
      standardError?: number;
    }
  | { status: 'unknown_opponent_range'; missingSeats: number[] }
  | { status: 'not_applicable'; reason: 'NO_OPPONENTS' | 'HERO_NOT_IN_HAND' | 'NO_HOLE_CARDS' };

/* ---- pot odds, EV, blockers ---- */

export type PotOddsInfo =
  | { status: 'no_call_decision' }
  | {
      status: 'available';
      odds: PotOdds;
      /** Present only when an equity was computed. */
      comparison: { equity: number; requiredEquity: number; margin: number; meetsRequirement: boolean } | null;
      implied: ImpliedOddsResult | null;
    };

export type EVInfo =
  | ({ status: 'complete'; kind: 'call' | 'bet'; breakEvenEquity?: number; equity?: number } & EVResult)
  | { status: 'insufficient_data'; missing: string[] };

export interface BlockerRangeInfo {
  seat: number;
  label?: string;
  totalCombos: number;
  remainingCombos: number;
  blockedCombos: number;
  /** Known card ("As") -> number of this range's combos that contain it. */
  blockedByCard: Record<string, number>;
  /** Hand classes that lose the most combos. */
  mostAffected: { handClass: string; blocked: number; total: number }[];
}

export type BlockersInfo = { status: 'no_range_assumed' } | { status: 'available'; ranges: BlockerRangeInfo[] };

export interface CoachAnalysis {
  version: 1;
  situation: Situation;
  handStrength: HandStrengthInfo;
  draws: DrawsInfo;
  outs: OutsInfo;
  equity: EquityInfo;
  potOdds: PotOddsInfo;
  spr: SprResult | { status: 'not_available' };
  ev: EVInfo;
  blockers: BlockersInfo;
  confidence: ConfidenceInfo;
  /** Plain list of the assumptions that were actually used. */
  assumptionsUsed: string[];
}
