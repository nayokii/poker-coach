import { Minus, Plus, X } from 'lucide-react';
import type { CSSProperties } from 'react';
import type { GameState, LegalActions } from '../../engine';
import { Button, IconButton } from '../design-system';
import { Amount, useFormat } from '../format';
import { sizePresets, snapAmount } from './betSizing';
import './actions.css';

export interface AmountControlProps {
  state: GameState;
  legal: LegalActions;
  value: number;
  onChange: (to: number) => void;
  onConfirm: () => void;
  onCancel: () => void;
}

export function AmountControl({ state, legal, value, onChange, onConfirm, onCancel }: AmountControlProps) {
  const { full, bigBlind } = useFormat();
  const min = legal.minRaiseTo ?? legal.maxRaiseTo;
  const max = legal.maxRaiseTo;
  const step = Math.max(1, state.config.smallBlind);
  const presets = sizePresets(state, legal);
  const verb = legal.bet ? 'BET' : 'RAISE TO';
  const isAllIn = value >= max;
  const pct = max > min ? ((value - min) / (max - min)) * 100 : 100;
  const move = (dir: 1 | -1): void => onChange(snapAmount(value + dir * bigBlind, min, max, step));

  return (
    <div className="sizing" role="group" aria-label="Bet sizing">
      <div className="sizing__readout">
        <IconButton label="Decrease amount" onClick={() => move(-1)} disabled={value <= min}>
          <Minus size={20} />
        </IconButton>
        <output className="sizing__value num" aria-live="polite" aria-label={`${verb} ${full(value)}`}>
          <Amount chips={value} />
        </output>
        <IconButton label="Increase amount" onClick={() => move(1)} disabled={value >= max}>
          <Plus size={20} />
        </IconButton>
      </div>

      <div className="sizing__slider">
        <input
          type="range"
          min={min}
          max={max}
          step={1}
          value={value}
          aria-label="Amount"
          aria-valuetext={full(value)}
          style={{ '--pct': `${pct}%` } as CSSProperties}
          onChange={(e) => onChange(snapAmount(Number(e.target.value), min, max, step))}
        />
        <div className="sizing__bounds">
          <span>
            <span className="label">Min</span> <Amount chips={min} />
          </span>
          <span>
            <span className="label">Max</span> <Amount chips={max} />
          </span>
        </div>
      </div>

      <div className="sizing__presets" role="group" aria-label="Quick sizes">
        {presets.map((p) => (
          <button
            key={p.key}
            type="button"
            className="chip"
            aria-pressed={p.to === value}
            onClick={() => onChange(p.to)}
          >
            {p.label}
          </button>
        ))}
      </div>

      <div className="sizing__confirm-row">
        <IconButton label="Cancel" onClick={onCancel} className="sizing__cancel">
          <X size={22} />
        </IconButton>
        <Button
          variant="primary"
          large
          block
          onClick={onConfirm}
          className="sizing__confirm"
          aria-label={`${isAllIn ? 'All-in' : legal.bet ? 'Bet' : 'Raise to'} ${full(value)}`}
        >
          {isAllIn ? 'ALL-IN' : verb}
          <Amount chips={value} />
        </Button>
      </div>
    </div>
  );
}
