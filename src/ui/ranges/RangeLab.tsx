import { useMemo, useState } from 'react';
import { parseCards, type Card } from '../../engine';
import { equityRangeVsRange, equityVsRange, type EquityResult, type Range, type RangeVsRangeResult } from '../../coach/math';
import { emptyRange, rangePercent } from '../../coach/ranges';
import { Badge, Button, Segmented } from '../design-system';
import { RangeEditor } from './RangeEditor';
import { CompareResult } from './CompareResult';
import './ranges.css';

type Slot = 'A' | 'B';

function readCards(text: string, allowed: number[], what: string): { cards: Card[]; error: string | null } {
  const t = text.trim();
  if (!t) return { cards: [], error: null };
  try {
    const cards = parseCards(t);
    if (!allowed.includes(cards.length)) return { cards: [], error: `${what}: ${allowed.filter((n) => n > 0).join(', ')} cards expected` };
    return { cards, error: null };
  } catch {
    return { cards: [], error: `${what}: cannot read cards (example: As Kd)` };
  }
}

export interface CompareOutcome {
  versus: RangeVsRangeResult;
  hero: { A: EquityResult; B: EquityResult } | null;
}

/** Range Lab: edit two ranges, see blockers from known cards and compare them (range vs range, hand vs range). */
export function RangeLab() {
  const [ranges, setRanges] = useState<Record<Slot, Range>>({ A: emptyRange(), B: emptyRange() });
  const [slot, setSlot] = useState<Slot>('A');
  const [heroText, setHeroText] = useState('');
  const [boardText, setBoardText] = useState('');
  const [outcome, setOutcome] = useState<CompareOutcome | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const hero = readCards(heroText, [0, 2], 'Hero cards');
  const board = readCards(boardText, [0, 3, 4, 5], 'Board');
  const inputError = hero.error ?? board.error;
  const dead = useMemo(() => [...hero.cards, ...board.cards], [heroText, boardText]); // eslint-disable-line react-hooks/exhaustive-deps
  const pct = (s: Slot): string => rangePercent(ranges[s]).toFixed(1);

  const compute = (): void => {
    setProblem(null);
    if (inputError) return setProblem(inputError);
    if (ranges.A.entries.length === 0 || ranges.B.entries.length === 0) return setProblem('Both ranges need at least one hand.');
    setBusy(true);
    // let the browser paint the "Computing" state before the (synchronous) calculation
    setTimeout(() => {
      try {
        const versus = equityRangeVsRange(ranges.A, ranges.B, board.cards);
        const heroResult = hero.cards.length === 2 ? { A: equityVsRange(hero.cards, ranges.A, board.cards), B: equityVsRange(hero.cards, ranges.B, board.cards) } : null;
        setOutcome({ versus, hero: heroResult });
      } catch (e) {
        setOutcome(null);
        setProblem(e instanceof Error ? e.message : 'Could not compute');
      } finally {
        setBusy(false);
      }
    }, 20);
  };

  return (
    <div className="lab">
      <header className="lab__head">
        <h1 className="lab__title">Range Lab</h1>
        <p className="lab__lead">Build ranges hand by hand, see what known cards remove, and compare them.</p>
      </header>

      <div className="lab__grid">
        <section className="lab__editor" aria-label="Range editor">
          <Segmented
            label="Range being edited"
            value={slot}
            options={[
              { value: 'A', label: `Range A · ${pct('A')}%` },
              { value: 'B', label: `Range B · ${pct('B')}%` },
            ]}
            onChange={setSlot}
          />

          <div className="lab__cards">
            <div className="field">
              <label className="label" htmlFor="lab-hero">Hero cards</label>
              <input id="lab-hero" className="text-input" value={heroText} placeholder="As Ks" spellCheck={false} autoCapitalize="off" onChange={(e) => setHeroText(e.target.value)} />
            </div>
            <div className="field">
              <label className="label" htmlFor="lab-board">Board</label>
              <input id="lab-board" className="text-input" value={boardText} placeholder="Jd 8s 4c" spellCheck={false} autoCapitalize="off" onChange={(e) => setBoardText(e.target.value)} />
            </div>
          </div>
          {inputError && <p className="reditor__error" role="alert">{inputError}</p>}

          <RangeEditor
            key={slot}
            label={`Range ${slot}`}
            range={ranges[slot]}
            dead={inputError ? [] : dead}
            onChange={(r) => setRanges((cur) => ({ ...cur, [slot]: r }))}
          />
        </section>

        <section className="lab__compare" aria-label="Compare ranges">
          <div className="lab__compare-head">
            <h2 className="lab__h2">Compare</h2>
            <Badge>{`A ${pct('A')}% vs B ${pct('B')}%`}</Badge>
          </div>
          <p className="lab__hint">Known cards block combos in both ranges. The board is dealt as given; without a board, all runouts are considered.</p>
          <Button variant="primary" large block onClick={compute} disabled={busy}>
            {busy ? 'Computing…' : 'Compute equity'}
          </Button>
          {problem && <p className="reditor__error" role="alert">{problem}</p>}
          {outcome && <CompareResult outcome={outcome} heroCards={hero.cards} />}
        </section>
      </div>
    </div>
  );
}
