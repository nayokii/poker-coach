import { describe, expect, it } from 'vitest';
import { parseCards } from '../../engine';
import { chenScore, drawBonus, postflopStrength, preflopStrength, straightOutRanks } from '../handStrength';

const hole = (s: string) => parseCards(s);

describe('chenScore (published values)', () => {
  it.each([
    ['As Ah', 20],
    ['Ks Kh', 16],
    ['As Ks', 12],
    ['As Kd', 10],
    ['Qs Qh', 14],
    ['Js Ts', 9],
    ['7s 6s', 7],
    ['7s 2d', -1],
    ['2s 2h', 5],
    ['Td 9c', 6],
  ])('%s = %i', (cards, expected) => {
    expect(chenScore(hole(cards))).toBe(expected);
  });

  it('normalises to 0..1 and orders hands sensibly', () => {
    expect(preflopStrength(hole('As Ah'))).toBeCloseTo(1, 5);
    expect(preflopStrength(hole('7s 2d'))).toBe(0);
    expect(preflopStrength(hole('As Ks'))).toBeGreaterThan(preflopStrength(hole('Ts 9d')));
  });
});

describe('postflopStrength', () => {
  const s = (h: string, b: string) => postflopStrength(hole(h), hole(b));

  it('orders made hands from air to the nuts', () => {
    const air = s('7s 2d', 'Kc 9h 4d');
    const pair = s('Ks 7d', 'Kc 9h 4d');
    const set = s('Ks Kd', 'Kc 9h 4d');
    const flush = s('As 5s', 'Ks 9s 4s');
    const boat = s('Ks 9d', 'Kc 9h 9c');
    expect(air).toBeLessThan(pair);
    expect(pair).toBeLessThan(set);
    expect(set).toBeLessThan(flush);
    expect(flush).toBeLessThan(boat);
  });

  it('values a pair that uses a hole card above a pair played by the board', () => {
    expect(s('Ks 7d', 'Kc 9h 4d')).toBeGreaterThan(s('Ac Qd', '9s 9h 4d'));
  });

  it('gives flush and straight draws a bonus, but not on the river', () => {
    expect(drawBonus(hole('As 5s'), hole('Ks 9s 2d'))).toBeGreaterThan(0);
    expect(drawBonus(hole('9s 8d'), hole('7c 6h 2d'))).toBeGreaterThan(0.1); // open-ended
    expect(drawBonus(hole('As 5s'), hole('Ks 9s 2d 3c 4h'))).toBe(0);
    expect(drawBonus(hole('7s 2d'), hole('Kc 9h 4d'))).toBe(0);
  });

  it('does not count a draw that exists only on the board', () => {
    expect(drawBonus(hole('Ad 2c'), hole('9s 8s 7s'))).toBe(0);
  });

  it('stays in 0..1', () => {
    expect(s('As Ah', 'Ac Ad 2h')).toBeLessThanOrEqual(1);
    expect(s('7s 2d', 'Kc 9h 4d')).toBeGreaterThanOrEqual(0);
  });
});

describe('straightOutRanks', () => {
  it('finds open-ended and gutshot outs, with the ace playing low', () => {
    expect(straightOutRanks(new Set([5, 6, 7, 8]))).toEqual([4, 9]);
    expect(straightOutRanks(new Set([5, 6, 8, 9]))).toEqual([7]);
    expect(straightOutRanks(new Set([14, 2, 3, 4]))).toEqual([5]);
    expect(straightOutRanks(new Set([14, 13, 12, 11]))).toEqual([10]);
  });
});
