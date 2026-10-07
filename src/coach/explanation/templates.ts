/**
 * Vocabulary and phrase fragments (French). Pure lookup tables keyed by values that already exist in a
 * CoachAnalysis (street, hand category, draw kind, SPR category, confidence reason...). No figure is
 * computed here and no sentence is built here: sentences are assembled in explain.ts.
 */
import { HandCategory, type Street } from '../../engine';
import type { ConfidenceReasonCode, CoachDrawKind } from '../analysis';
import type { SprCategory } from '../math';

export const STREET_FR: Record<Street, string> = {
  preflop: 'au preflop',
  flop: 'au flop',
  turn: 'au turn',
  river: 'à la river',
  showdown: 'au showdown',
};

const RANK_SING: Record<number, string> = {
  2: 'deux', 3: 'trois', 4: 'quatre', 5: 'cinq', 6: 'six', 7: 'sept', 8: 'huit', 9: 'neuf', 10: 'dix',
  11: 'valet', 12: 'dame', 13: 'roi', 14: 'as',
};
const RANK_PLUR: Record<number, string> = {
  2: 'deux', 3: 'trois', 4: 'quatre', 5: 'cinq', 6: 'six', 7: 'sept', 8: 'huit', 9: 'neuf', 10: 'dix',
  11: 'valets', 12: 'dames', 13: 'rois', 14: 'as',
};

export const rankSingular = (r: number): string => RANK_SING[r] ?? String(r);
export const rankPlural = (r: number): string => RANK_PLUR[r] ?? String(r);

/** "l’as", "le roi", "la dame", "le neuf". */
export const rankDefinite = (r: number): string => (r === 14 ? 'l’as' : r === 12 ? 'la dame' : `le ${rankSingular(r)}`);

/** "un as", "un neuf", "une dame". */
export const rankWithArticle = (r: number): string => (r === 12 ? 'une dame' : `un ${rankSingular(r)}`);

/** "de dames" / "d'as": the preposition before a plural rank word. */
export const ofRank = (r: number): string => (r === 14 ? 'd’as' : `de ${rankPlural(r)}`);

/** Names a made hand from its category and tiebreak ranks (both come from handStrength). */
export function madeHandName(category: HandCategory, tiebreak: readonly number[]): string {
  const [a = 0, b = 0] = tiebreak;
  switch (category) {
    case HandCategory.HighCard:
      return `une carte haute (${rankDefinite(a)})`;
    case HandCategory.Pair:
      return `une paire ${ofRank(a)}`;
    case HandCategory.TwoPair:
      return `deux paires, ${rankPlural(a)} et ${rankPlural(b)}`;
    case HandCategory.ThreeOfAKind:
      return `un brelan ${ofRank(a)}`;
    case HandCategory.Straight:
      return `une quinte, ${rankDefinite(a)} en carte haute`;
    case HandCategory.Flush:
      return `une couleur, ${rankDefinite(a)} en carte haute`;
    case HandCategory.FullHouse:
      return `un full, ${rankPlural(a)} par les ${rankPlural(b)}`;
    case HandCategory.FourOfAKind:
      return `un carré ${ofRank(a)}`;
    case HandCategory.StraightFlush:
      return a === 14 ? 'une quinte flush royale' : `une quinte flush, ${rankDefinite(a)} en carte haute`;
  }
}

/** Category used as a target ("vers une couleur"). */
export const CATEGORY_TARGET_FR: Record<number, string> = {
  [HandCategory.HighCard]: 'une carte haute',
  [HandCategory.Pair]: 'une paire',
  [HandCategory.TwoPair]: 'une double paire',
  [HandCategory.ThreeOfAKind]: 'un brelan',
  [HandCategory.Straight]: 'une quinte',
  [HandCategory.Flush]: 'une couleur',
  [HandCategory.FullHouse]: 'un full',
  [HandCategory.FourOfAKind]: 'un carré',
  [HandCategory.StraightFlush]: 'une quinte flush',
};

/** Category as a starting point ("à partir d’une paire"). */
export const CATEGORY_FROM_FR: Record<number, string> = {
  [HandCategory.HighCard]: 'd’une carte haute',
  [HandCategory.Pair]: 'd’une paire',
  [HandCategory.TwoPair]: 'd’une double paire',
  [HandCategory.ThreeOfAKind]: 'd’un brelan',
  [HandCategory.Straight]: 'd’une quinte',
  [HandCategory.Flush]: 'd’une couleur',
  [HandCategory.FullHouse]: 'd’un full',
  [HandCategory.FourOfAKind]: 'd’un carré',
  [HandCategory.StraightFlush]: 'd’une quinte flush',
};

export const DRAW_FR: Record<CoachDrawKind, string> = {
  'flush-draw': 'un tirage couleur',
  'open-ended-straight-draw': 'un tirage quinte par les deux bouts',
  gutshot: 'un tirage quinte ventral (gutshot)',
  'double-gutshot': 'un double tirage quinte ventral',
  'straight-flush-draw': 'un tirage quinte flush',
  'quads-draw': 'un tirage carré',
  'full-house-draw': 'un tirage full',
  'trips-draw': 'un tirage brelan',
  'two-pair-draw': 'un tirage double paire',
  'pair-draw': 'une possibilité de paire',
};

export const SUIT_FR: Record<string, string> = { s: 'piques', h: 'cœurs', d: 'carreaux', c: 'trèfles' };

export const SPR_FR: Record<SprCategory, string> = {
  'very-low': 'très bas',
  low: 'bas',
  medium: 'moyen',
  high: 'élevé',
  'very-high': 'très élevé',
};

/** General rule of thumb attached to the SPR category (the thresholds are documented in coach/math/spr.ts). */
export const SPR_MEANING_FR: Record<SprCategory, string> = {
  'very-low': 'il reste très peu derrière : presque toute main correcte est engagée dans le pot',
  low: 'il reste peu derrière : une top paire ou mieux prend naturellement de la valeur et les décisions de tapis sont courantes',
  medium: 'la profondeur est intermédiaire : les mains solides peuvent s’engager, les mains moyennes doivent rester prudentes',
  high: 'il reste beaucoup derrière : il faut une main solide pour s’engager et les tirages gagnent de la valeur potentielle',
  'very-high': 'il reste énormément derrière : s’engager demande une main très solide, les tirages et les cotes implicites pèsent davantage',
};

export const CONFIDENCE_FR = { high: 'élevée', medium: 'moyenne', low: 'faible' } as const;

export const REASON_FR: Record<ConfidenceReasonCode, string> = {
  ALL_OPPONENTS_EXACT_OR_KNOWN_RANGE: 'la main ou la range de chaque adversaire est connue',
  HYPOTHETICAL_RANGES: 'au moins une range adverse est une hypothèse, pas une observation',
  OPPONENT_INFO_MISSING: 'certains adversaires n’ont aucune main ni range supposée',
  NO_OPPONENT_INFO: 'rien n’est supposé sur les adversaires',
  NO_OPPONENTS: 'il n’y a plus d’adversaire à affronter',
  ESTIMATED_BY_SIMULATION: 'l’equity est une estimation par simulation',
  MULTIWAY_INDEPENDENT_RANGES: 'plusieurs ranges sont traitées comme indépendantes',
};

/** Known engine strings (EV assumptions, missing data) in French; anything else is shown as received. */
const KNOWN_TEXT_FR: Record<string, string> = {
  'Heads-up: one opponent, ties split the pot in two.': 'Un seul adversaire : une égalité partage le pot en deux.',
  'The hand is decided at showdown after the call: no further betting, no implied odds, no folds.':
    'La main se termine au showdown juste après le call : plus de mise, pas de cotes implicites, pas de fold.',
  'Win/tie/loss probabilities are given by the caller (their own assumptions about the villain range).':
    'Les probabilités viennent de l’hypothèse choisie sur la range adverse.',
  'The hand is decided at showdown right after the call: no further betting and no side pots.':
    'La main se termine au showdown juste après le call : plus de mise et pas de pot annexe.',
  'The pot is exactly potBeforeCall + callAmount: players still to act neither fold nor add chips.':
    'Le pot vaut exactement le pot actuel plus ton call : les joueurs qui restent à parler ne se couchent pas et n’ajoutent rien.',
  'Equity is win + tie share and comes from the stated opponent hands/ranges.':
    'L’equity compte les victoires et la part des égalités, d’après les mains ou ranges adverses indiquées.',
  'Heads-up, a single bet on this street; when called the hand goes to showdown with no more betting.':
    'Un seul adversaire, une seule mise sur cette street ; si elle est payée, la main va au showdown sans autre mise.',
  'Fold equity is an input (an assumption about the villain), not something the engine knows.':
    'La fréquence de fold adverse est une hypothèse fournie, pas une donnée connue.',
  'Win/tie/loss probabilities when called are inputs; they should be conditional on the villain calling (a calling range is stronger than a full range).':
    'Les probabilités quand la mise est payée sont des hypothèses fournies ; elles devraient dépendre du fait que l’adversaire paie (une range qui paie est plus forte).',
  'opponent hand or range (needed for equity)': 'il manque une main ou une range adverse (nécessaire pour l’equity)',
  'hero is not in the hand': 'tu n’es plus dans la main',
};

const BET_FIELD_FR: Record<string, string> = {
  'bet size': 'la taille de la mise',
  'fold equity': 'la fréquence de fold adverse',
  'win probability when called': 'la probabilité de gagner si la mise est payée',
  'tie probability when called': 'la probabilité d’égalité si la mise est payée',
  'loss probability when called': 'la probabilité de perdre si la mise est payée',
};

const IMPLIED_FIELD_FR: Record<string, string> = {
  stackBehind: 'le stack restant derrière',
  'implied.futureWinWhenHit': 'le gain futur si tu touches',
  'implied.payoffProbability': 'la probabilité que l’adversaire paie',
  'reverse.futureLossWhenBeaten': 'la perte future si tu es battu',
  'reverse.reverseProbability': 'la probabilité de cette perte',
  'implied or reverse assumptions (none provided)': 'des hypothèses de cotes implicites',
};

export function knownText(s: string): string {
  const direct = KNOWN_TEXT_FR[s];
  if (direct) return direct;
  const m = /^no call to evaluate; a bet needs these assumptions: (.+)$/.exec(s);
  if (m) {
    const parts = (m[1] as string).split(', ').map((p) => BET_FIELD_FR[p] ?? p);
    return `aucun call à évaluer ; pour juger une mise il faut : ${parts.join(', ')}`;
  }
  return s;
}

export const impliedFieldFr = (s: string): string => IMPLIED_FIELD_FR[s] ?? s;

export const EQUITY_NA_FR: Record<string, string> = {
  NO_OPPONENTS: 'il n’y a plus d’adversaire à affronter',
  HERO_NOT_IN_HAND: 'tu n’es plus dans la main',
  NO_HOLE_CARDS: 'aucune carte privée n’est connue',
};

/** "que Mira" / "qu’Atlas": elision before a vowel or a silent h. */
export const queName = (name: string): string => (/^[aeiouyhàâäéèêëîïôöùûü]/i.test(name) ? `qu’${name}` : `que ${name}`);
