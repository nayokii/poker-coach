/** Seat geometry as percentages of the table stage (x: left to right, y: top to bottom). */
export interface Point {
  x: number;
  y: number;
}

interface SeatSpec {
  seat: Point;
  /** Where this seat's bet marker rests: between the seat and the pot, clear of both. */
  bet: Point;
}

/** Bots are listed clockwise from the hero (bottom), i.e. left side first. */
const BOT_SEATS: Record<number, SeatSpec[]> = {
  1: [{ seat: { x: 50, y: 14 }, bet: { x: 50, y: 33 } }],
  2: [
    { seat: { x: 22, y: 28 }, bet: { x: 37, y: 43 } },
    { seat: { x: 78, y: 28 }, bet: { x: 63, y: 43 } },
  ],
  3: [
    { seat: { x: 16, y: 40 }, bet: { x: 37, y: 44 } },
    { seat: { x: 50, y: 13 }, bet: { x: 50, y: 31 } },
    { seat: { x: 84, y: 40 }, bet: { x: 63, y: 44 } },
  ],
  4: [
    { seat: { x: 16, y: 50 }, bet: { x: 37, y: 46 } },
    { seat: { x: 28, y: 18 }, bet: { x: 36, y: 34 } },
    { seat: { x: 72, y: 18 }, bet: { x: 64, y: 34 } },
    { seat: { x: 84, y: 50 }, bet: { x: 63, y: 46 } },
  ],
  5: [
    { seat: { x: 16, y: 55 }, bet: { x: 37, y: 51 } },
    { seat: { x: 17, y: 29 }, bet: { x: 35, y: 39 } },
    { seat: { x: 50, y: 13 }, bet: { x: 50, y: 31 } },
    { seat: { x: 83, y: 29 }, bet: { x: 65, y: 39 } },
    { seat: { x: 84, y: 55 }, bet: { x: 63, y: 51 } },
  ],
};

const HERO: SeatSpec = { seat: { x: 50, y: 104 }, bet: { x: 50, y: 80 } };

/** Seat of player `index` (0 = hero, then bots clockwise) at a table with `botCount` bots. */
export function seatSpec(botCount: number, index: number): SeatSpec {
  if (index === 0) return HERO;
  const seats = BOT_SEATS[Math.max(1, Math.min(5, botCount))] ?? [];
  return seats[index - 1] ?? { seat: { x: 50, y: 10 }, bet: { x: 50, y: 30 } };
}

/** Where chips fly to when a street ends. */
export const POT_POINT: Point = { x: 50, y: 50 };
