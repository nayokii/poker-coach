import { cardToString, type Card } from '../../engine';
import { CardSlot, PlayingCard, type CardState } from '../cards/PlayingCard';
import './table.css';

export interface BoardProps {
  cards: Card[];
  /** Card strings (e.g. "As") that belong to a winning hand. */
  highlight?: ReadonlySet<string>;
  /** Dim board cards that are not part of a winning hand once the hand is settled. */
  dimOthers?: boolean;
}

/** Five fixed slots so the layout never jumps as streets arrive. */
export function Board({ cards, highlight, dimOthers }: BoardProps) {
  return (
    <div className="board" aria-label="Board">
      {Array.from({ length: 5 }, (_, i) => {
        const c = cards[i];
        if (!c) return <CardSlot key={`slot-${i}`} />;
        const win = highlight?.has(cardToString(c));
        const state: CardState = win ? 'winning' : dimOthers ? 'losing' : 'idle';
        // The flop lands together with a small stagger; later streets land alone.
        const delay = i < 3 ? i * 90 : 0;
        return <PlayingCard key={cardToString(c)} card={c} size="fluid" enter="deal" delay={delay} state={state} />;
      })}
    </div>
  );
}
