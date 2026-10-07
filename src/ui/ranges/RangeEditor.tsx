import { useEffect, useMemo, useState } from 'react';
import { FolderOpen, Save, Trash2 } from 'lucide-react';
import type { Card } from '../../engine';
import { RangeParseError, comboCount, parseRange, rangeToString, withoutDeadCards, type Combo, type Range } from '../../coach/math';
import {
  BOT_RANGE_PROFILES, WEIGHT_PRESETS, botRange, botRangePercent, buildMatrix, emptyRange, fullRange, invertRange, paintCells, rangePercent,
  setCellWeight, setComboWeight, type MatrixCell,
} from '../../coach/ranges';
import { deleteSavedRange, loadSavedRanges, saveRange, type SavedRange } from '../../storage';
import { Button, Segmented, useToast } from '../design-system';
import { CellInspector } from './CellInspector';
import { RangeMatrix } from './RangeMatrix';
import './ranges.css';

export interface RangeEditorProps {
  range: Range;
  onChange: (r: Range) => void;
  /** Known cards (hero hand, board): shown as blocked combos in the matrix. */
  dead?: readonly Card[];
  /** Accessible name of this editor ("Range A"). */
  label?: string;
  /** Called with the name of a range loaded from the library ("TAG"), or null as soon as the range is edited by hand. */
  onSourceLabel?: (label: string | null) => void;
  /** The Range Lab shows these numbers in its own summary; the standalone editor keeps its compact line. */
  showStats?: boolean;
}

const BRUSHES = WEIGHT_PRESETS.map((w) => ({ value: w, label: w === 0 ? 'Effacer' : `${w * 100}%` }));

/**
 * Reusable range editor: 13x13 matrix, percent brush, per-cell inspector, range text input (engine parser),
 * clear / all / invert, bot-profile presets and a local library of saved ranges.
 */
export function RangeEditor({ range, onChange, dead = [], label = 'Range', onSourceLabel, showStats = true }: RangeEditorProps) {
  const toast = useToast();
  const change = (r: Range, source: string | null = null): void => {
    onChange(r);
    onSourceLabel?.(source);
  };
  const [brush, setBrush] = useState<number>(1);
  const [focused, setFocused] = useState<MatrixCell | null>(null);
  const [draft, setDraft] = useState(() => rangeToString(range));
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<SavedRange[]>(() => loadSavedRanges());
  const [saveName, setSaveName] = useState('');
  const [loadId, setLoadId] = useState('');

  // The text box follows the matrix unless the user is in the middle of typing something that fails to parse.
  useEffect(() => {
    setDraft(rangeToString(range));
    setError(null);
  }, [range]);

  const available = useMemo(() => comboCount(withoutDeadCards(range, dead)), [range, dead]);
  const total = comboCount(range);
  const matrix = useMemo(() => buildMatrix(range, dead), [range, dead]);
  const live = focused ? (matrix.flat().find((c) => c.label === focused.label) ?? focused) : null;

  const apply = (): void => {
    try {
      change(parseRange(draft));
      setError(null);
    } catch (e) {
      setError(e instanceof RangeParseError ? `Notation non reconnue près de « ${e.token} ».` : 'Range illisible.');
    }
  };

  const loadSelected = (): void => {
    if (!loadId) return;
    if (loadId.startsWith('bot:')) {
      const id = loadId.slice(4);
      change(botRange(id), BOT_RANGE_PROFILES[id]?.label ?? id);
      toast(`Range ${BOT_RANGE_PROFILES[id]?.label} chargée`);
      return;
    }
    const r = saved.find((x) => x.id === loadId);
    if (!r) return;
    try {
      change(parseRange(r.text), r.name);
      toast(`« ${r.name} » chargée`);
    } catch {
      toast('Cette range sauvegardée est illisible');
    }
  };

  const save = (): void => {
    const name = saveName.trim();
    if (!name) {
      toast('Donne d’abord un nom à la range');
      return;
    }
    if (total === 0) {
      toast('Rien à sauvegarder : la range est vide');
      return;
    }
    setSaved(saveRange(name, rangeToString(range)));
    setSaveName('');
    toast(`« ${name} » sauvegardée`);
  };

  const remove = (): void => {
    const r = saved.find((x) => x.id === loadId);
    if (!r) return;
    setSaved(deleteSavedRange(r.id));
    setLoadId('');
    toast(`« ${r.name} » supprimée`);
  };

  return (
    <div className="reditor" role="group" aria-label={label}>
      {showStats && (
      <div className="reditor__stats num" aria-live="polite">
        <span>
          {total} combos <span className="reditor__dim">· {rangePercent(range).toFixed(1).replace('.', ',')} % des mains</span>
        </span>
        {dead.length > 0 && (
          <span className="reditor__dim">
            {available} / {total} possibles avec les cartes connues
          </span>
        )}
      </div>
      )}

      <Segmented label="Pinceau" value={brush} options={BRUSHES} onChange={setBrush} />

      <RangeMatrix
        range={range}
        dead={dead}
        brush={brush}
        focused={focused?.label ?? null}
        onFocusCell={setFocused}
        onPaint={(cells, w) => change(paintCells(range, cells.map((c) => c.handClass), w))}
      />

      {live && (
        <CellInspector
          cell={live}
          range={range}
          dead={dead}
          onSetCell={(w) => change(setCellWeight(range, live.handClass, w))}
          onSetCombo={(c: Combo, w) => change(setComboWeight(range, c, w))}
        />
      )}

      <div className="reditor__quick">
        <Button variant="ghost" onClick={() => change(emptyRange())}>Vider</Button>
        <Button variant="ghost" onClick={() => change(fullRange())}>Tout</Button>
        <Button variant="ghost" onClick={() => change(invertRange(range))}>Inverser</Button>
      </div>

      <div className="field">
        <label className="label" htmlFor={`${label}-text`}>Texte de la range</label>
        <div className="reditor__text">
          <input
            id={`${label}-text`}
            className="text-input"
            value={draft}
            spellCheck={false}
            autoCapitalize="off"
            autoCorrect="off"
            placeholder="22+, AJs+, KQs, AQo+"
            aria-invalid={error !== null}
            aria-describedby={error ? `${label}-err` : undefined}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && apply()}
          />
          <Button variant="secondary" onClick={apply}>Appliquer</Button>
        </div>
        {error && (
          <p id={`${label}-err`} className="reditor__error" role="alert">
            {error}
          </p>
        )}
      </div>

      <div className="field">
        <span className="label">Bibliothèque</span>
        <div className="reditor__text">
          <select className="text-input" aria-label="Charger une range" value={loadId} onChange={(e) => setLoadId(e.target.value)}>
            <option value="">Charger une range…</option>
            <optgroup label="Profils de bots (préflop)">
              {Object.values(BOT_RANGE_PROFILES).map((p) => (
                <option key={p.id} value={`bot:${p.id}`}>
                  {p.label} · {botRangePercent(p.id).toFixed(0)}%
                </option>
              ))}
            </optgroup>
            {saved.length > 0 && (
              <optgroup label="Mes ranges">
                {saved.map((r) => (
                  <option key={r.id} value={r.id}>{r.name}</option>
                ))}
              </optgroup>
            )}
          </select>
          <Button variant="secondary" onClick={loadSelected} disabled={!loadId} aria-label="Charger la range choisie">
            <FolderOpen size={18} />
          </Button>
          <Button variant="ghost" onClick={remove} disabled={!saved.some((r) => r.id === loadId)} aria-label="Supprimer la range sauvegardée">
            <Trash2 size={18} />
          </Button>
        </div>
        <div className="reditor__text">
          <input
            className="text-input"
            aria-label="Nom de la range à sauvegarder"
            placeholder="Nom de la range"
            maxLength={24}
            value={saveName}
            onChange={(e) => setSaveName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && save()}
          />
          <Button variant="secondary" onClick={save} aria-label="Sauvegarder la range">
            <Save size={18} />
          </Button>
        </div>
      </div>
    </div>
  );
}
