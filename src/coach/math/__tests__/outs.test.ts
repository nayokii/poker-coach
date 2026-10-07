import { describe, expect, it } from 'vitest';
import { HandCategory, cardToString, parseCards } from '../../../engine';
import { analyzeOuts, parseRange, type OutsAnalysis, type OutsOptions } from '..';

const run = (hero: string, board: string, opts: OutsOptions = {}): OutsAnalysis => analyzeOuts(parseCards(hero), parseCards(board), opts);
const names = (cs: readonly { rank: number; suit: string }[] | undefined): string[] => (cs ?? []).map((c) => cardToString(c as never)).sort();
const outNames = (a: OutsAnalysis): string[] => a.outs.map((o) => cardToString(o.card));

describe('flush draws', () => {
  const a = run('Ah 5h', 'Kh 9h 2c');

  it('finds 9 flush outs among 47 unknown cards', () => {
    expect(a.unknownCards).toBe(47);
    expect(a.knownCards).toBe(5);
    expect(a.cardsToCome).toBe(2);
    expect(a.byCategory[HandCategory.Flush]).toHaveLength(9);
    expect(names(a.byCategory[HandCategory.Flush]).every((c) => c.endsWith('h'))).toBe(true);
  });

  it('labels the draw and keeps every card once', () => {
    const fd = a.draws.find((d) => d.kind === 'flush-draw')!;
    expect(fd.outs).toBe(9);
    expect(new Set(outNames(a)).size).toBe(a.outs.length);
  });

  it('also reports the pair outs from ace-high, but not cards that only pair the board', () => {
    expect(names(a.byCategory[HandCategory.Pair])).toEqual(['5c', '5d', '5s', 'Ac', 'Ad', 'As']);
    const all = outNames(a);
    for (const boardPair of ['Ks', 'Kd', 'Kc', '9s', '9d', '9c', '2s', '2d']) expect(all).not.toContain(boardPair);
    expect(a.outs).toHaveLength(15);
  });

  it('shrinks with dead cards and recomputes the unknown count', () => {
    const d = run('Ah 5h', 'Kh 9h 2c', { dead: parseCards('3h 4h') });
    expect(d.unknownCards).toBe(45);
    expect(d.knownCards).toBe(7);
    expect(d.byCategory[HandCategory.Flush]).toHaveLength(7);
    expect(outNames(d)).not.toContain('3h');
  });

  it('on the turn there is one card to come and 46 unknown cards', () => {
    const t = run('Ah 5h', 'Kh 9h 2c Jd');
    expect(t.unknownCards).toBe(46);
    expect(t.cardsToCome).toBe(1);
    expect(t.probabilities.hitNextCard).toBeCloseTo(t.outs.length / 46, 12);
    expect(t.probabilities.hitByLastCard).toBeCloseTo(t.probabilities.hitNextCard, 12);
  });

  it('has no flush draw when the hero already has the flush', () => {
    const f = run('Ah 5h', 'Kh 9h 2h');
    expect(f.draws.find((d) => d.kind === 'flush-draw')).toBeUndefined();
    expect(f.byCategory[HandCategory.Flush]).toBeUndefined();
  });

  it('a flush draw that is only on the board is not the hero draw', () => {
    const b = run('Ac 5d', 'Kh 9h 2h Qh');
    expect(b.outs.some((o) => o.improvesTo === HandCategory.Flush && o.card.suit === 'h')).toBe(false);
    expect(b.draws.find((d) => d.kind === 'flush-draw')).toBeUndefined();
  });
});

describe('straight draws', () => {
  it('open-ended: 8 outs (4 of each end rank)', () => {
    const a = run('8h 7d', '6c 5s 2h');
    const sd = a.draws.find((d) => d.kind === 'open-ended-straight-draw')!;
    expect(sd.outs).toBe(8);
    expect(sd.completingRanks).toEqual([4, 9]);
    expect(a.byCategory[HandCategory.Straight]).toHaveLength(8);
    expect(a.outs).toHaveLength(14); // + 3 eights and 3 sevens for a pair
  });

  it('gutshot: 4 outs', () => {
    const a = run('9h 8d', '6c 5s 2h');
    const g = a.draws.find((d) => d.kind === 'gutshot')!;
    expect(g.outs).toBe(4);
    expect(g.completingRanks).toEqual([7]);
    expect(a.byCategory[HandCategory.Straight]).toHaveLength(4);
  });

  it('double gutshot: two non-adjacent completing ranks, 8 outs', () => {
    const a = run('3d 9c', '5h 6s 7d');
    const g = a.draws.find((d) => d.kind === 'double-gutshot')!;
    expect(g.completingRanks).toEqual([4, 8]);
    expect(g.outs).toBe(8);
  });

  it('wheel draws and broadway draws use the ace on both ends', () => {
    expect(run('Ah 2d', '3c 4s Kh').draws.find((d) => d.kind === 'gutshot')!.completingRanks).toEqual([5]);
    const oe = run('Th Jd', 'Qc Ks 2h').draws.find((d) => d.kind === 'open-ended-straight-draw')!;
    expect(oe.completingRanks).toEqual([9, 14]);
    expect(oe.outs).toBe(8);
    const wheelOe = run('2h 3d', '4c 5s Kh').draws.find((d) => d.kind === 'open-ended-straight-draw')!;
    expect(wheelOe.completingRanks).toEqual([6, 14]);
  });

  it('does not count a straight that the board makes for everybody', () => {
    const a = run('2c Kd', '5h 6s 7d 8c');
    // 4 and 9 complete a board straight 4-8 / 5-9 whichever hole cards the hero holds
    expect(a.outs.some((o) => o.improvesTo === HandCategory.Straight)).toBe(false);
  });

  it('a straight draw already beaten by a made flush offers no straight outs', () => {
    const a = run('8h 7h', '6h 5h Kh');
    expect(a.draws.find((d) => d.kind !== 'flush-draw')).toBeUndefined();
  });
});

describe('overlapping draws are never double counted', () => {
  const a = run('8h 7h', '6h 5h Kd');

  it('flush + open-ended: the shared cards are counted once', () => {
    const fd = a.draws.find((d) => d.kind === 'flush-draw')!;
    const sd = a.draws.find((d) => d.kind === 'open-ended-straight-draw')!;
    const shared = names(fd.cards).filter((c) => names(sd.cards).includes(c));
    expect(shared).toEqual(['4h', '9h']);
    expect(fd.outs).toBe(9);
    expect(sd.outs).toBe(8);
    // 9 hearts + 6 off-suit straight cards + 6 pair cards (8s 8d 8c 7s 7d 7c)
    expect(a.outs).toHaveLength(21);
    expect(new Set(outNames(a)).size).toBe(21);
  });

  it('files each card under its best category', () => {
    expect(names(a.byCategory[HandCategory.StraightFlush])).toEqual(['4h', '9h']);
    expect(a.byCategory[HandCategory.Flush]).toHaveLength(7);
    expect(a.byCategory[HandCategory.Straight]).toHaveLength(6);
  });
});

describe('pairs and sets', () => {
  it('trips -> full house or quads', () => {
    const a = run('7h 7d', '7c Kd 2s');
    expect(names(a.byCategory[HandCategory.FourOfAKind])).toEqual(['7s']);
    expect(names(a.byCategory[HandCategory.FullHouse])).toEqual(['2c', '2d', '2h', 'Kc', 'Kh', 'Ks']);
    expect(a.outs).toHaveLength(7);
  });

  it('two pair -> full house only with the right cards, not with a board-only improvement', () => {
    const a = run('Ah Kd', 'As Ks 5c');
    expect(names(a.byCategory[HandCategory.FullHouse])).toEqual(['Ac', 'Ad', 'Kc', 'Kh']);
    expect(a.outs).toHaveLength(4);
    expect(outNames(a)).not.toContain('5s'); // pairs the board: still two pair
  });

  it('pair -> trips and two pair', () => {
    const a = run('Kh Qd', 'Ks 9c 3d');
    expect(names(a.byCategory[HandCategory.ThreeOfAKind])).toEqual(['Kc', 'Kd']);
    expect(names(a.byCategory[HandCategory.TwoPair])).toEqual(expect.arrayContaining(['Qc', 'Qh', 'Qs']));
  });

  it('high card -> pair outs are listed and can be filtered away', () => {
    const all = run('Ah Kd', '9c 5s 2h');
    expect(names(all.byCategory[HandCategory.Pair])).toHaveLength(6);
    const noPairs = run('Ah Kd', '9c 5s 2h', { targets: [HandCategory.Straight, HandCategory.Flush] });
    expect(noPairs.outs).toHaveLength(0);
  });

  it('a pocket pair makes a set with 2 cards; board-pairing improvements are flagged, not hidden', () => {
    const a = run('Qh Qd', '9c 5s 2h');
    expect(names(a.byCategory[HandCategory.ThreeOfAKind])).toEqual(['Qc', 'Qs']);
    const viaBoard = a.outs.filter((o) => o.viaBoardPair);
    expect(viaBoard).toHaveLength(9); // 3 nines + 3 fives + 3 deuces make two pair with the board
    expect(viaBoard.every((o) => o.improvesTo === HandCategory.TwoPair)).toBe(true);
    expect(a.outs.filter((o) => !o.viaBoardPair)).toHaveLength(2);
  });
});

describe('out quality is never invented', () => {
  it('without a range: clean only when the completed hand is the nuts, otherwise unknown', () => {
    const a = run('Ah Kh', '9h 5h 2c');
    const q = (c: string) => a.outs.find((o) => cardToString(o.card) === c && o.improvesTo >= HandCategory.Flush)!;
    expect(q('Qh').quality).toBe('clean');
    expect(q('Qh').evidence).toMatchObject({ method: 'nuts-check', nuts: true });
    // a villain holding 7h 6h would make a straight flush with 8h
    expect(q('8h').quality).toBe('unknown');
    expect(q('8h').evidence).toMatchObject({ method: 'nuts-check', nuts: false });
    expect(a.outs.every((o) => o.quality !== 'dirty')).toBe(true); // dirty needs evidence (a range)
  });

  it('with a range: dirty when the range beats the completed hand', () => {
    const a = run('7h 6h', 'Kh 2h Qc', { villainRange: parseRange('AhJh'), targets: [HandCategory.Flush] });
    expect(a.outs.length).toBeGreaterThan(0);
    for (const o of a.outs) {
      if (['Ah', 'Jh'].includes(cardToString(o.card))) {
        expect(o.quality).toBe('unknown'); // the card itself blocks the only combo: nothing to compare
        expect(o.evidence.combosConsidered).toBe(0);
      } else {
        expect(o.quality).toBe('dirty');
        expect(o.evidence.beatenShare).toBe(1);
      }
    }
  });

  it('with a range: clean when the range cannot beat it', () => {
    const a = run('7h 6h', 'Kh 2h Qc', { villainRange: parseRange('QdJc'), targets: [HandCategory.Flush] });
    for (const o of a.outs) {
      expect(o.quality).toBe('clean');
      expect(o.evidence.beatenShare).toBe(0);
    }
  });

  it('with a range: in between is unknown, and thresholds are explicit overrides', () => {
    const range = parseRange('AhJh, QdJc');
    const a = run('7h 6h', 'Kh 2h Qc', { villainRange: range, targets: [HandCategory.Flush], dead: [] });
    const nonAce = a.outs.find((o) => cardToString(o.card) === '9h')!;
    expect(nonAce.evidence.beatenShare).toBe(0.5);
    expect(nonAce.quality).toBe('dirty'); // 0.5 >= default dirty threshold 0.3
    const b = run('7h 6h', 'Kh 2h Qc', {
      villainRange: range, targets: [HandCategory.Flush],
      thresholds: { cleanMaxBeatenShare: 0.1, dirtyMinBeatenShare: 0.9 },
    });
    expect(b.outs.find((o) => cardToString(o.card) === '9h')!.quality).toBe('unknown');
  });

  it('known cards remove combos from the range before judging', () => {
    // villain AhJh is impossible when the Ah is dead: the range is empty -> unknown, not clean
    const a = run('7h 6h', 'Kh 2h Qc', { villainRange: parseRange('AhJh'), dead: parseCards('Ah'), targets: [HandCategory.Flush] });
    for (const o of a.outs) {
      expect(o.quality).toBe('unknown');
      expect(o.evidence.combosConsidered).toBe(0);
    }
    expect(a.unknownQuality).toBe(a.outs.length);
  });
});

describe('input validation', () => {
  it('requires a flop or a turn and rejects duplicates', () => {
    expect(() => run('Ah 5h', 'Kh 9h')).toThrow(RangeError);
    expect(() => run('Ah 5h', 'Kh 9h 2c Jd Qs')).toThrow(RangeError);
    expect(() => run('Ah 5h', 'Ah 9h 2c')).toThrow(/duplicate/);
    expect(() => run('Ah 5h', 'Kh 9h 2c', { dead: parseCards('Kh') })).toThrow(/duplicate/);
    expect(() => analyzeOuts(parseCards('Ah'), parseCards('Kh 9h 2c'))).toThrow(RangeError);
  });

  it('is deterministic', () => {
    expect(run('Ah 5h', 'Kh 9h 2c')).toEqual(run('Ah 5h', 'Kh 9h 2c'));
  });
});
