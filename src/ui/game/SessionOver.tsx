import { Button } from '../design-system';
import { Amount } from '../format';

export interface SessionOverProps {
  reason: 'busted' | 'cleared';
  handsPlayed: number;
  /** Hero result over the session, in chips. */
  net: number;
  onNewSession: () => void;
}

export function SessionOver({ reason, handsPlayed, net, onNewSession }: SessionOverProps) {
  return (
    <div className="session-over">
      <p className="session-over__lead">
        {reason === 'cleared' ? 'You took every chip on the table.' : 'You are out of chips.'}
      </p>
      <dl className="session-over__stats">
        <div>
          <dt className="label">Hands played</dt>
          <dd className="num">{handsPlayed}</dd>
        </div>
        <div>
          <dt className="label">Session result</dt>
          <dd className="num" data-sign={net > 0 ? 'pos' : 'neg'}>
            {net > 0 ? '+' : '−'}
            <Amount chips={Math.abs(net)} />
          </dd>
        </div>
      </dl>
      <Button variant="primary" large block onClick={onNewSession}>
        Start a new session
      </Button>
    </div>
  );
}
