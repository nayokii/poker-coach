import { useEffect, useMemo, useRef, useState } from 'react';
import { cardsToString, parseCards, type Card } from '../../engine';
import { equityRangeVsRange, equityVsRange, type EquityResult, type Range, type RangeVsRangeResult } from '../../coach/math';
import { BOT_RANGE_PROFILES, botRange, emptyRange } from '../../coach/ranges';
import { loadRangeIntroSeen, saveRangeIntroSeen } from '../../storage';
import { Badge, Button, Segmented } from '../design-system';
import { CompareResult } from './CompareResult';
import { RangeEditor } from './RangeEditor';
import { RangeGuide, RangeIntro } from './RangeHelp';
import { RangeSummary } from './RangeSummary';
import { frDecimal } from './cellText';
import { rangePercent } from '../../coach/ranges';
import './ranges.css';

type Slot = 'A' | 'B';

/** Sent by the Coach ("Modifier la range"): which bot profile range to open, and the cards that give it its context. */
export interface RangeLabRequest {
  /** Changes at every request so the same one can be sent twice. */
  id: number;
  profileId: string;
  hero: Card[];
  board: Card[];
}

function readCards(text: string, allowed: number[], what: string): { cards: Card[]; error: string | null } {
  const t = text.trim();
  if (!t) return { cards: [], error: null };
  try {
    const cards = parseCards(t);
    if (!allowed.includes(cards.length)) return { cards: [], error: `${what} : ${allowed.filter((n) => n > 0).join(', ')} cartes attendues` };
    return { cards, error: null };
  } catch {
    return { cards: [], error: `${what} : cartes illisibles (exemple : As Kd)` };
  }
}

export interface CompareOutcome {
  versus: RangeVsRangeResult;
  hero: { A: EquityResult; B: EquityResult } | null;
}

/** Range Lab: edit two ranges, see what known cards remove, and compare them (range vs range, hand vs range). */
export function RangeLab({ request = null }: { request?: RangeLabRequest | null }) {
  const [ranges, setRanges] = useState<Record<Slot, Range>>({ A: emptyRange(), B: emptyRange() });
  const [names, setNames] = useState<Record<Slot, string | null>>({ A: null, B: null });
  const [slot, setSlot] = useState<Slot>('A');
  const [heroText, setHeroText] = useState('');
  const [boardText, setBoardText] = useState('');
  const [outcome, setOutcome] = useState<CompareOutcome | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [introSeen, setIntroSeen] = useState(loadRangeIntroSeen);
  const scroller = useRef<HTMLDivElement>(null);

  // A request from the Coach opens that range, with the same cards, in slot A.
  const lastRequest = useRef<number | null>(null);
  useEffect(() => {
    if (!request || lastRequest.current === request.id) return;
    lastRequest.current = request.id;
    const profile = BOT_RANGE_PROFILES[request.profileId];
    if (!profile) return;
    setRanges((cur) => ({ ...cur, A: botRange(request.profileId) }));
    setNames((cur) => ({ ...cur, A: profile.label }));
    setSlot('A');
    setHeroText(cardsToString(request.hero));
    setBoardText(cardsToString(request.board));
    setOutcome(null);
    setProblem(null);
    scroller.current?.scrollTo?.({ top: 0 });
  }, [request]);

  const hero = readCards(heroText, [0, 2], 'Cartes du héros');
  const board = readCards(boardText, [0, 3, 4, 5], 'Board');
  const inputError = hero.error ?? board.error;
  const dead = useMemo(() => [...hero.cards, ...board.cards], [heroText, boardText]); // eslint-disable-line react-hooks/exhaustive-deps
  const pct = (s: Slot): string => frDecimal(rangePercent(ranges[s]));

  const compute = (): void => {
    setProblem(null);
    if (inputError) return setProblem(inputError);
    if (ranges.A.entries.length === 0 || ranges.B.entries.length === 0) return setProblem('Les deux ranges doivent contenir au moins une main.');
    setBusy(true);
    // let the browser paint the "Calcul" state before the (synchronous) calculation
    setTimeout(() => {
      try {
        const versus = equityRangeVsRange(ranges.A, ranges.B, board.cards);
        const heroResult = hero.cards.length === 2 ? { A: equityVsRange(hero.cards, ranges.A, board.cards), B: equityVsRange(hero.cards, ranges.B, board.cards) } : null;
        setOutcome({ versus, hero: heroResult });
      } catch (e) {
        setOutcome(null);
        setProblem(e instanceof Error ? e.message : 'Calcul impossible');
      } finally {
        setBusy(false);
      }
    }, 20);
  };

  return (
    <div className="lab" ref={scroller}>
      <header className="lab__head">
        <h1 className="lab__title">Range Lab</h1>
        <p className="lab__lead">Construis une range main par main, vois ce que les cartes connues retirent, puis compare deux ranges.</p>
      </header>

      <div className="lab__top">
        {!introSeen && (
          <RangeIntro
            onDone={() => {
              saveRangeIntroSeen();
              setIntroSeen(true);
            }}
          />
        )}
        <RangeGuide />
      </div>

      <div className="lab__grid">
        <section className="lab__editor" aria-label="Éditeur de range">
          <Segmented
            label="Range en cours d’édition"
            value={slot}
            options={[
              { value: 'A', label: `Range A · ${pct('A')} %` },
              { value: 'B', label: `Range B · ${pct('B')} %` },
            ]}
            onChange={setSlot}
          />

          <RangeSummary range={ranges[slot]} name={names[slot]} slot={slot} dead={inputError ? [] : dead} />

          <div className="lab__cards">
            <div className="field">
              <label className="label" htmlFor="lab-hero">Cartes du héros</label>
              <input id="lab-hero" className="text-input" value={heroText} placeholder="As Ks" spellCheck={false} autoCapitalize="off" onChange={(e) => setHeroText(e.target.value)} />
            </div>
            <div className="field">
              <label className="label" htmlFor="lab-board">Board</label>
              <input id="lab-board" className="text-input" value={boardText} placeholder="Jd 8s 4c" spellCheck={false} autoCapitalize="off" onChange={(e) => setBoardText(e.target.value)} />
            </div>
          </div>
          <p className="lab__hint">Les cartes connues retirent des combos de la range de l’adversaire : il ne peut pas avoir les cartes que tu vois.</p>
          {inputError && <p className="reditor__error" role="alert">{inputError}</p>}

          <RangeEditor
            key={slot}
            label={`Range ${slot}`}
            range={ranges[slot]}
            dead={inputError ? [] : dead}
            showStats={false}
            onChange={(r) => setRanges((cur) => ({ ...cur, [slot]: r }))}
            onSourceLabel={(l) => setNames((cur) => ({ ...cur, [slot]: l }))}
          />
        </section>

        <section className="lab__compare" aria-label="Comparer les ranges">
          <div className="lab__compare-head">
            <h2 className="lab__h2">Comparer</h2>
            <Badge>{`A ${pct('A')} % vs B ${pct('B')} %`}</Badge>
          </div>
          <p className="lab__hint">Les cartes connues retirent des combos dans les deux ranges. Sans board, toutes les cartes à venir sont prises en compte.</p>
          <Button variant="primary" large block onClick={compute} disabled={busy}>
            {busy ? 'Calcul…' : 'Calculer l’équité'}
          </Button>
          {problem && <p className="reditor__error" role="alert">{problem}</p>}
          {outcome && <CompareResult outcome={outcome} heroCards={hero.cards} />}
        </section>
      </div>
    </div>
  );
}
