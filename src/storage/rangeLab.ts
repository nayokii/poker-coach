import { readJson, writeJson } from './safeStorage';

const KEY = 'poker-coach:range-intro:v1';

/** Has the one-time Range Lab introduction been dismissed? */
export const loadRangeIntroSeen = (): boolean => readJson(KEY, (raw) => (raw === true ? true : null)) === true;
export const saveRangeIntroSeen = (): void => writeJson(KEY, true);
