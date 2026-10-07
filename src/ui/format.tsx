import { createContext, useContext, useMemo, type ReactNode } from 'react';
import type { AmountUnit } from '../storage';

/** Formats chips as big blinds ("2.5") or raw chips ("1 250"). No unit suffix. */
export function formatAmount(chips: number, bigBlind: number, unit: AmountUnit): string {
  if (unit === 'chips') return Math.round(chips).toLocaleString('fr-FR').replace(/ /g, ' ');
  const bb = chips / bigBlind;
  const digits = Math.abs(bb) >= 100 || Number.isInteger(bb) ? 0 : 1;
  return bb.toFixed(digits).replace(/\.0$/, '');
}

export interface Formatter {
  /** "2.5" or "1 250" */
  fmt: (chips: number) => string;
  /** "BB" in blind mode, "" in chips mode. */
  unit: string;
  /** "2.5 BB" / "1 250" for sentences and aria-labels. */
  full: (chips: number) => string;
  bigBlind: number;
  mode: AmountUnit;
}

export function makeFormatter(bigBlind: number, mode: AmountUnit): Formatter {
  const unit = mode === 'bb' ? 'BB' : '';
  const fmt = (chips: number): string => formatAmount(chips, bigBlind, mode);
  return { fmt, unit, full: (c) => (unit ? `${fmt(c)} ${unit}` : fmt(c)), bigBlind, mode };
}

const FormatContext = createContext<Formatter>(makeFormatter(20, 'bb'));

export function FormatProvider({ bigBlind, mode, children }: { bigBlind: number; mode: AmountUnit; children: ReactNode }) {
  const value = useMemo(() => makeFormatter(bigBlind, mode), [bigBlind, mode]);
  return <FormatContext.Provider value={value}>{children}</FormatContext.Provider>;
}

export const useFormat = (): Formatter => useContext(FormatContext);

/** Amount with a de-emphasised unit: "42.5 BB". */
export function Amount({ chips, className }: { chips: number; className?: string }) {
  const { fmt, unit } = useFormat();
  return (
    <span className={`num ${className ?? ''}`}>
      {fmt(chips)}
      {unit && <small className="amount-unit">{unit}</small>}
    </span>
  );
}
