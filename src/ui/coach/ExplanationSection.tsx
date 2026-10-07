import { itemsForLevel, type DecisionVerdict, type Explanation, type ExplanationCategory, type ExplanationLevel } from '../../coach/explanation';
import { Badge, Segmented } from '../design-system';
import './coach.css';

const LEVELS: { value: ExplanationLevel; label: string }[] = [
  { value: 1, label: 'Simple' },
  { value: 2, label: 'Approfondi' },
  { value: 3, label: 'Avancé' },
];

const LEVEL_HINT: Record<ExplanationLevel, string> = {
  1: 'Ce qui se passe',
  2: 'Pourquoi, étape par étape',
  3: 'Les maths, les hypothèses et leurs limites',
};

const CATEGORY_FR: Record<ExplanationCategory, string> = {
  situation: 'Situation',
  made_hand: 'Main',
  draw: 'Tirage',
  outs: 'Outs',
  equity: 'Equity',
  pot_odds: 'Pot odds',
  spr: 'SPR',
  ev: 'Valeur espérée',
  blockers: 'Blockers',
  range: 'Range',
  confidence: 'Confiance',
  missing_data: 'Donnée manquante',
  decision: 'Décision',
  limitation: 'Limite',
};

const VERDICT_FR: Record<DecisionVerdict, string> = {
  favorable: 'Favorable',
  unfavorable: 'Défavorable',
  close: 'Proche',
  undetermined: 'Indéterminé',
};

const VERDICT_TONE: Record<DecisionVerdict, 'gain' | 'danger' | 'accent' | 'neutral'> = {
  favorable: 'gain',
  unfavorable: 'danger',
  close: 'accent',
  undetermined: 'neutral',
};

export interface ExplanationSectionProps {
  explanation: Explanation;
  level: ExplanationLevel;
  onLevel: (l: ExplanationLevel) => void;
  showSources: boolean;
  onShowSources: (v: boolean) => void;
}

/** "Pourquoi ?": the explanation at the chosen depth. The level only changes how much is shown, never any number. */
export function ExplanationSection({ explanation, level, onLevel, showSources, onShowSources }: ExplanationSectionProps) {
  const items = itemsForLevel(explanation, level);
  const v = explanation.verdict.verdict;

  return (
    <section className="why" aria-label="Pourquoi ?">
      <header className="why__head">
        <h3 className="why__title">Pourquoi ?</h3>
        <Badge tone={VERDICT_TONE[v]} aria-label={`Verdict : ${VERDICT_FR[v]}`}>
          {VERDICT_FR[v]}
        </Badge>
      </header>

      <Segmented label="Niveau d’explication" value={level} options={LEVELS} onChange={onLevel} />
      <p className="why__hint">{LEVEL_HINT[level]}</p>

      <ol className="why__list" aria-live="polite">
        {items.map((i) => (
          <li key={i.id} className="why__item" data-tone={i.tone} data-category={i.category} data-level={i.level}>
            <span className="why__cat">{CATEGORY_FR[i.category]}</span>
            <span className="why__text">{i.text}</span>
            {showSources && (
              <span className="why__src" aria-label="Sources">
                {i.sources.join(' · ')}
              </span>
            )}
          </li>
        ))}
      </ol>

      <label className="why__toggle">
        <input type="checkbox" checked={showSources} onChange={(e) => onShowSources(e.target.checked)} />
        Afficher les sources de chaque phrase
      </label>
    </section>
  );
}
