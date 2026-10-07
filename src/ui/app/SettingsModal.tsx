import { MAX_BOTS } from '../../ai';
import { BLIND_OPTIONS, STACK_OPTIONS, type Settings } from '../../storage';
import { Modal, Segmented, useToast } from '../design-system';
import { useTheme } from '../theme/ThemeProvider';
import './app.css';

export function SettingsModal({ settings, onChange, onClose }: { settings: Settings; onChange: (s: Settings) => void; onClose: () => void }) {
  const toast = useToast();
  const { pref, setPref } = useTheme();
  const set = <K extends keyof Settings>(key: K, value: Settings[K]): void => onChange({ ...settings, [key]: value });
  const setTable = <K extends 'bots' | 'bigBlind' | 'stackBB'>(key: K, value: Settings[K]): void => {
    set(key, value);
    toast('Table settings apply to your next new game');
  };

  return (
    <Modal title="Settings" onClose={onClose}>
      <div className="settings">
        <div className="field">
          <span className="label">Apparence</span>
          <Segmented
            label="Apparence"
            value={pref}
            options={[
              { value: 'dark', label: 'Sombre' },
              { value: 'light', label: 'Clair' },
              { value: 'system', label: 'Système' },
            ]}
            onChange={setPref}
          />
          {pref === 'system' && <span className="field__hint">Suit le réglage de ton appareil.</span>}
        </div>
        <div className="field">
          <span className="label">Show amounts in</span>
          <Segmented
            label="Show amounts in"
            value={settings.unit}
            options={[
              { value: 'bb', label: 'Big blinds' },
              { value: 'chips', label: 'Chips' },
            ]}
            onChange={(v) => set('unit', v)}
          />
        </div>
        <div className="field">
          <span className="label">Bot speed</span>
          <Segmented
            label="Bot speed"
            value={settings.botSpeed}
            options={[
              { value: 'relaxed', label: 'Relaxed' },
              { value: 'normal', label: 'Normal' },
              { value: 'fast', label: 'Fast' },
            ]}
            onChange={(v) => set('botSpeed', v)}
          />
        </div>

        <div className="settings__group">
          <div className="field">
            <span className="label">Opponents</span>
            <Segmented
              label="Opponents"
              value={settings.bots}
              options={Array.from({ length: MAX_BOTS }, (_, i) => ({ value: i + 1, label: String(i + 1) }))}
              onChange={(v) => setTable('bots', v)}
            />
          </div>
          <div className="field">
            <span className="label">Blinds</span>
            <Segmented
              label="Blinds"
              value={settings.bigBlind}
              options={BLIND_OPTIONS.map((bb) => ({ value: bb, label: `${bb / 2} / ${bb}` }))}
              onChange={(v) => setTable('bigBlind', v)}
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
              onChange={(v) => setTable('stackBB', v)}
            />
          </div>
        </div>
      </div>
    </Modal>
  );
}
