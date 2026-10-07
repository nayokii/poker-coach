import { Play, RotateCw } from 'lucide-react';
import { MAX_BOTS } from '../../ai';
import { BLIND_OPTIONS, STACK_OPTIONS, type SavedSession, type Settings } from '../../storage';
import { card } from '../../engine';
import { PlayingCard } from '../cards/PlayingCard';
import { Button, Segmented } from '../design-system';
import './app.css';

export interface WelcomeProps {
  settings: Settings;
  saved: SavedSession | null;
  onChange: (s: Settings) => void;
  onStart: () => void;
  onResume: () => void;
}

export function Welcome({ settings, saved, onChange, onStart, onResume }: WelcomeProps) {
  const set = <K extends keyof Settings>(key: K, value: Settings[K]): void => onChange({ ...settings, [key]: value });

  return (
    <main className="welcome">
      <div className="welcome__inner">
        <div className="welcome__art" aria-hidden="true">
          <PlayingCard card={card(14, 's')} size="fluid" enter="deal" />
          <PlayingCard card={card(13, 'd')} size="fluid" enter="deal" delay={120} />
        </div>
        <header>
          <h1 className="welcome__title">Poker Coach</h1>
          <p className="welcome__lead">No-Limit Hold&apos;em contre des bots. Jetons virtuels, jamais d&apos;argent réel.</p>
        </header>

        <form
          className="welcome__form"
          onSubmit={(e) => {
            e.preventDefault();
            onStart();
          }}
        >
          <div className="field">
            <label className="label" htmlFor="player-name">Your name</label>
            <input
              id="player-name"
              className="text-input"
              value={settings.playerName}
              maxLength={14}
              autoComplete="off"
              onChange={(e) => set('playerName', e.target.value)}
              onBlur={() => settings.playerName.trim() === '' && set('playerName', 'Noah')}
            />
          </div>
          <div className="field">
            <span className="label">Opponents</span>
            <Segmented
              label="Opponents"
              value={settings.bots}
              options={Array.from({ length: MAX_BOTS }, (_, i) => ({ value: i + 1, label: String(i + 1) }))}
              onChange={(v) => set('bots', v)}
            />
          </div>
          <div className="field">
            <span className="label">Blinds</span>
            <Segmented
              label="Blinds"
              value={settings.bigBlind}
              options={BLIND_OPTIONS.map((bb) => ({ value: bb, label: `${bb / 2} / ${bb}` }))}
              onChange={(v) => set('bigBlind', v)}
            />
          </div>
          <div className="field">
            <span className="field__label">
              <span className="label">Starting stack</span>
              <span className="field__hint">in big blinds</span>
            </span>
            <Segmented
              label="Starting stack"
              value={settings.stackBB}
              options={STACK_OPTIONS.map((v) => ({ value: v, label: String(v) }))}
              onChange={(v) => set('stackBB', v)}
            />
          </div>

          <div className="welcome__actions">
            <Button type="submit" variant="primary" large block>
              <Play size={18} fill="currentColor" />
              Deal me in
            </Button>
            {saved && (
              <Button variant="secondary" large block onClick={onResume}>
                <RotateCw size={18} />
                <span>
                  Continue session
                  <span className="resume-hint">
                    {saved.handsPlayed} {saved.handsPlayed === 1 ? 'hand' : 'hands'} played
                  </span>
                </span>
              </Button>
            )}
          </div>
        </form>
        <p className="welcome__note">Chips are only for practice. Nothing here can be bought, won or cashed out.</p>
      </div>
    </main>
  );
}
