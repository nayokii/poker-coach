import { describe, expect, it } from 'vitest';
import { parseCards } from '../../../engine';
import { PROFILES } from '../../../ai';
import {
  comboCount, handClassCombos, parseCombo, parseHandClass, parseRange, rangeToString, totalWeight, comboKey, equityVsRange,
} from '../../math';
import {
  BOT_RANGE_PROFILES, HAND_GROUPS, MATRIX_RANKS, TOTAL_COMBOS, WEIGHT_PRESETS, botRange, botRangePercent, buildMatrix, comboWeight,
  emptyRange, fullRange, groupRange, invertRange, isCellUniform, nextCellWeight, paintCells, rangePercent, setCellWeight, setComboWeight,
  toggleCell,
} from '..';

const hc = parseHandClass;
const cell = (m: ReturnType<typeof buildMatrix>, label: string) => m.flat().find((c) => c.label === label)!;
const keys = (r: ReturnType<typeof parseRange>) => new Set(r.entries.map((e) => comboKey(e.combo)));

describe('13x13 matrix', () => {
  const m = buildMatrix(emptyRange());

  it('is a perfect 13 x 13 square in A..2 order', () => {
    expect(m).toHaveLength(13);
    m.forEach((row) => expect(row).toHaveLength(13));
    expect(MATRIX_RANKS[0]).toBe(14);
    expect(MATRIX_RANKS[12]).toBe(2);
    expect(m[0]![0]!.label).toBe('AA');
    expect(m[12]![12]!.label).toBe('22');
  });

  it('pairs on the diagonal, suited above, offsuit below', () => {
    for (let i = 0; i < 13; i++) expect(m[i]![i]!.handClass.kind).toBe('pair');
    expect(m[0]![1]!.label).toBe('AKs'); // row A, column K: above the diagonal
    expect(m[1]![0]!.label).toBe('AKo'); // row K, column A: below the diagonal
    for (let r = 0; r < 13; r++) {
      for (let c = 0; c < 13; c++) {
        const k = m[r]![c]!.handClass.kind;
        expect(k).toBe(r === c ? 'pair' : c > r ? 'suited' : 'offsuit');
      }
    }
  });

  it('has 6 / 4 / 12 combos per cell and 1326 in total', () => {
    expect(cell(m, 'AA').totalCombos).toBe(6);
    expect(cell(m, 'AKs').totalCombos).toBe(4);
    expect(cell(m, 'AKo').totalCombos).toBe(12);
    expect(m.flat().reduce((s, c) => s + c.totalCombos, 0)).toBe(TOTAL_COMBOS);
    expect(new Set(m.flat().map((c) => c.label)).size).toBe(169);
  });

  it('an empty range has no selection and a full range selects everything', () => {
    expect(m.flat().every((c) => c.state === 'none' && c.fraction === 0)).toBe(true);
    const f = buildMatrix(fullRange());
    expect(f.flat().every((c) => c.state === 'full' && c.fraction === 1)).toBe(true);
  });
});

describe('selecting from range text (engine parser)', () => {
  it('maps 22+, AJs+, KQs, AQo+ onto the right cells', () => {
    const m = buildMatrix(parseRange('22+, AJs+, KQs, AQo+'));
    const full = m.flat().filter((c) => c.state === 'full').map((c) => c.label).sort();
    const expected = [
      ...'AKQJT98765432'.split('').map((r) => r + r),
      'AJs', 'AQs', 'AKs', 'KQs', 'AQo', 'AKo',
    ].sort();
    expect(full).toEqual(expected);
    expect(m.flat().filter((c) => c.state === 'none')).toHaveLength(169 - expected.length);
  });

  it('round-trips with rangeToString', () => {
    const r = parseRange('22+, AJs+, KQs, AQo+');
    expect(keys(parseRange(rangeToString(r)))).toEqual(keys(r));
  });
});

describe('editing: tap, brush, partial combos', () => {
  it('toggles a cell on and off', () => {
    const on = toggleCell(emptyRange(), hc('AKs'));
    expect(comboCount(on)).toBe(4);
    expect(cell(buildMatrix(on), 'AKs').state).toBe('full');
    const off = toggleCell(on, hc('AKs'));
    expect(comboCount(off)).toBe(0);
  });

  it('percent brushes are real combo weights', () => {
    for (const w of WEIGHT_PRESETS) {
      const r = setCellWeight(emptyRange(), hc('QQ'), w);
      expect(totalWeight(r)).toBeCloseTo(6 * w, 12);
      const c = cell(buildMatrix(r), 'QQ');
      expect(c.weight).toBeCloseTo(6 * w, 12);
      expect(c.state).toBe(w === 0 ? 'none' : w === 1 ? 'full' : 'partial');
      expect(c.fraction).toBeCloseTo(w, 12);
    }
  });

  it('50% on QQ changes the equity calculation exactly like a half-weight range', () => {
    const hero = parseCards('Ah Kh');
    const board = parseCards('7s 2d 9c');
    const mix = parseRange('KK, QQ:0.5');
    const viaMatrix = paintCells(setCellWeight(emptyRange(), hc('KK'), 1), [hc('QQ')], 0.5);
    expect(keys(viaMatrix)).toEqual(keys(mix));
    const a = equityVsRange(hero, viaMatrix, board);
    const b = equityVsRange(hero, mix, board);
    expect(a.equity).toBeCloseTo(b.equity, 12);
    const full = equityVsRange(hero, parseRange('KK, QQ'), board);
    expect(a.equity).not.toBeCloseTo(full.equity, 4);
  });

  it('a tap with the same brush clears the cell, with another brush replaces it', () => {
    const half = setCellWeight(emptyRange(), hc('QQ'), 0.5);
    expect(nextCellWeight(half, hc('QQ'), 0.5)).toBe(0);
    expect(nextCellWeight(half, hc('QQ'), 1)).toBe(1);
    expect(nextCellWeight(half, hc('QQ'), 0)).toBe(0);
    expect(isCellUniform(half, hc('QQ'), 0.5)).toBe(true);
    expect(totalWeight(toggleCell(half, hc('QQ'), 0.75))).toBeCloseTo(4.5, 12);
  });

  it('individual combos make a cell partial', () => {
    const r = setComboWeight(emptyRange(), parseCombo('AsKs'), 1);
    const c = cell(buildMatrix(r), 'AKs');
    expect(c.state).toBe('partial');
    expect(c.presentCombos).toBe(1);
    expect(c.fraction).toBe(0.25);
    expect(comboWeight(r, parseCombo('AsKs'))).toBe(1);
    expect(comboWeight(r, parseCombo('AhKh'))).toBe(0);
    expect(comboCount(setComboWeight(r, parseCombo('AsKs'), 0))).toBe(0);
  });

  it('paints several cells at once and rejects invalid weights', () => {
    const r = paintCells(emptyRange(), [hc('AA'), hc('KK'), hc('AKs')], 1);
    expect(comboCount(r)).toBe(16);
    expect(() => setCellWeight(emptyRange(), hc('AA'), 1.5)).toThrow(RangeError);
    expect(() => setComboWeight(emptyRange(), parseCombo('AsKs'), -1)).toThrow(RangeError);
  });

  it('inverts every combo weight: 1 - w', () => {
    expect(comboCount(invertRange(emptyRange()))).toBe(1326);
    expect(comboCount(invertRange(fullRange()))).toBe(0);
    const inv = invertRange(parseRange('AA'));
    expect(comboCount(inv)).toBe(1320);
    expect(keys(invertRange(inv))).toEqual(keys(parseRange('AA')));
    const half = invertRange(parseRange('QQ:0.5'));
    expect(comboWeight(half, handClassCombos(hc('QQ'))[0]!)).toBe(0.5);
    expect(comboWeight(half, handClassCombos(hc('AA'))[0]!)).toBe(1);
  });

  it('reports the percentage of all hands', () => {
    expect(rangePercent(fullRange())).toBe(100);
    expect(rangePercent(emptyRange())).toBe(0);
    expect(rangePercent(parseRange('AA'))).toBeCloseTo((6 / 1326) * 100, 10);
    expect(rangePercent(parseRange('22+'))).toBeCloseTo((78 / 1326) * 100, 10);
  });
});

describe('blockers in the matrix', () => {
  const dead = parseCards('As Ks');

  it('AKs goes from 4 to 3 combos when As Ks are known', () => {
    const c = cell(buildMatrix(parseRange('AKs'), dead), 'AKs');
    expect(c.totalCombos).toBe(4);
    expect(c.availableCombos).toBe(3);
    expect(c.blockedCombos).toBe(1);
    expect(c.state).toBe('full'); // every combo that can still exist is selected
    expect(c.weight).toBe(3);
  });

  it('AA loses 3 combos to the ace of spades, AKo loses 6', () => {
    const m = buildMatrix(parseRange('AA, AKo'), dead);
    expect(cell(m, 'AA').availableCombos).toBe(3);
    expect(cell(m, 'AKo').availableCombos).toBe(6);
  });

  it('a cell whose combos are all blocked is disabled', () => {
    const m = buildMatrix(parseRange('AA'), parseCards('As Ah Ad Ac'));
    expect(cell(m, 'AA').state).toBe('disabled');
    expect(cell(m, 'AKs').state).toBe('disabled');
    expect(cell(m, 'KK').state).not.toBe('disabled');
    expect(cell(m, 'KK').availableCombos).toBe(6);
  });

  it('does not edit the range itself', () => {
    const r = parseRange('AKs');
    buildMatrix(r, dead);
    expect(comboCount(r)).toBe(4);
  });

  it('selected combos that are blocked are not counted as weight', () => {
    const c = cell(buildMatrix(parseRange('AKs:0.5'), dead), 'AKs');
    expect(c.weight).toBeCloseTo(1.5, 12);
    expect(c.state).toBe('partial');
  });
});

describe('bot profile ranges', () => {
  const ids = ['nit', 'tag', 'lag', 'station', 'maniac'];
  const percent = Object.fromEntries(ids.map((id) => [id, botRangePercent(id)]));

  it('every bot profile of the game has a documented range', () => {
    expect(Object.keys(PROFILES).sort()).toEqual([...ids].sort());
    for (const id of ids) {
      expect(BOT_RANGE_PROFILES[id]).toBeDefined();
      expect(BOT_RANGE_PROFILES[id]!.description.length).toBeGreaterThan(20);
      expect(comboCount(botRange(id))).toBeGreaterThan(0);
    }
  });

  it('every hand group parses and is used by at least one profile', () => {
    const used = new Set(Object.values(BOT_RANGE_PROFILES).flatMap((p) => p.groupIds));
    for (const g of HAND_GROUPS) {
      expect(comboCount(groupRange(g.id)), g.id).toBeGreaterThan(0);
      expect(used.has(g.id), `${g.id} is unused`).toBe(true);
    }
    for (const id of used) expect(HAND_GROUPS.some((g) => g.id === id)).toBe(true);
  });

  it('are nested from tight to wide, with sensible sizes', () => {
    for (let i = 0; i < ids.length - 1; i++) {
      const narrow = keys(botRange(ids[i]!));
      const wide = keys(botRange(ids[i + 1]!));
      for (const k of narrow) expect(wide.has(k)).toBe(true);
      expect(wide.size).toBeGreaterThan(narrow.size);
    }
    expect(percent.nit).toBeGreaterThan(2);
    expect(percent.nit).toBeLessThan(6);
    expect(percent.tag).toBeGreaterThan(8);
    expect(percent.tag).toBeLessThan(16);
    expect(percent.lag).toBeGreaterThan(18);
    expect(percent.lag).toBeLessThan(32);
    expect(percent.station).toBeGreaterThan(35);
    expect(percent.station).toBeLessThan(55);
    expect(percent.maniac).toBeGreaterThan(55);
    expect(percent.maniac).toBeLessThan(75);
  });

  it('contain the hands a player of that type would obviously play (or never play)', () => {
    const has = (id: string, label: string) => {
      const r = keys(botRange(id));
      return handClassCombos(parseHandClass(label)).every((c) => r.has(comboKey(c)));
    };
    expect(has('nit', 'AA')).toBe(true);
    expect(has('nit', 'AKs')).toBe(true);
    expect(has('nit', 'JJ')).toBe(true);
    expect(has('nit', '99')).toBe(false);
    expect(has('nit', 'KQs')).toBe(false);
    expect(has('tag', '99')).toBe(true);
    expect(has('tag', '55')).toBe(false);
    expect(has('tag', '76s')).toBe(false);
    expect(has('lag', '76s')).toBe(true);
    expect(has('lag', 'A5s')).toBe(true);
    expect(has('lag', '72s')).toBe(false);
    expect(has('station', 'A2o')).toBe(true);
    expect(has('station', 'K5s')).toBe(true);
    expect(has('maniac', '72s')).toBe(true);
    expect(has('maniac', '72o')).toBe(false);
  });

  it('feed the matrix and the equity engine like any other range', () => {
    const m = buildMatrix(botRange('nit'));
    // TT JJ QQ KK AA + AQs AKs + AKo
    expect(m.flat().filter((c) => c.state === 'full')).toHaveLength(8);
    const eq = equityVsRange(parseCards('Ah Kh'), botRange('tag'), parseCards('7s 2d 9c'));
    expect(eq.equity).toBeGreaterThan(0.2);
    expect(eq.equity).toBeLessThan(0.6);
  });

  it('rejects unknown ids', () => {
    expect(() => botRange('shark')).toThrow();
    expect(() => groupRange('nope')).toThrow();
  });
});
