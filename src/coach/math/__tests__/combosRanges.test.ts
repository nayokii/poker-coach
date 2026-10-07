import { describe, expect, it } from 'vitest';
import { parseCards } from '../../../engine';
import {
  ALL_HAND_CLASSES, allCombos, comboCount, comboToString, handClassCombos, handClassOf, handClassToString, makeCombo, mergeRanges,
  parseCombo, parseHandClass, parseRange, rangeFromCombos, rangeFromHandClasses, rangeToString, summarizeByClass, totalWeight,
  withoutDeadCards, RangeParseError, comboKey,
} from '..';
import { analyzeBlockers, blockersFor } from '..';

const names = (r: ReturnType<typeof parseRange>) => r.entries.map((e) => comboToString(e.combo)).sort();

describe('combos', () => {
  it('counts the combos of each class', () => {
    expect(handClassCombos(parseHandClass('AA'))).toHaveLength(6);
    expect(handClassCombos(parseHandClass('AKs'))).toHaveLength(4);
    expect(handClassCombos(parseHandClass('AKo'))).toHaveLength(12);
    expect(handClassCombos(parseHandClass('72o'))).toHaveLength(12);
  });

  it('has 1326 combos and 169 classes that partition them', () => {
    expect(allCombos()).toHaveLength(1326);
    expect(ALL_HAND_CLASSES).toHaveLength(169);
    const seen = new Set<number>();
    let total = 0;
    for (const h of ALL_HAND_CLASSES) {
      for (const c of handClassCombos(h)) {
        seen.add(comboKey(c));
        total++;
        expect(handClassToString(handClassOf(c))).toBe(handClassToString(h));
      }
    }
    expect(total).toBe(1326);
    expect(seen.size).toBe(1326);
  });

  it('lists the matrix in AA, AK, AQ... order with suited above and offsuit below the diagonal', () => {
    const t = ALL_HAND_CLASSES.map(handClassToString);
    expect(t.slice(0, 4)).toEqual(['AA', 'AKs', 'AQs', 'AJs']);
    expect(t[13]).toBe('AKo');
    expect(t[14]).toBe('KK');
    expect(t.at(-1)).toBe('22');
  });

  it('is order independent and round-trips through strings', () => {
    expect(makeCombo(5, 9)).toEqual(makeCombo(9, 5));
    expect(comboToString(parseCombo('KdAs'))).toBe('AsKd');
    expect(comboToString(parseCombo('7c7h'))).toBe('7h7c');
    expect(() => makeCombo(3, 3)).toThrow();
    expect(() => parseCombo('AsAs')).toThrow();
    expect(() => parseHandClass('AK')).toThrow();
    expect(() => parseHandClass('AAs')).toThrow();
  });
});

describe('range parsing', () => {
  it('parses pairs, suited, offsuit and both', () => {
    expect(comboCount(parseRange('AA'))).toBe(6);
    expect(comboCount(parseRange('AKs'))).toBe(4);
    expect(comboCount(parseRange('AKo'))).toBe(12);
    expect(comboCount(parseRange('AK'))).toBe(16);
  });

  it('expands the plus notation for pairs and non-pairs', () => {
    expect(comboCount(parseRange('22+'))).toBe(13 * 6);
    expect(comboCount(parseRange('TT+'))).toBe(5 * 6); // TT JJ QQ KK AA
    expect(comboCount(parseRange('AJs+'))).toBe(3 * 4); // AJs AQs AKs
    expect(comboCount(parseRange('AQo+'))).toBe(2 * 12); // AQo AKo
    expect(comboCount(parseRange('KTs+'))).toBe(3 * 4); // KTs KJs KQs
    expect(comboCount(parseRange('A2s+'))).toBe(12 * 4);
    expect(comboCount(parseRange('KQs+'))).toBe(4); // already at the top
    expect(comboCount(parseRange('AJ+'))).toBe(3 * 16);
  });

  it('parses the example range from the spec, in any separator style', () => {
    const a = parseRange('22+, AJs+, KQs, AQo+');
    expect(comboCount(a)).toBe(13 * 6 + 3 * 4 + 4 + 2 * 12);
    expect(names(parseRange('22+ AJs+ KQs AQo+'))).toEqual(names(a));
    expect(names(parseRange('22+;AJs+;KQs;AQo+'))).toEqual(names(a));
    expect(names(parseRange('  22+ ,  aJs+, kqs ,AQO+ '))).toEqual(names(a));
  });

  it('parses spans', () => {
    expect(comboCount(parseRange('77-44'))).toBe(4 * 6);
    expect(comboCount(parseRange('44-77'))).toBe(4 * 6);
    expect(comboCount(parseRange('A5s-A2s'))).toBe(4 * 4);
  });

  it('counts a same-gap span inclusively', () => {
    // T9s, 98s, 87s, 76s, 65s = 5 classes
    expect(comboCount(parseRange('T9s-65s'))).toBe(5 * 4);
    expect(comboCount(parseRange('A5s-A2s'))).toBe(4 * 4);
  });

  it('parses exact combos and weights', () => {
    const r = parseRange('AsKd, QQ:0.5');
    expect(comboCount(r)).toBe(7);
    expect(totalWeight(r)).toBeCloseTo(1 + 3, 10);
    expect(rangeFromCombos(['AsKd', 'AsKh']).entries).toHaveLength(2);
  });

  it('keeps the largest weight when tokens overlap and never double counts', () => {
    const r = parseRange('AKs, AKs:0.5, AK');
    expect(comboCount(r)).toBe(16);
    expect(totalWeight(r)).toBe(16);
    expect(comboCount(parseRange('AA, AA, AA+'))).toBe(6);
    expect(comboCount(parseRange('22+, 99'))).toBe(13 * 6);
  });

  it('merges ranges', () => {
    const m = mergeRanges(parseRange('AA'), parseRange('KK'), parseRange('AA:0.5'));
    expect(comboCount(m)).toBe(12);
    expect(totalWeight(m)).toBe(12);
  });

  it('rejects malformed notation with the offending token', () => {
    for (const bad of ['AAs', 'AK+x', 'ZZ', 'AKs-QJo', 'A5s-K2s', '77-', 'AA:0', 'AA:1.5', 'AA:x', 'AsAs', 'xyz', 'AKs:0.5:1']) {
      expect(() => parseRange(bad), bad).toThrow(RangeParseError);
    }
    try {
      parseRange('AA, ZZ');
    } catch (e) {
      expect((e as RangeParseError).token).toBe('ZZ');
    }
  });

  it('builds ranges from classes and from strings equivalently', () => {
    expect(names(rangeFromHandClasses(['AA', 'AKs']))).toEqual(names(parseRange('AA, AKs')));
  });

  it('round-trips through rangeToString', () => {
    for (const text of ['AA', 'AKs, QQ', 'AsKd', 'QQ:0.5', '22+, AJs+, KQs, AQo+']) {
      const r = parseRange(text);
      expect(names(parseRange(rangeToString(r)))).toEqual(names(r));
      expect(totalWeight(parseRange(rangeToString(r)))).toBeCloseTo(totalWeight(r), 10);
    }
  });

  it('summarises by class (matrix data)', () => {
    const s = summarizeByClass(parseRange('AA, AKs:0.5, AsKd'));
    const byName = Object.fromEntries(s.map((x) => [handClassToString(x.handClass), x]));
    expect(byName.AA).toMatchObject({ combos: 6, fraction: 1 });
    expect(byName.AKs).toMatchObject({ combos: 4, fraction: 0.5 });
    expect(byName.AKo).toMatchObject({ combos: 1 });
    expect(byName.AKo!.fraction).toBeCloseTo(1 / 12, 10);
  });
});

describe('dead cards and blockers (derived from real combos)', () => {
  const hero = parseCards('As Ks');

  it('AKs loses every combo that uses As or Ks (only AsKs does)', () => {
    const r = withoutDeadCards(parseRange('AKs'), hero);
    expect(names(r)).toEqual(['AcKc', 'AdKd', 'AhKh']);
    expect(comboCount(r)).toBe(3);
  });

  it('AKo loses the 3 + 3 offsuit combos that use As or Ks', () => {
    // AKo has 12 combos; those with As: 3 (As with Kh, Kd, Kc), with Ks: 3 (Ah, Ad, Ac with Ks)
    expect(comboCount(withoutDeadCards(parseRange('AKo'), hero))).toBe(6);
  });

  it('reports blocked and remaining combos for the example in the spec', () => {
    const rep = blockersFor('AKs', hero);
    expect(rep.totalCombos).toBe(4);
    expect(rep.blockedCombos).toBe(1); // only AsKs itself uses both dead cards
    expect(rep.remainingCombos).toBe(3);
  });

  it('AA is blocked by one ace: 6 -> 3 combos', () => {
    const rep = blockersFor('AA', parseCards('As 7c'));
    expect([rep.totalCombos, rep.blockedCombos, rep.remainingCombos]).toEqual([6, 3, 3]);
    expect(rep.blockedByCard.As).toBe(3);
    expect(rep.blockedByCard['7c']).toBe(0);
  });

  it('AK (16 combos) with As Ks in hand: 7 remain', () => {
    // combos using As: 4 suited-or-offsuit with each K = 4 (As + K*); using Ks: 4; both: AsKs counted once
    const rep = blockersFor('AK', hero);
    expect(rep.blockedCombos).toBe(7);
    expect(rep.remainingCombos).toBe(9); // 3 aces x 3 kings
  });

  it('a pair is blocked by two dead cards of the same rank completely down to one combo', () => {
    expect(blockersFor('KK', parseCards('Ks Kh')).remainingCombos).toBe(1);
    expect(blockersFor('KK', parseCards('Ks Kh Kd')).remainingCombos).toBe(0);
  });

  it('counts every dead card and weighted combos for partial ranges', () => {
    const rep = analyzeBlockers(parseRange('AA:0.5'), parseCards('As'));
    expect(rep.totalWeight).toBe(3);
    expect(rep.remainingWeight).toBe(1.5);
    expect(rep.blockedWeight).toBe(1.5);
  });

  it('works for any hand class, e.g. a board card blocking a flush-draw range', () => {
    const rep = blockersFor('JTs', parseCards('Jh 2c 9d'));
    expect([rep.blockedCombos, rep.remainingCombos]).toEqual([1, 3]);
  });

  it('known cards that are not in the range block nothing', () => {
    const rep = blockersFor('AA', parseCards('Kd Qc'));
    expect(rep.blockedCombos).toBe(0);
  });
});
