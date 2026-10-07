import type { Card } from '../../engine';
import type { Range } from '../../coach/math';
import { TOTAL_COMBOS, summarizeRange } from '../../coach/ranges';
import { frDecimal } from './cellText';
import './ranges.css';

export interface RangeSummaryProps {
  range: Range;
  /** Name of the loaded range ("TAG", "Value 3bet"), or null for a range edited by hand. */
  name: string | null;
  /** Which slot is being edited ("A" / "B"). */
  slot?: string;
  dead?: readonly Card[];
}

/** "Range actuelle": what is being edited, how big it is, and what it is for. Every number is an engine figure. */
export function RangeSummary({ range, name, slot, dead = [] }: RangeSummaryProps) {
  const s = summarizeRange(range, dead);
  const empty = s.combos === 0;
  const combos = Number.isInteger(s.effectiveCombos) ? String(s.effectiveCombos) : frDecimal(s.effectiveCombos);

  return (
    <section className="rsum" aria-label="Range actuelle">
      <span className="label">Range actuelle{slot ? ` · ${slot}` : ''}</span>
      <h2 className="rsum__name">{empty ? 'Aucune main choisie' : (name ?? 'Range personnalisée')}</h2>
      <p className="rsum__nums num">
        <strong>{frDecimal(s.percent)} %</strong> des mains <span className="rsum__sep">·</span> ≈ {combos} / {TOTAL_COMBOS} combos
      </p>
      {dead.length > 0 && !empty && (
        <p className="rsum__dim num">
          {s.possibleCombos} {s.possibleCombos === 1 ? 'combo reste possible' : 'combos restent possibles'} avec les cartes connues.
        </p>
      )}
      <p className="rsum__why">Le Coach utilise cette range pour estimer ton équité contre les mains que l’adversaire pourrait avoir.</p>
      <p className="rsum__warn">Attention : une range choisie ici est une hypothèse, pas une information connue.</p>
    </section>
  );
}
