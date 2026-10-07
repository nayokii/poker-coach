/** localStorage access that never throws (private mode, blocked storage, quota...). */
export function readJson<T>(key: string, validate: (raw: unknown) => T | null): T | null {
  try {
    const text = globalThis.localStorage?.getItem(key);
    if (!text) return null;
    return validate(JSON.parse(text));
  } catch {
    return null;
  }
}

export function writeJson(key: string, value: unknown): void {
  try {
    globalThis.localStorage?.setItem(key, JSON.stringify(value));
  } catch {
    /* storage unavailable: the app keeps working without persistence */
  }
}

export function removeKey(key: string): void {
  try {
    globalThis.localStorage?.removeItem(key);
  } catch {
    /* ignore */
  }
}
