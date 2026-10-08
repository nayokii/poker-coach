// @vitest-environment jsdom
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { readFileSync } from 'node:fs';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { parseCards } from '../../engine';
import { comboCount, handClassAt, parseRange, totalWeight, withoutDeadCards } from '../../coach/math';
import { botRange, buildMatrix, cellSelection, emptyRange, rangePercent, summarizeRange } from '../../coach/ranges';
import { newGame, play, rigged } from '../../engine/__tests__/helpers';
import { DEFAULT_SETTINGS, THEME_KEY, loadRangeIntroSeen, loadThemePref, resolveTheme, sanitizeThemePref } from '../../storage';
import { SettingsModal } from '../app/SettingsModal';
import { CoachLive } from '../coach/CoachLive';
import { ToastProvider } from '../design-system';
import { FormatProvider } from '../format';
import { RangeLab } from '../ranges/RangeLab';
import { RangeSummary } from '../ranges/RangeSummary';
import { explainCell } from '../ranges/cellText';
import { ThemeProvider, applyTheme, useTheme } from '../theme/ThemeProvider';

/** A controllable prefers-color-scheme. */
function mockSystemTheme(dark: boolean) {
  const listeners = new Set<() => void>();
  const mq = {
    matches: dark,
    media: '(prefers-color-scheme: dark)',
    addEventListener: (_: string, fn: () => void) => listeners.add(fn),
    removeEventListener: (_: string, fn: () => void) => listeners.delete(fn),
  };
  window.matchMedia = vi.fn(() => mq) as unknown as typeof window.matchMedia;
  return (nextDark: boolean) => {
    mq.matches = nextDark;
    act(() => listeners.forEach((fn) => fn()));
  };
}

beforeEach(() => {
  localStorage.clear();
  document.documentElement.removeAttribute('data-theme');
  mockSystemTheme(true);
});

describe('summarizeRange: every figure is an engine figure', () => {
  it('equals the engine functions, with and without known cards', () => {
    const r = parseRange('QQ+, AKs');
    const dead = parseCards('As Kd');
    const s = summarizeRange(r, dead);
    expect(s.combos).toBe(comboCount(r));
    expect(s.effectiveCombos).toBe(totalWeight(r));
    expect(s.percent).toBe(rangePercent(r));
    expect(s.possibleCombos).toBe(comboCount(withoutDeadCards(r, dead)));
    expect(s.combos).toBe(3 * 6 + 4);
    expect(s.possibleCombos).toBeLessThan(s.combos);
  });

  it('percent brushes count as effective combos, not as whole ones', () => {
    const half = { entries: parseRange('QQ').entries.map((e) => ({ ...e, weight: 0.5 })) };
    expect(summarizeRange(half).combos).toBe(6);
    expect(summarizeRange(half).effectiveCombos).toBeCloseTo(3, 12);
  });

  it('an empty range is 0 / 0 %', () => {
    expect(summarizeRange(emptyRange())).toEqual({ combos: 0, effectiveCombos: 0, percent: 0, possibleCombos: 0 });
  });
});

describe('RangeSummary display', () => {
  it('shows the name, the percent with a decimal comma, the combos out of 1326 and the hypothesis warning', () => {
    const r = botRange('tag');
    render(<RangeSummary range={r} name="TAG" slot="A" />);
    const box = screen.getByRole('region', { name: 'Range actuelle' });
    expect(box).toHaveTextContent('TAG');
    const s = summarizeRange(r);
    expect(box.textContent!.replace(/ /g, ' ')).toContain(`${s.percent.toFixed(1).replace('.', ',')} % des mains`);
    expect(box).toHaveTextContent(`/ 1326 combos`);
    expect(box).toHaveTextContent('hypothèse, pas une information connue');
  });

  it('is "Range personnalisée" without a name, and "Aucune main choisie" when empty', () => {
    const { rerender } = render(<RangeSummary range={parseRange('AA')} name={null} />);
    expect(screen.getByRole('heading', { name: 'Range personnalisée' })).toBeInTheDocument();
    rerender(<RangeSummary range={emptyRange()} name={null} />);
    expect(screen.getByRole('heading', { name: 'Aucune main choisie' })).toBeInTheDocument();
  });

  it('with known cards, says how many combos remain possible', () => {
    const r = parseRange('AKs');
    render(<RangeSummary range={r} name={null} dead={parseCards('As Jd 4c')} />);
    expect(screen.getByRole('region', { name: 'Range actuelle' })).toHaveTextContent('3 combos restent possibles');
  });
});

describe('cell states and combos available after blockers', () => {
  const AKs = handClassAt(14, 13);
  const AA = handClassAt(14, 14);

  it('classifies none / full / uniform / subset / disabled', () => {
    expect(cellSelection(emptyRange(), [], AKs).kind).toBe('none');
    expect(cellSelection(parseRange('AKs'), [], AKs).kind).toBe('full');
    const half = { entries: parseRange('AKs').entries.map((e) => ({ ...e, weight: 0.5 })) };
    expect(cellSelection(half, [], AKs)).toMatchObject({ kind: 'uniform', percent: 50 });
    const some = { entries: parseRange('AKs').entries.slice(0, 2) };
    expect(cellSelection(some, [], AKs)).toMatchObject({ kind: 'subset', selectedCombos: 2, percent: 50 });
    expect(cellSelection(parseRange('AA'), parseCards('As Ah Ad Ac'), AA).kind).toBe('disabled');
  });

  it('known cards remove combos: AKs with the ace of spades has 3 of 4 combos', () => {
    const sel = cellSelection(parseRange('AKs'), parseCards('As'), AKs);
    expect(sel).toMatchObject({ totalCombos: 4, availableCombos: 3, blockedCombos: 1 });
    const matrixCell = buildMatrix(parseRange('AKs'), parseCards('As')).flat().find((c) => c.label === 'AKs')!;
    expect(matrixCell.availableCombos).toBe(sel.availableCombos);
  });

  it('explains it in French, "2 combos disponibles sur 4 normalement"', () => {
    // As removes AsKs, Kh removes AhKh: 2 of the 4 suited combos remain
    const sel = cellSelection(parseRange('AKs'), parseCards('As Kh'), AKs);
    const words = explainCell(AKs, sel);
    expect(sel.blockedCombos).toBe(2);
    expect(words.blocked?.available).toBe('2 combos disponibles sur 4 normalement');
    expect(words.blocked?.reason).toMatch(/cartes.*board/);
  });

  it('"50 % de cette main est dans la range" and "6 / 12 combos sélectionnés"', () => {
    const AKo = handClassAt(13, 14);
    const half = explainCell(AA, cellSelection({ entries: parseRange('AA').entries.map((e) => ({ ...e, weight: 0.5 })) }, [], AA));
    expect(half.headline).toBe('50 % de cette main est dans la range.');
    const sel = cellSelection({ entries: parseRange('AKo').entries.slice(0, 6) }, [], AKo);
    expect(explainCell(AKo, sel).detail).toContain('6 / 12 combos');
  });
});

describe('Range Lab first-use introduction', () => {
  const lab = () =>
    render(
      <ToastProvider>
        <RangeLab />
      </ToastProvider>,
    );

  it('shows on first open, with its three steps, and once dismissed never comes back', async () => {
    const user = userEvent.setup();
    const first = lab();
    const intro = screen.getByRole('region', { name: 'Bienvenue dans Range Lab' });
    expect(within(intro).getAllByRole('listitem')).toHaveLength(3);
    expect(loadRangeIntroSeen()).toBe(false);
    await user.click(within(intro).getByRole('button', { name: 'J’ai compris' }));
    expect(screen.queryByRole('region', { name: 'Bienvenue dans Range Lab' })).toBeNull();
    expect(loadRangeIntroSeen()).toBe(true);
    first.unmount();
    lab();
    expect(screen.queryByRole('region', { name: 'Bienvenue dans Range Lab' })).toBeNull();
  });

  it('the help is optional: collapsed by default, and opens the matrix guide', async () => {
    const user = userEvent.setup();
    lab();
    const toggle = screen.getByRole('button', { name: 'Comprendre les ranges' });
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByText(/l’ensemble des mains qu’un joueur peut avoir/)).toBeNull();
    await user.click(toggle);
    expect(screen.getByText('Une range, c’est l’ensemble des mains qu’un joueur peut avoir dans une situation.')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Comprendre la matrice' }));
    const modal = screen.getByRole('dialog');
    expect(modal).toHaveTextContent('Diagonale');
    expect(modal).toHaveTextContent('Au-dessus');
    expect(modal).toHaveTextContent('En dessous');
    await user.click(within(modal).getByRole('button', { name: 'J’ai compris' }));
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('shows the active range summary and a cell explanation on tap', () => {
    lab();
    expect(screen.getByRole('region', { name: 'Range actuelle' })).toHaveTextContent('Aucune main choisie');
    const aks = document.querySelector('[data-cell="AKs"]') as HTMLElement;
    fireEvent.pointerDown(aks);
    fireEvent.pointerUp(aks);
    expect(screen.getByRole('region', { name: 'Range actuelle' })).toHaveTextContent('Range personnalisée');
    expect(screen.getByRole('region', { name: 'Main AKs' })).toHaveTextContent('100 % de cette main est dans la range.');
  });
});

describe('theme preference', () => {
  function Probe() {
    const { pref, resolved, setPref } = useTheme();
    return (
      <div>
        <span data-testid="state">{`${pref}/${resolved}`}</span>
        <button onClick={() => setPref('light')}>clair</button>
        <button onClick={() => setPref('dark')}>sombre</button>
        <button onClick={() => setPref('system')}>système</button>
      </div>
    );
  }
  const state = () => screen.getByTestId('state').textContent;

  it('resolves the preference with one rule and ignores garbage', () => {
    expect(resolveTheme('system', true)).toBe('dark');
    expect(resolveTheme('system', false)).toBe('light');
    expect(resolveTheme('light', true)).toBe('light');
    expect(resolveTheme('dark', false)).toBe('dark');
    expect(sanitizeThemePref('purple')).toBe('system');
    expect(sanitizeThemePref(null)).toBe('system');
  });

  it('defaults to the system theme and applies it on the document', () => {
    mockSystemTheme(false);
    render(<ThemeProvider><Probe /></ThemeProvider>);
    expect(state()).toBe('system/light');
    expect(document.documentElement.dataset.theme).toBe('light');
    expect(document.querySelector('meta[name="theme-color"]')).toHaveAttribute('content', '#f1eee8');
  });

  it('changes immediately, persists, and comes back after a reload', async () => {
    const user = userEvent.setup();
    const first = render(<ThemeProvider><Probe /></ThemeProvider>);
    await user.click(screen.getByRole('button', { name: 'clair' }));
    expect(state()).toBe('light/light');
    expect(document.documentElement.dataset.theme).toBe('light');
    expect(JSON.parse(localStorage.getItem(THEME_KEY)!)).toBe('light');
    first.unmount();

    document.documentElement.removeAttribute('data-theme');
    render(<ThemeProvider><Probe /></ThemeProvider>);
    expect(loadThemePref()).toBe('light');
    expect(state()).toBe('light/light');
    expect(document.documentElement.dataset.theme).toBe('light');
  });

  it('system mode follows the device live, an explicit choice does not', async () => {
    const user = userEvent.setup();
    const setSystem = mockSystemTheme(true);
    render(<ThemeProvider><Probe /></ThemeProvider>);
    expect(state()).toBe('system/dark');
    setSystem(false);
    expect(state()).toBe('system/light');
    expect(document.documentElement.dataset.theme).toBe('light');
    await user.click(screen.getByRole('button', { name: 'sombre' }));
    setSystem(false);
    expect(state()).toBe('dark/dark');
    await user.click(screen.getByRole('button', { name: 'système' }));
    expect(state()).toBe('system/light');
  });

  it('applyTheme writes data-theme, color-scheme and the browser chrome color', () => {
    applyTheme('dark');
    expect(document.documentElement.dataset.theme).toBe('dark');
    expect(document.documentElement.style.colorScheme).toBe('dark');
    expect(document.querySelector('meta[name="theme-color"]')).toHaveAttribute('content', '#0a0c0f');
  });

  it('Settings offers Sombre / Clair / Système and applies the choice at once', async () => {
    const user = userEvent.setup();
    render(
      <ThemeProvider>
        <SettingsModal settings={DEFAULT_SETTINGS} onChange={() => {}} onClose={() => {}} />
      </ThemeProvider>,
    );
    const group = screen.getByRole('radiogroup', { name: 'Apparence' });
    expect(within(group).getAllByRole('radio').map((r) => r.getAttribute('aria-label') ?? r.textContent)).toEqual(['Sombre', 'Clair', 'Système']);
    expect(within(group).getByRole('radio', { name: 'Système' })).toBeChecked();
    expect(screen.getByText('Suit le réglage de ton appareil.')).toBeInTheDocument();
    await user.click(within(group).getByRole('radio', { name: 'Clair' }));
    expect(document.documentElement.dataset.theme).toBe('light');
    expect(screen.queryByText('Suit le réglage de ton appareil.')).toBeNull();
    await user.click(within(group).getByRole('radio', { name: 'Sombre' }));
    expect(document.documentElement.dataset.theme).toBe('dark');
  });
});

describe('light and dark tokens keep readable contrast', () => {
  const css = readFileSync('src/ui/styles/tokens.css', 'utf8');
  const block = (selector: string): Record<string, string> => {
    const start = css.indexOf(selector);
    const body = css.slice(css.indexOf('{', start) + 1, css.indexOf('\n}', start));
    return Object.fromEntries([...body.matchAll(/--([\w-]+):\s*(#[0-9a-fA-F]{6})\s*;/g)].map((m) => [m[1]!, m[2]!]));
  };
  const lum = (hex: string): number => {
    const c = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
    return 0.2126 * c[0]! + 0.7152 * c[1]! + 0.0722 * c[2]!;
  };
  const ratio = (a: string, b: string): number => {
    const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x);
    return (hi! + 0.05) / (lo! + 0.05);
  };
  const dark = block(":root[data-theme='dark']");
  const light = { ...dark, ...block(":root[data-theme='light']") };

  for (const [name, t] of [['dark', dark], ['light', light]] as const) {
    it(`${name}: text on every surface reaches WCAG AA (4.5:1)`, () => {
      for (const surface of ['bg', 'surface-1', 'surface-2', 'surface-3']) {
        for (const fg of ['text', 'text-2', 'accent-text', ...(surface === 'surface-3' ? [] : ['text-3'])]) {
          expect(ratio(t[fg]!, t[surface]!), `${fg} on ${surface}`).toBeGreaterThanOrEqual(4.5);
        }
      }
    });
    it(`${name}: status colors and the primary button label are readable`, () => {
      expect(ratio(t['danger']!, t['surface-1']!)).toBeGreaterThanOrEqual(4.5);
      expect(ratio(t['gain']!, t['surface-1']!)).toBeGreaterThanOrEqual(4.5);
      expect(ratio(t['accent-ink']!, t['accent']!)).toBeGreaterThanOrEqual(4.5);
    });
  }
});

describe('Coach ↔ Range Lab', () => {
  const mk = () => newGame([2000, 2000, 2000], { sb: 10, bb: 20 });
  const flop = () => play(rigged(mk(), ['As Ks', '7c 2d', '8c 3d'], 'Jh 8h 4c 4s 5s'), ['call'], ['call'], ['check']);
  const wrap = (ui: React.ReactNode) => <FormatProvider bigBlind={20} mode="bb">{ui}</FormatProvider>;

  it('names the assumed range as a hypothesis and offers "Modifier" with the right context', async () => {
    const user = userEvent.setup();
    const g = flop();
    const onEditRange = vi.fn();
    render(wrap(<CoachLive variant="aside" game={g} visibleBoard={g.board} botProfiles={{ 1: 'tag', 2: 'tag' }} onEditRange={onEditRange} />));
    expect(screen.queryByRole('button', { name: 'Modifier' })).toBeNull(); // nothing assumed, nothing to edit
    await user.click(screen.getByRole('button', { name: 'Ajouter une hypothèse' }));
    expect(onEditRange).toHaveBeenCalledTimes(1); // the existing Range Lab flow opens
    expect(screen.getByText(/Range adverse :/)).toHaveTextContent('Range adverse : TAG · hypothèse');
    await user.click(screen.getByRole('button', { name: 'Modifier' }));
    expect(onEditRange).toHaveBeenCalledTimes(2);
    const req = onEditRange.mock.calls[1]![0];
    expect(req.profileId).toBe('tag');
    expect(req.hero).toHaveLength(2);
    expect(req.board).toHaveLength(3);
  });

  it('Range Lab receives it: the profile range in A, the cards filled in, and a new request replaces the previous one', () => {
    const { rerender } = render(
      <ToastProvider>
        <RangeLab request={{ id: 1, profileId: 'tag', hero: parseCards('As Ks'), board: parseCards('Jh 8h 4c') }} />
      </ToastProvider>,
    );
    expect(screen.getByRole('region', { name: 'Range actuelle' })).toHaveTextContent('TAG');
    expect(screen.getByLabelText('Cartes du héros')).toHaveValue('As Ks');
    expect(screen.getByLabelText('Board')).toHaveValue('Jh 8h 4c');
    expect(summarizeRange(botRange('tag')).combos).toBeGreaterThan(0);
    rerender(
      <ToastProvider>
        <RangeLab request={{ id: 2, profileId: 'nit', hero: [], board: [] }} />
      </ToastProvider>,
    );
    expect(screen.getByRole('region', { name: 'Range actuelle' })).toHaveTextContent('Nit');
    expect(screen.getByLabelText('Board')).toHaveValue('');
  });
});

describe('Range Engine non-regression', () => {
  it('parses and prints the same ranges as before', () => {
    expect(comboCount(parseRange('22+, AJs+, KQs, AQo+'))).toBe(13 * 6 + 3 * 4 + 4 + 2 * 12);
    expect(comboCount(parseRange('AA'))).toBe(6);
    expect(comboCount(parseRange('AKs'))).toBe(4);
    expect(comboCount(parseRange('AKo'))).toBe(12);
    expect(rangePercent(parseRange('AA'))).toBeCloseTo((6 / 1326) * 100, 10);
  });

  it('the matrix still has 169 cells whose combos add up to 1326', () => {
    const cells = buildMatrix(emptyRange(), []).flat();
    expect(cells).toHaveLength(169);
    expect(cells.reduce((n, c) => n + c.totalCombos, 0)).toBe(1326);
  });
});
