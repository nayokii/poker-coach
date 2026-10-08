// @vitest-environment jsdom
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { readFileSync } from 'node:fs';
import { useState } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { DecisionProvider } from '../../ai';
import type { GameState } from '../../engine';
import { newGame, play, rigged } from '../../engine/__tests__/helpers';
import { DEFAULT_SETTINGS } from '../../storage';
import { ToastProvider } from '../design-system';
import { CoachLive } from '../coach/CoachLive';
import { analysisKey, buildCoachAnalysis, decisionKey, opponentProfiles } from '../coach/liveAnalysis';
import { FormatProvider } from '../format';
import { GameScreen } from '../game/GameScreen';
import { ThemeProvider } from '../theme/ThemeProvider';

beforeEach(() => {
  localStorage.clear();
  document.documentElement.removeAttribute('data-theme');
});

const mk = () => newGame([2000, 2000, 2000], { sb: 10, bb: 20 });
const preflop = (): GameState => rigged(mk(), ['Ah 5h', '7c 2d', '8c 3d'], 'Kh 9h 2c 4s 5s');
const flop = (): GameState => play(preflop(), ['call'], ['call'], ['check']);
const facing = (): GameState => play(flop(), ['bet', 40]);
const turn = (): GameState => play(flop(), ['check'], ['check'], ['check']);
const profiles = { 1: 'tag', 2: 'lag' };
const atLevel = (level: 1 | 2 | 3) => localStorage.setItem('poker-coach:coach-prefs:v1', JSON.stringify({ level, showSources: false }));

const wrap = (ui: React.ReactNode) => (
  <ThemeProvider>
    <FormatProvider bigBlind={20} mode="bb">
      {ui}
    </FormatProvider>
  </ThemeProvider>
);

/** The sheet, controlled the way GameScreen controls it. */
function Sheet({ game, start = false, onEditRange }: { game: GameState; start?: boolean; onEditRange?: React.ComponentProps<typeof CoachLive>['onEditRange'] }) {
  const [open, setOpen] = useState(start);
  return <CoachLive variant="sheet" open={open} onOpenChange={setOpen} game={game} visibleBoard={game.board} botProfiles={profiles} onEditRange={onEditRange} />;
}
const bar = () => within(screen.getByRole('region', { name: 'Coach' })).getByRole('button');
const analysis = () => screen.getByRole('region', { name: 'Analyse' });
const items = () => [...analysis().querySelectorAll('.why__text')].map((n) => n.textContent ?? '');

describe('Coach live: the closed bar', () => {
  it('is one slim, useful line, not a summary', () => {
    render(wrap(<Sheet game={flop()} />));
    const b = bar();
    expect(b).toHaveAttribute('aria-expanded', 'false');
    expect(b).toHaveTextContent('Coach');
    expect(b).toHaveTextContent('Analyse ta situation');
    expect(b.textContent).toMatch(/\d+ infos/);
    expect(screen.queryByRole('region', { name: 'Analyse' })).toBeNull();
  });

  it('says so when there is no hand to analyse', () => {
    const over = play(preflop(), ['raise', 60], ['fold'], ['fold']);
    render(wrap(<Sheet game={over} />));
    expect(bar()).toHaveTextContent('Disponible pendant la main');
  });
});

describe('Coach live: opening and closing', () => {
  it('a tap opens the panel under the game and the close button / Escape / a swipe down close it', async () => {
    const user = userEvent.setup();
    render(wrap(<Sheet game={flop()} />));
    await user.click(bar());
    expect(screen.getByRole('region', { name: 'Coach' })).toBeInTheDocument();
    expect(analysis()).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Fermer le Coach' })).toHaveFocus();

    await user.click(screen.getByRole('button', { name: 'Fermer le Coach' }));
    expect(bar()).toHaveAttribute('aria-expanded', 'false');
    expect(bar()).toHaveFocus(); // focus goes back where it came from

    await user.click(bar());
    await user.keyboard('{Escape}');
    expect(bar()).toHaveAttribute('aria-expanded', 'false');

    await user.click(bar());
    const head = screen.getByRole('heading', { name: 'Coach' }).parentElement!;
    fireEvent.pointerDown(head, { clientY: 100 });
    fireEvent.pointerUp(head, { clientY: 110 }); // too short: stays open
    expect(screen.getByRole('button', { name: 'Fermer le Coach' })).toBeInTheDocument();
    fireEvent.pointerDown(head, { clientY: 100 });
    fireEvent.pointerUp(head, { clientY: 180 });
    expect(bar()).toHaveAttribute('aria-expanded', 'false');
  });

  it('the aside variant (wide screens) is always open and has no close button', () => {
    render(wrap(<CoachLive variant="aside" game={flop()} visibleBoard={flop().board} botProfiles={profiles} />));
    expect(analysis()).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Fermer le Coach' })).toBeNull();
  });
});

describe('Coach live: it follows the hand', () => {
  it('analyses the current state: preflop hand, then the flop, then the turn', () => {
    const g0 = preflop();
    const { rerender } = render(wrap(<CoachLive variant="aside" game={g0} visibleBoard={g0.board} botProfiles={profiles} />));
    expect(analysis()).toHaveTextContent('Ta main de départ est');
    const f = flop();
    rerender(wrap(<CoachLive variant="aside" game={f} visibleBoard={f.board} botProfiles={profiles} />));
    return waitFor(() => {
      expect(analysis()).toHaveTextContent(/flop/);
      expect(analysis().textContent).not.toContain('Ta main de départ est');
    }).then(async () => {
      const t = turn();
      rerender(wrap(<CoachLive variant="aside" game={t} visibleBoard={t.board} botProfiles={profiles} />));
      await waitFor(() => expect(analysis()).toHaveTextContent(/turn/));
    });
  });

  it('recomputes when the pot or the action changes, and not when nothing relevant changed', async () => {
    const f = flop();
    const { rerender } = render(wrap(<CoachLive variant="aside" game={f} visibleBoard={f.board} botProfiles={profiles} />));
    const before = items();
    const b = facing();
    rerender(wrap(<CoachLive variant="aside" game={b} visibleBoard={b.board} botProfiles={profiles} />));
    await waitFor(() => expect(items()).not.toEqual(before));
    expect(analysis()).toHaveTextContent(/payer/); // there is now something to call
    expect(b.pot).toBeGreaterThan(f.pot);
  });

  it('the keys that drive recomputation change exactly when they should', () => {
    const f = flop();
    const b = facing();
    const t = turn();
    expect(analysisKey(f, f.board)).toBe(analysisKey(b, b.board)); // an action is not a new analysis
    expect(analysisKey(f, f.board)).not.toBe(analysisKey(t, t.board)); // a new street is
    expect(decisionKey(f, f.board)).not.toBe(decisionKey(b, b.board)); // but it is a new decision point
  });

  it('a new street while the bar is closed adds a discreet dot, which goes away once opened', async () => {
    const user = userEvent.setup();
    const f = flop();
    const { rerender } = render(wrap(<CoachLive variant="sheet" open={false} game={f} visibleBoard={f.board} botProfiles={profiles} />));
    expect(screen.queryByRole('img', { name: 'Nouvelle analyse disponible' })).toBeNull();
    const t = turn();
    rerender(wrap(<CoachLive variant="sheet" open={false} game={t} visibleBoard={t.board} botProfiles={profiles} />));
    expect(await screen.findByRole('img', { name: 'Nouvelle analyse disponible' })).toBeInTheDocument();
    rerender(wrap(<CoachLive variant="sheet" open game={t} visibleBoard={t.board} botProfiles={profiles} />));
    rerender(wrap(<CoachLive variant="sheet" open={false} game={t} visibleBoard={t.board} botProfiles={profiles} />));
    expect(screen.queryByRole('img', { name: 'Nouvelle analyse disponible' })).toBeNull();
    void user;
  });

  it('buildCoachAnalysis is the existing analysis (null once the hand is over)', () => {
    const f = flop();
    const a = buildCoachAnalysis(f, f.board, 0, profiles, 'none');
    expect(a?.situation.street).toBe('flop');
    expect(a?.equity.status).toBe('unknown_opponent_range');
    expect(buildCoachAnalysis(f, f.board, 0, profiles, 'profiles')?.equity.status).toBe('computed');
    expect(buildCoachAnalysis(play(preflop(), ['raise', 60], ['fold'], ['fold']), [], 0, profiles, 'none')).toBeNull();
    expect(opponentProfiles(f, 0, profiles).map((p) => p.label)).toEqual(['TAG', 'LAG']);
  });
});

describe('Coach live: the verdict is not given too early', () => {
  it('shows no verdict and no imperative advice until the player asks, and hides it again at the next decision', async () => {
    const user = userEvent.setup();
    const b = facing();
    const { rerender } = render(wrap(<CoachLive variant="aside" game={b} visibleBoard={b.board} botProfiles={profiles} />));
    await user.click(screen.getByRole('button', { name: 'Ajouter une hypothèse' }));
    await screen.findByText(/Si on suppose ces ranges/);
    expect(analysis().textContent).not.toMatch(/\b(CALL|RAISE|FOLD)\b/i);
    expect(within(analysis()).queryByLabelText(/^Verdict/)).toBeNull();
    expect(analysis().textContent).not.toMatch(/est favorable|est défavorable|trop faible pour trancher/);

    await user.click(screen.getByRole('button', { name: 'Afficher mon verdict' }));
    expect(within(analysis()).getByLabelText(/^Verdict/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Afficher mon verdict' })).toBeNull();

    const next = play(b, ['call']); // the street changes: new decision, hidden again
    rerender(wrap(<CoachLive variant="aside" game={next} visibleBoard={next.board} botProfiles={profiles} />));
    await waitFor(() => expect(within(analysis()).queryByLabelText(/^Verdict/)).toBeNull());
  });

  it('the detailed numbers do not leak the verdict either (pot odds comparison and EV are masked)', async () => {
    const user = userEvent.setup();
    atLevel(2);
    const b = facing();
    render(wrap(<CoachLive variant="aside" game={b} visibleBoard={b.board} botProfiles={profiles} />));
    await user.click(screen.getByRole('button', { name: 'Ajouter une hypothèse' }));
    await waitFor(() => expect(screen.getByRole('region', { name: 'Pot odds' })).toHaveTextContent('Comparaison masquée'));
    expect(screen.getByRole('region', { name: 'Expected value' })).toHaveTextContent('Masquée jusqu’au verdict');
    await user.click(screen.getByRole('button', { name: 'Afficher mon verdict' }));
    expect(screen.getByRole('region', { name: 'Pot odds' })).not.toHaveTextContent('Comparaison masquée');
  });
});

describe('Coach live: the three existing levels', () => {
  it('Simple shows the essentials only; the detailed numbers come with Approfondi and Avancé', async () => {
    const user = userEvent.setup();
    const b = facing();
    render(wrap(<CoachLive variant="aside" game={b} visibleBoard={b.board} botProfiles={profiles} />));
    expect(within(analysis()).getAllByRole('radio').map((r) => r.textContent)).toEqual(['Simple', 'Approfondi', 'Avancé']);
    const simple = items();
    expect(screen.queryByText('Données chiffrées')).toBeNull();
    await user.click(within(analysis()).getByRole('radio', { name: 'Approfondi' }));
    expect(screen.getByText('Données chiffrées')).toBeInTheDocument();
    const mid = items();
    await user.click(within(analysis()).getByRole('radio', { name: 'Avancé' }));
    const adv = items();
    expect(mid.length).toBeGreaterThan(simple.length);
    expect(adv.length).toBeGreaterThanOrEqual(mid.length);
    for (const s of simple) expect(mid).toContain(s);
    expect(JSON.parse(localStorage.getItem('poker-coach:coach-prefs:v1')!).level).toBe(3);
  });

  it('keeps the sources of every sentence on demand', async () => {
    const user = userEvent.setup();
    const b = facing();
    render(wrap(<CoachLive variant="aside" game={b} visibleBoard={b.board} botProfiles={profiles} />));
    expect(analysis().querySelector('.why__src')).toBeNull();
    await user.click(within(analysis()).getByLabelText('Afficher les sources de chaque phrase'));
    const srcs = [...analysis().querySelectorAll('.why__src')];
    expect(srcs.length).toBe(analysis().querySelectorAll('.why__item').length);
    expect(srcs.every((s) => (s.textContent ?? '').length > 0)).toBe(true);
  });
});

describe('Coach live: the opponent range', () => {
  it('unknown by default, with a button that opens the Range Lab flow', async () => {
    const user = userEvent.setup();
    const onEditRange = vi.fn();
    render(wrap(<Sheet game={flop()} start onEditRange={onEditRange} />));
    expect(screen.getByText(/Range adverse :/)).toHaveTextContent('Range adverse : inconnue');
    expect(screen.queryByRole('button', { name: 'Modifier' })).toBeNull();
    await user.click(screen.getByRole('button', { name: 'Ajouter une hypothèse' }));
    expect(onEditRange).toHaveBeenCalledWith(expect.objectContaining({ profileId: 'tag' }));
  });

  it('a hypothesis is labelled as one, can be edited and can be removed', async () => {
    const user = userEvent.setup();
    const onEditRange = vi.fn();
    const f = flop();
    render(wrap(<CoachLive variant="aside" game={f} visibleBoard={f.board} botProfiles={profiles} onEditRange={onEditRange} />));
    await user.click(screen.getByRole('button', { name: 'Ajouter une hypothèse' }));
    const rows = screen.getAllByText(/Range adverse :/);
    expect(rows[0]).toHaveTextContent('Range adverse : TAG · hypothèse');
    expect(rows[1]).toHaveTextContent('Range adverse : LAG · hypothèse');
    await user.click(screen.getAllByRole('button', { name: 'Modifier' })[1]!);
    expect(onEditRange).toHaveBeenLastCalledWith(expect.objectContaining({ profileId: 'lag' }));
    await user.click(screen.getByRole('button', { name: 'Retirer' }));
    expect(screen.getByText(/Range adverse :/)).toHaveTextContent('inconnue');
  });
});

describe('Coach live: themes', () => {
  it('renders the same panel in dark and in light', () => {
    for (const theme of ['dark', 'light'] as const) {
      localStorage.setItem('poker-coach:theme:v1', JSON.stringify(theme));
      const { unmount } = render(wrap(<Sheet game={flop()} start />));
      expect(document.documentElement.dataset.theme).toBe(theme);
      expect(analysis()).toBeInTheDocument();
      unmount();
    }
  });

  it('its stylesheet only uses design tokens: no raw colour that could break one of the themes', () => {
    const css = readFileSync('src/ui/coach/coach.css', 'utf8');
    const live = css.slice(css.indexOf('/* Live coach'));
    expect(live.length).toBeGreaterThan(500);
    expect(live).not.toMatch(/#[0-9a-fA-F]{3,8}\b|rgba?\(|hsla?\(/);
    expect(live).toMatch(/prefers-reduced-motion|animation: live-in var\(--dur-2\)/);
  });
});

describe('Coach live on the game screen (responsive logic)', () => {
  const passive: DecisionProvider = { decide: ({ legal }) => (legal.check ? { type: 'check' } : { type: 'call' }) };
  const matchMedia = (wide: boolean) => {
    window.matchMedia = vi.fn((query: string) => ({
      matches: query.includes('1180') ? wide : false,
      media: query,
      addEventListener: () => {},
      removeEventListener: () => {},
    })) as unknown as typeof window.matchMedia;
  };
  const renderGame = (over: Partial<React.ComponentProps<typeof GameScreen>> = {}) =>
    render(
      <ToastProvider>
        <GameScreen settings={{ ...DEFAULT_SETTINGS, bots: 2, bigBlind: 20, stackBB: 100 }} onNewGame={vi.fn()} onOpenMenu={vi.fn()} logOpen={false} onCloseLog={vi.fn()} seed={7} paceScale={0} provider={passive} {...over} />
      </ToastProvider>,
    );

  it('phone: a bar under the table, the table and the actions stay on screen while the Coach is open, and the player can act', async () => {
    matchMedia(false);
    const user = userEvent.setup();
    const { container } = renderGame();
    expect(screen.queryByRole('complementary')).toBeNull();
    await user.click(bar());
    expect(analysis()).toBeInTheDocument();
    expect(container.querySelector('.stage')).toBeInTheDocument();
    expect(screen.getByRole('region', { name: /your hand/i })).toBeInTheDocument();
    const act_ = await screen.findByRole('button', { name: /^(check|call)/i });
    await user.click(act_); // playing while the Coach is open
    await waitFor(() => expect(analysis()).toBeInTheDocument());
    await user.click(screen.getByRole('button', { name: 'Fermer le Coach' }));
    expect(container.querySelector('.stage')).toBeInTheDocument();
  });

  it('wide: the Coach is the side panel, always there, no bar', () => {
    matchMedia(true);
    renderGame();
    const aside = screen.getByRole('complementary');
    expect(within(aside).getByRole('region', { name: 'Analyse' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Fermer le Coach' })).toBeNull();
    expect(within(aside).getByRole('radio', { name: 'Hand log' })).toBeInTheDocument();
  });

  it('the header button and the menu request open the same panel', async () => {
    matchMedia(false);
    const user = userEvent.setup();
    renderGame();
    await user.click(screen.getByRole('button', { name: 'Coach analysis' }));
    expect(screen.getByRole('button', { name: 'Fermer le Coach' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Coach analysis' }));
    expect(bar()).toHaveAttribute('aria-expanded', 'false');
    await act(async () => {});
  });
});
