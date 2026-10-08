import { useEffect, useRef, useState } from 'react';
import { cardToString, type Card, type GameState } from '../../engine';
import { Amount } from '../format';
import { Board } from './Board';
import { ChipStack } from './ChipStack';
import { PlayerSeat } from './PlayerSeat';
import { Pot } from './Pot';
import { POT_POINT, seatSpec, type Point } from './seatLayout';
import './table.css';

export interface TableProps {
  game: GameState;
  /** Board cards currently visible (the engine may be ahead during a run-out). */
  board: Card[];
  potChips: number;
  /** Opponents hole cards are turned face-up (showdown). */
  showdown: boolean;
  /** Player index currently deciding, if a bot. */
  thinking: number | null;
  lastActions: Record<number, string | undefined>;
  /** Chips won per player once the hand is settled. */
  gains: Record<number, number>;
  settled: boolean;
  highlight: ReadonlySet<string>;
}

const at = (p: Point) => ({ left: `${p.x}%`, top: `${p.y}%` });

/** A seat is placed by CSS variables so that a very short stage can move it (see `tightY`). */
const seatStyle = (p: Point, tightY?: number) => ({ ['--x' as string]: `${p.x}%`, ['--y' as string]: `${p.y}%`, ...(tightY !== undefined ? { ['--yt' as string]: `${tightY}%` } : {}) });

interface Ghost {
  id: number;
  from: Point;
  /** Where the chips travel: the pot between streets, the winner at the end of the hand. */
  to: Point;
  chips: number;
}

/** Remembers bets that just left the felt so they can slide into the pot. */
function useSweeps(bets: number[], origin: (i: number) => Point, target: Point): Ghost[] {
  const prev = useRef<number[]>(bets);
  const nextId = useRef(1);
  const [ghosts, setGhosts] = useState<Ghost[]>([]);
  const key = bets.join(',');

  useEffect(() => {
    const swept: Ghost[] = [];
    bets.forEach((b, i) => {
      const before = prev.current[i] ?? 0;
      if (before > 0 && b === 0) swept.push({ id: nextId.current++, from: origin(i), to: target, chips: before });
    });
    prev.current = bets;
    if (!swept.length) return;
    setGhosts((g) => [...g, ...swept]);
    const t = setTimeout(() => setGhosts((g) => g.filter((x) => !swept.includes(x))), 520);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  return ghosts;
}

export function Table({ game, board, potChips, showdown, thinking, lastActions, gains, settled, highlight }: TableProps) {
  const botCount = game.players.length - 1;
  const bb = game.config.bigBlind;
  const seatOf = (i: number): Point => seatSpec(botCount, i).seat;
  const betAt = (i: number): Point => seatSpec(botCount, i).bet;
  const handOver = game.handStatus === 'complete';
  // Once the hand is over the engine has paid the pots: bets leave the felt and fly to the winner.
  const bets = game.players.map((p) => (handOver ? 0 : p.bet));
  const mainWinner = game.result?.pots[0]?.winners[0];
  const target = handOver && mainWinner !== undefined ? seatOf(mainWinner) : POT_POINT;
  const ghosts = useSweeps(bets, betAt, target);
  const anyWinner = Object.values(gains).some((g) => g > 0);

  return (
    <div className="stage" data-street={game.street}>
      <div className="felt" aria-hidden="true" />

      <div className="stage__center">
        <Pot chips={potChips} bigBlind={bb} />
        <Board cards={board} highlight={settled && showdown ? highlight : undefined} dimOthers={settled && showdown && highlight.size > 0} />
      </div>

      {game.players.map((p, i) => {
        if (i === 0) return null;
        return (
          <PlayerSeat
            key={p.id}
            name={p.name}
            stack={p.stack}
            position={p.position}
            isDealer={game.button === i}
            status={p.status}
            active={game.toAct === i && game.handStatus === 'inProgress'}
            thinking={thinking === i}
            cards={p.holeCards}
            revealed={showdown && p.status !== 'folded'}
            lastAction={lastActions[i]}
            gain={settled ? gains[i] : undefined}
            loser={settled && showdown && anyWinner && (gains[i] ?? 0) <= 0}
            highlight={highlight}
            bet={bets[i]}
            style={seatStyle(seatOf(i), seatSpec(botCount, i).tightY)}
          />
        );
      })}

      {bets.map((bet, i) =>
        bet > 0 ? (
          <div key={`bet-${i}-${bet}`} className={i === 0 ? 'bet bet--hero' : 'bet'} style={{ ['--x' as string]: `${betAt(i).x}%`, ['--y' as string]: `${betAt(i).y}%` }}>
            <ChipStack chips={bet} bigBlind={bb} showAmount={false} />
            <Amount chips={bet} className="bet__amount" />
          </div>
        ) : null,
      )}

      {ghosts.map((g) => (
        <div
          key={g.id}
          className="bet bet--sweep"
          style={{ ...at(g.from), ['--dx' as string]: `${g.to.x - g.from.x}cqw`, ['--dy' as string]: `${g.to.y - g.from.y}cqh` }}
          aria-hidden="true"
        >
          <ChipStack chips={g.chips} bigBlind={bb} showAmount={false} />
        </div>
      ))}

      <span className="sr-only" aria-live="polite">
        {board.map(cardToString).join(' ')}
      </span>
    </div>
  );
}
