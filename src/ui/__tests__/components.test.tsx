// @vitest-environment jsdom
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { getLegalActions, parseCard, parseCards, seededRng, startHand, type GameState, type PlayerAction } from '../../engine';
import { ActionBar } from '../actions/ActionBar';
import { PlayingCard } from '../cards/PlayingCard';
import { Modal } from '../design-system';
import { FormatProvider } from '../format';
import { ResultPanel } from '../game/ResultPanel';
import { PlayerSeat } from '../table/PlayerSeat';
import { Table } from '../table/Table';
import { buildResultView } from '../game/views';
import { newGame, play, rigged } from '../../engine/__tests__/helpers';

const three = (stacks = [2000, 2000, 2000]) => startHand(newGame(stacks, { sb: 10, bb: 20 }), seededRng(1));

function renderBar(state: GameState, onAction = vi.fn<(a: PlayerAction) => void>(), waiting?: string) {
  const legal = getLegalActions(state);
  render(
    <FormatProvider bigBlind={20} mode="bb">
      <ActionBar state={state} legal={legal} waiting={waiting} onAction={onAction} />
    </FormatProvider>,
  );
  return { onAction, legal };
}

describe('ActionBar: only legal actions are offered', () => {
  it('facing a bet: fold, call (with amount) and raise; no check', () => {
    renderBar(three());
    expect(screen.getByRole('button', { name: /^fold/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^call 1\s?BB/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^raise/i })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^check/i })).toBeNull();
  });

  it('with the big blind option: check and raise, no fold and no call', () => {
    const s = play(three(), ['call'], ['call']);
    renderBar(s);
    expect(screen.getByRole('button', { name: /^check/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^raise/i })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^fold/i })).toBeNull();
    expect(screen.queryByRole('button', { name: /^call/i })).toBeNull();
  });

  it('postflop with no bet: check and bet', () => {
    const s = play(three(), ['call'], ['call'], ['check']);
    renderBar(s);
    expect(screen.getByRole('button', { name: /^bet/i })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^raise/i })).toBeNull();
  });

  it('a short stack that cannot raise gets an all-in button instead', () => {
    renderBar(three([30, 2000, 2000]));
    expect(screen.queryByRole('button', { name: /^raise/i })).toBeNull();
    expect(screen.getByRole('button', { name: /^all-in 1\.5\s?BB/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^call/i })).toBeInTheDocument();
  });

  it('a call that uses the whole stack is labelled all-in and no second shove is offered', () => {
    renderBar(three([20, 2000, 2000]));
    expect(screen.getByRole('button', { name: /^call all-in/i })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^all-in/i })).toBeNull();
  });

  it('shows a waiting message and no buttons when it is not the hero turn', () => {
    const s = three();
    const onAction = vi.fn();
    render(<ActionBar state={s} legal={null} waiting="Atlas is thinking" onAction={onAction} />);
    expect(screen.getByText('Atlas is thinking')).toBeInTheDocument();
    expect(screen.queryAllByRole('button')).toHaveLength(0);
  });
});

describe('ActionBar: interactions', () => {
  it('sends fold and call to the engine layer', async () => {
    const user = userEvent.setup();
    const { onAction } = renderBar(three());
    await user.click(screen.getByRole('button', { name: /^call/i }));
    await user.click(screen.getByRole('button', { name: /^fold/i }));
    expect(onAction.mock.calls.map((c) => c[0])).toEqual([{ type: 'call' }, { type: 'fold' }]);
  });

  it('opens the sizing panel with real bounds and confirms the chosen raise', async () => {
    const user = userEvent.setup();
    const state = three();
    const { onAction, legal } = renderBar(state);
    await user.click(screen.getByRole('button', { name: /^raise/i }));

    const group = screen.getByRole('group', { name: /bet sizing/i });
    expect(within(group).getByText('Min')).toBeInTheDocument();
    expect(within(group).getByText('Max')).toBeInTheDocument();
    const slider = within(group).getByRole('slider');
    expect(slider).toHaveAttribute('min', String(legal!.minRaiseTo));
    expect(slider).toHaveAttribute('max', String(legal!.maxRaiseTo));

    await user.click(within(group).getByRole('button', { name: 'MIN' }));
    await user.click(screen.getByRole('button', { name: /^raise to/i }));
    expect(onAction).toHaveBeenCalledWith({ type: 'raise', amount: legal!.minRaiseTo });
  });

  it('offers pot-fraction shortcuts computed from the state and an all-in shortcut', async () => {
    const user = userEvent.setup();
    const { onAction, legal } = renderBar(three());
    await user.click(screen.getByRole('button', { name: /^raise/i }));
    const group = screen.getByRole('group', { name: /quick sizes/i });
    const labels = within(group).getAllByRole('button').map((b) => b.textContent);
    expect(labels[0]).toBe('MIN');
    expect(labels).toContain('POT');
    expect(labels.at(-1)).toBe('ALL-IN');

    await user.click(within(group).getByRole('button', { name: 'POT' }));
    await user.click(screen.getByRole('button', { name: /^raise to/i }));
    // pot after calling = 30 + 20 = 50; currentBet 20 -> raise to 70
    expect(onAction).toHaveBeenLastCalledWith({ type: 'raise', amount: 70 });
    expect(legal!.minRaiseTo).toBe(40);
  });

  it('turns a max-size raise into an all-in', async () => {
    const user = userEvent.setup();
    const { onAction } = renderBar(three());
    await user.click(screen.getByRole('button', { name: /^raise/i }));
    await user.click(within(screen.getByRole('group', { name: /quick sizes/i })).getByRole('button', { name: 'ALL-IN' }));
    await user.click(screen.getByRole('button', { name: /^all-in 100 BB$/i }));
    expect(onAction).toHaveBeenCalledWith({ type: 'allin' });
  });

  it('can step the amount with the plus/minus buttons and cancel', async () => {
    const user = userEvent.setup();
    const { onAction } = renderBar(three());
    await user.click(screen.getByRole('button', { name: /^raise/i }));
    const readout = screen.getByLabelText(/^RAISE TO/);
    const before = readout.textContent;
    await user.click(screen.getByRole('button', { name: /increase amount/i }));
    expect(readout.textContent).not.toBe(before);
    await user.click(screen.getByRole('button', { name: /^cancel$/i }));
    expect(screen.queryByRole('group', { name: /bet sizing/i })).toBeNull();
    expect(onAction).not.toHaveBeenCalled();
  });

  it('supports keyboard shortcuts', async () => {
    const user = userEvent.setup();
    const { onAction } = renderBar(three());
    await user.keyboard('c');
    await user.keyboard('f');
    expect(onAction.mock.calls.map((c) => c[0])).toEqual([{ type: 'call' }, { type: 'fold' }]);
  });
});

describe('PlayingCard', () => {
  it('exposes face-up cards to assistive tech and hides face-down ones', () => {
    const { rerender } = render(<PlayingCard card={parseCard('Qs')} />);
    expect(screen.getByRole('img', { name: 'queen of spades' })).toBeInTheDocument();
    rerender(<PlayingCard card={parseCard('Qs')} faceDown />);
    expect(screen.getByRole('img', { name: 'Hidden card' })).toBeInTheDocument();
    expect(screen.queryByText('Q')).toBeNull();
  });

  it('renders states and becomes a button when interactive', async () => {
    const onClick = vi.fn();
    const user = userEvent.setup();
    render(<PlayingCard card={parseCard('Ah')} state="selected" onClick={onClick} />);
    const btn = screen.getByRole('button', { name: 'ace of hearts' });
    expect(btn).toHaveAttribute('data-state', 'selected');
    expect(btn).toHaveAttribute('aria-pressed', 'true');
    await user.click(btn);
    expect(onClick).toHaveBeenCalled();
  });
});

describe('PlayerSeat states', () => {
  const base = { name: 'Atlas', stack: 1500, position: 'CO', isDealer: false, status: 'active' as const, active: false };

  it('shows fold, all-in and the last action', () => {
    const { rerender } = render(<FormatProvider bigBlind={20} mode="bb"><PlayerSeat {...base} status="folded" /></FormatProvider>);
    expect(screen.getByText('Fold')).toBeInTheDocument();
    rerender(<FormatProvider bigBlind={20} mode="bb"><PlayerSeat {...base} status="allin" /></FormatProvider>);
    expect(screen.getByText('All-in')).toBeInTheDocument();
    rerender(<FormatProvider bigBlind={20} mode="bb"><PlayerSeat {...base} lastAction="Raise" /></FormatProvider>);
    expect(screen.getByText('Raise')).toBeInTheDocument();
  });

  it('marks the player to act and the dealer', () => {
    render(<FormatProvider bigBlind={20} mode="bb"><PlayerSeat {...base} active isDealer thinking /></FormatProvider>);
    const seat = screen.getByRole('group', { name: /atlas, co, to act/i });
    expect(seat).toHaveAttribute('data-active', 'true');
    expect(screen.getByLabelText('Dealer button')).toBeInTheDocument();
  });

  it('keeps cards hidden until revealed, then shows them', () => {
    const cards = parseCards('As Kd');
    const { rerender, container } = render(<FormatProvider bigBlind={20} mode="bb"><PlayerSeat {...base} cards={cards} /></FormatProvider>);
    expect(container.querySelectorAll('.pcard__face')).toHaveLength(0);
    expect(container.querySelectorAll('.pcard__back')).toHaveLength(2);
    rerender(<FormatProvider bigBlind={20} mode="bb"><PlayerSeat {...base} cards={cards} revealed /></FormatProvider>);
    expect(container.querySelectorAll('.pcard__face')).toHaveLength(2);
  });

  it('shows the winner gain', () => {
    render(<FormatProvider bigBlind={20} mode="bb"><PlayerSeat {...base} gain={500} /></FormatProvider>);
    expect(screen.getByText(/\+/)).toHaveTextContent('+25');
  });

  it('hides the cards of a folded player', () => {
    const { container } = render(<FormatProvider bigBlind={20} mode="bb"><PlayerSeat {...base} status="folded" cards={parseCards('As Kd')} /></FormatProvider>);
    expect(container.querySelectorAll('.pcard')).toHaveLength(0);
  });
});

describe('Table', () => {
  const tableProps = (game: GameState, over: Partial<Parameters<typeof Table>[0]> = {}) => ({
    game, board: game.board, potChips: game.pot, showdown: false, thinking: null, lastActions: {}, gains: {}, settled: false,
    highlight: new Set<string>(), ...over,
  });

  it('shows the pot, five board slots and the bets in front of players', () => {
    const g = three();
    const { container } = render(<FormatProvider bigBlind={20} mode="bb"><Table {...tableProps(g)} /></FormatProvider>);
    expect(screen.getByRole('status', { name: 'Pot' })).toHaveTextContent('1.5');
    expect(container.querySelectorAll('.board .pcard--slot')).toHaveLength(5);
    expect(container.querySelectorAll('.bet')).toHaveLength(2); // small and big blind
    expect(screen.getAllByRole('group').length).toBe(2); // two bot seats
  });

  it('follows the street: 3, 4 then 5 board cards', () => {
    let g = three();
    const counts: number[] = [];
    const draw = (state: GameState) => {
      const { container, unmount } = render(<FormatProvider bigBlind={20} mode="bb"><Table {...tableProps(state)} /></FormatProvider>);
      counts.push(container.querySelectorAll('.board .pcard:not(.pcard--slot)').length);
      unmount();
    };
    draw(g);
    g = play(g, ['call'], ['call'], ['check']);
    draw(g);
    g = play(g, ['check'], ['check'], ['check']);
    draw(g);
    g = play(g, ['check'], ['check'], ['check']);
    draw(g);
    expect(counts).toEqual([0, 3, 4, 5]);
  });

  it('reveals opponents cards at showdown and highlights the winning hand', () => {
    let g = rigged(newGame([1000, 1000, 1000], { sb: 10, bb: 20 }), ['As Ah', 'Kd Kc', '7h 2c'], 'Ks 8d 3c 9h 2s');
    g = play(g, ['call'], ['call'], ['check'], ['check'], ['check'], ['check'], ['check'], ['check'], ['check'], ['check'], ['check'], ['check']);
    expect(g.handStatus).toBe('complete');
    const view = buildResultView(g)!;
    const { container } = render(
      <FormatProvider bigBlind={20} mode="bb">
        <Table {...tableProps(g, { showdown: true, settled: true, gains: view.gains, highlight: view.highlight, potChips: view.totalPot })} />
      </FormatProvider>,
    );
    expect(container.querySelectorAll('.seat__cards[data-revealed]').length).toBeGreaterThan(0);
    expect(container.querySelectorAll('.board .pcard[data-state="winning"]').length).toBeGreaterThan(0);
    expect(container.querySelectorAll('.board .pcard[data-state="losing"]').length).toBeGreaterThan(0);
    expect(container.querySelector('.seat[data-winner] .seat__gain')).not.toBeNull();
    expect(container.querySelectorAll('.bet')).toHaveLength(0); // chips have left the felt
  });
});

describe('ResultPanel', () => {
  const finished = (sequence: ['fold' | 'call' | 'check'][]) => sequence;
  void finished;

  it('announces a win by folds and offers a new hand', async () => {
    const user = userEvent.setup();
    const s = play(startHand(newGame([1000, 1000]), seededRng(1)), ['raise', 40], ['fold']);
    const onNext = vi.fn();
    render(
      <FormatProvider bigBlind={10} mode="bb">
        <ResultPanel view={buildResultView(s)!} heroName="Noah" heroHand={null} sessionOver={false} onNext={onNext} />
      </FormatProvider>,
    );
    expect(screen.getByText('Noah wins')).toBeInTheDocument();
    expect(screen.getByText('Everyone else folded')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /new hand/i }));
    expect(onNext).toHaveBeenCalled();
  });

  it('shows side pots and who won each', () => {
    let s = rigged(newGame([200, 500, 1000]), ['As Ah', 'Kd Kc', 'Qd Qc'], '2h 7d 9s Jc 3d');
    s = play(s, ['allin'], ['allin'], ['allin']);
    render(
      <FormatProvider bigBlind={10} mode="chips">
        <ResultPanel view={buildResultView(s)!} heroName="Noah" heroHand="Pair of aces" sessionOver={false} onNext={() => {}} />
      </FormatProvider>,
    );
    const list = screen.getByRole('list', { name: 'Pots' });
    expect(within(list).getByText('Main pot')).toBeInTheDocument();
    expect(within(list).getByText('Side pot')).toBeInTheDocument();
    expect(within(list).getByText('Player 1')).toBeInTheDocument();
    expect(screen.getByText(/returned to Player 2/)).toBeInTheDocument();
  });

  it('announces a split pot', () => {
    let s = rigged(newGame([1000, 1000]), ['2c 3c', '4d 5d'], 'Th Jh Qh Kh Ah');
    s = play(s, ['call'], ['check'], ['check'], ['check'], ['check'], ['check'], ['check'], ['check']);
    render(
      <FormatProvider bigBlind={10} mode="bb">
        <ResultPanel view={buildResultView(s)!} heroName="Noah" heroHand="Royal flush" sessionOver={false} onNext={() => {}} />
      </FormatProvider>,
    );
    expect(screen.getByText('Split pot')).toBeInTheDocument();
    expect(screen.getByText('Break even')).toBeInTheDocument();
  });

  it('changes its call to action when the session is over', () => {
    const s = play(startHand(newGame([1000, 1000]), seededRng(1)), ['fold']);
    render(
      <FormatProvider bigBlind={10} mode="bb">
        <ResultPanel view={buildResultView(s)!} heroName="Noah" heroHand={null} sessionOver onNext={() => {}} />
      </FormatProvider>,
    );
    expect(screen.getByRole('button', { name: /end of session/i })).toBeInTheDocument();
  });
});

describe('Modal', () => {
  it('closes on Escape and on the close button, and is labelled', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(<Modal title="Settings" onClose={onClose}><button type="button">Inside</button></Modal>);
    expect(screen.getByRole('dialog', { name: 'Settings' })).toBeInTheDocument();
    await user.keyboard('{Escape}');
    expect(onClose).toHaveBeenCalledTimes(1);
    await user.click(screen.getByRole('button', { name: 'Fermer' }));
    expect(onClose).toHaveBeenCalledTimes(2);
  });
});
