import { cardToString, describeHand, type GameState, type HandResult } from '../../engine';

/** Short label of each player's last action on the current street (derived from the engine history). */
export function lastActions(state: GameState): Record<number, string | undefined> {
  const out: Record<number, string | undefined> = {};
  const labels: Record<string, string> = { fold: 'Fold', check: 'Check', call: 'Call', bet: 'Bet', raise: 'Raise', allin: 'All-in' };
  for (const h of state.history) {
    if (h.street !== state.street) continue;
    const label = labels[h.type];
    if (label) out[h.player] = label;
  }
  return out;
}

export interface PotLine {
  label: string;
  amount: number;
  winners: string[];
  split: boolean;
}

export interface ResultView {
  endedBy: 'fold' | 'showdown';
  headline: 'hero' | 'bot' | 'split';
  /** Name(s) shown in the title. */
  winnerNames: string[];
  /** Best-hand description of the main winner (showdown only). */
  handName: string | null;
  heroNet: number;
  heroPayout: number;
  /** Chips won per player (payouts minus contribution when positive). */
  gains: Record<number, number>;
  pots: PotLine[];
  /** Card strings belonging to the winning hands (hole + board). */
  highlight: Set<string>;
  refunds: { name: string; amount: number }[];
  totalPot: number;
}

/** Presentation model of a finished hand. Every number comes from the engine result. */
export function buildResultView(state: GameState, heroIndex = 0): ResultView | null {
  const r: HandResult | null = state.result;
  if (!r) return null;
  const name = (i: number): string => state.players[i]?.name ?? `#${i}`;

  const gains: Record<number, number> = {};
  r.netChange.forEach((net, i) => {
    if (net > 0) gains[i] = net;
  });

  const pots: PotLine[] = r.pots.map((p, i) => ({
    label: i === 0 ? 'Main pot' : r.pots.length > 2 ? `Side pot ${i}` : 'Side pot',
    amount: p.amount,
    winners: p.winners.map(name),
    split: p.winners.length > 1,
  }));

  const winnerSet = new Set(r.pots.flatMap((p) => p.winners));
  const heroWon = winnerSet.has(heroIndex);
  const winners = [...winnerSet];
  const headline: ResultView['headline'] = winners.length > 1 && r.pots.length === 1 ? 'split' : heroWon ? 'hero' : 'bot';
  // The headline winner is whoever took the biggest pot (the main pot comes first).
  const main = r.pots[0];
  const winnerNames = (main ? main.winners : winners).map(name);

  const highlight = new Set<string>();
  const best = r.showdownHands.filter((h) => winnerSet.has(h.player));
  for (const h of best) for (const c of h.hand.cards) highlight.add(cardToString(c));

  const mainWinner = main?.winners[0];
  const mainHand = r.showdownHands.find((h) => h.player === mainWinner)?.hand;

  return {
    endedBy: r.endedBy,
    headline,
    winnerNames,
    handName: r.endedBy === 'showdown' && mainHand ? describeHand(mainHand) : null,
    heroNet: r.netChange[heroIndex] ?? 0,
    heroPayout: r.payouts[heroIndex] ?? 0,
    gains,
    pots,
    highlight,
    refunds: r.refunds.map((x) => ({ name: name(x.player), amount: x.amount })),
    totalPot: r.pots.reduce((a, p) => a + p.amount, 0),
  };
}

/** Description of the hero's best hand at showdown, if the hero reached it. */
export function heroHandName(state: GameState, heroIndex = 0): string | null {
  const h = state.result?.showdownHands.find((x) => x.player === heroIndex);
  return h ? describeHand(h.hand) : null;
}
