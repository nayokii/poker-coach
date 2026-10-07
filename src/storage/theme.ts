import { readJson, writeJson } from './safeStorage';

/** What the user chose. "system" follows the device (prefers-color-scheme) and updates live. */
export type ThemePref = 'dark' | 'light' | 'system';
/** What is actually applied to the page. */
export type ResolvedTheme = 'dark' | 'light';

export const THEME_KEY = 'poker-coach:theme:v1';
export const DEFAULT_THEME_PREF: ThemePref = 'system';

/** Browser chrome colors (address bar, installed-app title bar): the page background of each theme. */
export const THEME_COLOR: Record<ResolvedTheme, string> = { dark: '#0a0c0f', light: '#f1eee8' };

export const sanitizeThemePref = (raw: unknown): ThemePref => (raw === 'dark' || raw === 'light' || raw === 'system' ? raw : DEFAULT_THEME_PREF);

export const loadThemePref = (): ThemePref => readJson(THEME_KEY, sanitizeThemePref) ?? DEFAULT_THEME_PREF;
export const saveThemePref = (p: ThemePref): void => writeJson(THEME_KEY, p);

/** The single rule that turns a preference into a theme. (index.html repeats it in a tiny inline script to avoid a flash.) */
export const resolveTheme = (pref: ThemePref, systemPrefersDark: boolean): ResolvedTheme =>
  pref === 'system' ? (systemPrefersDark ? 'dark' : 'light') : pref;
