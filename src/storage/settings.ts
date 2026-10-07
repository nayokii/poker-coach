import { MAX_BOTS } from '../ai';
import { readJson, writeJson } from './safeStorage';

export type AmountUnit = 'bb' | 'chips';
export type BotSpeed = 'relaxed' | 'normal' | 'fast';

export interface Settings {
  playerName: string;
  /** Number of bot opponents (1..MAX_BOTS). */
  bots: number;
  /** Big blind in chips; the small blind is half. */
  bigBlind: number;
  /** Starting stack in big blinds. */
  stackBB: number;
  unit: AmountUnit;
  botSpeed: BotSpeed;
}

export const DEFAULT_SETTINGS: Settings = {
  playerName: 'Noah',
  bots: 3,
  bigBlind: 20,
  stackBB: 100,
  unit: 'bb',
  botSpeed: 'normal',
};

export const BLIND_OPTIONS = [10, 20, 50, 100] as const;
export const STACK_OPTIONS = [20, 50, 100, 200] as const;

const KEY = 'poker-coach:settings:v1';

const int = (v: unknown, lo: number, hi: number, fallback: number): number =>
  typeof v === 'number' && Number.isInteger(v) && v >= lo && v <= hi ? v : fallback;

/** Coerces unknown data into valid settings (defaults for anything invalid). */
export function sanitizeSettings(raw: unknown): Settings {
  const r = (typeof raw === 'object' && raw !== null ? raw : {}) as Record<string, unknown>;
  const name = typeof r.playerName === 'string' ? r.playerName.trim().slice(0, 14) : '';
  return {
    playerName: name || DEFAULT_SETTINGS.playerName,
    bots: int(r.bots, 1, MAX_BOTS, DEFAULT_SETTINGS.bots),
    bigBlind: (BLIND_OPTIONS as readonly number[]).includes(r.bigBlind as number) ? (r.bigBlind as number) : DEFAULT_SETTINGS.bigBlind,
    stackBB: (STACK_OPTIONS as readonly number[]).includes(r.stackBB as number) ? (r.stackBB as number) : DEFAULT_SETTINGS.stackBB,
    unit: r.unit === 'chips' ? 'chips' : 'bb',
    botSpeed: r.botSpeed === 'relaxed' || r.botSpeed === 'fast' ? r.botSpeed : 'normal',
  };
}

export function loadSettings(): Settings {
  return readJson(KEY, sanitizeSettings) ?? { ...DEFAULT_SETTINGS };
}

export function saveSettings(s: Settings): void {
  writeJson(KEY, s);
}
