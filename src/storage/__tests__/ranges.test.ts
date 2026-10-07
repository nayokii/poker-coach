// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest';
import { deleteSavedRange, loadSavedRanges, saveRange } from '..';
import { parseRange, comboCount } from '../../coach/math';

beforeEach(() => localStorage.clear());

describe('saved ranges', () => {
  it('saves, lists newest first, and the text parses back through the engine', () => {
    saveRange('My 3-bet range', 'QQ+, AKs', 1000);
    saveRange('Wide', '22+, A2s+', 2000);
    const list = loadSavedRanges();
    expect(list.map((r) => r.name)).toEqual(['Wide', 'My 3-bet range']);
    expect(comboCount(parseRange(list[1]!.text))).toBe(3 * 6 + 4); // QQ KK AA + AKs
  });

  it('replaces a range with the same name (case-insensitive) instead of duplicating it', () => {
    saveRange('Value', 'AA', 1);
    const next = saveRange('value', 'AA, KK', 2);
    expect(next).toHaveLength(1);
    expect(next[0]!.text).toBe('AA, KK');
    expect(next[0]!.updatedAt).toBe(2);
  });

  it('deletes and survives corrupted storage', () => {
    const [a] = saveRange('A', 'AA', 1);
    expect(deleteSavedRange(a!.id)).toEqual([]);
    localStorage.setItem('poker-coach:ranges:v1', 'not json');
    expect(loadSavedRanges()).toEqual([]);
    localStorage.setItem('poker-coach:ranges:v1', JSON.stringify([{ id: 1 }, { id: 'x', name: '  ', text: 'AA' }, { id: 'y', name: 'ok', text: 'KK' }]));
    expect(loadSavedRanges().map((r) => r.name)).toEqual(['ok']);
  });

  it('requires a name and trims it', () => {
    expect(() => saveRange('   ', 'AA')).toThrow();
    expect(saveRange('  Long name that goes beyond twenty-four characters  ', 'AA')[0]!.name).toHaveLength(24);
  });
});
