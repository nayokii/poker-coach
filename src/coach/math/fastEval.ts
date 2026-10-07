/**
 * Allocation-free 5..7 card evaluator for the math engine's hot loops (equity, outs quality).
 *
 * Cards are the engine's integer indices: index = (rank - 2) * 4 + suit, suit order s,h,d,c.
 * The returned score uses EXACTLY the same encoding as engine `evaluateHand().score`
 * (category * 16^5 + up to five rank tiebreakers), so both are interchangeable and the
 * engine evaluator stays the reference: tests assert equality on random hands and on the
 * exhaustive 5-card distribution.
 */
import { cardIndex, type Card } from '../../engine';

export const CATEGORY_SHIFT = 20;

/** Highest straight (top rank index 3..12, wheel = 3) contained in a 13-bit rank mask, or -1. */
const STRAIGHT_TOP = new Int8Array(8192).fill(-1);
(() => {
  const wheel = (1 << 12) | 0b1111;
  for (let mask = 0; mask < 8192; mask++) {
    for (let top = 12; top >= 4; top--) {
      const window = 0b11111 << (top - 4);
      if ((mask & window) === window) {
        STRAIGHT_TOP[mask] = top;
        break;
      }
    }
    if (STRAIGHT_TOP[mask] === -1 && (mask & wheel) === wheel) STRAIGHT_TOP[mask] = 3;
  }
})();

const cnt = new Int8Array(13);
const sCnt = new Int8Array(4);
const sMask = new Int32Array(4);

const pack = (cat: number, a: number, b = 0, c = 0, d = 0, e = 0): number =>
  (cat << CATEGORY_SHIFT) | (a << 16) | (b << 12) | (c << 8) | (d << 4) | e;

/** Top rank index of a straight in `rankMask`, or -1 (exported for the outs analysis). */
export function straightTop(rankMask: number): number {
  return STRAIGHT_TOP[rankMask] ?? -1;
}

/** Bit mask (bit = rank index 0..12) of a list of card indices. */
export function rankMaskOf(cards: ArrayLike<number>, n = cards.length): number {
  let m = 0;
  for (let i = 0; i < n; i++) m |= 1 << ((cards[i] as number) >> 2);
  return m;
}

/**
 * Score of the best 5-card hand among the first `n` (5..7) entries of `cards`.
 * Not re-entrant (module-level scratch arrays); the engine is single-threaded so this is safe.
 */
export function fastScore(cards: ArrayLike<number>, n: number = cards.length): number {
  cnt.fill(0);
  sCnt.fill(0);
  sMask.fill(0);
  let rankMask = 0;
  for (let i = 0; i < n; i++) {
    const c = cards[i] as number;
    const r = c >> 2;
    const s = c & 3;
    cnt[r]!++;
    sCnt[s]!++;
    sMask[s]! |= 1 << r;
    rankMask |= 1 << r;
  }

  let flushMask = 0;
  for (let s = 0; s < 4; s++) if ((sCnt[s] as number) >= 5) flushMask = sMask[s] as number;

  if (flushMask) {
    const top = STRAIGHT_TOP[flushMask] as number;
    if (top >= 0) return pack(8, top + 2);
  }

  let quad = -1;
  let trip1 = -1;
  let trip2 = -1;
  let pair1 = -1;
  let pair2 = -1;
  let pair3 = -1;
  for (let r = 12; r >= 0; r--) {
    const k = cnt[r] as number;
    if (k === 4) quad = r;
    else if (k === 3) {
      if (trip1 < 0) trip1 = r;
      else trip2 = r;
    } else if (k === 2) {
      if (pair1 < 0) pair1 = r;
      else if (pair2 < 0) pair2 = r;
      else pair3 = r;
    }
  }

  if (quad >= 0) {
    let kick = 0;
    for (let r = 12; r >= 0; r--) {
      if (r !== quad && (cnt[r] as number) > 0) {
        kick = r + 2;
        break;
      }
    }
    return pack(7, quad + 2, kick);
  }

  if (trip1 >= 0 && (trip2 >= 0 || pair1 >= 0)) {
    return pack(6, trip1 + 2, Math.max(trip2, pair1) + 2);
  }

  if (flushMask) {
    let out = 0;
    let taken = 0;
    for (let r = 12; r >= 0 && taken < 5; r--) {
      if (flushMask & (1 << r)) {
        out = (out << 4) | (r + 2);
        taken++;
      }
    }
    return (5 << CATEGORY_SHIFT) | out;
  }

  const st = STRAIGHT_TOP[rankMask] as number;
  if (st >= 0) return pack(4, st + 2);

  if (trip1 >= 0) {
    let k1 = 0;
    let k2 = 0;
    for (let r = 12; r >= 0; r--) {
      if (r === trip1 || (cnt[r] as number) === 0) continue;
      if (!k1) k1 = r + 2;
      else {
        k2 = r + 2;
        break;
      }
    }
    return pack(3, trip1 + 2, k1, k2);
  }

  if (pair2 >= 0) {
    // pair3 may exist (three pairs among 7 cards): its rank competes for the kicker.
    let kick = 0;
    for (let r = 12; r >= 0; r--) {
      if (r !== pair1 && r !== pair2 && (cnt[r] as number) > 0) {
        kick = r + 2;
        break;
      }
    }
    void pair3;
    return pack(2, pair1 + 2, pair2 + 2, kick);
  }

  if (pair1 >= 0) {
    let k1 = 0;
    let k2 = 0;
    let k3 = 0;
    for (let r = 12; r >= 0; r--) {
      if (r === pair1 || (cnt[r] as number) === 0) continue;
      if (!k1) k1 = r + 2;
      else if (!k2) k2 = r + 2;
      else {
        k3 = r + 2;
        break;
      }
    }
    return pack(1, pair1 + 2, k1, k2, k3);
  }

  let out = 0;
  let taken = 0;
  for (let r = 12; r >= 0 && taken < 5; r--) {
    if ((cnt[r] as number) > 0) {
      out = (out << 4) | (r + 2);
      taken++;
    }
  }
  return out; // category 0
}

export const categoryOf = (score: number): number => score >>> CATEGORY_SHIFT;

/** Engine cards -> integer indices. */
export function toIndices(cards: readonly Card[]): number[] {
  return cards.map(cardIndex);
}
