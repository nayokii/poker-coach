/** Seat geometry as percentages of the table stage (x: left to right, y: top to bottom). */
export interface Point {
  x: number;
  y: number;
}

interface SeatSpec {
  seat: Point;
  /** Vertical position of the seat on a very short stage (Coach panel open on a small phone), when seats stacked on one side need more room. */
  tightY?: number;
  /** Where this seat's bet marker rests: next to its seat, outside the band the pot and the board occupy in the middle of the table. */
  bet: Point;
}

/** Bots are listed clockwise from the hero (bottom), i.e. left side first. */
const BOT_SEATS: Record<number, SeatSpec[]> = {
  1: [{ seat: { x: 50, y: 14 }, bet: { x: 50, y: 30 } }],
  2: [
    { seat: { x: 22, y: 28 }, bet: { x: 21, y: 43 } },
    { seat: { x: 78, y: 28 }, bet: { x: 79, y: 43 } },
  ],
  3: [
    { seat: { x: 16, y: 40 }, bet: { x: 12, y: 55 } },
    { seat: { x: 50, y: 13 }, bet: { x: 50, y: 30 } },
    { seat: { x: 84, y: 40 }, bet: { x: 88, y: 55 } },
  ],
  4: [
    { seat: { x: 16, y: 50 }, bet: { x: 13, y: 75 } },
    { seat: { x: 28, y: 18 }, bet: { x: 27, y: 33 } },
    { seat: { x: 72, y: 18 }, bet: { x: 73, y: 33 } },
    { seat: { x: 84, y: 50 }, bet: { x: 87, y: 75 } },
  ],
  5: [
    { seat: { x: 16, y: 55 }, tightY: 60, bet: { x: 13, y: 76 } },
    { seat: { x: 17, y: 29 }, tightY: 24, bet: { x: 17, y: 41 } },
    { seat: { x: 50, y: 13 }, bet: { x: 50, y: 30 } },
    { seat: { x: 83, y: 29 }, tightY: 24, bet: { x: 83, y: 41 } },
    { seat: { x: 84, y: 55 }, tightY: 60, bet: { x: 87, y: 76 } },
  ],
};

const HERO: SeatSpec = { seat: { x: 50, y: 104 }, bet: { x: 50, y: 85 } };

/** Seat of player `index` (0 = hero, then bots clockwise) at a table with `botCount` bots. */
export function seatSpec(botCount: number, index: number): SeatSpec {
  if (index === 0) return HERO;
  const seats = BOT_SEATS[Math.max(1, Math.min(5, botCount))] ?? [];
  return seats[index - 1] ?? { seat: { x: 50, y: 10 }, bet: { x: 50, y: 30 } };
}

/** Where chips fly to when a street ends. */
export const POT_POINT: Point = { x: 50, y: 50 };
