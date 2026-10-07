import { rankChar, type Card } from '../../engine';
import { SuitIcon } from './PlayingCard';

/** Small inline card chip (rank + suit) for logs and data views. */
export function MiniCard({ card, muted }: { card: Card; muted?: boolean }) {
  return (
    <span className="logcard" data-suit={card.suit} data-muted={muted || undefined} role="img" aria-label={`${rankChar(card.rank)} of ${card.suit}`}>
      {rankChar(card.rank)}
      <SuitIcon suit={card.suit} />
    </span>
  );
}
