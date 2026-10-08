import { itemsForLevel, type DecisionVerdict, type Explanation, type ExplanationCategory, type ExplanationLevel } from '../../coach/explanation';
import { Badge, Button, Segmented } from '../design-system';
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
  /** Live coach: the decision sentences and the verdict badge stay hidden until the player asks. */
  verdictHidden?: boolean;
  onRevealVerdict?: () => void;
  /** Live coach: "Ta situation" (what is on the table) apart from "Pourquoi ?" (what it means). */
  grouped?: boolean;
}

const FACTS: ExplanationCategory[] = ['situation', 'made_hand', 'draw', 'outs', 'equity', 'range'];

/** "Pourquoi ?": the explanation at the chosen depth. The level only changes how much is shown, never any number. */
export function ExplanationSection({ explanation, level, onLevel, showSources, onShowSources, verdictHidden = false, onRevealVerdict, grouped = false }: ExplanationSectionProps) {
  const all = itemsForLevel(explanation, level);
  const items = verdictHidden ? all.filter((i) => i.category !== 'decision') : all;
  const v = explanation.verdict.verdict;
  const canReveal = verdictHidden && all.length !== items.length;

  const list = (rows: typeof items, label?: string) => (
    <ol className="why__list" aria-live="polite" aria-label={label}>
      {rows.map((i) => (
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
  );
  const facts = items.filter((i) => FACTS.includes(i.category));
  const reasons = items.filter((i) => !FACTS.includes(i.category));

  return (
    <section className="why" aria-label={grouped ? 'Analyse' : 'Pourquoi ?'}>
      <Segmented label="Niveau d’explication" value={level} options={LEVELS} onChange={onLevel} />
      <p className="why__hint">{LEVEL_HINT[level]}</p>

      {grouped ? (
        <>
          {list(facts, 'Ta situation')}
          {(reasons.length > 0 || canReveal) && (
            <>
              <header className="why__head">
                <h3 className="why__title">Pourquoi ?</h3>
                {!verdictHidden && (
                  <Badge tone={VERDICT_TONE[v]} aria-label={`Verdict : ${VERDICT_FR[v]}`}>
                    {VERDICT_FR[v]}
                  </Badge>
                )}
              </header>
              {reasons.length > 0 && list(reasons)}
            </>
          )}
        </>
      ) : (
        <>
          <header className="why__head">
            <h3 className="why__title">Pourquoi ?</h3>
            {!verdictHidden && (
              <Badge tone={VERDICT_TONE[v]} aria-label={`Verdict : ${VERDICT_FR[v]}`}>
                {VERDICT_FR[v]}
              </Badge>
            )}
          </header>
          {list(items)}
        </>
      )}

      {canReveal && (
        <div className="why__reveal">
          <Button variant="secondary" onClick={onRevealVerdict}>
            Afficher mon verdict
          </Button>
          <span className="why__hint">Réfléchis d’abord : le verdict n’apparaît que si tu le demandes.</span>
        </div>
      )}

      <label className="why__toggle">
        <input type="checkbox" checked={showSources} onChange={(e) => onShowSources(e.target.checked)} />
        Afficher les sources de chaque phrase
      </label>
    </section>
  );
}
