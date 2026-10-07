import { readJson, removeKey, writeJson } from './safeStorage';

/** Minimal snapshot taken between hands so a session can be resumed after a reload. */
export interface SavedSession {
  version: 1;
  players: { id: string; name: string; stack: number }[];
  bigBlind: number;
  /** Seat of the button of the last hand played. */
  button: number;
  handsPlayed: number;
  /** Hero chips when the session started, to compute the session result. */
  startStack: number;
}

const KEY = 'poker-coach:session:v1';

function validate(raw: unknown): SavedSession | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const r = raw as Partial<SavedSession>;
  if (r.version !== 1 || !Array.isArray(r.players) || r.players.length < 2) return null;
  const okPlayers = r.players.every(
    (p) => p && typeof p.id === 'string' && typeof p.name === 'string' && Number.isInteger(p.stack) && p.stack >= 0,
  );
  const ints = [r.bigBlind, r.button, r.handsPlayed, r.startStack].every((n) => Number.isInteger(n));
  if (!okPlayers || !ints || (r.bigBlind as number) < 2 || (r.button as number) >= r.players.length) return null;
  if (r.players.filter((p) => p.stack > 0).length < 2 || (r.players[0]?.stack ?? 0) <= 0) return null;
  return r as SavedSession;
}

export const loadSession = (): SavedSession | null => readJson(KEY, validate);
export const saveSession = (s: SavedSession): void => writeJson(KEY, s);
export const clearSession = (): void => removeKey(KEY);
