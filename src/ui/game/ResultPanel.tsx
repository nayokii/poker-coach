import { useEffect, useRef } from 'react';
import { ArrowRight } from 'lucide-react';
import { Button } from '../design-system';
import { Amount } from '../format';
import type { ResultView } from './views';

export interface ResultPanelProps {
  view: ResultView;
  heroName: string;
  /** Hero hand name at showdown, if reached. */
  heroHand: string | null;
  sessionOver: boolean;
  onNext: () => void;
}

function title(view: ResultView, heroName: string): string {
  if (view.headline === 'split') return `Split pot`;
  if (view.headline === 'hero') return `${heroName} wins`;
  return `${view.winnerNames.join(' & ')} wins`;
}

export function ResultPanel({ view, heroName, heroHand, sessionOver, onNext }: ResultPanelProps) {
  const next = useRef<HTMLButtonElement>(null);
  useEffect(() => next.current?.focus({ preventScroll: true }), []);

  const net = view.heroNet;
  const multi = view.pots.length > 1 || view.pots.some((p) => p.split);
  const detail =
    view.endedBy === 'fold'
      ? 'Everyone else folded'
      : view.headline === 'split'
        ? [...new Set(view.pots.flatMap((p) => p.winners))].join(' & ')
        : (view.handName ?? '');

  return (
    <div className="result" role="status" aria-live="polite" data-outcome={view.headline}>
      <div className="result__top">
        <div className="result__text">
          <span className="label">{view.endedBy === 'showdown' ? 'Showdown' : 'Uncontested'}</span>
          <h2 className="result__title">{title(view, heroName)}</h2>
          {detail && <p className="result__detail">{detail}</p>}
          {view.endedBy === 'showdown' && heroHand && view.headline !== 'hero' && <p className="result__hero-hand">You had {heroHand}</p>}
        </div>
        <div className="result__net" data-sign={net > 0 ? 'pos' : net < 0 ? 'neg' : 'zero'}>
          <span className="num result__net-value">
            {net > 0 ? '+' : net < 0 ? '−' : ''}
            <Amount chips={Math.abs(net)} />
          </span>
          <span className="label">{net === 0 ? 'Break even' : 'Your result'}</span>
        </div>
      </div>

      {multi && (
        <ul className="result__pots" aria-label="Pots">
          {view.pots.map((p) => (
            <li key={p.label}>
              <span className="label">{p.label}</span>
              <Amount chips={p.amount} />
              <span className="result__pot-winner">{p.split ? `Split · ${p.winners.join(' & ')}` : p.winners[0]}</span>
            </li>
          ))}
        </ul>
      )}
      {view.refunds.length > 0 && multi && (
        <p className="result__refund">
          {view.refunds.map((r) => (
            <span key={r.name}>
              <Amount chips={r.amount} /> returned to {r.name}
            </span>
          ))}
        </p>
      )}

      <Button ref={next} variant="primary" large block onClick={onNext} className="result__next">
        {sessionOver ? 'End of session' : 'New hand'}
        <ArrowRight size={20} />
      </Button>
    </div>
  );
}
