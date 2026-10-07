import type { CSSProperties } from 'react';
import { cardToString, type Card } from '../../engine';
import { Amount } from '../format';
import { PlayingCard } from '../cards/PlayingCard';
import './table.css';

export type SeatStatus = 'active' | 'folded' | 'allin' | 'out';

export interface PlayerSeatProps {
  name: string;
  stack: number;
  position: string;
  isDealer: boolean;
  status: SeatStatus;
  /** It is this player to act. */
  active: boolean;
  /** A bot is currently deciding. */
  thinking?: boolean;
  /** Hole cards, shown face-up only when `revealed`. */
  cards?: Card[];
  revealed?: boolean;
  /** Short label of the last action on this street (Call, Raise...). */
  lastAction?: string;
  /** Chips won in the settled hand (> 0 marks the winner). */
  gain?: number;
  /** Showdown is settled and this player did not win. */
  loser?: boolean;
  highlight?: ReadonlySet<string>;
  style?: CSSProperties;
}

export function PlayerSeat({
  name, stack, position, isDealer, status, active, thinking, cards, revealed, lastAction, gain, loser, highlight, style,
}: PlayerSeatProps) {
  const folded = status === 'folded';
  const showCards = !!cards && cards.length === 2 && status !== 'out' && !folded;
  const winner = (gain ?? 0) > 0;
  const statusText = folded ? 'Fold' : status === 'allin' ? 'All-in' : lastAction;

  return (
    <div
      className="seat"
      data-status={status}
      data-active={active || undefined}
      data-winner={winner || undefined}
      data-loser={loser || undefined}
      style={style}
      role="group"
      aria-label={`${name}, ${position}${active ? ', to act' : ''}${folded ? ', folded' : ''}`}
    >
      {showCards && (
        <div className="seat__cards" data-revealed={revealed || undefined}>
          {cards.map((c, i) => (
            <PlayingCard
              key={revealed ? cardToString(c) : `back-${i}`}
              card={revealed ? c : undefined}
              size={revealed ? 'sm' : 'xs'}
              enter={revealed ? 'flip' : 'deal'}
              delay={revealed ? i * 120 : 0}
              state={revealed ? (winner && highlight?.has(cardToString(c)) ? 'winning' : loser ? 'losing' : 'idle') : 'idle'}
            />
          ))}
        </div>
      )}
      <div className="seat__plate">
        <span className="seat__avatar" aria-hidden="true">
          {name.slice(0, 1).toUpperCase()}
        </span>
        <span className="seat__info">
          <span className="seat__name">{name}</span>
          <Amount chips={stack} className="seat__stack" />
        </span>
        {isDealer && (
          <span className="dealer" title="Dealer button" aria-label="Dealer button">
            D
          </span>
        )}
        {active && <span className="seat__timer" data-thinking={thinking || undefined} aria-hidden="true" />}
      </div>
      <div className="seat__foot">
        <span className="seat__pos">{position}</span>
        {statusText && !winner && (
          <span className="seat__status" data-kind={folded ? 'fold' : status === 'allin' ? 'allin' : 'act'}>
            {statusText}
          </span>
        )}
        {winner && (
          <span className="seat__gain num">
            +<Amount chips={gain ?? 0} />
          </span>
        )}
      </div>
    </div>
  );
}
