import { describe, expect, it } from 'vitest';
import { applyAction, getLegalActions, seededRng, startHand } from '../../engine';
import { defaultAmount, sizePresets, snapAmount } from '../actions/betSizing';
import { formatAmount, makeFormatter } from '../format';
import { chipCount } from '../table/ChipStack';
import { seatSpec } from '../table/seatLayout';
import { buildResultView, lastActions } from '../game/views';
import { assertConsistent, newGame, play, rigged } from '../../engine/__tests__/helpers';

describe('formatAmount', () => {
  it('formats big blinds with at most one decimal', () => {
    expect(formatAmount(20, 20, 'bb')).toBe('1');
    expect(formatAmount(50, 20, 'bb')).toBe('2.5');
    expect(formatAmount(10, 20, 'bb')).toBe('0.5');
    expect(formatAmount(2000, 20, 'bb')).toBe('100');
    expect(formatAmount(1989, 20, 'bb')).toBe('99.5');
    expect(formatAmount(0, 20, 'bb')).toBe('0');
  });
  it('formats raw chips with grouping', () => {
    expect(formatAmount(1250, 20, 'chips')).toMatch(/^1\s?250$/);
    expect(formatAmount(40, 20, 'chips')).toBe('40');
  });
  it('builds sentences with a unit only in blind mode', () => {
    expect(makeFormatter(20, 'bb').full(50)).toBe('2.5 BB');
    expect(makeFormatter(20, 'chips').full(50)).toBe('50');
  });
});

describe('bet sizing presets (from engine state)', () => {
  it('derives pot fractions from the real pot and call amount', () => {
    // 3-handed, preflop: BTN to act, pot 30, to call 20 -> pot after call 50
    const s = startHand(newGame([2000, 2000, 2000], { sb: 10, bb: 20 }), seededRng(1));
    const legal = getLegalActions(s)!;
    expect(s.pot).toBe(30);
    expect(legal.toCall).toBe(20);
    const presets = sizePresets(s, legal);
    expect(presets[0]).toEqual({ key: 'min', label: 'MIN', to: 40 });
    // raiseTo = currentBet(20) + f * (30 + 20), rounded to the small blind
    expect(presets.find((p) => p.key === 'half')!.to).toBe(50); // 20 + 25
    expect(presets.find((p) => p.key === 'twoThirds')).toBeUndefined(); // 20 + 33 -> 50, a duplicate of 1/2 pot
    expect(presets.find((p) => p.key === 'pot')!.to).toBe(70); // 20 + 50
    expect(presets.at(-1)).toEqual({ key: 'allin', label: 'ALL-IN', to: 2000 });
  });

  it('keeps every preset inside the legal range, sorted and unique', () => {
    const rng = seededRng(9);
    for (let i = 0; i < 60; i++) {
      let s = startHand(newGame([300, 1500, 2000, 80], { sb: 10, bb: 20 }), rng);
      for (let step = 0; step < 6 && s.handStatus === 'inProgress'; step++) {
        const legal = getLegalActions(s)!;
        const presets = sizePresets(s, legal);
        const tos = presets.map((p) => p.to);
        expect(new Set(tos).size).toBe(tos.length);
        expect([...tos].sort((a, b) => a - b)).toEqual(tos);
        for (const p of presets) {
          expect(p.to).toBeGreaterThanOrEqual(legal.minRaiseTo!);
          expect(p.to).toBeLessThanOrEqual(legal.maxRaiseTo);
        }
        s = applyAction(s, legal.check ? { type: 'check' } : { type: 'call' });
      }
    }
  });

  it('is empty when neither bet nor raise is legal', () => {
    const s = startHand(newGame([2000, 2000, 2000], { sb: 10, bb: 20 }), seededRng(2));
    const legal = getLegalActions(s)!;
    expect(sizePresets(s, { ...legal, raise: false, bet: false })).toEqual([]);
  });

  it('snaps slider values to the step but keeps exact min and max', () => {
    expect(snapAmount(43, 40, 2000, 10)).toBe(40);
    expect(snapAmount(47, 40, 2000, 10)).toBe(50);
    expect(snapAmount(1996, 40, 2000, 10)).toBe(2000);
    expect(snapAmount(-5, 40, 2000, 10)).toBe(40);
    expect(snapAmount(123, 40, 2000, 10)).toBe(120);
  });

  it('defaults to 2/3 pot, then 1/2 pot, then the minimum', () => {
    expect(defaultAmount([{ key: 'min', label: 'MIN', to: 40 }, { key: 'twoThirds', label: '2/3 POT', to: 90 }], 40)).toBe(90);
    expect(defaultAmount([{ key: 'min', label: 'MIN', to: 40 }, { key: 'half', label: '1/2 POT', to: 70 }], 40)).toBe(70);
    expect(defaultAmount([{ key: 'min', label: 'MIN', to: 40 }], 40)).toBe(40);
  });
});

describe('table layout', () => {
  it('places every seat inside the stage and bets between seat and center', () => {
    for (let bots = 1; bots <= 5; bots++) {
      for (let i = 1; i <= bots; i++) {
        const { seat, bet } = seatSpec(bots, i);
        expect(seat.x).toBeGreaterThanOrEqual(10);
        expect(seat.x).toBeLessThanOrEqual(90);
        expect(seat.y).toBeGreaterThanOrEqual(0);
        expect(seat.y).toBeLessThan(70);
        // the bet marker is closer to the center than the seat is
        const d = (p: { x: number; y: number }) => Math.hypot(p.x - 50, (p.y - 50) * 0.6);
        expect(d(bet)).toBeLessThan(d(seat));
      }
    }
  });

  it('scales the chip stack with the bet size', () => {
    expect(chipCount(20, 20)).toBe(1);
    expect(chipCount(100, 20)).toBe(2);
    expect(chipCount(300, 20)).toBe(3);
    expect(chipCount(2000, 20)).toBe(4);
  });
});

describe('result view (presentation of engine results)', () => {
  it('describes a fold win', () => {
    const s = play(startHand(newGame([1000, 1000, 1000]), seededRng(1)), ['fold'], ['fold']);
    const v = buildResultView(s)!;
    expect(v.endedBy).toBe('fold');
    expect(v.winnerNames).toEqual(['Player 2']);
    expect(v.headline).toBe('bot');
    expect(v.heroNet).toBe(0);
    expect(v.handName).toBeNull();
  });

  it('describes a hero showdown win with highlighted cards', () => {
    let s = rigged(newGame([1000, 1000]), ['As Ah', 'Kd Qc'], '2h 7d 9s Jc 3d');
    s = play(s, ['call'], ['check'], ['check'], ['check'], ['check'], ['check'], ['check'], ['check']);
    const v = buildResultView(s)!;
    expect(v.headline).toBe('hero');
    expect(v.handName).toBe('Pair of aces');
    expect(v.heroNet).toBe(10);
    expect(v.gains).toEqual({ 0: 10 });
    expect(v.highlight.has('As')).toBe(true);
    expect(v.highlight.has('Ah')).toBe(true);
    expect(v.highlight.has('Kd')).toBe(false);
    expect(v.pots).toEqual([{ label: 'Main pot', amount: 20, winners: ['Player 0'], split: false }]);
  });

  it('describes a split pot', () => {
    let s = rigged(newGame([1000, 1000]), ['2c 3c', '4d 5d'], 'Th Jh Qh Kh Ah');
    s = play(s, ['call'], ['check'], ['check'], ['check'], ['check'], ['check'], ['check'], ['check']);
    const v = buildResultView(s)!;
    expect(v.headline).toBe('split');
    expect(v.pots[0]!.split).toBe(true);
    expect(v.heroNet).toBe(0);
  });

  it('lists main and side pots with their winners and refunds', () => {
    let s = rigged(newGame([200, 500, 1000]), ['As Ah', 'Kd Kc', 'Qd Qc'], '2h 7d 9s Jc 3d', 1);
    s = play(s, ['allin'], ['allin'], ['allin']);
    assertConsistent(s, 1700);
    const v = buildResultView(s)!;
    expect(v.pots.map((p) => [p.label, p.amount, p.winners])).toEqual([
      ['Main pot', 600, ['Player 0']],
      ['Side pot', 600, ['Player 1']],
    ]);
    expect(v.refunds).toEqual([{ name: 'Player 2', amount: 500 }]);
    expect(v.heroNet).toBe(400);
    expect(v.totalPot).toBe(1200);
  });

  it('names several side pots', () => {
    let s = rigged(newGame([100, 200, 300, 1000]), ['As Ah', 'Kd Kc', 'Qd Qc', 'Jd Jh'], '2h 7d 9s 4c 3d');
    s = play(s, ['allin'], ['allin'], ['allin'], ['allin']);
    expect(buildResultView(s)!.pots.map((p) => p.label)).toEqual(['Main pot', 'Side pot 1', 'Side pot 2']);
  });

  it('is null while the hand is in progress', () => {
    expect(buildResultView(startHand(newGame([1000, 1000]), seededRng(1)))).toBeNull();
  });
});

describe('lastActions', () => {
  it('keeps the last action of each player on the current street only', () => {
    let s = startHand(newGame([1000, 1000, 1000]), seededRng(1));
    s = play(s, ['raise', 40], ['fold'], ['call']);
    expect(s.street).toBe('flop');
    expect(lastActions(s)).toEqual({});
    s = play(s, ['check']);
    expect(lastActions(s)).toEqual({ 2: 'Check' });
  });

  it('reports folds and aggression during the street', () => {
    let s = startHand(newGame([1000, 1000, 1000]), seededRng(1));
    s = play(s, ['raise', 40], ['fold']);
    expect(lastActions(s)).toEqual({ 0: 'Raise', 1: 'Fold' });
  });
});
