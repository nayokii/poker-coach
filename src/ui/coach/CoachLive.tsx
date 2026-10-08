import { useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';
import { ChevronDown, ChevronUp, GraduationCap } from 'lucide-react';
import type { Card, GameState } from '../../engine';
import { explainAnalysis, itemsForLevel, type ExplanationLevel } from '../../coach/explanation';
import { loadCoachPrefs, saveCoachPrefs } from '../../storage';
import { Button, IconButton } from '../design-system';
import { useFormat } from '../format';
import { CoachView } from './CoachPanel';
import { ExplanationSection } from './ExplanationSection';
import { analysisKey, buildCoachAnalysis, decisionKey, opponentProfiles, type AssumeMode } from './liveAnalysis';
import './coach.css';

export interface RangeRequest {
  profileId: string;
  hero: Card[];
  board: Card[];
}

export interface CoachLiveProps {
  game: GameState;
  /** Board cards currently visible to the player (the engine may be ahead during a run-out). */
  visibleBoard: Card[];
  heroSeat?: number;
  /** Seat -> bot profile id, used to build HYPOTHETICAL ranges. */
  botProfiles: Record<number, string>;
  /**
   * "sheet": a slim bar under the table that opens a panel (phones, tablets).
   * "aside": the panel itself, always open (wide screens, where it sits beside the table).
   */
  variant?: 'sheet' | 'aside';
  /** Sheet only. */
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  /** "Modifier la range": open the Range Lab on that range, with the same cards. */
  onEditRange?: (request: RangeRequest) => void;
}

/** A downward swipe of at least this many pixels on the panel header closes the sheet. */
const SWIPE_CLOSE_PX = 56;

/**
 * The Coach, live, next to the table. It only READS: the analysis comes from the existing snapshot / CoachAnalysis /
 * Explanation Engine, recomputed from the current game state. Secondary by design: closed it is one slim bar, open it
 * sits under the table (which stays visible and playable), and the verdict stays hidden until the player asks for it.
 */
export function CoachLive({ game, visibleBoard, heroSeat = 0, botProfiles, variant = 'aside', open = false, onOpenChange, onEditRange }: CoachLiveProps) {
  const sheet = variant === 'sheet';
  const expanded = !sheet || open;
  const [mode, setMode] = useState<AssumeMode>('none');
  const [prefs, setPrefs] = useState(loadCoachPrefs);
  const update = (next: Partial<typeof prefs>): void => {
    const merged = { ...prefs, ...next };
    setPrefs(merged);
    saveCoachPrefs(merged);
  };

  // The game keeps animating and playing; the analysis follows one render behind rather than blocking an action.
  const liveGame = useDeferredValue(game);
  const boardKey = visibleBoard.map((c) => `${c.rank}${c.suit}`).join('');
  const board = useMemo(() => visibleBoard.slice(), [boardKey]); // eslint-disable-line react-hooks/exhaustive-deps
  const liveBoard = useDeferredValue(board);

  // Recomputed only when something the analysis reads changes (state, visible board, assumption); a closed bar needs no equity.
  const analysis = useMemo(
    () => buildCoachAnalysis(liveGame, liveBoard, heroSeat, botProfiles, expanded ? mode : 'none'),
    [liveGame, liveBoard, heroSeat, botProfiles, mode, expanded],
  );
  const { full } = useFormat();
  const explanation = useMemo(() => (analysis ? explainAnalysis(analysis, { formatAmount: (c) => full(c).replace('.', ',') }) : null), [analysis, full]);
  const profiles = useMemo(() => opponentProfiles(liveGame, heroSeat, botProfiles), [liveGame, heroSeat, botProfiles]);

  // The verdict is hidden again at every new decision point.
  const dKey = decisionKey(game, visibleBoard);
  const [revealedFor, setRevealedFor] = useState<string | null>(null);
  const verdictHidden = revealedFor !== dKey;

  // A new analysis (new hand or street) while the bar is closed: a discreet dot, never a notification.
  const aKey = analysisKey(game, visibleBoard);
  const [seen, setSeen] = useState(aKey);
  useEffect(() => {
    if (expanded) setSeen(aKey);
  }, [expanded, aKey]);
  const fresh = sheet && !open && seen !== aKey && analysis !== null;

  // Focus: into the panel when the player opens it, back to the bar when it closes.
  const bar = useRef<HTMLButtonElement>(null);
  const closeBtn = useRef<HTMLButtonElement>(null);
  const wasOpen = useRef(open);
  useEffect(() => {
    if (!sheet) return;
    if (open && !wasOpen.current) closeBtn.current?.focus({ preventScroll: true });
    if (!open && wasOpen.current) bar.current?.focus({ preventScroll: true });
    wasOpen.current = open;
  }, [open, sheet]);

  const swipe = useRef<number | null>(null);
  const close = (): void => onOpenChange?.(false);

  const editRange = (profileId: string): void => {
    const hero = game.players[heroSeat]?.holeCards ?? [];
    onEditRange?.({ profileId, hero: [...hero], board: visibleBoard.slice() });
  };

  const count = explanation ? itemsForLevel(explanation, 1).filter((i) => i.category !== 'decision').length : 0;

  if (sheet && !open) {
    return (
      <section className="live live--closed" aria-label="Coach" data-fresh={fresh || undefined}>
        <button ref={bar} type="button" className="live__bar" aria-expanded="false" aria-controls="coach-live-panel" onClick={() => onOpenChange?.(true)}>
          <GraduationCap size={20} aria-hidden="true" />
          <span className="live__bar-text">
            <span className="live__bar-title">Coach</span>
            <span className="live__bar-sub">{analysis ? 'Analyse ta situation' : 'Disponible pendant la main'}</span>
          </span>
          {analysis && (
            <span className="live__bar-meta num">
              {count} infos
              {fresh && <span className="live__dot" role="img" aria-label="Nouvelle analyse disponible" />}
            </span>
          )}
          <ChevronUp size={20} aria-hidden="true" />
        </button>
      </section>
    );
  }

  const rangeRow = analysis && (
    <div className="live__ranges">
      {mode === 'profiles' && profiles.length > 0 ? (
        <>
          {profiles.map((p) => (
            <div key={p.id} className="live__range">
              <span>
                Range adverse : <strong>{p.label}</strong> · hypothèse
              </span>
              {onEditRange && (
                <Button variant="secondary" onClick={() => editRange(p.id)}>
                  Modifier
                </Button>
              )}
            </div>
          ))}
          <Button variant="ghost" onClick={() => setMode('none')}>
            Retirer
          </Button>
        </>
      ) : (
        <div className="live__range">
          <span>
            Range adverse : <strong>inconnue</strong>
          </span>
          {profiles.length > 0 && (
            <Button
              variant="secondary"
              onClick={() => {
                setMode('profiles');
                editRange(profiles[0]!.id);
              }}
            >
              Ajouter une hypothèse
            </Button>
          )}
        </div>
      )}
    </div>
  );

  return (
    <section id="coach-live-panel" className={`live live--${variant}`} aria-label="Coach" onKeyDown={sheet ? (e) => e.key === 'Escape' && close() : undefined}>
      <header
        className="live__head"
        onPointerDown={sheet ? (e) => (swipe.current = e.clientY) : undefined}
        onPointerUp={
          sheet
            ? (e) => {
                if (swipe.current !== null && e.clientY - swipe.current >= SWIPE_CLOSE_PX) close();
                swipe.current = null;
              }
            : undefined
        }
        onPointerCancel={sheet ? () => (swipe.current = null) : undefined}
      >
        <GraduationCap size={20} aria-hidden="true" />
        <h2 className="live__title">Coach</h2>
        {sheet && (
          <IconButton ref={closeBtn} label="Fermer le Coach" onClick={close}>
            <ChevronDown size={22} />
          </IconButton>
        )}
      </header>

      <div className="live__body">
        {analysis && explanation ? (
          <>
            {rangeRow}
            <ExplanationSection
              explanation={explanation}
              level={prefs.level}
              onLevel={(l: ExplanationLevel) => update({ level: l })}
              showSources={prefs.showSources}
              onShowSources={(v) => update({ showSources: v })}
              verdictHidden={verdictHidden}
              onRevealVerdict={() => setRevealedFor(dKey)}
              grouped
            />
            {prefs.level >= 2 && (
              <details className="live__details">
                <summary>Données chiffrées</summary>
                <CoachView a={analysis} blind={verdictHidden} />
              </details>
            )}
          </>
        ) : (
          <p className="cc__line dim">L’analyse est disponible pendant une main en cours.</p>
        )}
      </div>
    </section>
  );
}
