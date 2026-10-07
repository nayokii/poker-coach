import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { THEME_COLOR, loadThemePref, resolveTheme, saveThemePref, type ResolvedTheme, type ThemePref } from '../../storage';

const QUERY = '(prefers-color-scheme: dark)';

const systemPrefersDark = (): boolean => (typeof window !== 'undefined' && typeof window.matchMedia === 'function' ? window.matchMedia(QUERY).matches : true);

/** Writes the theme on the document: the data attribute the tokens key on, the native color-scheme and the browser chrome color. */
export function applyTheme(theme: ResolvedTheme, doc: Document = document): void {
  const root = doc.documentElement;
  root.dataset.theme = theme;
  root.style.colorScheme = theme;
  let meta = doc.querySelector<HTMLMetaElement>('meta[name="theme-color"]');
  if (!meta) {
    meta = doc.createElement('meta');
    meta.name = 'theme-color';
    doc.head.appendChild(meta);
  }
  meta.content = THEME_COLOR[theme];
}

export interface ThemeContextValue {
  pref: ThemePref;
  resolved: ResolvedTheme;
  setPref: (p: ThemePref) => void;
}

const ThemeContext = createContext<ThemeContextValue>({ pref: 'system', resolved: 'dark', setPref: () => {} });
export const useTheme = (): ThemeContextValue => useContext(ThemeContext);

/** Owns the theme preference: persists it, follows the system when asked, applies changes immediately (no reload). */
export function ThemeProvider({ children }: { children: ReactNode }) {
  const [pref, setPrefState] = useState<ThemePref>(loadThemePref);
  const [systemDark, setSystemDark] = useState<boolean>(systemPrefersDark);

  useEffect(() => {
    if (typeof window.matchMedia !== 'function') return;
    const mq = window.matchMedia(QUERY);
    const on = (): void => setSystemDark(mq.matches);
    on();
    mq.addEventListener?.('change', on);
    return () => mq.removeEventListener?.('change', on);
  }, []);

  const resolved = resolveTheme(pref, systemDark);
  useEffect(() => applyTheme(resolved), [resolved]);

  const setPref = useCallback((p: ThemePref) => {
    setPrefState(p);
    saveThemePref(p);
  }, []);

  const value = useMemo(() => ({ pref, resolved, setPref }), [pref, resolved, setPref]);
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}
