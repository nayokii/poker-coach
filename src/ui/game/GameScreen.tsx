import { useEffect, useMemo, useState } from 'react';
import type { PlayerAction } from '../../engine';
import type { SavedSession, Settings } from '../../storage';
import { ActionBar } from '../actions/ActionBar';
import { FormatProvider } from '../format';
import { Modal, Panel, Segmented } from '../design-system';
import { CoachLive, type RangeRequest } from '../coach/CoachLive';
import { useMediaQuery } from '../useMediaQuery';
import { Table } from '../table/Table';
import { Header } from '../app/Header';
import { HandLog } from './HandLog';
import { HeroPanel } from './HeroPanel';
import { ResultPanel } from './ResultPanel';
import { SessionOver } from './SessionOver';
import { HERO, useGameSession, type SessionOptions } from './useGameSession';
import { buildResultView, heroHandName, lastActions } from './views';
import './game.css';

export interface GameScreenProps {
  settings: Settings;
  resume?: SavedSession | null;
  onNewGame: () => void;
  onOpenMenu: () => void;
  logOpen: boolean;
  onCloseLog: () => void;
  coachOpen?: boolean;
  onCloseCoach?: () => void;
  /** "Modifier" in the Coach: open the Range Lab with that range and these cards. */
  onEditRange?: (request: RangeRequest) => void;
  /** Test hooks. */
  seed?: number;
  paceScale?: number;
  provider?: SessionOptions['provider'];
}

export function GameScreen({ settings, resume, onNewGame, onOpenMenu, logOpen, onCloseLog, coachOpen = false, onCloseCoach, onEditRange, seed, paceScale, provider }: GameScreenProps) {
  const s = useGameSession({ settings, resume, seed, paceScale, provider });
  const { game } = s;
  const [summaryOpen, setSummaryOpen] = useState(false);
  const [sizing, setSizing] = useState(false);
  const [coachSheet, setCoachOpen] = useState(false);
  const [asideTab, setAsideTab] = useState<'coach' | 'log'>('coach');
  const wide = useMediaQuery('(min-width: 1180px)');
  // The menu asks for the Coach: it opens the panel under the table, then lets go of the request.
  useEffect(() => {
    if (!coachOpen) return;
    if (wide) setAsideTab('coach');
    else setCoachOpen(true);
    onCloseCoach?.();
  }, [coachOpen, wide, onCloseCoach]);
  const toggleCoach = (): void => (wide ? setAsideTab('coach') : setCoachOpen((v) => !v));
  const editRange: GameScreenProps['onEditRange'] = onEditRange
    ? (req) => {
        setCoachOpen(false);
        onEditRange(req);
      }
    : undefined;

  const view = useMemo(() => (s.settled ? buildResultView(game, HERO) : null), [s.settled, game]);
  const showdown = game.handStatus === 'complete' && game.result?.endedBy === 'showdown';
  const actions = lastActions(game);
  const hero = game.players[HERO];
  const botToAct = s.thinking !== null ? game.players[s.thinking] : null;

  const potChips = game.pot > 0 ? game.pot : (game.result?.pots.reduce((a, p) => a + p.amount, 0) ?? 0);
  const gains = view?.gains ?? {};
  const highlight = view?.highlight ?? new Set<string>();

  const onAction = (a: PlayerAction): void => s.act(a);

  const waiting = botToAct ? `${botToAct.name} is thinking` : undefined;

  if (!hero) return null;

  return (
    <FormatProvider bigBlind={game.config.bigBlind} mode={settings.unit}>
      <div className="game" data-phase={s.phase} data-street={game.street} data-sizing={sizing || undefined} data-coach={(!wide && coachSheet) || undefined}>
        <Header
          blinds={`${game.config.smallBlind} / ${game.config.bigBlind}`}
          handNumber={game.handNumber}
          onMenu={onOpenMenu}
          onCoach={toggleCoach}
        />
        <div className="game__body">
          <div className="game__main">
            <Table
              game={game}
              board={s.board}
              potChips={potChips}
              showdown={showdown}
              thinking={s.thinking}
              lastActions={actions}
              gains={gains}
              settled={s.settled}
              highlight={highlight}
            />

            <HeroPanel
              player={hero}
              board={s.board}
              isDealer={game.button === HERO}
              active={game.toAct === HERO && s.heroLegal !== null}
              lastAction={actions[HERO]}
              gain={s.settled ? gains[HERO] : undefined}
              settled={s.settled}
              showdown={showdown}
              highlight={highlight}
              lost={s.settled && (gains[HERO] ?? 0) <= 0}
            />

            <div className="dock">
              {view ? (
                <ResultPanel
                  view={view}
                  heroName={hero.name}
                  heroHand={heroHandName(game, HERO)}
                  sessionOver={s.phase === 'over'}
                  onNext={s.phase === 'over' ? () => setSummaryOpen(true) : s.nextHand}
                />
              ) : (
                <ActionBar state={game} legal={s.heroLegal} waiting={waiting} onAction={onAction} onSizingChange={setSizing} />
              )}
            </div>

            {!wide && (
              <CoachLive variant="sheet" open={coachSheet} onOpenChange={setCoachOpen} game={game} visibleBoard={s.board} botProfiles={s.botProfiles} onEditRange={editRange} />
            )}
          </div>

          {wide && (
            <aside className="game__aside" aria-label="Coach and hand log">
              <Segmented
                label="Side panel"
                value={asideTab}
                options={[
                  { value: 'coach', label: 'Coach' },
                  { value: 'log', label: 'Hand log' },
                ]}
                onChange={setAsideTab}
              />
              <div className="game__aside-body">
                {asideTab === 'coach' ? (
                  <CoachLive variant="aside" game={game} visibleBoard={s.board} botProfiles={s.botProfiles} onEditRange={editRange} />
                ) : (
                  <Panel>
                    <HandLog game={game} />
                  </Panel>
                )}
              </div>
            </aside>
          )}
        </div>

        {logOpen && (
          <Modal title={`Hand ${game.handNumber}`} onClose={onCloseLog}>
            <HandLog game={game} />
          </Modal>
        )}
        {summaryOpen && (
          <Modal title="Session over" onClose={() => setSummaryOpen(false)}>
            <SessionOver
              reason={s.overReason ?? 'busted'}
              handsPlayed={s.handsPlayed}
              net={s.sessionNet}
              onNewSession={onNewGame}
            />
          </Modal>
        )}
      </div>
    </FormatProvider>
  );
}
