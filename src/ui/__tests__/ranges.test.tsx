// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { beforeEach, describe, expect, it } from 'vitest';
import { parseCards } from '../../engine';
import { comboCount, parseRange, totalWeight, type Range } from '../../coach/math';
import { botRange } from '../../coach/ranges';
import { ToastProvider } from '../design-system';
import { RangeEditor } from '../ranges/RangeEditor';
import { RangeLab } from '../ranges/RangeLab';
import { RangeMatrix } from '../ranges/RangeMatrix';
import { emptyRange } from '../../coach/ranges';

beforeEach(() => localStorage.clear());

const cell = (label: string) => document.querySelector(`[data-cell="${label}"]`) as HTMLElement;
const state = (label: string) => cell(label).getAttribute('data-state');

/** Controlled wrapper so tests can read the range after edits. */
function Harness({ initial = emptyRange(), dead = [] as ReturnType<typeof parseCards>, onRange }: { initial?: Range; dead?: ReturnType<typeof parseCards>; onRange?: (r: Range) => void }) {
  const [range, setRange] = useState(initial);
  return (
    <ToastProvider>
      <RangeEditor
        range={range}
        dead={dead}
        onChange={(r) => {
          setRange(r);
          onRange?.(r);
        }}
      />
    </ToastProvider>
  );
}

describe('RangeMatrix', () => {
  it('renders a 13 x 13 grid of 169 cells in matrix order', () => {
    render(<RangeMatrix range={emptyRange()} brush={1} focused={null} onPaint={() => {}} onFocusCell={() => {}} />);
    const grid = screen.getByRole('grid');
    expect(within(grid).getAllByRole('row')).toHaveLength(13);
    expect(within(grid).getAllByRole('gridcell')).toHaveLength(169);
    const labels = within(grid).getAllByRole('gridcell').map((c) => c.getAttribute('data-cell'));
    expect(labels.slice(0, 3)).toEqual(['AA', 'AKs', 'AQs']);
    expect(labels[13]).toBe('AKo');
    expect(labels[168]).toBe('22');
  });

  it('describes every cell for assistive tech (combos available and state)', () => {
    render(<RangeMatrix range={parseRange('AKs')} dead={parseCards('As Ks')} brush={1} focused={null} onPaint={() => {}} onFocusCell={() => {}} />);
    expect(cell('AKs').getAttribute('aria-label')).toBe('AKs, suited, 3 of 4 combos available, selected');
    expect(cell('AA').getAttribute('aria-label')).toContain('pocket pair');
    expect(cell('AKo').getAttribute('aria-label')).toContain('6 of 12 combos available'); // AKo loses the 3 + 3 combos with As or Ks
  });
});

describe('RangeEditor: selecting and deselecting', () => {
  it('a tap selects a cell and a second tap deselects it', () => {
    let last: Range | undefined;
    render(<Harness onRange={(r) => (last = r)} />);
    fireEvent.pointerDown(cell('AKs'));
    fireEvent.pointerUp(cell('AKs'));
    expect(state('AKs')).toBe('full');
    expect(comboCount(last!)).toBe(4);
    fireEvent.pointerDown(cell('AKs'));
    fireEvent.pointerUp(cell('AKs'));
    expect(state('AKs')).toBe('none');
    expect(comboCount(last!)).toBe(0);
  });

  it('dragging paints every cell it crosses with the same weight, and can erase', () => {
    let last: Range | undefined;
    render(<Harness onRange={(r) => (last = r)} />);
    const under = new Map<string, HTMLElement>([['10,10', cell('AA')], ['20,10', cell('AKs')], ['30,10', cell('AQs')]]);
    document.elementFromPoint = ((x: number, y: number) => under.get(`${x},${y}`) ?? null) as typeof document.elementFromPoint;
    fireEvent.pointerDown(cell('AA'), { clientX: 10, clientY: 10 });
    fireEvent.pointerMove(cell('AA').parentElement!.parentElement!, { clientX: 20, clientY: 10 });
    fireEvent.pointerMove(cell('AA').parentElement!.parentElement!, { clientX: 30, clientY: 10 });
    fireEvent.pointerUp(cell('AA'));
    expect(['AA', 'AKs', 'AQs'].map(state)).toEqual(['full', 'full', 'full']);
    expect(comboCount(last!)).toBe(6 + 4 + 4);

    // a drag that starts on a selected cell erases
    fireEvent.pointerDown(cell('AA'), { clientX: 10, clientY: 10 });
    fireEvent.pointerMove(cell('AA').parentElement!.parentElement!, { clientX: 20, clientY: 10 });
    fireEvent.pointerUp(cell('AA'));
    expect(['AA', 'AKs', 'AQs'].map(state)).toEqual(['none', 'none', 'full']);
  });

  it('a fast swipe that jumps over cells still paints every cell on the way', () => {
    let last: Range | undefined;
    render(<Harness onRange={(r) => (last = r)} />);
    const byX = (x: number): HTMLElement | null => (x < 10 ? cell('AA') : x < 20 ? cell('AKs') : x < 30 ? cell('AQs') : null);
    document.elementFromPoint = ((x: number) => byX(x)) as typeof document.elementFromPoint;
    fireEvent.pointerDown(cell('AA'), { clientX: 5, clientY: 0 });
    fireEvent.pointerMove(cell('AA').parentElement!.parentElement!, { clientX: 25, clientY: 0 }); // one single event, two cells skipped over
    fireEvent.pointerUp(cell('AA'));
    expect(['AA', 'AKs', 'AQs'].map(state)).toEqual(['full', 'full', 'full']);
    expect(comboCount(last!)).toBe(14);
  });

  it('keyboard: arrow keys move between cells and Enter toggles', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    cell('AA').focus();
    await user.keyboard('{ArrowRight}');
    expect(document.activeElement).toBe(cell('AKs'));
    await user.keyboard('{ArrowDown}');
    expect(document.activeElement).toBe(cell('KK'));
    await user.keyboard('{Enter}');
    expect(state('KK')).toBe('full');
    await user.keyboard('{Enter}');
    expect(state('KK')).toBe('none');
  });
});

describe('RangeEditor: percent brushes are real weights', () => {
  it('50% on QQ makes half of its combos weight, partial state, and 3 combos of equity weight', async () => {
    const user = userEvent.setup();
    let last: Range | undefined;
    render(<Harness onRange={(r) => (last = r)} />);
    await user.click(screen.getByRole('radio', { name: '50%' }));
    fireEvent.pointerDown(cell('QQ'));
    fireEvent.pointerUp(cell('QQ'));
    expect(state('QQ')).toBe('partial');
    expect(totalWeight(last!)).toBeCloseTo(3, 12);
    expect(comboCount(last!)).toBe(6);
    expect(screen.getByRole('region', { name: 'Hand QQ' })).toHaveTextContent('50%');
    // the same tap again clears it
    fireEvent.pointerDown(cell('QQ'));
    fireEvent.pointerUp(cell('QQ'));
    expect(state('QQ')).toBe('none');
  });

  it('the inspector sets exact percentages and individual combos (partial selection)', async () => {
    const user = userEvent.setup();
    let last: Range | undefined;
    render(<Harness onRange={(r) => (last = r)} />);
    fireEvent.pointerDown(cell('AKs'));
    fireEvent.pointerUp(cell('AKs'));
    const inspector = screen.getByRole('region', { name: 'Hand AKs' });
    await user.click(within(inspector).getByRole('button', { name: '25%' }));
    expect(totalWeight(last!)).toBeCloseTo(1, 12);
    expect(state('AKs')).toBe('partial');
    await user.click(within(inspector).getByRole('button', { name: '100%' }));
    expect(state('AKs')).toBe('full');
    // switch one combo off: the cell becomes partial with 3 of 4 combos
    await user.click(within(inspector).getAllByRole('button', { name: /, 100%$/ })[0]!);
    expect(comboCount(last!)).toBe(3);
    expect(state('AKs')).toBe('partial');
  });
});

describe('RangeEditor: blockers', () => {
  it('AKs shows 3 / 4 combos when the hero holds As Ks, and combo chips of blocked cards are disabled', () => {
    render(<Harness dead={parseCards('As Ks')} />);
    fireEvent.pointerDown(cell('AKs')); // selects AKs (4 combos in the range, 3 still possible)
    fireEvent.pointerUp(cell('AKs'));
    const inspector = screen.getByRole('region', { name: 'Hand AKs' });
    expect(inspector).toHaveTextContent('3 / 4 combos');
    expect(inspector).toHaveTextContent('1 blocked');
    const blocked = within(inspector).getAllByRole('button').filter((b) => (b as HTMLButtonElement).disabled && b.className.includes('combo'));
    expect(blocked).toHaveLength(1);
    expect(screen.getByText(/possible with known cards/)).toHaveTextContent('3 / 4');
  });

  it('a cell whose combos are all blocked is disabled and cannot be painted', () => {
    let last: Range | undefined;
    render(<Harness dead={parseCards('As Ah Ad Ac')} onRange={(r) => (last = r)} />);
    expect(state('AA')).toBe('disabled');
    fireEvent.pointerDown(cell('AA'));
    fireEvent.pointerUp(cell('AA'));
    expect(last).toBeUndefined();
    expect(state('KK')).toBe('none');
  });
});

describe('RangeEditor: text input uses the engine parser', () => {
  it('applies 22+, AJs+, KQs, AQo+ to the matrix', async () => {
    const user = userEvent.setup();
    let last: Range | undefined;
    render(<Harness onRange={(r) => (last = r)} />);
    const input = screen.getByLabelText('Range text');
    await user.clear(input);
    await user.type(input, '22+, AJs+, KQs, AQo+');
    await user.click(screen.getByRole('button', { name: 'Apply' }));
    expect(comboCount(last!)).toBe(parseRange('22+, AJs+, KQs, AQo+').entries.length);
    for (const l of ['AA', '22', 'AJs', 'AKs', 'KQs', 'AQo', 'AKo']) expect(state(l), l).toBe('full');
    for (const l of ['KJs', 'AJo', 'T9s', '72o']) expect(state(l), l).toBe('none');
    expect(screen.getByText(/combos/, { selector: '.reditor__stats span' })).toBeInTheDocument();
  });

  it('shows the offending token when the notation is wrong and keeps the range', async () => {
    const user = userEvent.setup();
    render(<Harness initial={parseRange('AA')} />);
    const input = screen.getByLabelText('Range text');
    await user.clear(input);
    await user.type(input, 'AA, ZZ+');
    await user.click(screen.getByRole('button', { name: 'Apply' }));
    expect(screen.getByRole('alert')).toHaveTextContent('ZZ+');
    expect(state('AA')).toBe('full');
    expect(input).toHaveAttribute('aria-invalid', 'true');
  });

  it('typing then pressing Enter applies', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    const input = screen.getByLabelText('Range text');
    await user.type(input, 'TT+{Enter}');
    expect(state('TT')).toBe('full');
    expect(state('99')).toBe('none');
  });
});

describe('RangeEditor: clear, all, invert', () => {
  it('works on the real combo weights', async () => {
    const user = userEvent.setup();
    let last: Range | undefined;
    render(<Harness initial={parseRange('AA')} onRange={(r) => (last = r)} />);
    await user.click(screen.getByRole('button', { name: 'All' }));
    expect(comboCount(last!)).toBe(1326);
    expect(state('72o')).toBe('full');
    await user.click(screen.getByRole('button', { name: 'Invert' }));
    expect(comboCount(last!)).toBe(0);
    await user.click(screen.getByRole('button', { name: 'Invert' }));
    expect(comboCount(last!)).toBe(1326);
    await user.click(screen.getByRole('button', { name: 'Clear' }));
    expect(comboCount(last!)).toBe(0);
    expect(state('AA')).toBe('none');
  });
});

describe('RangeEditor: library', () => {
  it('saves a named range locally and loads it back', async () => {
    const user = userEvent.setup();
    let last: Range | undefined;
    render(<Harness initial={parseRange('QQ+, AKs')} onRange={(r) => (last = r)} />);
    await user.type(screen.getByLabelText('Name to save this range under'), 'Value 3bet');
    await user.click(screen.getByRole('button', { name: 'Save range' }));
    expect(JSON.parse(localStorage.getItem('poker-coach:ranges:v1')!)[0]).toMatchObject({ name: 'Value 3bet' });

    await user.click(screen.getByRole('button', { name: 'Clear' }));
    expect(comboCount(last!)).toBe(0);
    const select = screen.getByLabelText('Load a range');
    await user.selectOptions(select, screen.getByRole('option', { name: 'Value 3bet' }));
    await user.click(screen.getByRole('button', { name: 'Load selected range' }));
    expect(comboCount(last!)).toBe(3 * 6 + 4);
    expect(state('QQ')).toBe('full');
    expect(state('AKs')).toBe('full');
  });

  it('loads a bot profile range and deletes a saved one', async () => {
    const user = userEvent.setup();
    let last: Range | undefined;
    render(<Harness onRange={(r) => (last = r)} />);
    await user.selectOptions(screen.getByLabelText('Load a range'), screen.getByRole('option', { name: /^Nit/ }));
    await user.click(screen.getByRole('button', { name: 'Load selected range' }));
    expect(comboCount(last!)).toBe(comboCount(botRange('nit')));
    expect(state('AA')).toBe('full');
    expect(state('99')).toBe('none');

    await user.type(screen.getByLabelText('Name to save this range under'), 'Temp');
    await user.click(screen.getByRole('button', { name: 'Save range' }));
    await user.selectOptions(screen.getByLabelText('Load a range'), screen.getByRole('option', { name: 'Temp' }));
    await user.click(screen.getByRole('button', { name: 'Delete selected saved range' }));
    expect(screen.queryByRole('option', { name: 'Temp' })).toBeNull();
    expect(JSON.parse(localStorage.getItem('poker-coach:ranges:v1')!)).toEqual([]);
  });

  it('refuses to save without a name or an empty range', async () => {
    const user = userEvent.setup();
    render(<Harness initial={parseRange('AA')} />);
    await user.click(screen.getByRole('button', { name: 'Save range' }));
    expect(await screen.findByText('Give the range a name first')).toBeInTheDocument();
    expect(localStorage.getItem('poker-coach:ranges:v1')).toBeNull();
  });
});

describe('RangeLab', () => {
  const setRange = async (user: ReturnType<typeof userEvent.setup>, text: string) => {
    const input = screen.getByLabelText('Range text');
    await user.clear(input);
    await user.type(input, `${text}{Enter}`);
  };

  it('edits two ranges, applies blockers from hero cards and board, and compares them (exact)', async () => {
    const user = userEvent.setup();
    render(
      <ToastProvider>
        <RangeLab />
      </ToastProvider>,
    );
    await user.type(screen.getByLabelText('Hero cards'), 'As Ks');
    await user.type(screen.getByLabelText('Board'), 'Jd 8s 4c');
    await setRange(user, 'AA, KK');
    expect(screen.getByRole('radio', { name: /Range A · 0\.9%/ })).toBeInTheDocument();
    expect(state('AA')).toBe('full');
    expect(cell('AA').getAttribute('aria-label')).toContain('3 of 6 combos available'); // the ace of spades blocks 3

    await user.click(screen.getByRole('radio', { name: /Range B/ }));
    await setRange(user, 'QQ, TT');
    await user.click(screen.getByRole('button', { name: 'Compute equity' }));
    const result = await screen.findByRole('region', { name: 'Equity result' });
    expect(result).toHaveTextContent('Exact');
    expect(result).toHaveTextContent('possible matchups');
    expect(result).toHaveTextContent('As Ks vs A');
    // equities sum to 100%
    const values = [...result.querySelectorAll('.side__eq')].map((e) => parseFloat(e.textContent!));
    expect(values[0]! + values[1]!).toBeCloseTo(100, 0);
  });

  it('flags an estimate when the matchup is too large for exact enumeration', async () => {
    const user = userEvent.setup();
    render(
      <ToastProvider>
        <RangeLab />
      </ToastProvider>,
    );
    await setRange(user, '22+, A2s+, K9s+, ATo+');
    await user.click(screen.getByRole('radio', { name: /Range B/ }));
    await setRange(user, '55+, ATs+, KQs, AJo+');
    await user.click(screen.getByRole('button', { name: 'Compute equity' }));
    const result = await screen.findByRole('region', { name: 'Equity result' });
    await waitFor(() => expect(result).toHaveTextContent('Estimated'));
    expect(result).toHaveTextContent('20 000 samples');
    expect(result).toHaveTextContent('seed 1');
  });

  it('validates cards and empty ranges before computing', async () => {
    const user = userEvent.setup();
    render(
      <ToastProvider>
        <RangeLab />
      </ToastProvider>,
    );
    await user.click(screen.getByRole('button', { name: 'Compute equity' }));
    expect(await screen.findByText('Both ranges need at least one hand.')).toBeInTheDocument();
    await user.type(screen.getByLabelText('Board'), 'Jd 8s');
    expect(screen.getAllByRole('alert')[0]).toHaveTextContent('Board: 3, 4, 5 cards expected');
    await user.clear(screen.getByLabelText('Board'));
    await user.type(screen.getByLabelText('Hero cards'), 'zz');
    expect(screen.getAllByRole('alert')[0]).toHaveTextContent('Hero cards: cannot read cards');
  });
});
