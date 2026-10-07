import { describe, expect, it } from 'vitest';
import { createDeck, parseCards, HandCategory as C, evaluateHand, compareHands, describeHand } from '..';

const ev = (s: string) => evaluateHand(parseCards(s));
const cmp = (a: string, b: string) => Math.sign(compareHands(parseCards(a), parseCards(b)));

describe('category detection (5 cards)', () => {
  it.each([
    ['Ah Kd 9s 5c 3d', C.HighCard],
    ['Ah Ad 9s 5c 3d', C.Pair],
    ['Ah Ad 9s 9c 3d', C.TwoPair],
    ['Ah Ad As 9c 3d', C.ThreeOfAKind],
    ['5h 6d 7s 8c 9d', C.Straight],
    ['Ah 2d 3s 4c 5d', C.Straight], // wheel
    ['Th Jd Qs Kc Ad', C.Straight], // broadway
    ['Ah 9h 7h 5h 3h', C.Flush],
    ['Ah Ad As 9c 9d', C.FullHouse],
    ['Ah Ad As Ac 9d', C.FourOfAKind],
    ['5h 6h 7h 8h 9h', C.StraightFlush],
    ['Ah 2h 3h 4h 5h', C.StraightFlush], // steel wheel
    ['Th Jh Qh Kh Ah', C.StraightFlush], // royal
  ])('%s', (hand, cat) => {
    expect(ev(hand).category).toBe(cat);
  });

  it('does not wrap the straight around the ace (QKA23)', () => {
    expect(ev('Qh Kd As 2c 3d').category).toBe(C.HighCard);
  });
});

describe('ordering', () => {
  it('orders all categories', () => {
    const hands = [
      'Ah Kd 9s 5c 3d', 'Ah Ad 9s 5c 3d', 'Ah Ad 9s 9c 3d', 'Ah Ad As 9c 3d', '5h 6d 7s 8c 9d',
      'Ah 9h 7h 5h 3h', 'Ah Ad As 9c 9d', 'Ah Ad As Ac 9d', '5h 6h 7h 8h 9h',
    ];
    for (let i = 0; i < hands.length - 1; i++) {
      expect(cmp(hands[i]!, hands[i + 1]!)).toBe(-1);
    }
  });
  it('wheel is the lowest straight', () => {
    expect(cmp('Ah 2d 3s 4c 5d', '2h 3d 4s 5c 6d')).toBe(-1);
  });
  it('steel wheel loses to a six-high straight flush', () => {
    expect(cmp('Ah 2h 3h 4h 5h', '2s 3s 4s 5s 6s')).toBe(-1);
  });
  it('kickers decide pairs', () => {
    expect(cmp('Ah Ad Ks 5c 3d', 'As Ac Qs Jc Td')).toBe(1);
    expect(cmp('Ah Ad Ks 5c 3d', 'As Ac Ks 5d 2d')).toBe(1);
  });
  it('higher two pair / lower pair / kicker order', () => {
    expect(cmp('Kh Kd 2s 2c 3d', 'Qh Qd Js Jc Ad')).toBe(1);
    expect(cmp('Kh Kd 2s 2c 3d', 'Kh Kd 2s 2c 4d')).toBe(-1);
    expect(cmp('Kh Kd 3s 3c Ad', 'Kh Kd 2s 2c Ad')).toBe(1);
  });
  it('full house compares trips first', () => {
    expect(cmp('3h 3d 3s 2c 2d', 'Ah Ad Ks Kc Kd')).toBe(-1);
  });
  it('flush compares card by card', () => {
    expect(cmp('Ah Kh 9h 5h 3h', 'Ah Kh 9h 5h 2h')).toBe(1);
  });
  it('identical ranks in different suits tie', () => {
    expect(cmp('Ah Kd 9s 5c 3d', 'As Kc 9d 5h 3s')).toBe(0);
  });
  it('quads kicker', () => {
    expect(cmp('9h 9d 9s 9c Ad', '9h 9d 9s 9c Kd')).toBe(1);
  });
});

describe('7-card best-of selection', () => {
  it('finds a hidden flush', () => {
    const h = ev('Ah 9h 7h 5h 3h Kd Kc');
    expect(h.category).toBe(C.Flush);
    expect(h.tiebreak).toEqual([14, 9, 7, 5, 3]);
  });
  it('prefers full house over trips + pair on board with two trips', () => {
    const h = ev('Ah Ad As Kh Kd Kc 2s');
    expect(h.category).toBe(C.FullHouse);
    expect(h.tiebreak.slice(0, 2)).toEqual([14, 13]);
  });
  it('picks the best of three pairs', () => {
    const h = ev('Ah Ad Kh Kd Qh Qd 2s');
    expect(h.category).toBe(C.TwoPair);
    expect(h.tiebreak).toEqual([14, 13, 12]); // kicker is the Q, not the 2
  });
  it('straight flush beats a higher flush in the same suit', () => {
    const h = ev('9h 8h 7h 6h 5h Ah Kh');
    expect(h.category).toBe(C.StraightFlush);
    expect(h.tiebreak).toEqual([9]);
  });
  it('flush + straight (different cards) is only a flush', () => {
    expect(ev('2h 5h 9h Kh Jh 3d 4c').category).toBe(C.Flush);
  });
  it('picks the highest of 6 consecutive ranks', () => {
    expect(ev('2h 3d 4s 5c 6d 7h Kc').tiebreak).toEqual([7]);
  });
  it('two board-playing hands tie on the board', () => {
    expect(cmp('Th Jd Qs Kc Ad 2h 3h', 'Th Jd Qs Kc Ad 4s 4c')).toBe(0);
  });
  it('wheel inside 7 cards', () => {
    const h = ev('Ah 2d 3s 4c 5d Kh Kd');
    expect(h.category).toBe(C.Straight);
    expect(h.tiebreak).toEqual([5]);
  });
  it('quads beat a full house available in the same 7 cards', () => {
    expect(ev('9h 9d 9s 9c Ad Ah Kd').category).toBe(C.FourOfAKind);
  });
});

describe('validation and description', () => {
  it('rejects duplicates and wrong sizes', () => {
    expect(() => ev('Ah Ah 9s 5c 3d')).toThrow();
    expect(() => ev('Ah Kd 9s 5c')).toThrow();
  });
  it('describes hands', () => {
    expect(describeHand(ev('Ah Ad As Kc Kd'))).toBe('Full house, aces full of kings');
    expect(describeHand(ev('Th Jh Qh Kh Ah'))).toBe('Royal flush');
    expect(describeHand(ev('Ah 2d 3s 4c 5d'))).toBe('Straight, five high');
  });
});

describe('exhaustive validation: all C(52,5) hands match the known distribution', () => {
  it('has exactly the textbook counts', () => {
    const deck = createDeck();
    const counts = new Array<number>(9).fill(0);
    const hand = [deck[0]!, deck[0]!, deck[0]!, deck[0]!, deck[0]!];
    for (let a = 0; a < 48; a++)
      for (let b = a + 1; b < 49; b++)
        for (let c = b + 1; c < 50; c++)
          for (let d = c + 1; d < 51; d++)
            for (let e = d + 1; e < 52; e++) {
              hand[0] = deck[a]!; hand[1] = deck[b]!; hand[2] = deck[c]!;
              hand[3] = deck[d]!; hand[4] = deck[e]!;
              counts[evaluateHand(hand).category]!++;
            }
    expect(counts).toEqual([
      1302540, // high card
      1098240, // pair
      123552, // two pair
      54912, // trips
      10200, // straight
      5108, // flush
      3744, // full house
      624, // quads
      40, // straight flush (incl. 4 royals)
    ]);
  }, 300_000);
});
