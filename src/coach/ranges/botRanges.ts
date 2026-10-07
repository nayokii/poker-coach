/**
 * Preflop ranges of the five bot profiles, built from named hand groups.
 *
 * These are TEACHING profiles, not game-theory-optimal strategies: each range answers "which starting hands
 * does this kind of player voluntarily play?" and nothing more. They describe the profile's preflop range,
 * they are not updated by what happens later in the hand, and they are only ever a hypothesis about a real
 * opponent. The coach labels them as such.
 */
import { mergeRanges, parseRange, type Range } from '../math/ranges';
import { rangePercent } from './matrix';

export interface HandGroup {
  id: string;
  label: string;
  /** Range notation understood by the math engine's parser. */
  notation: string;
  description: string;
}

/** Understandable building blocks. Groups may overlap: merging keeps every combo once. */
export const HAND_GROUPS: readonly HandGroup[] = [
  { id: 'premium-pairs', label: 'Premium pairs', notation: 'QQ+', description: 'QQ, KK, AA' },
  { id: 'strong-pairs', label: 'Strong pairs', notation: 'TT-JJ', description: 'TT, JJ' },
  { id: 'medium-pairs', label: 'Medium pairs', notation: '77-99', description: '77, 88, 99' },
  { id: 'small-pairs', label: 'Small pairs', notation: '22-66', description: '22 to 66 (set mining)' },
  { id: 'big-aces-suited', label: 'Big suited aces', notation: 'AQs+', description: 'AQs, AKs' },
  { id: 'good-aces-suited', label: 'Good suited aces', notation: 'ATs-AJs', description: 'ATs, AJs' },
  { id: 'weak-aces-suited', label: 'Weak suited aces', notation: 'A2s-A9s', description: 'A2s to A9s (wheel and flush potential)' },
  { id: 'ak-offsuit', label: 'AK offsuit', notation: 'AKo', description: 'AKo' },
  { id: 'aq-offsuit', label: 'AQ offsuit', notation: 'AQo', description: 'AQo' },
  { id: 'good-aces-offsuit', label: 'Good offsuit aces', notation: 'ATo-AJo', description: 'ATo, AJo' },
  { id: 'weak-aces-offsuit', label: 'Weak offsuit aces', notation: 'A2o-A9o', description: 'A2o to A9o' },
  { id: 'kq-suited', label: 'KQ suited', notation: 'KQs', description: 'KQs' },
  { id: 'suited-broadways', label: 'Suited broadways', notation: 'KJs, KTs, QJs, QTs, JTs', description: 'KJs KTs QJs QTs JTs' },
  { id: 'kq-offsuit', label: 'KQ offsuit', notation: 'KQo', description: 'KQo' },
  { id: 'offsuit-broadways', label: 'Offsuit broadways', notation: 'KJo, KTo, QJo, QTo, JTo', description: 'KJo KTo QJo QTo JTo' },
  { id: 'suited-connectors', label: 'Suited connectors', notation: 'T9s-54s', description: 'T9s, 98s, 87s, 76s, 65s, 54s' },
  { id: 'suited-gappers', label: 'Suited one-gappers', notation: 'T8s, 97s, 86s, 75s, 64s, 53s', description: 'T8s 97s 86s 75s 64s 53s' },
  { id: 'mid-suited-kqj', label: 'Medium suited K/Q/J', notation: 'K8s-K9s, Q9s, J9s', description: 'K9s K8s Q9s J9s' },
  { id: 'weak-suited-kings', label: 'Weak suited kings', notation: 'K2s-K7s', description: 'K2s to K7s' },
  { id: 'weak-suited-queens-jacks', label: 'Weak suited queens and jacks', notation: 'Q2s-Q8s, J2s-J8s', description: 'Q2s-Q8s and J2s-J8s' },
  { id: 'mid-offsuit', label: 'Medium offsuit', notation: 'K8o-K9o, Q9o, J9o, T9o, 98o', description: 'K9o K8o Q9o J9o T9o 98o' },
  { id: 'weak-offsuit-kings', label: 'Weak offsuit kings and queens', notation: 'K2o-K7o, Q4o-Q8o, J6o-J8o', description: 'K2o-K7o Q4o-Q8o J6o-J8o' },
  { id: 'rest-suited', label: 'Every other suited hand', notation: 'T2s+, 92s+, 82s+, 72s+, 62s+, 52s+, 42s+, 32s', description: 'All remaining suited hands' },
];

export interface BotRangeProfile {
  id: string;
  label: string;
  /** What the profile is meant to teach. */
  description: string;
  groupIds: readonly string[];
}

const TIGHT = ['premium-pairs', 'strong-pairs', 'big-aces-suited', 'ak-offsuit'];
const TAG = [...TIGHT, 'medium-pairs', 'good-aces-suited', 'aq-offsuit', 'good-aces-offsuit', 'kq-suited', 'suited-broadways', 'kq-offsuit'];
const LAG = [
  ...TAG, 'small-pairs', 'weak-aces-suited', 'suited-connectors', 'suited-gappers', 'offsuit-broadways', 'mid-suited-kqj',
];
const STATION = [...LAG, 'weak-suited-kings', 'weak-suited-queens-jacks', 'weak-aces-offsuit', 'mid-offsuit'];
const MANIAC = [...STATION, 'weak-offsuit-kings', 'rest-suited'];

/** Keys are the ids of `PROFILES` in src/ai/profiles.ts. */
export const BOT_RANGE_PROFILES: Record<string, BotRangeProfile> = {
  nit: {
    id: 'nit',
    label: 'Nit',
    description: 'Plays almost only premium hands: big pairs and the strongest aces. Very few bluffs.',
    groupIds: TIGHT,
  },
  tag: {
    id: 'tag',
    label: 'TAG',
    description: 'Tight and disciplined: solid pairs, strong aces and good broadways, nothing speculative.',
    groupIds: TAG,
  },
  lag: {
    id: 'lag',
    label: 'LAG',
    description: 'Looser: adds every pair, suited aces, suited connectors and offsuit broadways to put pressure.',
    groupIds: LAG,
  },
  station: {
    id: 'station',
    label: 'Station',
    description: 'Plays a very large share of hands and calls too much: weak aces, kings and queens suited and medium offsuit hands.',
    groupIds: STATION,
  },
  maniac: {
    id: 'maniac',
    label: 'Maniac',
    description: 'Plays almost anything that is not trash: nearly every suited hand and most big or medium offsuit hands.',
    groupIds: MANIAC,
  },
};

const groupById = new Map(HAND_GROUPS.map((g) => [g.id, g]));

export function groupRange(id: string): Range {
  const g = groupById.get(id);
  if (!g) throw new Error(`Unknown hand group "${id}"`);
  return parseRange(g.notation);
}

/** Preflop range of a bot profile id ("tag", "nit"...). */
export function botRange(profileId: string): Range {
  const p = BOT_RANGE_PROFILES[profileId];
  if (!p) throw new Error(`Unknown bot profile "${profileId}"`);
  return mergeRanges(...p.groupIds.map(groupRange));
}

export const botRangePercent = (profileId: string): number => rangePercent(botRange(profileId));
