import { cardToString } from '../../engine';
import { cardIndex } from '../../engine';
import { comboCards, handClassCombos, type Combo, type Range } from '../../coach/math';
import { WEIGHT_PRESETS, comboWeight, type MatrixCell } from '../../coach/ranges';
import { SuitIcon } from '../cards/PlayingCard';
import type { Card } from '../../engine';
import './ranges.css';

export interface CellInspectorProps {
  cell: MatrixCell;
  range: Range;
  dead: readonly Card[];
  onSetCell: (weight: number) => void;
  onSetCombo: (combo: Combo, weight: number) => void;
}

/** Details of one matrix cell: real combos, blockers, exact percent and per-combo switches. */
export function CellInspector({ cell, range, dead, onSetCell, onSetCombo }: CellInspectorProps) {
  const deadSet = new Set(dead.map(cardIndex));
  const combos = handClassCombos(cell.handClass);
  const pct = cell.availableCombos === 0 ? 0 : Math.round(cell.fraction * 100);

  return (
    <section className="inspector" aria-label={`Hand ${cell.label}`}>
      <div className="inspector__head">
        <h3 className="inspector__title">{cell.label}</h3>
        <span className="inspector__count num">
          {cell.availableCombos} / {cell.totalCombos} combos
          {cell.blockedCombos > 0 && <span className="inspector__blocked"> · {cell.blockedCombos} blocked</span>}
        </span>
        <span className="inspector__pct num">{pct}%</span>
      </div>

      <div className="inspector__weights" role="group" aria-label="Frequency of every combo of this hand">
        {WEIGHT_PRESETS.map((w) => (
          <button
            key={w}
            type="button"
            className="chip"
            aria-pressed={cell.availableCombos > 0 && Math.abs(cell.fraction - w) < 1e-9 && combos.every((c) => deadSet.has(c.a) || deadSet.has(c.b) || comboWeight(range, c) === w)}
            disabled={cell.state === 'disabled'}
            onClick={() => onSetCell(w)}
          >
            {w * 100}%
          </button>
        ))}
      </div>

      <ul className="inspector__combos" aria-label="Combos">
        {combos.map((c) => {
          const [x, y] = comboCards(c);
          const blocked = deadSet.has(c.a) || deadSet.has(c.b);
          const w = comboWeight(range, c);
          return (
            <li key={`${c.a}-${c.b}`}>
              <button
                type="button"
                className="combo"
                data-on={w > 0 || undefined}
                data-partial={(w > 0 && w < 1) || undefined}
                disabled={blocked}
                aria-pressed={w > 0}
                aria-label={`${cardToString(x)} ${cardToString(y)}${blocked ? ', blocked by a known card' : ''}, ${Math.round(w * 100)}%`}
                onClick={() => onSetCombo(c, w > 0 ? 0 : 1)}
              >
                {[x, y].map((card) => (
                  <span key={cardToString(card)} className="combo__card" data-suit={card.suit}>
                    {cardToString(card)[0]}
                    <SuitIcon suit={card.suit} />
                  </span>
                ))}
                {w > 0 && w < 1 && <span className="combo__w num">{Math.round(w * 100)}%</span>}
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
