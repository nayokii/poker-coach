import { useEffect, useState } from 'react';
import type { GameState, LegalActions, PlayerAction } from '../../engine';
import { Amount, useFormat } from '../format';
import { AmountControl } from './AmountControl';
import { defaultAmount, sizePresets } from './betSizing';
import './actions.css';

export interface ActionBarProps {
  state: GameState;
  /** Legal actions of the hero, or null when it is not the hero's turn. */
  legal: LegalActions | null;
  /** Message shown while waiting (e.g. "Atlas is thinking"). */
  waiting?: string;
  onAction: (action: PlayerAction) => void;
  /** Lets the screen compact itself while the sizing panel is open. */
  onSizingChange?: (open: boolean) => void;
}

export function ActionBar({ state, legal, waiting, onAction, onSizingChange }: ActionBarProps) {
  const { full } = useFormat();
  const [sizing, setSizing] = useState(false);
  const [amount, setAmount] = useState(0);
  const turnKey = `${state.handNumber}:${state.history.length}`;

  // Any new action (or a new hand) closes the sizing panel.
  useEffect(() => setSizing(false), [turnKey]);
  const sizingOpen = sizing && !!legal;
  useEffect(() => {
    onSizingChange?.(sizingOpen);
    return () => onSizingChange?.(false);
  }, [sizingOpen, onSizingChange]);

  const canSize = !!legal && (legal.bet || legal.raise) && legal.minRaiseTo !== null;
  // A call that uses the whole stack is already an all-in; do not offer both.
  const callIsAllIn = !!legal && legal.call && legal.callAmount >= legal.maxRaiseTo - (state.players[legal.player]?.bet ?? 0);
  const shoveOnly = !!legal && !canSize && legal.allIn && !callIsAllIn;

  const openSizing = (): void => {
    if (!legal || !canSize) return;
    setAmount(defaultAmount(sizePresets(state, legal), legal.minRaiseTo as number));
    setSizing(true);
  };
  const confirmSizing = (): void => {
    if (!legal) return;
    if (amount >= legal.maxRaiseTo) onAction({ type: 'allin' });
    else onAction({ type: legal.bet ? 'bet' : 'raise', amount });
  };

  // Desktop shortcuts: F fold, C check/call, R raise, Enter confirm, Esc cancel.
  useEffect(() => {
    if (!legal) return;
    const onKey = (e: KeyboardEvent): void => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === 'INPUT' || target.closest('[role="dialog"]'))) {
        if (e.key === 'Enter' && sizing && target.tagName === 'INPUT') confirmSizing();
        return;
      }
      const k = e.key.toLowerCase();
      if (sizing) {
        if (k === 'escape') setSizing(false);
        else if (k === 'enter') confirmSizing();
        return;
      }
      if (k === 'f' && !legal.check) onAction({ type: 'fold' });
      else if (k === 'c') onAction({ type: legal.check ? 'check' : 'call' });
      else if (k === 'r' && canSize) openSizing();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  if (!legal) {
    return (
      <div className="actions actions--waiting" role="status" aria-live="polite">
        <span className="waiting">
          {waiting ?? ''}
          {waiting && <span className="dots" aria-hidden="true" />}
        </span>
      </div>
    );
  }

  if (sizing && canSize) {
    return (
      <div className="actions actions--sizing">
        <AmountControl
          state={state}
          legal={legal}
          value={amount}
          onChange={setAmount}
          onConfirm={confirmSizing}
          onCancel={() => setSizing(false)}
        />
      </div>
    );
  }

  return (
    <div className="actions" role="group" aria-label="Your action" data-count={[!legal.check, true, canSize || shoveOnly].filter(Boolean).length}>
      {!legal.check && (
        <button type="button" className="act act--fold" onClick={() => onAction({ type: 'fold' })}>
          <span className="act__label">Fold</span>
          <kbd className="act__key" aria-hidden="true">F</kbd>
        </button>
      )}

      {legal.check ? (
        <button type="button" className="act act--call" onClick={() => onAction({ type: 'check' })}>
          <span className="act__label">Check</span>
          <kbd className="act__key" aria-hidden="true">C</kbd>
        </button>
      ) : (
        <button
          type="button"
          className="act act--call"
          aria-label={`${callIsAllIn ? 'Call all-in' : 'Call'} ${full(legal.callAmount)}`}
          onClick={() => onAction({ type: 'call' })}
        >
          <span className="act__label">{callIsAllIn ? 'Call all-in' : 'Call'}</span>
          <Amount chips={legal.callAmount} className="act__amount" />
          <kbd className="act__key" aria-hidden="true">C</kbd>
        </button>
      )}

      {canSize && (
        <button type="button" className="act act--raise" onClick={openSizing}>
          <span className="act__label">{legal.bet ? 'Bet' : 'Raise'}</span>
          <kbd className="act__key" aria-hidden="true">R</kbd>
        </button>
      )}
      {shoveOnly && (
        <button
          type="button"
          className="act act--raise"
          aria-label={`All-in ${full(legal.maxRaiseTo)}`}
          onClick={() => onAction({ type: 'allin' })}
        >
          <span className="act__label">All-in</span>
          <Amount chips={legal.maxRaiseTo} className="act__amount" />
        </button>
      )}
    </div>
  );
}
