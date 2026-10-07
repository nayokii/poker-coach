import { readJson, writeJson } from './safeStorage';

/** A range saved by the user. `text` is range notation (parsed again by the math engine when loaded). */
export interface SavedRange {
  id: string;
  name: string;
  text: string;
  updatedAt: number;
}

const KEY = 'poker-coach:ranges:v1';
export const MAX_SAVED_RANGES = 50;

function sanitize(raw: unknown): SavedRange[] {
  if (!Array.isArray(raw)) return [];
  const out: SavedRange[] = [];
  for (const r of raw) {
    if (typeof r !== 'object' || r === null) continue;
    const { id, name, text, updatedAt } = r as Partial<SavedRange>;
    if (typeof id !== 'string' || typeof name !== 'string' || typeof text !== 'string') continue;
    const n = name.trim().slice(0, 24);
    if (!n || text.length > 6000) continue;
    out.push({ id, name: n, text, updatedAt: typeof updatedAt === 'number' ? updatedAt : 0 });
  }
  return out.slice(0, MAX_SAVED_RANGES);
}

export const loadSavedRanges = (): SavedRange[] => readJson(KEY, sanitize) ?? [];

/** Saves (or replaces, matching the name case-insensitively) and returns the new list, newest first. */
export function saveRange(name: string, text: string, now: number = Date.now()): SavedRange[] {
  const n = name.trim().slice(0, 24);
  if (!n) throw new Error('A range needs a name');
  const list = loadSavedRanges();
  const existing = list.find((r) => r.name.toLowerCase() === n.toLowerCase());
  const entry: SavedRange = { id: existing?.id ?? `r${now.toString(36)}${Math.floor(list.length)}`, name: n, text, updatedAt: now };
  const next = [entry, ...list.filter((r) => r.id !== entry.id)].slice(0, MAX_SAVED_RANGES);
  writeJson(KEY, next);
  return next;
}

export function deleteSavedRange(id: string): SavedRange[] {
  const next = loadSavedRanges().filter((r) => r.id !== id);
  writeJson(KEY, next);
  return next;
}
