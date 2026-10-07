import { Amount } from '../format';
import { ChipStack } from './ChipStack';
import './table.css';

export function Pot({ chips, bigBlind }: { chips: number; bigBlind: number }) {
  if (chips <= 0) return <div className="pot pot--empty" aria-hidden="true" />;
  return (
    <div className="pot" role="status" aria-label="Pot">
      <span className="label pot__label">Pot</span>
      <span className="pot__row">
        <ChipStack chips={chips} bigBlind={bigBlind} showAmount={false} className="pot__chips" />
        <span key={chips} className="pot__value">
          <Amount chips={chips} />
        </span>
      </span>
    </div>
  );
}
