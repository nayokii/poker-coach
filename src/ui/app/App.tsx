import { useCallback, useState } from 'react';
import { clearSession, loadSession, loadSettings, saveSettings, type SavedSession, type Settings } from '../../storage';
import { ToastProvider } from '../design-system';
import { ThemeProvider } from '../theme/ThemeProvider';
import { GameScreen } from '../game/GameScreen';
import { RangeLab, type RangeLabRequest } from '../ranges/RangeLab';
import { BottomNav } from './BottomNav';
import { MenuSheet } from './MenuSheet';
import { SettingsModal } from './SettingsModal';
import { Welcome } from './Welcome';
import { availableSections, type SectionId } from './sections';
import './app.css';

type Screen = { mode: 'welcome' } | { mode: 'game'; key: number; resume: SavedSession | null };
type Overlay = 'none' | 'menu' | 'settings' | 'log' | 'coach';

export function App() {
  const [settings, setSettings] = useState<Settings>(loadSettings);
  const [saved, setSaved] = useState<SavedSession | null>(loadSession);
  const [screen, setScreen] = useState<Screen>({ mode: 'welcome' });
  const [overlay, setOverlay] = useState<Overlay>('none');
  const [section, setSection] = useState<SectionId>('play');
  const [rangeRequest, setRangeRequest] = useState<RangeLabRequest | null>(null);

  const updateSettings = useCallback((s: Settings) => {
    setSettings(s);
    saveSettings(s);
  }, []);

  const startNew = (): void => {
    clearSession();
    setSaved(null);
    setScreen((cur) => ({ mode: 'game', key: (cur.mode === 'game' ? cur.key : 0) + 1, resume: null }));
  };
  const resume = (): void => {
    if (saved) setScreen((cur) => ({ mode: 'game', key: (cur.mode === 'game' ? cur.key : 0) + 1, resume: saved }));
  };
  const toWelcome = (): void => {
    setSaved(loadSession());
    setOverlay('none');
    setSection('play');
    setScreen({ mode: 'welcome' });
  };

  // Sections other than Play and Range Lab are planned (Train, History, Profile). The tab bar shows on the
  // new-game screen and in the Range Lab; during a hand the table keeps the whole screen.
  const sections = availableSections();
  const inGame = screen.mode === 'game' && section === 'play';
  const showNav = sections.length > 1 && !inGame;

  return (
    <ThemeProvider>
    <ToastProvider>
      <div className="app-shell">
        <div className="app-main">
          <div hidden={section !== 'play'} className="app-section">
            {screen.mode === 'welcome' ? (
              <Welcome settings={settings} saved={saved} onChange={updateSettings} onStart={startNew} onResume={resume} />
            ) : (
              <GameScreen
                key={screen.key}
                settings={settings}
                resume={screen.resume}
                onNewGame={toWelcome}
                onOpenMenu={() => setOverlay('menu')}
                logOpen={overlay === 'log'}
                onCloseLog={() => setOverlay('none')}
                coachOpen={overlay === 'coach'}
                onCloseCoach={() => setOverlay('none')}
                onEditRange={(req) => {
                  setRangeRequest((cur) => ({ ...req, id: (cur?.id ?? 0) + 1 }));
                  setSection('ranges');
                }}
              />
            )}
          </div>
          <div hidden={section !== 'ranges'} className="app-section">
            <RangeLab request={rangeRequest} />
          </div>
        </div>
        {showNav && <BottomNav sections={sections} current={section} onSelect={setSection} />}
      </div>

      {overlay === 'menu' && (
        <MenuSheet
          onClose={() => setOverlay('none')}
          onNewGame={toWelcome}
          onLog={() => setOverlay('log')}
          onSettings={() => setOverlay('settings')}
          onCoach={screen.mode === 'game' ? () => setOverlay('coach') : undefined}
          onRanges={() => {
            setOverlay('none');
            setSection('ranges');
          }}
        />
      )}
      {overlay === 'settings' && <SettingsModal settings={settings} onChange={updateSettings} onClose={() => setOverlay('none')} />}
    </ToastProvider>
    </ThemeProvider>
  );
}
