import { cardToString, type Card } from '../../engine';
import type { EquityResult, MultiwayPlayerResult } from '../../coach/math';
import { Badge } from '../design-system';
import type { CompareOutcome } from './RangeLab';
import './ranges.css';

const pct = (x: number): string => `${(x * 100).toFixed(1)}%`;

function MethodBadge({ method, samples, seed, se }: { method: 'exact' | 'monte-carlo'; samples?: number; seed?: number; se?: number }) {
  if (method === 'exact') return <Badge tone="gain">Exact</Badge>;
  return (
    <span className="method">
      <Badge tone="accent">Estimated</Badge>
      <span className="method__detail num">
        {samples?.toLocaleString('fr-FR')} samples{seed !== undefined ? ` · seed ${seed}` : ''}
        {se !== undefined ? ` · ±${(se * 200).toFixed(1)}%` : ''}
      </span>
    </span>
  );
}

function Side({ name, r, tone }: { name: string; r: MultiwayPlayerResult; tone: 'a' | 'b' }) {
  return (
    <div className="side" data-tone={tone}>
      <span className="label">{name}</span>
      <span className="side__eq num">{pct(r.equity)}</span>
      <dl className="side__stats num">
        <div><dt>Win</dt><dd>{pct(r.winProbability)}</dd></div>
        <div><dt>Tie</dt><dd>{pct(r.tieProbability)}</dd></div>
        <div><dt>Loss</dt><dd>{pct(Math.max(0, 1 - r.winProbability - r.tieProbability))}</dd></div>
        <div><dt>Combos</dt><dd>{r.combosConsidered}</dd></div>
      </dl>
    </div>
  );
}

function HeroLine({ label, r }: { label: string; r: EquityResult }) {
  return (
    <li>
      <span>{label}</span>
      <span className="num">{pct(r.equity)}</span>
      <span className="num dim">
        win {pct(r.winProbability)} · tie {pct(r.tieProbability)} · {r.combosConsidered} combos
      </span>
    </li>
  );
}

export function CompareResult({ outcome, heroCards }: { outcome: CompareOutcome; heroCards: Card[] }) {
  const v = outcome.versus;
  return (
    <div className="result-card" role="region" aria-label="Equity result">
      <div className="result-card__bar" role="img" aria-label={`Range A ${pct(v.a.equity)}, Range B ${pct(v.b.equity)}`}>
        <span style={{ width: `${v.a.equity * 100}%` }} data-tone="a" />
        <span style={{ width: `${v.b.equity * 100}%` }} data-tone="b" />
      </div>
      <div className="result-card__sides">
        <Side name="Range A" r={v.a} tone="a" />
        <Side name="Range B" r={v.b} tone="b" />
      </div>
      <p className="result-card__meta num">
        {v.validMatchups.toLocaleString('fr-FR')} possible matchups
      </p>
      <MethodBadge method={v.method} samples={v.samples} seed={v.seed} se={v.a.standardError} />
      {outcome.hero && (
        <ul className="result-card__hero" aria-label={`${heroCards.map(cardToString).join(' ')} against each range`}>
          <HeroLine label={`${heroCards.map(cardToString).join(' ')} vs A`} r={outcome.hero.A} />
          <HeroLine label={`${heroCards.map(cardToString).join(' ')} vs B`} r={outcome.hero.B} />
        </ul>
      )}
    </div>
  );
}
