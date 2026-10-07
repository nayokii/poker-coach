// @vitest-environment jsdom
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';
import type { GameState } from '../../engine';
import { newGame, play, rigged } from '../../engine/__tests__/helpers';
import { CoachPanel } from '../coach/CoachPanel';
import { FormatProvider } from '../format';

beforeEach(() => localStorage.clear());

const mk = () => newGame([2000, 2000, 2000], { sb: 10, bb: 20 });
const flop = (): GameState => play(rigged(mk(), ['Ah 5h', '7c 2d', '8c 3d'], 'Kh 9h 2c 4s 5s'), ['call'], ['call'], ['check']);
const facing = (): GameState => play(flop(), ['bet', 40]);
const profiles = { 1: 'tag', 2: 'lag' };
const norm = (s: string | null) => (s ?? '').replace(/[  ]/g, ' ');

function renderPanel(game: GameState) {
  return render(
    <FormatProvider bigBlind={20} mode="bb">
      <CoachPanel game={game} visibleBoard={game.board} botProfiles={profiles} />
    </FormatProvider>,
  );
}
const why = () => screen.getByRole('region', { name: 'Pourquoi ?' });
const items = () => why().querySelectorAll('.why__item');
const texts = () => [...items()].map((i) => i.querySelector('.why__text')!.textContent);

describe('Pourquoi ? — three levels in the Coach panel', () => {
  it('starts at the Simple level with a short list; without a range the verdict is undetermined', () => {
    renderPanel(facing());
    expect(within(why()).getAllByRole('radio').map((r) => r.textContent)).toEqual(['Simple', 'Approfondi', 'Avancé']);
    expect(within(why()).getByRole('radio', { name: 'Simple' })).toHaveAttribute('aria-checked', 'true');
    expect(items().length).toBeGreaterThan(3);
    expect(items().length).toBeLessThanOrEqual(12);
    expect(why()).toHaveTextContent('Impossible de conclure précisément sans hypothèse sur la range adverse.');
    expect(within(why()).getByLabelText('Verdict : Indéterminé')).toBeInTheDocument();
    expect(why()).toHaveTextContent('Ton equity est inconnue');
    expect(why()).not.toHaveTextContent(/payer est favorable|payer est défavorable/);
  });

  it('Approfondi and Avancé only add sentences: every Simple sentence stays', async () => {
    const user = userEvent.setup();
    renderPanel(facing());
    const simple = texts();
    await user.click(within(why()).getByRole('radio', { name: 'Approfondi' }));
    const mid = texts();
    await user.click(within(why()).getByRole('radio', { name: 'Avancé' }));
    const adv = texts();
    expect(mid.length).toBeGreaterThan(simple.length);
    expect(adv.length).toBeGreaterThan(mid.length);
    for (const s of simple) expect(mid).toContain(s);
    for (const s of mid) expect(adv).toContain(s);
    expect(why()).toHaveTextContent('Valeur espérée impossible à calculer');
    expect(why()).toHaveTextContent('Tant qu’aucune main ni range adverse n’est supposée');
  });

  it('remembers the chosen level', async () => {
    const user = userEvent.setup();
    const first = renderPanel(facing());
    await user.click(within(why()).getByRole('radio', { name: 'Avancé' }));
    expect(JSON.parse(localStorage.getItem('poker-coach:coach-prefs:v1')!).level).toBe(3);
    first.unmount();
    renderPanel(facing());
    expect(within(why()).getByRole('radio', { name: 'Avancé' })).toHaveAttribute('aria-checked', 'true');
  });

  it('with a hypothetical range the wording changes, the hypothesis is stated and a verdict appears', async () => {
    const user = userEvent.setup();
    renderPanel(facing());
    await user.click(screen.getByRole('radio', { name: 'Leur range de profil' }));
    expect(await within(why()).findByText(/Si on suppose ces ranges, ton equity est de/)).toBeInTheDocument();
    expect(why()).toHaveTextContent('hypothèse, pas une observation');
    expect(why()).toHaveTextContent('Confiance de l’analyse : moyenne.');
    expect(['Favorable', 'Défavorable', 'Proche']).toContain(why().querySelector('.badge')!.textContent);
    expect(norm(why().textContent)).toMatch(/Il te faut environ \d+,\d % d’equity pour payer 2 BB dans un pot de 5 BB\./);
    expect(why()).not.toHaveTextContent('Ton equity est inconnue');
  });

  it('the equity written in the explanation is the one in the data card (the explanation only reads the analysis)', async () => {
    const user = userEvent.setup();
    renderPanel(facing());
    await user.click(screen.getByRole('radio', { name: 'Leur range de profil' }));
    const sentence = norm((await within(why()).findByText(/ton equity est de/)).textContent);
    const printed = /ton equity est de (\d+,\d) %/.exec(sentence)![1]!.replace(',', '.');
    expect(norm(screen.getByRole('region', { name: 'Equity' }).textContent)).toContain(`${printed}%`);
  });

  it('shows the source of each sentence on demand', async () => {
    const user = userEvent.setup();
    renderPanel(facing());
    expect(why().querySelector('.why__src')).toBeNull();
    await user.click(within(why()).getByLabelText('Afficher les sources de chaque phrase'));
    const srcs = [...why().querySelectorAll('.why__src')].map((s) => s.textContent ?? '');
    expect(srcs.length).toBe(items().length);
    expect(srcs.some((s) => s.includes('potOdds.odds.requiredEquity'))).toBe(true);
    expect(srcs.every((s) => s.length > 0)).toBe(true);
  });

  it('preflop: the hand class, and no outs invented', () => {
    renderPanel(rigged(mk(), ['As Ks', '7c 2d', '8c 3d'], '2h 9h Jc 4s 5s'));
    expect(why()).toHaveTextContent('Ta main de départ est AKs.');
    expect(why().textContent).not.toMatch(/outs? potentiels?/);
  });

  it('once the hand is over the panel says the analysis needs a hand in progress', () => {
    const over = play(rigged(mk(), ['As Ks', '7c 2d', '8c 3d'], '2h 9h Jc 4s 5s'), ['raise', 60], ['fold'], ['fold']);
    renderPanel(over);
    expect(screen.getByText('L’analyse est disponible pendant une main en cours.')).toBeInTheDocument();
    expect(screen.queryByRole('region', { name: 'Pourquoi ?' })).toBeNull();
  });
});
