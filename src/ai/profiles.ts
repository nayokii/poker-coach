/** Tunable personality of a bot. All values are 0..1. */
export interface BotProfile {
  id: string;
  label: string;
  /** Willingness to play marginal hands. */
  looseness: number;
  /** Tendency to bet/raise rather than check/call. */
  aggression: number;
  /** Frequency of betting with weak hands. */
  bluff: number;
  /** Reluctance to fold when facing a bet. */
  stickiness: number;
}

export const PROFILES = {
  tag: { id: 'tag', label: 'TAG', looseness: 0.35, aggression: 0.65, bluff: 0.15, stickiness: 0.3 },
  lag: { id: 'lag', label: 'LAG', looseness: 0.7, aggression: 0.8, bluff: 0.35, stickiness: 0.35 },
  nit: { id: 'nit', label: 'Nit', looseness: 0.05, aggression: 0.4, bluff: 0.03, stickiness: 0.1 },
  station: { id: 'station', label: 'Station', looseness: 0.75, aggression: 0.15, bluff: 0.02, stickiness: 0.95 },
  maniac: { id: 'maniac', label: 'Maniac', looseness: 0.9, aggression: 0.95, bluff: 0.5, stickiness: 0.5 },
} satisfies Record<string, BotProfile>;

export interface RosterEntry {
  name: string;
  profile: BotProfile;
}

const ROSTER: RosterEntry[] = [
  { name: 'Atlas', profile: PROFILES.tag },
  { name: 'Mira', profile: PROFILES.lag },
  { name: 'Kenji', profile: PROFILES.nit },
  { name: 'Sol', profile: PROFILES.station },
  { name: 'Ivo', profile: PROFILES.maniac },
];

export const MAX_BOTS = ROSTER.length;

export function botRoster(count: number): RosterEntry[] {
  return ROSTER.slice(0, Math.max(0, Math.min(count, MAX_BOTS)));
}
