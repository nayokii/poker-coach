// @vitest-environment jsdom
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';
import { analyzeGameState } from '../../coach/analysis';
import { parseRange } from '../../coach/math';
import type { GameState } from '../../engine';
import { App } from '../app/App';
import { CoachView } from '../coach/CoachPanel';
import { CoachLive } from '../coach/CoachLive';
import { FormatProvider } from '../format';
import { newGame, play, rigged } from '../../engine/__tests__/helpers';

beforeEach(() => localStorage.clear());

const mk = () => newGame([2000, 2000, 2000], { sb: 10, bb: 20 });
const flop = (hero: string, v1: string, v2: string, board: string): GameState =>
  play(rigged(mk(), [hero, v1, v2], `${board} 4s 5s`), ['call'], ['call'], ['check']);

const wrap = (ui: React.ReactNode) => <FormatProvider bigBlind={20} mode="bb">{ui}</FormatProvider>;
const profiles = { 1: 'tag', 2: 'lag' };
/** The structured data cards sit behind the Approfondi / Avancé levels. */
const atLevel = (level: 1 | 2 | 3) => localStorage.setItem('poker-coach:coach-prefs:v1', JSON.stringify({ level, showSources: false }));

describe('CoachView renders structured data without inventing anything', () => {
  it('unknown opponents: no equity number, an explicit message, low confidence, EV insufficient', () => {
    const g = flop('Ah 5h', '7c 2d', '8c 3d', 'Kh 9h 2c');
    render(wrap(<CoachView a={analyzeGameState(g, 0)} />));
    expect(screen.getByText('Opponent range unknown')).toBeInTheDocument();
    const equity = screen.getByRole('region', { name: 'Equity' });
    expect(equity.textContent).not.toMatch(/\d+\.\d%/);
    expect(screen.getByText('low')).toBeInTheDocument();
    expect(screen.getByText('Nothing is known about the opponents')).toBeInTheDocument();
    expect(within(screen.getByRole('region', { name: 'Expected value' })).getByText('Insufficient data')).toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'Blockers' })).toHaveTextContent('No opponent range assumed');
    expect(screen.getByRole('region', { name: 'Pot odds' })).toHaveTextContent('Nothing to call');
  });

  it('shows the situation: street, pot, effective stack, SPR, call owed', () => {
    let g = flop('Ah 5h', '7c 2d', '8c 3d', 'Kh 9h 2c');
    g = play(g, ['bet', 60]);
    render(wrap(<CoachView a={analyzeGameState(g, 0)} />));
    const s = screen.getByRole('region', { name: 'Situation' });
    expect(s).toHaveTextContent('flop');
    expect(s).toHaveTextContent('3 players');
    expect(s).toHaveTextContent('Pot6BB'); // pot 120 chips / 20
    expect(s).toHaveTextContent('To call 3 BB');
    expect(s).toHaveTextContent('bet = 1.00 × pot');
  });

  it('current hand, flush draw with its reason, outs with probabilities and quality counts', () => {
    const g = flop('Ah 5h', '7c 2d', '8c 3d', 'Kh 9h 2c');
    render(wrap(<CoachView a={analyzeGameState(g, 0)} />));
    expect(screen.getByRole('region', { name: 'Current hand' })).toHaveTextContent('High card ace');
    const draws = screen.getByRole('region', { name: 'Draws' });
    expect(draws).toHaveTextContent('Flush draw');
    expect(draws).toHaveTextContent('9 outs');
    expect(draws).toHaveTextContent('4 hearts: 2 in hand, 2 on the board');
    const outs = screen.getByRole('region', { name: 'Outs' });
    expect(outs).toHaveTextContent('15');
    expect(outs).toHaveTextContent('47 unknown cards');
    expect(outs).toHaveTextContent('Next card');
    expect(outs).toHaveTextContent('31.9%'); // 15 outs among 47 cards: 15 / 47
    expect(outs).toHaveTextContent('By the river');
    expect(outs).toHaveTextContent('54.1%'); // 1 - (32 x 31) / (47 x 46)
    expect(outs.querySelector('.outs__quality')).toHaveTextContent(/Clean \d+/);
    expect(outs.querySelector('.outs__quality')).toHaveTextContent(/Dirty 0/);
  });

  it('opponent hands: exact equity with exact badge and high confidence', () => {
    const g = flop('Ah Kh', 'Qs Qd', '5c 5d', '7s 2d 9c');
    const a = analyzeGameState(g, 0, {
      opponents: { 1: { kind: 'exact-hand', hand: [{ rank: 12, suit: 's' }, { rank: 12, suit: 'd' }] }, 2: { kind: 'exact-hand', hand: [{ rank: 5, suit: 'c' }, { rank: 5, suit: 'd' }] } },
    });
    render(wrap(<CoachView a={a} />));
    const eq = screen.getByRole('region', { name: 'Equity' });
    expect(eq).toHaveTextContent('Exact');
    expect(eq).toHaveTextContent('exact hand');
    expect(screen.getByText('high')).toBeInTheDocument();
  });

  it('hypothetical ranges: estimate badge with samples and seed, medium confidence, blockers', () => {
    const g = flop('As Ks', '7c 2d', '8c 3d', 'Jh 8h 4c');
    const a = analyzeGameState(g, 0, {
      opponents: {
        1: { kind: 'range', range: parseRange('22+, A2s+, K9s+, ATo+'), certainty: 'hypothetical', label: 'TAG' },
        2: { kind: 'range', range: parseRange('22+, A2s+, K9s+, ATo+'), certainty: 'hypothetical', label: 'LAG' },
      },
      equity: { seed: 3, samples: 3000 },
    });
    render(wrap(<CoachView a={a} />));
    const eq = screen.getByRole('region', { name: 'Equity' });
    expect(eq).toHaveTextContent('Estimated');
    expect(eq).toHaveTextContent('3 000 samples');
    expect(eq).toHaveTextContent('seed 3');
    expect(eq).toHaveTextContent('hypothetical · TAG');
    expect(screen.getByText('medium')).toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'Blockers' })).toHaveTextContent('combos remain');
  });

  it('pot odds with a computed equity show the margin; EV is complete with its assumptions', async () => {
    const user = userEvent.setup();
    let g = flop('Ah Kh', 'Qs Qd', '5c 5d', '7s 2d 9c');
    g = play(g, ['bet', 60], ['fold']);
    const a = analyzeGameState(g, 0, { opponents: { 1: { kind: 'exact-hand', hand: [{ rank: 12, suit: 's' }, { rank: 12, suit: 'd' }] } } });
    render(wrap(<CoachView a={a} />));
    const odds = screen.getByRole('region', { name: 'Pot odds' });
    expect(odds).toHaveTextContent('33.3% needed');
    expect(odds).toHaveTextContent('Call 3 BB into 6 BB');
    expect(odds).toHaveTextContent(/Equity \d+\.\d% vs 33\.3% needed/);
    const ev = screen.getByRole('region', { name: 'Expected value' });
    expect(ev).toHaveTextContent('EV of calling');
    await user.click(within(ev).getByText('Assumptions'));
    expect(ev).toHaveTextContent('decided at showdown');
  });

  it('preflop: hand class, outs and draws not applicable', () => {
    const g = rigged(mk(), ['As Ks', '7c 2d', '8c 3d'], '2h 9h Jc 4s 5s');
    render(wrap(<CoachView a={analyzeGameState(g, 0)} />));
    expect(screen.getByRole('region', { name: 'Current hand' })).toHaveTextContent('AKs');
    expect(screen.getByRole('region', { name: 'Outs' })).toHaveTextContent('Outs start on the flop');
    expect(screen.getByRole('region', { name: 'Draws' })).toHaveTextContent('No board yet');
    expect(screen.getByRole('region', { name: 'Pot odds' })).toHaveTextContent('40.0% needed');
  });
});

describe('CoachLive: the user chooses what to assume', () => {
  it('defaults to no assumption (no equity), and a profile hypothesis computes one clearly labelled', async () => {
    const user = userEvent.setup();
    atLevel(2);
    const g = flop('As Ks', '7c 2d', '8c 3d', 'Jh 8h 4c');
    render(wrap(<CoachLive variant="aside" game={g} visibleBoard={g.board} botProfiles={profiles} />));
    expect(screen.getByText('Opponent range unknown')).toBeInTheDocument();
    expect(screen.getByText(/Range adverse :/)).toHaveTextContent('Range adverse : inconnue');

    await user.click(screen.getByRole('button', { name: 'Ajouter une hypothèse' }));
    const eq = await screen.findByRole('region', { name: 'Equity' });
    expect(eq).toHaveTextContent(/\d+\.\d%/);
    expect(eq).toHaveTextContent('hypothetical · TAG preflop range');
    expect(eq).toHaveTextContent('hypothetical · LAG preflop range');
    expect(screen.getAllByText(/Range adverse :/)[0]).toHaveTextContent('Range adverse : TAG · hypothèse');
    expect(screen.getByText('medium')).toBeInTheDocument();
  });

  it('only uses the board the player can see during a run-out', () => {
    const g = flop('As Ks', '7c 2d', '8c 3d', 'Jh 8h 4c');
    const full = { ...g, board: g.board };
    // pretend the engine already dealt turn and river while the screen still shows the flop
    const ahead: GameState = { ...full, board: [...g.board, ...g.deck.slice(0, 2)] };
    atLevel(2);
    render(wrap(<CoachLive variant="aside" game={ahead} visibleBoard={g.board} botProfiles={profiles} />));
    expect(screen.getByRole('region', { name: 'Situation' })).toHaveTextContent('flop');
    expect(screen.getByRole('region', { name: 'Outs' })).toHaveTextContent('47 unknown cards');
  });

  it('says analysis needs a hand in progress once the hand is over', () => {
    let g = rigged(mk(), ['As Ks', '7c 2d', '8c 3d'], '2h 9h Jc 4s 5s');
    g = play(g, ['raise', 60], ['fold'], ['fold']);
    render(wrap(<CoachLive variant="aside" game={g} visibleBoard={[]} botProfiles={profiles} />));
    expect(screen.getByText('L’analyse est disponible pendant une main en cours.')).toBeInTheDocument();
  });
});

describe('Coach and Range Lab inside the app', () => {
  it('the tab bar offers Play and Ranges on the new-game screen, and the Range Lab opens', async () => {
    const user = userEvent.setup();
    render(<App />);
    const nav = screen.getByRole('navigation', { name: 'Sections' });
    expect(within(nav).getAllByRole('button').map((b) => b.textContent)).toEqual(['Play', 'Ranges']);
    await user.click(within(nav).getByRole('button', { name: 'Ranges' }));
    expect(screen.getByRole('heading', { name: 'Range Lab' })).toBeVisible();
    expect(screen.getAllByRole('gridcell')).toHaveLength(169);
    await user.click(within(nav).getByRole('button', { name: 'Play' }));
    expect(screen.getByRole('heading', { name: /poker coach/i })).toBeVisible();
  });

  it('during a hand the Coach is on the game screen, and also opens from the menu, without the tab bar stealing room', async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getByRole('button', { name: /deal me in/i }));
    await screen.findByRole('region', { name: /your hand/i });
    expect(screen.queryByRole('navigation', { name: 'Sections' })).toBeNull();

    // the Coach is part of the screen: a slim bar under the table, no menu to dig through
    const bar = within(screen.getByRole('region', { name: 'Coach' })).getByRole('button');
    expect(bar).toHaveAttribute('aria-expanded', 'false');
    await user.click(bar);
    const panel = await screen.findByRole('region', { name: 'Coach' });
    expect(within(panel).getByRole('region', { name: 'Analyse' })).toBeInTheDocument();
    expect(within(panel).getByText(/Range adverse :/)).toHaveTextContent('inconnue');
    await user.keyboard('{Escape}');
    expect(within(screen.getByRole('region', { name: 'Coach' })).getByRole('button')).toHaveAttribute('aria-expanded', 'false');

    await user.click(screen.getByRole('button', { name: 'Menu' }));
    const menu = screen.getByRole('dialog', { name: 'Menu' });
    expect(within(menu).getByText('Range Lab')).toBeInTheDocument();
    await user.click(within(menu).getByText('Coach analysis'));
    expect(await screen.findByRole('button', { name: 'Fermer le Coach' })).toBeInTheDocument();
  });

  it('the Range Lab can be reached from the game menu and the table is still there when coming back', async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getByRole('button', { name: /deal me in/i }));
    await screen.findByRole('region', { name: /your hand/i });
    await user.click(screen.getByRole('button', { name: 'Menu' }));
    await user.click(within(screen.getByRole('dialog', { name: 'Menu' })).getByText('Range Lab'));
    expect(screen.getByRole('heading', { name: 'Range Lab' })).toBeVisible();
    const nav = screen.getByRole('navigation', { name: 'Sections' });
    await user.click(within(nav).getByRole('button', { name: 'Play' }));
    expect(screen.getByRole('region', { name: /your hand/i })).toBeVisible();
  });
});
