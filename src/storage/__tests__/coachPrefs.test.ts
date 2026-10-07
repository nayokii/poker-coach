// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest';
import { DEFAULT_COACH_PREFS, loadCoachPrefs, sanitizeCoachPrefs, saveCoachPrefs } from '..';

beforeEach(() => localStorage.clear());

describe('coach preferences', () => {
  it('default to the Simple level without sources', () => {
    expect(loadCoachPrefs()).toEqual(DEFAULT_COACH_PREFS);
    expect(DEFAULT_COACH_PREFS).toEqual({ level: 1, showSources: false });
  });

  it('round-trip and sanitise garbage', () => {
    saveCoachPrefs({ level: 3, showSources: true });
    expect(loadCoachPrefs()).toEqual({ level: 3, showSources: true });
    expect(sanitizeCoachPrefs({ level: 9, showSources: 'yes' })).toEqual({ level: 1, showSources: false });
    expect(sanitizeCoachPrefs(null)).toEqual({ level: 1, showSources: false });
    localStorage.setItem('poker-coach:coach-prefs:v1', '{oops');
    expect(loadCoachPrefs()).toEqual(DEFAULT_COACH_PREFS);
  });
});
