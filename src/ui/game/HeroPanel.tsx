import { describeHand, evaluateHand, cardToString, type Card, type PlayerState } from '../../engine';
import { Badge } from '../design-system';
import { Amount } from '../format';
import { PlayingCard } from '../cards/PlayingCard';

export interface HeroPanelProps {
  player: PlayerState;
  board: Card[];
  isDealer: boolean;
  active: boolean;
  lastAction?: string;
  /** Chips won in the settled hand. */
  gain?: number;
  settled: boolean;
  showdown: boolean;
  highlight: ReadonlySet<string>;
  /** Hand finished and the hero did not win a pot. */
  lost: boolean;
}

/** Name of the hero's current best hand (engine evaluator), once a flop is out. */
function currentHandName(hole: Card[], board: Card[]): string | null {
  if (hole.length !== 2 || board.length < 3) return null;
  return describeHand(evaluateHand([...hole, ...board]));
}

export function HeroPanel({ player, board, isDealer, active, lastAction, gain, settled, showdown, highlight, lost }: HeroPanelProps) {
  const folded = player.status === 'folded';
  const won = (gain ?? 0) > 0;
  const handName = folded ? null : currentHandName(player.holeCards, board);
  const cardState = (c: Card) => {
    if (folded || (settled && lost)) return 'losing' as const;
    if (settled && showdown && won && highlight.has(cardToString(c))) return 'winning' as const;
    return 'idle' as const;
  };

  return (
    <section className="hero" data-active={active || undefined} data-winner={won || undefined} aria-label="Your hand">
      <div className="hero__cards">
        {player.holeCards.map((c, i) => (
          <PlayingCard key={cardToString(c)} card={c} size="fluid" enter="deal" delay={i * 110} state={cardState(c)} className={`hero__card hero__card--${i}`} />
        ))}
      </div>

      <div className="hero__info">
        <div className="hero__row">
          <span className="hero__name">{player.name}</span>
          <Badge>{player.position}</Badge>
          {isDealer && <span className="dealer dealer--inline" aria-label="Dealer button">D</span>}
        </div>
        <div className="hero__stack">
          <Amount chips={player.stack} />
        </div>
        <div className="hero__status">
          {active ? (
            <Badge tone="accent">Your turn</Badge>
          ) : won && settled ? (
            <Badge tone="gain">Winner</Badge>
          ) : folded ? (
            <Badge>Folded</Badge>
          ) : player.status === 'allin' ? (
            <Badge tone="accent">All-in</Badge>
          ) : lastAction ? (
            <Badge>{lastAction}</Badge>
          ) : null}
          {handName && <span className="hero__hand">{handName}</span>}
        </div>
      </div>
    </section>
  );
}
