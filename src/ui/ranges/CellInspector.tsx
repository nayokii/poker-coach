import { cardIndex, cardToString, type Card } from '../../engine';
import { comboCards, handClassCombos, type Combo, type Range } from '../../coach/math';
import { WEIGHT_PRESETS, cellSelection, comboWeight, type MatrixCell } from '../../coach/ranges';
import { SuitIcon } from '../cards/PlayingCard';
import { KIND_TEXT, explainCell } from './cellText';
import './ranges.css';

export interface CellInspectorProps {
  cell: MatrixCell;
  range: Range;
  dead: readonly Card[];
  onSetCell: (weight: number) => void;
  onSetCombo: (combo: Combo, weight: number) => void;
}

/** One hand of the matrix in plain words: what it is, how many combos, how much of it is in the range, what is blocked. */
export function CellInspector({ cell, range, dead, onSetCell, onSetCombo }: CellInspectorProps) {
  const deadSet = new Set(dead.map(cardIndex));
  const combos = handClassCombos(cell.handClass);
  const sel = cellSelection(range, dead, cell.handClass);
  const words = explainCell(cell.handClass, sel);
  const kind = KIND_TEXT[cell.handClass.kind];

  return (
    <section className="inspector" aria-label={`Main ${cell.label}`}>
      <div className="inspector__head">
        <h3 className="inspector__title">{cell.label}</h3>
        <span className="inspector__kind">
          {kind.name} <span className="inspector__hint">· {kind.hint}</span>
        </span>
        <span className="inspector__pct num" aria-hidden="true">
          {sel.percent} %
        </span>
      </div>

      <p className="inspector__line">
        <strong className="num">{cell.totalCombos} combos</strong> au total pour cette main.
      </p>
      <p className="inspector__headline">{words.headline}</p>
      {words.detail && <p className="inspector__detail">{words.detail}</p>}

      {words.blocked && (
        <p className="inspector__blocked-note" role="note">
          <strong className="num">{words.blocked.available}</strong>
          <span>{words.blocked.reason}</span>
        </p>
      )}

      <div className="inspector__weights" role="group" aria-label="Part de cette main dans la range">
        {WEIGHT_PRESETS.map((w) => (
          <button
            key={w}
            type="button"
            className="chip"
            aria-pressed={sel.kind !== 'disabled' && sel.percent === w * 100 && (w === 0 ? sel.kind === 'none' : sel.kind === 'full' || sel.kind === 'uniform')}
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
                aria-label={`${cardToString(x)} ${cardToString(y)}${blocked ? ', retiré par une carte connue' : ''}, ${Math.round(w * 100)} %`}
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
