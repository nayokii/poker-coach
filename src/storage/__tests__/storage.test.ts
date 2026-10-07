// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest';
import {
  DEFAULT_SETTINGS, clearSession, loadSession, loadSettings, sanitizeSettings, saveSession, saveSettings, type SavedSession,
} from '..';

beforeEach(() => localStorage.clear());

describe('settings', () => {
  it('falls back to defaults when nothing is stored', () => {
    expect(loadSettings()).toEqual(DEFAULT_SETTINGS);
  });

  it('round-trips valid settings', () => {
    const s = { ...DEFAULT_SETTINGS, bots: 5, bigBlind: 50, stackBB: 200, unit: 'chips' as const, botSpeed: 'fast' as const, playerName: 'Léa' };
    saveSettings(s);
    expect(loadSettings()).toEqual(s);
  });

  it('sanitises garbage field by field', () => {
    expect(sanitizeSettings({ bots: 99, bigBlind: 7, stackBB: 'x', unit: 'zzz', botSpeed: 'warp', playerName: '   ' })).toEqual(DEFAULT_SETTINGS);
    expect(sanitizeSettings(null)).toEqual(DEFAULT_SETTINGS);
    expect(sanitizeSettings({ playerName: 'A very long player name indeed' }).playerName).toHaveLength(14);
  });

  it('survives corrupted JSON', () => {
    localStorage.setItem('poker-coach:settings:v1', '{not json');
    expect(loadSettings()).toEqual(DEFAULT_SETTINGS);
  });
});

describe('session snapshot', () => {
  const snap: SavedSession = {
    version: 1,
    players: [
      { id: 'hero', name: 'Noah', stack: 2500 },
      { id: 'bot1', name: 'Atlas', stack: 1500 },
      { id: 'bot2', name: 'Mira', stack: 2000 },
    ],
    bigBlind: 20,
    button: 1,
    handsPlayed: 4,
    startStack: 2000,
  };

  it('round-trips and clears', () => {
    expect(loadSession()).toBeNull();
    saveSession(snap);
    expect(loadSession()).toEqual(snap);
    clearSession();
    expect(loadSession()).toBeNull();
  });

  it('rejects invalid snapshots', () => {
    const bad: unknown[] = [
      { ...snap, version: 2 },
      { ...snap, players: [snap.players[0]] },
      { ...snap, button: 9 },
      { ...snap, players: [{ id: 'hero', name: 'N', stack: 0 }, ...snap.players.slice(1)] }, // busted hero
      { ...snap, players: snap.players.map((p, i) => (i === 0 ? p : { ...p, stack: 0 })) }, // nobody left
      { ...snap, players: [{ id: 1, name: 'x', stack: 5 }, ...snap.players] },
    ];
    for (const b of bad) {
      localStorage.setItem('poker-coach:session:v1', JSON.stringify(b));
      expect(loadSession()).toBeNull();
    }
  });
});
