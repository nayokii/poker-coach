import type { CSSProperties } from 'react';
import { cardToPretty, type Card, type Suit } from '../../engine';
import { rankChar } from '../../engine';
import './card.css';

const SUIT_PATH: Record<Suit, string> = {
  s: 'M12 2c3 4.2 8 7 8 11.2a4.3 4.3 0 0 1-7.2 3.2c.2 2 .9 3.6 2.2 5.1H9.2c1.3-1.5 2-3.1 2.2-5.1A4.3 4.3 0 0 1 4 13.2C4 9 9 6.2 12 2z',
  h: 'M12 21.5C5 16.2 2.5 12.6 2.5 8.9A5 5 0 0 1 12 6.4a5 5 0 0 1 9.5 2.5c0 3.7-2.5 7.3-9.5 12.6z',
  d: 'M12 2l8.5 10L12 22 3.5 12z',
  c: 'M12 2.5a4.6 4.6 0 0 0-4.2 6.6A4.8 4.8 0 1 0 10.4 17c.1 1.8-.5 3.3-1.9 4.5h7c-1.4-1.2-2-2.7-1.9-4.5a4.8 4.8 0 1 0 2.6-7.9A4.6 4.6 0 0 0 12 2.5z',
};

const SUIT_NAME: Record<Suit, string> = { s: 'spades', h: 'hearts', d: 'diamonds', c: 'clubs' };
const RANK_NAME: Record<number, string> = { 11: 'jack', 12: 'queen', 13: 'king', 14: 'ace' };

export function SuitIcon({ suit, className }: { suit: Suit; className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path d={SUIT_PATH[suit]} fill="currentColor" />
    </svg>
  );
}

export function cardLabel(card: Card): string {
  return `${RANK_NAME[card.rank] ?? card.rank} of ${SUIT_NAME[card.suit]}`;
}

export type CardState = 'idle' | 'selected' | 'winning' | 'losing';
export type CardSize = 'xs' | 'sm' | 'md' | 'lg' | 'fluid';

export interface PlayingCardProps {
  /** Card to show. Without it (or with faceDown) the back is rendered. */
  card?: Card;
  faceDown?: boolean;
  size?: CardSize;
  state?: CardState;
  /** Entrance animation: slide-in when dealt, flip when turned over. */
  enter?: 'none' | 'deal' | 'flip';
  /** Animation delay in ms (stagger). */
  delay?: number;
  onClick?: () => void;
  className?: string;
  style?: CSSProperties;
}

export function PlayingCard({
  card, faceDown, size = 'md', state = 'idle', enter = 'none', delay = 0, onClick, className = '', style,
}: PlayingCardProps) {
  const showFace = !!card && !faceDown;
  const cls = ['pcard', enter !== 'none' && `pcard--${enter}`, className].filter(Boolean).join(' ');
  const css = { ...style, ...(delay ? { animationDelay: `${delay}ms` } : null) } as CSSProperties;
  const label = showFace ? cardLabel(card) : 'Hidden card';

  const inner = showFace ? (
    <span className="pcard__face" data-suit={card.suit}>
      <span className="pcard__corner">
        <span className="pcard__rank">{rankChar(card.rank)}</span>
        <SuitIcon suit={card.suit} className="pcard__pip" />
      </span>
      <SuitIcon suit={card.suit} className="pcard__mark" />
    </span>
  ) : (
    <span className="pcard__back" aria-hidden="true">
      <span className="pcard__back-mark" />
    </span>
  );

  const common = { className: cls, 'data-size': size, 'data-state': state, style: css, title: showFace ? cardToPretty(card) : undefined };
  if (onClick) {
    return (
      <button type="button" aria-label={label} aria-pressed={state === 'selected'} onClick={onClick} {...common}>
        {inner}
      </button>
    );
  }
  return (
    <span role="img" aria-label={label} {...common}>
      {inner}
    </span>
  );
}

/** Empty placeholder where a board card will land. */
export function CardSlot({ size = 'fluid' }: { size?: CardSize }) {
  return <span className="pcard pcard--slot" data-size={size} aria-hidden="true" />;
}
