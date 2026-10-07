import type { GameState, LegalActions } from '../../engine';

export type PresetKey = 'min' | 'half' | 'twoThirds' | 'pot' | 'allin';

export interface SizePreset {
  key: PresetKey;
  label: string;
  /** Total bet this street ("raise to"), in chips. */
  to: number;
}

const FRACTIONS: { key: PresetKey; label: string; f: number }[] = [
  { key: 'half', label: '1/2 POT', f: 1 / 2 },
  { key: 'twoThirds', label: '2/3 POT', f: 2 / 3 },
  { key: 'pot', label: 'POT', f: 1 },
];

/**
 * Quick sizes derived from the engine state. A pot-sized raise puts in the amount
 * of the pot after calling: raiseTo = currentBet + fraction * (pot + toCall).
 */
export function sizePresets(state: GameState, legal: LegalActions): SizePreset[] {
  if (!(legal.bet || legal.raise) || legal.minRaiseTo === null) return [];
  const min = legal.minRaiseTo;
  const max = legal.maxRaiseTo;
  const potAfterCall = state.pot + legal.toCall;
  // Round to the small blind so quick sizes read as clean numbers (2.5 BB rather than 2.6 BB).
  const unit = Math.max(1, state.config.smallBlind);

  const presets: SizePreset[] = [{ key: 'min', label: 'MIN', to: min }];
  for (const { key, label, f } of FRACTIONS) {
    const to = Math.round((state.currentBet + f * potAfterCall) / unit) * unit;
    if (to > min && to < max) presets.push({ key, label, to });
  }
  if (legal.allIn && max > min) presets.push({ key: 'allin', label: 'ALL-IN', to: max });

  // Several fractions can land on the same amount: keep the first.
  return presets.filter((p, i) => presets.findIndex((q) => q.to === p.to) === i);
}

/** Snaps a slider value to a step, always allowing the exact min and max. */
export function snapAmount(value: number, min: number, max: number, step: number): number {
  if (value <= min + step / 2) return min;
  if (value >= max - step / 2) return max;
  return Math.min(max, Math.max(min, Math.round(value / step) * step));
}

/** Initial amount offered when the sizing panel opens. */
export function defaultAmount(presets: SizePreset[], min: number): number {
  return presets.find((p) => p.key === 'twoThirds')?.to ?? presets.find((p) => p.key === 'half')?.to ?? min;
}
