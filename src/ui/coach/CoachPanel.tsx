import { useMemo, useState } from 'react';
import { CATEGORY_NAMES, type Card, type GameState, type Street } from '../../engine';
import {
  analyzeCoach, snapshotForCoach, type CoachAnalysis, type CoachAssumptions, type ConfidenceReasonCode, type DrawInfo, type OpponentAssumption,
} from '../../coach/analysis';
import { explainAnalysis, type ExplanationLevel } from '../../coach/explanation';
import { BOT_RANGE_PROFILES, botRange } from '../../coach/ranges';
import { loadCoachPrefs, saveCoachPrefs } from '../../storage';
import { MiniCard } from '../cards/MiniCard';
import { Badge, Button, Segmented } from '../design-system';
import { Amount, useFormat } from '../format';
import { ExplanationSection } from './ExplanationSection';
import './coach.css';

export interface CoachPanelProps {
  game: GameState;
  /** Board cards currently visible to the player (the engine may be ahead during a run-out). */
  visibleBoard: Card[];
  heroSeat?: number;
  /** Seat -> bot profile id, used to build HYPOTHETICAL ranges when the user asks for them. */
  botProfiles: Record<number, string>;
  /** Opens the Range Lab on the range assumed for an opponent, with the same cards. */
  onEditRange?: (request: { profileId: string; hero: Card[]; board: Card[] }) => void;
}

type Mode = 'none' | 'profiles';

const pct = (x: number, digits = 1): string => `${(x * 100).toFixed(digits)}%`;

const streetOf = (n: number): Street => (n === 0 ? 'preflop' : n === 3 ? 'flop' : n === 4 ? 'turn' : 'river');

const REASON_TEXT: Record<ConfidenceReasonCode, string> = {
  ALL_OPPONENTS_EXACT_OR_KNOWN_RANGE: 'Every opponent hand or range is known',
  HYPOTHETICAL_RANGES: 'Opponent ranges are hypotheses, not facts',
  OPPONENT_INFO_MISSING: 'Some opponents have no assumed hand or range',
  NO_OPPONENT_INFO: 'Nothing is known about the opponents',
  NO_OPPONENTS: 'No opponent left to play against',
  ESTIMATED_BY_SIMULATION: 'Equity is a simulation estimate',
  MULTIWAY_INDEPENDENT_RANGES: 'Several ranges are treated as independent',
};

const DRAW_NAME: Record<DrawInfo['kind'], string> = {
  'flush-draw': 'Flush draw',
  'open-ended-straight-draw': 'Open-ended straight draw',
  gutshot: 'Gutshot',
  'double-gutshot': 'Double gutshot',
  'straight-flush-draw': 'Straight flush draw',
  'quads-draw': 'Four of a kind',
  'full-house-draw': 'Full house',
  'trips-draw': 'Three of a kind',
  'two-pair-draw': 'Two pair',
  'pair-draw': 'Pair',
};

const RANK_WORD = (r: number): string => ({ 11: 'J', 12: 'Q', 13: 'K', 14: 'A' } as Record<number, string>)[r] ?? String(r);
const SUIT_WORD: Record<string, string> = { s: 'spades', h: 'hearts', d: 'diamonds', c: 'clubs' };

function drawReason(d: DrawInfo): string {
  const r = d.reason;
  if (r.code === 'FOUR_TO_FLUSH') return `4 ${SUIT_WORD[r.suit]}: ${r.holeCards.length} in hand, ${r.boardCards.length} on the board`;
  if (r.code === 'STRAIGHT_COMPLETING_RANKS') return `Completed by a ${r.completingRanks.map(RANK_WORD).join(' or ')}`;
  return `${CATEGORY_NAMES[r.from]} to ${CATEGORY_NAMES[r.to]}`;
}

function Card_({ title, children, aside }: { title: string; children: React.ReactNode; aside?: React.ReactNode }) {
  return (
    <section className="cc" aria-label={title}>
      <header className="cc__head">
        <h3 className="label">{title}</h3>
        {aside}
      </header>
      {children}
    </section>
  );
}

function CardRow({ cards, muted }: { cards: Card[]; muted?: boolean }) {
  return (
    <span className="cc__cards">
      {cards.map((c) => (
        <MiniCard key={`${c.rank}${c.suit}`} card={c} muted={muted} />
      ))}
    </span>
  );
}

function Tile({ label, value, sub }: { label: string; value: React.ReactNode; sub?: string }) {
  return (
    <div className="tile">
      <span className="label">{label}</span>
      <span className="tile__value num">{value}</span>
      {sub && <span className="tile__sub">{sub}</span>}
    </div>
  );
}

/** Read-only view of a CoachAnalysis: structured data, no advice and no free text generated here. */
export function CoachView({ a }: { a: CoachAnalysis }) {
  const { fmt, full, unit } = useFormat();
  const s = a.situation;
  const sprText = 'status' in a.spr ? '—' : a.spr.spr === Infinity ? '∞' : a.spr.spr.toFixed(1);

  return (
    <div className="coach" data-confidence={a.confidence.level}>
      <div className="coach__confidence">
        <span className="label">Confidence</span>
        <Badge tone={a.confidence.level === 'high' ? 'gain' : a.confidence.level === 'medium' ? 'accent' : 'neutral'}>{a.confidence.level}</Badge>
        <ul className="coach__reasons">
          {a.confidence.reasons.map((r) => (
            <li key={r.code}>{REASON_TEXT[r.code]}{r.detail ? ` (${r.detail})` : ''}</li>
          ))}
        </ul>
      </div>

      <Card_ title="Situation">
        <div className="tiles">
          <Tile label="Street" value={s.street} sub={`${s.playersInHand} players`} />
          <Tile label="Pot" value={<Amount chips={s.pot} />} />
          <Tile label="Eff. stack" value={s.effectiveStack === null ? '—' : <Amount chips={s.effectiveStack} />} />
          <Tile label="SPR" value={sprText} sub={'status' in a.spr ? undefined : a.spr.category} />
        </div>
        <p className="cc__line">
          {s.facing.kind === 'bet' ? (
            <>To call <strong className="num">{full(s.facing.callAmount)}</strong>{s.facing.callIsAllIn ? ' (all-in)' : ''}
              {s.facing.betToPotRatio !== null && <span className="dim"> · bet = {s.facing.betToPotRatio.toFixed(2)} × pot</span>}</>
          ) : (
            'No bet to call'
          )}
          <span className="dim"> · {s.heroPosition || '—'}{s.heroToAct ? ' · your turn' : ''}</span>
        </p>
      </Card_>

      <Card_ title="Current hand">
        {a.handStrength.kind === 'preflop' ? (
          <p className="cc__big">{a.handStrength.handClass} <span className="dim">· {a.handStrength.combos} combos</span></p>
        ) : a.handStrength.kind === 'made' ? (
          <>
            <p className="cc__big">{a.handStrength.description}</p>
            <p className="cc__line dim">
              {a.handStrength.boardPlays ? 'The board plays: no hole card is used' : `Uses ${a.handStrength.holeCardsUsed.length} hole card${a.handStrength.holeCardsUsed.length > 1 ? 's' : ''}`}
            </p>
            <CardRow cards={a.handStrength.bestFive} />
          </>
        ) : (
          <p className="cc__line dim">No hole cards</p>
        )}
      </Card_>

      <Card_ title="Draws">
        {a.draws.status === 'not_applicable' ? (
          <p className="cc__line dim">{a.draws.reason === 'PREFLOP' ? 'No board yet' : a.draws.reason === 'RIVER' ? 'No card to come' : 'No hole cards'}</p>
        ) : a.draws.draws.length === 0 ? (
          <p className="cc__line dim">No draw</p>
        ) : (
          <ul className="draws">
            {a.draws.draws.map((d) => (
              <li key={d.kind} data-relevance={d.relevance}>
                <span className="draws__name">{DRAW_NAME[d.kind]}</span>
                <span className="draws__outs num">{d.outs} outs</span>
                <span className="draws__reason">{drawReason(d)}</span>
                <CardRow cards={d.cards} muted={d.relevance === 'minor'} />
              </li>
            ))}
          </ul>
        )}
      </Card_>

      <Card_ title="Outs">
        {a.outs.status === 'not_applicable' ? (
          <p className="cc__line dim">{a.outs.reason === 'PREFLOP' ? 'Outs start on the flop' : a.outs.reason === 'RIVER' ? 'No card to come' : 'No hole cards'}</p>
        ) : (
          <>
            <div className="outs__top">
              <span className="cc__big num">{a.outs.total}</span>
              <span className="dim">{a.outs.total === 1 ? 'out' : 'outs'} · {a.outs.probabilities.unknownCards} unknown cards</span>
            </div>
            <div className="outs__quality num" aria-label="Out quality">
              <span data-q="clean">Clean {a.outs.clean.length}</span>
              <span data-q="dirty">Dirty {a.outs.dirty.length}</span>
              <span data-q="unknown">Unknown {a.outs.unknown.length}</span>
            </div>
            <p className="cc__line dim">
              {a.outs.qualityBasis === 'nuts-check' ? 'Clean = completes the nuts. No opponent range, so the rest is unknown.' : 'Quality judged against the assumed opponent ranges.'}
            </p>
            <div className="outs__odds num">
              <Tile label={a.outs.probabilities.cardsToCome === 2 ? 'Next card' : 'Next card'} value={pct(a.outs.probabilities.hitNextCard)} />
              {a.outs.probabilities.cardsToCome > 1 && <Tile label="By the river" value={pct(a.outs.probabilities.hitByLastCard)} />}
            </div>
            {a.outs.clean.length > 0 && <div className="outs__group"><span className="label">Clean</span><CardRow cards={a.outs.clean} /></div>}
            {a.outs.dirty.length > 0 && <div className="outs__group"><span className="label">Dirty</span><CardRow cards={a.outs.dirty} /></div>}
            {a.outs.unknown.length > 0 && <div className="outs__group"><span className="label">Unknown</span><CardRow cards={a.outs.unknown} muted /></div>}
          </>
        )}
      </Card_>

      <Card_
        title="Equity"
        aside={
          a.equity.status === 'computed' ? (
            a.equity.method === 'exact' ? <Badge tone="gain">Exact</Badge> : <Badge tone="accent">Estimated</Badge>
          ) : undefined
        }
      >
        {a.equity.status === 'computed' ? (
          <>
            <p className="cc__big num">{pct(a.equity.equity)}</p>
            <p className="cc__line num dim">
              Win {pct(a.equity.winProbability)} · Tie {pct(a.equity.tieProbability)} · Loss {pct(a.equity.lossProbability)}
            </p>
            {a.equity.method === 'monte-carlo' && (
              <p className="cc__line num dim">
                {a.equity.samples?.toLocaleString('fr-FR')} samples · seed {a.equity.seed ?? 'custom'} · ±{((a.equity.standardError ?? 0) * 200).toFixed(1)}%
              </p>
            )}
            <ul className="opps">
              {a.equity.opponents.map((o, i) => (
                <li key={o.seat}>
                  <span>{o.name}</span>
                  <span className="dim">
                    {o.source === 'exact-hand' ? 'exact hand' : o.source === 'known-range' ? 'known range' : 'hypothetical'}
                    {o.label ? ` · ${o.label}` : ''} · {o.combos} combos
                  </span>
                  <span className="num">{pct((a.equity as Extract<CoachAnalysis['equity'], { status: 'computed' }>).opponentEquities[i] ?? 0)}</span>
                </li>
              ))}
            </ul>
          </>
        ) : a.equity.status === 'unknown_opponent_range' ? (
          <>
            <p className="cc__big">Opponent range unknown</p>
            <p className="cc__line dim">No equity is shown: it would require inventing a range. Pick a hypothesis above to compute one.</p>
          </>
        ) : (
          <p className="cc__line dim">Not applicable</p>
        )}
      </Card_>

      <Card_ title="Pot odds">
        {a.potOdds.status === 'no_call_decision' ? (
          <p className="cc__line dim">Nothing to call</p>
        ) : (
          <>
            <p className="cc__big num">{pct(a.potOdds.odds.requiredEquity)} <span className="dim">needed</span></p>
            <p className="cc__line num dim">
              Call {fmt(a.potOdds.odds.callAmount)}{unit && ` ${unit}`} into {fmt(a.potOdds.odds.potBeforeCall)}{unit && ` ${unit}`} · {a.potOdds.odds.ratio.toFixed(1)} to 1
            </p>
            {a.potOdds.comparison ? (
              <p className="cc__line num" data-ok={a.potOdds.comparison.meetsRequirement || undefined}>
                Equity {pct(a.potOdds.comparison.equity)} vs {pct(a.potOdds.comparison.requiredEquity)} needed ·{' '}
                <strong>{a.potOdds.comparison.margin >= 0 ? '+' : '−'}{pct(Math.abs(a.potOdds.comparison.margin))}</strong>
              </p>
            ) : (
              <p className="cc__line dim">Equity unknown: no comparison.</p>
            )}
            {a.potOdds.implied && (
              <p className="cc__line dim">
                {a.potOdds.implied.status === 'complete'
                  ? `With the stated implied odds: ${pct(a.potOdds.implied.requiredEquity)} needed`
                  : `Implied odds incomplete: missing ${a.potOdds.implied.missing.join(', ')}`}
              </p>
            )}
          </>
        )}
      </Card_>

      <Card_ title="Expected value">
        {a.ev.status === 'complete' ? (
          <>
            <p className="cc__big num">{a.ev.ev >= 0 ? '+' : '−'}<Amount chips={Math.abs(a.ev.ev)} /></p>
            <p className="cc__line dim">EV of {a.ev.kind === 'call' ? 'calling' : 'betting'}, relative to folding</p>
            <details className="cc__details">
              <summary>Assumptions</summary>
              <ul>{a.ev.assumptions.map((x) => <li key={x}>{x}</li>)}</ul>
            </details>
          </>
        ) : (
          <>
            <p className="cc__big">Insufficient data</p>
            <ul className="cc__list dim">{a.ev.missing.map((m) => <li key={m}>{m}</li>)}</ul>
          </>
        )}
      </Card_>

      <Card_ title="Blockers">
        {a.blockers.status === 'no_range_assumed' ? (
          <p className="cc__line dim">No opponent range assumed.</p>
        ) : (
          <ul className="opps">
            {a.blockers.ranges.map((r) => (
              <li key={r.seat}>
                <span>{s.opponents.find((o) => o.seat === r.seat)?.name ?? `Seat ${r.seat}`}</span>
                <span className="dim num">
                  {r.remainingCombos} / {r.totalCombos} combos remain{r.blockedCombos > 0 ? ` (${r.blockedCombos} blocked)` : ''}
                </span>
                <span className="dim num">{r.mostAffected.map((m) => `${m.handClass} ${m.total - m.blocked}/${m.total}`).join(' · ')}</span>
              </li>
            ))}
          </ul>
        )}
      </Card_>

      {a.assumptionsUsed.length > 0 && (
        <details className="cc__details cc__details--card">
          <summary>Assumptions used</summary>
          <ul>{a.assumptionsUsed.map((x) => <li key={x}>{x}</li>)}</ul>
        </details>
      )}
    </div>
  );
}

/** Coach analysis of the live hand, with an explicit choice of what to assume about the opponents. */
export function CoachPanel({ game, visibleBoard, heroSeat = 0, botProfiles, onEditRange }: CoachPanelProps) {
  const [mode, setMode] = useState<Mode>('none');

  const analysis = useMemo(() => {
    if (game.handStatus !== 'inProgress') return null;
    const base = snapshotForCoach(game, heroSeat);
    const snap = { ...base, board: visibleBoard.slice(), street: streetOf(visibleBoard.length) };
    const assumptions: CoachAssumptions = { equity: { seed: 1 } };
    if (mode === 'profiles') {
      const opponents: Record<number, OpponentAssumption> = {};
      for (const o of snap.opponents) {
        const id = botProfiles[o.seat];
        if (!id || !BOT_RANGE_PROFILES[id]) continue;
        opponents[o.seat] = {
          kind: 'range', range: botRange(id), certainty: 'hypothetical', source: 'bot-profile', label: `${BOT_RANGE_PROFILES[id].label} preflop range`,
        };
      }
      assumptions.opponents = opponents;
    }
    return analyzeCoach(snap, assumptions);
  }, [game, visibleBoard, heroSeat, botProfiles, mode]);

  // One line per distinct hypothetical range in use: "Adversaire : range TAG — hypothèse".
  const rangeRows = useMemo(() => {
    if (mode !== 'profiles' || game.handStatus !== 'inProgress') return [];
    const snap = snapshotForCoach(game, heroSeat);
    const seen = new Set<string>();
    for (const o of snap.opponents) {
      const id = botProfiles[o.seat];
      if (id && BOT_RANGE_PROFILES[id]) seen.add(id);
    }
    return [...seen].map((id) => ({ id, label: BOT_RANGE_PROFILES[id]?.label ?? id, hero: snap.hero, board: visibleBoard.slice() }));
  }, [mode, game, heroSeat, botProfiles, visibleBoard]);

  const { full } = useFormat();
  const [prefs, setPrefs] = useState(loadCoachPrefs);
  const update = (next: Partial<typeof prefs>): void => {
    const merged = { ...prefs, ...next };
    setPrefs(merged);
    saveCoachPrefs(merged);
  };
  const explanation = useMemo(() => (analysis ? explainAnalysis(analysis, { formatAmount: (c) => full(c).replace('.', ',') }) : null), [analysis, full]);

  return (
    <div className="coach-panel">
      <div className="field">
        <span className="label">Les adversaires sont supposés avoir</span>
        <Segmented
          label="Opponent assumption"
          value={mode}
          options={[
            { value: 'none', label: 'Rien' },
            { value: 'profiles', label: 'Leur range de profil' },
          ]}
          onChange={setMode}
        />
        {mode === 'profiles' && <p className="coach__note">Hypothèse : la range préflop de chaque bot, non mise à jour par ses actions.</p>}
        {rangeRows.map((r) => (
          <div key={r.id} className="coach__range">
            <span>
              Adversaire : range <strong>{r.label}</strong> — hypothèse
            </span>
            {onEditRange && (
              <Button variant="secondary" onClick={() => onEditRange({ profileId: r.id, hero: r.hero, board: r.board })}>
                Modifier la range
              </Button>
            )}
          </div>
        ))}
      </div>
      {analysis && explanation ? (
        <div className="coach-cols">
          <ExplanationSection
            explanation={explanation}
            level={prefs.level}
            onLevel={(l: ExplanationLevel) => update({ level: l })}
            showSources={prefs.showSources}
            onShowSources={(v) => update({ showSources: v })}
          />
          <CoachView a={analysis} />
        </div>
      ) : (
        <p className="cc__line dim">L’analyse est disponible pendant une main en cours.</p>
      )}
    </div>
  );
}
