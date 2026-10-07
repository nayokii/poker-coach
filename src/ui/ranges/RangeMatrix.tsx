import { useMemo, useRef, type KeyboardEvent, type PointerEvent } from 'react';
import { rankChar, type Card } from '../../engine';
import type { Range } from '../../coach/math';
import { buildMatrix, nextCellWeight, type MatrixCell } from '../../coach/ranges';
import './ranges.css';

export interface RangeMatrixProps {
  range: Range;
  /** Known cards: they only change what cells report (blocked combos), never the range itself. */
  dead?: readonly Card[];
  /** Weight applied by a tap / drag (1, 0.75, 0.5, 0.25 or 0 = erase). */
  brush: number;
  /** Label ("AKs") of the cell shown in the inspector. */
  focused: string | null;
  /** Called with the cells touched by a tap or a drag movement, and the weight to apply to all of them. */
  onPaint: (cells: MatrixCell[], weight: number) => void;
  onFocusCell: (cell: MatrixCell) => void;
}

const shortLabel = (c: MatrixCell): string => `${rankChar(c.handClass.high)}${rankChar(c.handClass.low)}`;

function describe(c: MatrixCell): string {
  const kind = c.handClass.kind === 'pair' ? 'pocket pair' : c.handClass.kind;
  const state =
    c.state === 'disabled' ? 'all combos blocked' : c.state === 'none' ? 'not selected' : c.state === 'full' ? 'selected' : `partly selected, ${Math.round(c.fraction * 100)}%`;
  return `${c.label}, ${kind}, ${c.availableCombos} of ${c.totalCombos} combos available, ${state}`;
}

/** 13x13 starting-hand matrix: pairs on the diagonal, suited above, offsuit below. Tap or drag to paint. */
export function RangeMatrix({ range, dead = [], brush, focused, onPaint, onFocusCell }: RangeMatrixProps) {
  const matrix = useMemo(() => buildMatrix(range, dead), [range, dead]);
  const byLabel = useMemo(() => new Map(matrix.flat().map((c) => [c.label, c])), [matrix]);
  const drag = useRef<{ weight: number; last: string; x: number; y: number } | null>(null);
  const gridRef = useRef<HTMLDivElement>(null);

  const cellFromTarget = (target: EventTarget | null): MatrixCell | null => {
    const el = (target as HTMLElement | null)?.closest?.('[data-cell]') as HTMLElement | null;
    return el ? (byLabel.get(el.dataset.cell as string) ?? null) : null;
  };

  const down = (e: PointerEvent<HTMLDivElement>): void => {
    const cell = cellFromTarget(e.target);
    if (!cell) return;
    e.currentTarget.setPointerCapture?.(e.pointerId);
    onFocusCell(cell);
    if (cell.state === 'disabled') {
      drag.current = null;
      return;
    }
    const weight = nextCellWeight(range, cell.handClass, brush);
    drag.current = { weight, last: cell.label, x: e.clientX, y: e.clientY };
    onPaint([cell], weight);
  };

  const move = (e: PointerEvent<HTMLDivElement>): void => {
    const d = drag.current;
    if (!d) return;
    // A fast swipe can jump over cells between two pointer events: walk the segment so none is skipped.
    const dx = e.clientX - d.x;
    const dy = e.clientY - d.y;
    const steps = Math.max(1, Math.ceil(Math.hypot(dx, dy) / 6));
    const touched: MatrixCell[] = [];
    for (let i = 1; i <= steps; i++) {
      const cell = cellFromTarget(document.elementFromPoint(d.x + (dx * i) / steps, d.y + (dy * i) / steps));
      if (!cell || cell.label === d.last || cell.state === 'disabled') continue;
      d.last = cell.label;
      touched.push(cell);
    }
    if (touched.length > 0) onPaint(touched, d.weight);
    d.x = e.clientX;
    d.y = e.clientY;
  };

  const end = (e: PointerEvent<HTMLDivElement>): void => {
    drag.current = null;
    e.currentTarget.releasePointerCapture?.(e.pointerId);
  };

  const key = (e: KeyboardEvent<HTMLDivElement>): void => {
    const cell = cellFromTarget(e.target);
    if (!cell) return;
    const delta: Record<string, [number, number]> = { ArrowUp: [-1, 0], ArrowDown: [1, 0], ArrowLeft: [0, -1], ArrowRight: [0, 1] };
    const d = delta[e.key];
    if (!d) return;
    e.preventDefault();
    const row = Math.min(12, Math.max(0, cell.row + d[0]));
    const col = Math.min(12, Math.max(0, cell.col + d[1]));
    const next = matrix[row]?.[col];
    if (next) gridRef.current?.querySelector<HTMLElement>(`[data-cell="${next.label}"]`)?.focus();
  };

  return (
    <div
      ref={gridRef}
      className="rmatrix"
      role="grid"
      aria-label="Starting hands matrix. Pairs on the diagonal, suited hands above it, offsuit hands below it."
      onPointerDown={down}
      onPointerMove={move}
      onPointerUp={end}
      onPointerCancel={end}
      onKeyDown={key}
    >
      {matrix.map((row, r) => (
        <div key={r} role="row" className="rmatrix__row">
          {row.map((c) => (
            <button
              key={c.label}
              type="button"
              role="gridcell"
              className="rcell"
              data-cell={c.label}
              data-state={c.state}
              data-kind={c.handClass.kind}
              data-focused={focused === c.label || undefined}
              data-blocked={c.blockedCombos > 0 || undefined}
              aria-label={describe(c)}
              aria-selected={c.state === 'full' || c.state === 'partial'}
              disabled={false}
              tabIndex={focused === c.label || (focused === null && r === 0 && c.col === 0) ? 0 : -1}
              style={{ ['--fill' as string]: c.fraction }}
              onClick={(e) => {
                // Mouse and touch are handled by pointer events; this runs for keyboard / assistive activation only.
                if (e.detail !== 0 || c.state === 'disabled') return;
                onFocusCell(c);
                onPaint([c], nextCellWeight(range, c.handClass, brush));
              }}
            >
              <span className="rcell__label">{shortLabel(c)}</span>
            </button>
          ))}
        </div>
      ))}
    </div>
  );
}
