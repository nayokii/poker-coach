import { Amount } from '../format';
import './table.css';

/** Number of chip discs drawn for an amount: taller stack = bigger bet. */
export function chipCount(chips: number, bigBlind: number): number {
  const n = chips / bigBlind;
  return n <= 2 ? 1 : n <= 6 ? 2 : n <= 20 ? 3 : 4;
}

export function ChipStack({
  chips, bigBlind, showAmount = true, className = '',
}: {
  chips: number;
  bigBlind: number;
  showAmount?: boolean;
  className?: string;
}) {
  const count = chipCount(chips, bigBlind);
  return (
    <span className={`chipstack ${className}`}>
      <span className="chipstack__discs" aria-hidden="true" style={{ height: 12 + (count - 1) * 3 }}>
        {Array.from({ length: count }, (_, i) => (
          <span key={i} className="chipstack__disc" style={{ bottom: i * 3 }} />
        ))}
      </span>
      {showAmount && <Amount chips={chips} className="chipstack__amount" />}
    </span>
  );
}
