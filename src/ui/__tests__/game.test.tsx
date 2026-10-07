// @vitest-environment jsdom
import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { DecisionProvider } from '../../ai';
import { DEFAULT_SETTINGS, type SavedSession, type Settings } from '../../storage';
import { App } from '../app/App';
import { ToastProvider } from '../design-system';
import { GameScreen } from '../game/GameScreen';

type UE = ReturnType<typeof userEvent.setup>;

/** Bots that never raise: they check or call, which makes full hands short and predictable. */
const passiveBots: DecisionProvider = {
  decide: ({ legal }) => (legal.check ? { type: 'check' } : { type: 'call' }),
};
const foldingBots: DecisionProvider = {
  decide: ({ legal }) => (legal.check ? { type: 'check' } : { type: 'fold' }),
};
const shovingBots: DecisionProvider = {
  decide: ({ legal }) => (legal.allIn ? { type: 'allin' } : legal.check ? { type: 'check' } : { type: 'call' }),
};

const settings: Settings = { ...DEFAULT_SETTINGS, bots: 2, bigBlind: 20, stackBB: 100 };

function renderGame(over: Partial<React.ComponentProps<typeof GameScreen>> = {}) {
  const props = {
    settings,
    onNewGame: vi.fn(),
    onOpenMenu: vi.fn(),
    logOpen: false,
    onCloseLog: vi.fn(),
    seed: 7,
    paceScale: 0,
    provider: passiveBots,
    ...over,
  };
  const utils = render(
    <ToastProvider>
      <GameScreen {...props} />
    </ToastProvider>,
  );
  return { ...utils, props };
}

const tick = (ms = 5) => act(async () => void (await new Promise((r) => setTimeout(r, ms))));
const boardCards = (c: HTMLElement) => c.querySelectorAll('.board .pcard:not(.pcard--slot)').length;

/** Plays check/call with the hero until the result panel shows. Returns the board sizes seen. */
async function playHand(user: UE, container: HTMLElement): Promise<number[]> {
  const seen: number[] = [];
  for (let i = 0; i < 80; i++) {
    const n = boardCards(container);
    if (seen.at(-1) !== n) seen.push(n);
    if (container.querySelector('.result')) return seen;
    const act = screen.queryByRole('button', { name: /^(check|call)/i });
    if (act) await user.click(act);
    else await tick(5);
  }
  throw new Error('hand did not finish');
}

beforeEach(() => localStorage.clear());

describe('GameScreen: a full hand against the bots', () => {
  it('starts a hand with cards, blinds and a header', () => {
    const { container } = renderGame();
    expect(screen.getByText('NLH')).toBeInTheDocument();
    expect(screen.getByText('10 / 20')).toBeInTheDocument();
    const hero = screen.getByRole('region', { name: /your hand/i });
    expect(within(hero).getAllByRole('img')).toHaveLength(2);
    expect(container.querySelectorAll('.seat')).toHaveLength(2);
    expect(boardCards(container)).toBe(0);
    expect(screen.getByRole('status', { name: 'Pot' })).toBeInTheDocument();
  });

  it('plays automatically for the bots and reaches the river and a showdown', async () => {
    const user = userEvent.setup();
    const { container } = renderGame();
    const seen = await playHand(user, container);

    // streets only ever move forward: preflop 0 -> flop 3 -> turn 4 -> river 5
    expect(seen).toEqual([0, 3, 4, 5]);
    expect(screen.getByText('Showdown')).toBeInTheDocument();
    expect(container.querySelectorAll('.seat__cards[data-revealed]').length).toBeGreaterThan(0);
    expect(container.querySelectorAll('.board .pcard[data-state="winning"]').length).toBeGreaterThan(0);
    expect(screen.getByRole('button', { name: /new hand/i })).toBeInTheDocument();
    // someone won: either the hero (Winner badge) or a seat shows its gain
    const gain = container.querySelector('.seat__gain');
    const heroWon = !!screen.queryByText('Winner');
    expect(!!gain || heroWon).toBe(true);
  });

  it('starts a new hand: button moves, cards are redealt, board is cleared', async () => {
    const user = userEvent.setup();
    const { container } = renderGame();
    const heroPosition = () => screen.getByRole('region', { name: /your hand/i }).querySelector('.hero__row .badge')?.textContent;
    const firstPosition = heroPosition();
    const firstCards = within(screen.getByRole('region', { name: /your hand/i })).getAllByRole('img').map((e) => e.getAttribute('aria-label'));
    await playHand(user, container);

    await user.click(screen.getByRole('button', { name: /new hand/i }));
    expect(screen.getByLabelText('Hand 2')).toBeInTheDocument();
    await waitFor(() => expect(container.querySelector('.result')).toBeNull());
    expect(boardCards(container)).toBe(0);
    expect(heroPosition()).not.toBe(firstPosition); // the dealer button moved
    const secondCards = within(screen.getByRole('region', { name: /your hand/i })).getAllByRole('img').map((e) => e.getAttribute('aria-label'));
    expect(secondCards).not.toEqual(firstCards);
  });

  it('lets the hero fold and shows the loss without a showdown', async () => {
    const user = userEvent.setup();
    const { container } = renderGame({ provider: foldingBots, seed: 3 });
    // wait for the hero turn facing a bet (hero is the button, UTG)
    const fold = await screen.findByRole('button', { name: /^fold/i });
    await user.click(fold);
    await waitFor(() => expect(container.querySelector('.result')).not.toBeNull());
    expect(screen.getByText('Uncontested')).toBeInTheDocument();
    expect(screen.getByText('Everyone else folded')).toBeInTheDocument();
    expect(container.querySelectorAll('.hero .pcard[data-state="losing"]')).toHaveLength(2);
  });

  it('wins uncontested when every bot folds', async () => {
    const user = userEvent.setup();
    const { container } = renderGame({ provider: foldingBots, seed: 3 });
    const raise = await screen.findByRole('button', { name: /^raise/i });
    await user.click(raise);
    await user.click(screen.getByRole('button', { name: /^raise to/i }));
    await waitFor(() => expect(container.querySelector('.result')).not.toBeNull());
    expect(screen.getByText('Noah wins')).toBeInTheDocument();
    expect(screen.getByText('Winner')).toBeInTheDocument();
  });

  it('shows who is thinking while a bot plays and hides actions meanwhile', async () => {
    const user = userEvent.setup();
    renderGame({ paceScale: 8 }); // slow bots so the waiting state is observable
    await user.click(await screen.findByRole('button', { name: /^call/i }));
    expect(await screen.findByText(/is thinking/i)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^call/i })).toBeNull();
  });

  it('marks all-in players and runs the board out', async () => {
    const user = userEvent.setup();
    const { container } = renderGame({ provider: shovingBots, seed: 5 });
    await user.click(await screen.findByRole('button', { name: /^call/i }));
    // if the hero only called/raised, shove for the rest
    for (let i = 0; i < 30 && !container.querySelector('.result'); i++) {
      const b = screen.queryByRole('button', { name: /^(call|all-in)/i });
      if (b) await user.click(b);
      else await tick(5);
    }
    await waitFor(() => expect(container.querySelector('.result')).not.toBeNull());
    expect(boardCards(container)).toBe(5);
  });

  it('opens the hand log with the real action history', async () => {
    const user = userEvent.setup();
    const { container, rerender, props } = renderGame();
    await user.click(await screen.findByRole('button', { name: /^call/i }));
    rerender(
      <ToastProvider>
        <GameScreen {...props} logOpen />
      </ToastProvider>,
    );
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText('Preflop')).toBeInTheDocument();
    expect(within(dialog).getByText(/posts small blind/)).toBeInTheDocument();
    expect(within(dialog).getByText(/posts big blind/)).toBeInTheDocument();
    expect(within(dialog).getAllByText(/calls/).length).toBeGreaterThan(0);
    void container;
  });

  it('keeps chips conserved across a session (stacks shown add up)', async () => {
    const user = userEvent.setup();
    const { container } = renderGame({ settings: { ...settings, unit: 'chips' } });
    const total = () => {
      const text = [...container.querySelectorAll('.seat__stack, .hero__stack')].map((e) => Number((e.textContent ?? '').replace(/\D/g, '')));
      return text.reduce((a, b) => a + b, 0);
    };
    await playHand(user, container);
    // after the hand everything is paid out: stacks sum to the starting total
    expect(total()).toBe(3 * 2000);
  });
});

describe('GameScreen: end of session', () => {
  const resume: SavedSession = {
    version: 1,
    players: [
      { id: 'hero', name: 'Noah', stack: 20 },
      { id: 'bot1', name: 'Atlas', stack: 2000 },
      { id: 'bot2', name: 'Mira', stack: 2000 },
    ],
    bigBlind: 20,
    button: 1, // the hero is the big blind and is all-in just by posting
    handsPlayed: 6,
    startStack: 2000,
  };

  it('offers the session summary when the hero is out of chips', async () => {
    const user = userEvent.setup();
    let found = false;
    for (let seed = 1; seed <= 25 && !found; seed++) {
      const onNewGame = vi.fn();
      const { container, unmount } = renderGame({ resume, seed, provider: shovingBots, onNewGame });
      await waitFor(() => expect(container.querySelector('.result')).not.toBeNull(), { timeout: 3000 });
      const end = screen.queryByRole('button', { name: /end of session/i });
      if (end) {
        found = true;
        await user.click(end);
        const dialog = await screen.findByRole('dialog', { name: /session over/i });
        expect(within(dialog).getByText(/out of chips/i)).toBeInTheDocument();
        expect(within(dialog).getByText('7')).toBeInTheDocument(); // hands played = 6 + this one
        await user.click(within(dialog).getByRole('button', { name: /new session/i }));
        expect(onNewGame).toHaveBeenCalled();
      }
      unmount();
    }
    expect(found).toBe(true);
  });

  it('saves a resumable snapshot after a hand and clears it when the session ends', async () => {
    const user = userEvent.setup();
    const { container } = renderGame({ provider: foldingBots, seed: 3 });
    await user.click(await screen.findByRole('button', { name: /^fold/i }));
    await waitFor(() => expect(container.querySelector('.result')).not.toBeNull());
    await waitFor(() => expect(localStorage.getItem('poker-coach:session:v1')).not.toBeNull());
    const saved = JSON.parse(localStorage.getItem('poker-coach:session:v1') as string) as SavedSession;
    expect(saved.players.reduce((a, p) => a + p.stack, 0)).toBe(3 * 2000);
    expect(saved.handsPlayed).toBe(1);
  });
});

describe('App flow', () => {
  it('opens on the new-game screen, starts a session and offers the menu', async () => {
    const user = userEvent.setup();
    render(<App />);
    expect(screen.getByRole('heading', { name: /poker coach/i })).toBeInTheDocument();
    expect(screen.getByText(/jamais d.argent réel/i)).toBeInTheDocument();

    await user.click(screen.getByRole('radio', { name: '2' })); // opponents
    await user.click(screen.getByRole('button', { name: /deal me in/i }));
    expect(await screen.findByRole('region', { name: /your hand/i })).toBeInTheDocument();
    expect(screen.getAllByRole('group').filter((g) => g.classList.contains('seat'))).toHaveLength(2);

    await user.click(screen.getByRole('button', { name: 'Menu' }));
    const menu = screen.getByRole('dialog', { name: 'Menu' });
    expect(within(menu).getByText('New game')).toBeInTheDocument();
    expect(within(menu).getByText('Hand log')).toBeInTheDocument();
    expect(within(menu).getByText('Settings')).toBeInTheDocument();
  });

  it('switches amounts from big blinds to chips in the settings', async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getByRole('button', { name: /deal me in/i }));
    const hero = await screen.findByRole('region', { name: /your hand/i });
    expect(within(hero).getByText('BB')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Menu' }));
    await user.click(screen.getByText('Settings'));
    await user.click(screen.getByRole('radio', { name: 'Chips' }));
    await user.keyboard('{Escape}');
    expect(within(hero).queryByText('BB')).toBeNull();
    expect(JSON.parse(localStorage.getItem('poker-coach:settings:v1') as string).unit).toBe('chips');
  });

  it('goes back to the new-game screen from the menu and resumes a saved session', async () => {
    const user = userEvent.setup();
    localStorage.setItem(
      'poker-coach:session:v1',
      JSON.stringify({
        version: 1,
        players: [
          { id: 'hero', name: 'Noah', stack: 3000 },
          { id: 'bot1', name: 'Atlas', stack: 1000 },
          { id: 'bot2', name: 'Mira', stack: 2000 },
        ],
        bigBlind: 20, button: 0, handsPlayed: 3, startStack: 2000,
      }),
    );
    render(<App />);
    const resumeBtn = screen.getByRole('button', { name: /continue session/i });
    expect(resumeBtn).toHaveTextContent('3 hands played');
    await user.click(resumeBtn);
    const hero = await screen.findByRole('region', { name: /your hand/i });
    // the previous stacks are restored (blinds are already posted for the new hand)
    expect(hero).toHaveTextContent(/\d/);
    expect(screen.getAllByText('Atlas').length).toBeGreaterThan(0);
    expect(screen.getByLabelText('Hand 1')).toBeInTheDocument();
  });
});
