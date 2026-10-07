import { readJson, writeJson } from './safeStorage';

export type ExplanationLevelPref = 1 | 2 | 3;

export interface CoachPrefs {
  /** Depth of the "Pourquoi ?" explanation: 1 Simple, 2 Approfondi, 3 Avancé. */
  level: ExplanationLevelPref;
  /** Show the analysis paths each sentence comes from. */
  showSources: boolean;
}

export const DEFAULT_COACH_PREFS: CoachPrefs = { level: 1, showSources: false };

const KEY = 'poker-coach:coach-prefs:v1';

export function sanitizeCoachPrefs(raw: unknown): CoachPrefs {
  const r = (typeof raw === 'object' && raw !== null ? raw : {}) as Record<string, unknown>;
  return {
    level: r.level === 2 || r.level === 3 ? r.level : 1,
    showSources: r.showSources === true,
  };
}

export const loadCoachPrefs = (): CoachPrefs => readJson(KEY, sanitizeCoachPrefs) ?? { ...DEFAULT_COACH_PREFS };
export const saveCoachPrefs = (p: CoachPrefs): void => writeJson(KEY, p);
