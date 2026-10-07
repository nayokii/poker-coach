import { describe, expect, it } from 'vitest';
import { parseCards } from '../../../engine';
import { analyzeOuts, equityVsHand, equityVsRange, parseRange } from '..';

const P = parseCards;
const time = <T,>(label: string, f: () => T): { value: T; ms: number } => {
  const t0 = performance.now();
  const value = f();
  const ms = performance.now() - t0;
  console.info(`[perf] ${label}: ${ms.toFixed(0)} ms`);
  return { value, ms };
};

/** Loose guard rails (generous so slow CI machines do not flake): they catch accidental 10x regressions. */
describe('performance guard rails', () => {
  const wide = parseRange('22+, A2s+, K2s+, Q8s+, J8s+, T8s+, 98s, 87s, A2o+, K9o+, QTo+, JTo');

  it('exact equity vs a very wide range on the flop', () => {
    const { value, ms } = time(`exact flop vs ${wide.entries.length} combos`, () => equityVsRange(P('Ah Kh'), wide, P('7s 2d 9c')));
    expect(value.method).toBe('exact');
    expect(ms).toBeLessThan(15_000);
  });

  it('exact equity vs a range on the turn', () => {
    const { value, ms } = time('exact turn vs wide range', () => equityVsRange(P('Ah Kh'), wide, P('7s 2d 9c Jd')));
    expect(value.method).toBe('exact');
    expect(ms).toBeLessThan(3_000);
  });

  it('Monte Carlo preflop vs a wide range, 20,000 samples', () => {
    const { value, ms } = time('monte-carlo preflop 20k', () => equityVsRange(P('Ah Kh'), wide));
    expect(value.method).toBe('monte-carlo');
    expect(ms).toBeLessThan(5_000);
  });

  it('exact preflop hand vs hand (1.7M boards)', () => {
    const { ms } = time('exact preflop AA vs KK', () => equityVsHand(P('As Ah'), P('Kd Kc')));
    expect(ms).toBeLessThan(20_000);
  });

  it('outs analysis with a wide villain range', () => {
    const { ms } = time('outs + range quality', () => analyzeOuts(P('7h 6h'), P('Kh 2h Qc'), { villainRange: wide }));
    expect(ms).toBeLessThan(2_000);
  });
});

import { equityMultiway, equityRangeVsRange } from '..';

/** Multiway and range-vs-range: the cost model decides exact vs Monte Carlo; both must stay interactive. */
describe('multiway performance guard rails', () => {
  const tight = parseRange('QQ+, AKs, AKo');
  const wide2 = parseRange('22+, A2s+, K9s+, QTs+, JTs, ATo+, KJo+');

  it('heads-up exact hands, flop and turn', () => {
    const flop = time('heads-up flop exact', () => equityMultiway([{ hand: P('Ah Kh') }, { hand: P('Qs Qd') }], P('7s 2d 9c')));
    const turn = time('heads-up turn exact', () => equityMultiway([{ hand: P('Ah Kh') }, { hand: P('Qs Qd') }], P('7s 2d 9c Jd')));
    expect(flop.value.method).toBe('exact');
    expect(turn.value.method).toBe('exact');
    expect(flop.ms).toBeLessThan(2_000);
  });

  it('3-way and 4-way exact hands on the flop', () => {
    const three = time('3-way flop exact', () => equityMultiway([{ hand: P('Ah Kh') }, { hand: P('Qs Qd') }, { hand: P('5c 5d') }], P('7s 2d 9c')));
    const four = time('4-way flop exact', () => equityMultiway([{ hand: P('Ah Kh') }, { hand: P('Qs Qd') }, { hand: P('5c 5d') }, { hand: P('Tc Td') }], P('7s 2d 9c')));
    expect(three.value.method).toBe('exact');
    expect(four.value.method).toBe('exact');
    expect(four.ms).toBeLessThan(3_000);
  });

  it('3-way preflop exact hands (1.37M runouts)', () => {
    const r = time('3-way preflop exact', () => equityMultiway([{ hand: P('As Ah') }, { hand: P('Kd Kc') }, { hand: P('Qd Qc') }]));
    expect(r.value.method).toBe('exact');
    expect(r.ms).toBeLessThan(15_000);
  });

  it('hero vs two ranges on the turn stays exact; on the flop it switches to Monte Carlo by cost', () => {
    const turn = time('hero vs 2 ranges, turn', () => equityMultiway([{ hand: P('Ah Kh') }, { range: tight }, { range: tight }], P('7s 2d 9c Jd')));
    const flop = time('hero vs 2 wide ranges, flop', () => equityMultiway([{ hand: P('Ah Kh') }, { range: wide2 }, { range: wide2 }], P('7s 2d 9c')));
    expect(turn.value.method).toBe('exact');
    expect(flop.value.method).toBe('monte-carlo');
    expect(turn.ms).toBeLessThan(5_000);
    expect(flop.ms).toBeLessThan(5_000);
  });

  it('range vs range: flop, turn and preflop', () => {
    const turn = time('range vs range turn', () => equityRangeVsRange(tight, wide2, P('7s 2d 9c Jd')));
    const flop = time('range vs range flop', () => equityRangeVsRange(tight, wide2, P('7s 2d 9c')));
    const pre = time('range vs range preflop', () => equityRangeVsRange(wide2, tight));
    expect(turn.value.method).toBe('exact');
    expect(['exact', 'monte-carlo']).toContain(flop.value.method);
    expect(pre.value.method).toBe('monte-carlo');
    expect(turn.ms).toBeLessThan(5_000);
    expect(flop.ms).toBeLessThan(8_000);
    expect(pre.ms).toBeLessThan(5_000);
  });

  it('4-way and 6-way ranges by Monte Carlo (20,000 samples)', () => {
    const four = time('4-way ranges MC', () => equityMultiway([{ hand: P('Ah Kh') }, { range: wide2 }, { range: wide2 }, { range: tight }], P('7s 2d 9c')));
    const six = time('6-way ranges MC', () => equityMultiway([{ hand: P('Ah Kh') }, ...Array.from({ length: 5 }, () => ({ range: wide2 }))], P('7s 2d 9c')));
    expect(four.value.method).toBe('monte-carlo');
    expect(six.value.method).toBe('monte-carlo');
    expect(four.ms).toBeLessThan(5_000);
    expect(six.ms).toBeLessThan(8_000);
  });
});
