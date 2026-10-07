import { describe, expect, it } from 'vitest';
import { cardToString, parseCards, remainingDeck, type GameState } from '../../../engine';
import { newGame, play, rigged } from '../../../engine/__tests__/helpers';
import { analyzeGameState, type CoachAnalysis, type CoachAssumptions, type OpponentAssumption } from '../../analysis';
import { parseRange } from '../../math';
import {
  CLOSE_MARGIN_STANDARD_ERRORS, explainAnalysis, itemsForLevel, readVerdict, resolvePath, type Explanation, type ExplanationItem,
} from '..';

const mk = (stacks = [2000, 2000, 2000]) => newGame(stacks, { sb: 10, bb: 20 });
const free = (used: string, n: number): string[] => remainingDeck(parseCards(used)).slice(0, n).map(cardToString);

function flop(hero: string, board: string, v1?: string, v2?: string): GameState {
  const base = `${hero} ${board}`;
  const h1 = v1 ?? free(base, 2).join(' ');
  const h2 = v2 ?? free(`${base} ${h1}`, 2).join(' ');
  const run = free(`${base} ${h1} ${h2}`, 2).join(' ');
  return play(rigged(mk(), [hero, h1, h2], `${board} ${run}`), ['call'], ['call'], ['check']);
}

type Available = Extract<CoachAnalysis['potOdds'], { status: 'available' }>;
const comparisonOf = (a: CoachAnalysis): NonNullable<Available['comparison']> => {
  if (a.potOdds.status !== 'available' || !a.potOdds.comparison) throw new Error('comparison expected');
  return a.potOdds.comparison;
};
const withMargin = (a: CoachAnalysis, margin: number): CoachAnalysis => {
  if (a.potOdds.status !== 'available' || !a.potOdds.comparison) throw new Error('comparison expected');
  return { ...a, potOdds: { ...a.potOdds, comparison: { ...a.potOdds.comparison, margin, meetsRequirement: margin >= 0 } } };
};

const BB = 20;
const fmt = (chips: number): string => `${Number.isInteger(chips / BB) ? chips / BB : (chips / BB).toFixed(1).replace('.', ',')} BB`;
const hyp = (text: string, label = 'TAG'): OpponentAssumption => ({ kind: 'range', range: parseRange(text), certainty: 'hypothetical', label });
const known = (text: string): OpponentAssumption => ({ kind: 'range', range: parseRange(text), certainty: 'known' });
const exact = (hand: string): OpponentAssumption => ({ kind: 'exact-hand', hand: parseCards(hand) });

const explain = (s: GameState, assume: CoachAssumptions = {}): { a: CoachAnalysis; e: Explanation } => {
  const a = analyzeGameState(s, 0, assume);
  return { a, e: explainAnalysis(a, { formatAmount: fmt }) };
};
const find = (e: Explanation, id: string): ExplanationItem | undefined => e.items.find((i) => i.id === id);
const all = (e: Explanation): string => e.items.map((i) => i.text).join('\n');
const norm = (s: string): string => s.replace(/[  ]/g, ' ');

/** Flop, hero has a flush draw, villain bets 40 into 60 (hero owes 40). */
const flushDrawFacingBet = (): GameState => play(flop('Ah 5h', 'Kh 9h 2c'), ['bet', 40]);
const tag = '77+, A9s+, KTs+, ATo+';

describe('known data produces the matching sentences', () => {
  const { a, e } = explain(flushDrawFacingBet(), { opponents: { 1: hyp(tag), 2: hyp('22+, A2s+, K9s+') } });

  it('situation: street, players, pot and what is owed', () => {
    expect(find(e, 'situation.summary')!.text).toBe('Tu es au flop, à 3 joueurs. Le pot est de 5 BB et tu dois payer 2 BB.');
    expect(find(e, 'situation.position')!.text).toContain('BTN');
  });

  it('made hand', () => {
    expect(find(e, 'made_hand.value')!.text).toBe('Tu as une carte haute (l’as).');
    expect(find(e, 'made_hand.best_five')!.text).toContain('A♥ 5♥');
  });

  it('draw: flush draw, with the data behind it', () => {
    expect(find(e, 'draw.flush-draw')!.text).toBe('Tu as aussi un tirage couleur.');
    expect(find(e, 'draw.flush-draw.reason')!.text).toBe('Tu as quatre cartes de cœurs : 2 dans ta main et 2 sur le board.');
  });

  it('outs: count, never presented as guaranteed, quality counts and exact probabilities', () => {
    expect(find(e, 'outs.total')!.text).toBe('Tu as 15 outs potentiels.');
    expect(find(e, 'outs.reliability')!.text).toContain('moins fiables');
    const q = find(e, 'outs.quality')!.text;
    expect(q).toMatch(/Parmi eux : \d+ propres, \d+ douteux, \d+ de qualité inconnue\./);
    expect(norm(find(e, 'outs.probability')!.text)).toBe('Chance de toucher à la prochaine carte : 31,9 % ; d’ici la river : 54,1 %.');
    expect(norm(all(e))).not.toMatch(/garanti/i);
  });

  it('equity, pot odds and the comparison, straight from the analysis', () => {
    if (a.equity.status !== 'computed' || a.potOdds.status !== 'available') throw new Error('analysis expected');
    const eq = norm(find(e, 'equity.value')!.text);
    expect(eq).toMatch(/^Si on suppose ces ranges, ton equity est de \d+,\d %\.$/);
    const pct = (x: number) => `${(x * 100).toFixed(1).replace('.', ',')} %`;
    expect(eq).toContain(pct(a.equity.equity));
    expect(norm(find(e, 'pot_odds.need')!.text)).toBe(`Il te faut environ ${pct(a.potOdds.odds.requiredEquity)} d’equity pour payer 2 BB dans un pot de 5 BB.`);
    expect(norm(find(e, 'pot_odds.compare')!.text)).toContain(pct(a.potOdds.comparison!.equity));
    expect(norm(find(e, 'pot_odds.ratio')!.text)).toContain('2,5 contre un');
  });

  it('SPR and EV', () => {
    if (a.ev.status !== 'complete') throw new Error('ev expected');
    expect(find(e, 'spr.value')!.text).toBe('Le SPR est de 19,8 (très élevé).');
    expect(find(e, 'spr.meaning')!.text).toContain('très élevé');
    const ev = find(e, 'ev.value')!;
    expect(ev.text).toContain('Payer vaut');
    expect(ev.text.startsWith('Payer vaut +')).toBe(a.ev.ev > 0);
    expect(find(e, 'ev.assumptions')!.text).toContain('showdown');
  });

  it('blockers: simple sentence, counts, details', () => {
    expect(find(e, 'blockers.summary')!.text).toMatch(/^Tu bloques certaines combinaisons de /);
    expect(find(e, 'blockers.range.1')!.text).toMatch(/combinaisons sont impossibles sur \d+ à cause de tes cartes ; il en reste \d+\./);
    expect(find(e, 'blockers.range.1.detail')!.text).toContain('Mains les plus touchées');
  });

  it('range: the hypothesis is stated as a hypothesis, never as an observation', () => {
    const r = find(e, 'range.hypothesis.0')!;
    expect(r.level).toBe(1);
    expect(r.text).toContain('Cette analyse suppose que');
    expect(r.text).toContain('hypothèse, pas une observation');
    expect(r.text).toContain('« TAG »');
    expect(r.text).toContain('chacun');
  });

  it('decision: a verdict read from the comparison, with the reasoning chain', () => {
    expect(e.verdict.verdict).toBe('favorable');
    expect(find(e, 'decision.verdict')!.text).toBe('Si on suppose ces ranges, payer est favorable : ton equity dépasse l’equity nécessaire.');
    const chain = norm(find(e, 'decision.reasoning')!.text);
    expect(chain).toContain('tirage couleur');
    expect(chain).toContain('15 outs potentiels');
    expect(chain).toContain('ton equity est de');
    expect(chain).toContain('Le pot te demande');
    expect(chain).toContain('Conclusion : payer est favorable dans cette hypothèse.');
  });

  it('confidence and limitations of a hypothetical, simulated, multiway analysis', () => {
    expect(find(e, 'confidence.level')!.text).toBe('Confiance de l’analyse : moyenne.');
    expect(find(e, 'limitation.hypothesis')!.text).toContain('dépend fortement de la range supposée');
    expect(find(e, 'limitation.simulation')!.text).toContain('estimation');
    expect(find(e, 'limitation.multiway')!.text).toContain('indépendantes');
    expect(find(e, 'limitation.outs')!.text).toContain('pas des cartes gagnantes assurées');
    expect(find(e, 'equity.method')!.text).toMatch(/Estimation par simulation : 20000 tirages, graine 1, erreur standard/);
  });
});

describe('unknown data: nothing is invented', () => {
  const { a, e } = explain(flushDrawFacingBet());

  it('the analysis itself has no equity, EV or blockers', () => {
    expect(a.equity.status).toBe('unknown_opponent_range');
    expect(a.ev.status).toBe('insufficient_data');
    expect(a.blockers.status).toBe('no_range_assumed');
  });

  it('says the equity is unknown and asks for a hypothesis', () => {
    expect(find(e, 'missing.equity')!.text).toBe('Ton equity est inconnue : la range adverse n’est pas connue. Sélectionne une hypothèse de range pour obtenir une estimation.');
    expect(find(e, 'missing.equity.who')!.text).toContain('Sans hypothèse pour');
    expect(find(e, 'equity.value')).toBeUndefined();
    expect(find(e, 'pot_odds.compare')).toBeUndefined();
    expect(find(e, 'pot_odds.margin')).toBeUndefined();
    expect(find(e, 'ev.value')).toBeUndefined();
    expect(find(e, 'blockers.summary')).toBeUndefined();
    expect(find(e, 'pot_odds.no_equity')).toBeDefined();
  });

  it('never turns insufficient data into a recommendation', () => {
    expect(e.verdict).toEqual({ verdict: 'undetermined', sources: [] });
    expect(find(e, 'decision.verdict')!.text).toBe('Impossible de conclure précisément sans hypothèse sur la range adverse.');
    expect(find(e, 'decision.reasoning')!.text).toContain('le raisonnement s’arrête ici, aucune décision ne peut en être tirée');
    expect(find(e, 'decision.nuance')).toBeUndefined();
    const t = norm(all(e));
    expect(t).not.toMatch(/payer est favorable|payer est défavorable|tu devrais|il faut payer|je te conseille|couche-toi|relance/i);
    expect(t).not.toMatch(/ton equity est de/);
  });

  it('elides "que" before a vowel in the hypothesis sentence', () => {
    const s = play(flop('Ah Kh', 'Qs 7d 2c'), ['bet', 40], ['fold']);
    const a = analyzeGameState(s, 0, { opponents: { 1: hyp('QQ+') } });
    a.situation.opponents[0]!.name = 'Atlas';
    if (a.equity.status === 'computed') a.equity.opponents[0]!.name = 'Atlas';
    expect(find(explainAnalysis(a, { formatAmount: fmt }), 'range.hypothesis.0')!.text).toMatch(/^Cette analyse suppose qu’Atlas possède la range/);
  });

  it('EV: says why it cannot be computed', () => {
    expect(find(e, 'ev.missing')!.text).toBe('Valeur espérée impossible à calculer : il manque une main ou une range adverse (nécessaire pour l’equity).');
  });

  it('low confidence is in the explanation, in plain words', () => {
    expect(e.confidence).toBe('low');
    expect(find(e, 'confidence.level')!.text).toBe('Confiance de l’analyse : faible.');
    expect(find(e, 'confidence.low')!.text).toBe('Sans information sur la range adverse, cette conclusion reste incertaine.');
    expect(find(e, 'limitation.no_range')).toBeDefined();
  });

  it('outs are described as unreliable without a range, not as winning cards', () => {
    expect(find(e, 'outs.reliability')!.text).toBe('Sans range adverse, on ne sait pas si ces cartes te laissent devant.');
    expect(find(e, 'outs.basis')!.text).toContain('tous les autres restent de qualité inconnue');
  });

  it('a partial hypothesis (one opponent only) is still unknown, with the missing opponent named', () => {
    const p = explain(flushDrawFacingBet(), { opponents: { 1: hyp(tag) } });
    expect(p.a.equity.status).toBe('unknown_opponent_range');
    expect(find(p.e, 'missing.equity.who')!.text).toBe('Sans hypothèse pour : Player 2.');
    expect(p.e.verdict.verdict).toBe('undetermined');
  });

  it('a bet with no assumptions: no verdict, and the EV text lists what a bet would need', () => {
    const q = explain(flop('Ah 5h', 'Kh 9h 2c'));
    expect(find(q.e, 'pot_odds.free')!.text).toBe('Rien à payer : les pot odds ne s’appliquent pas.');
    expect(find(q.e, 'decision.verdict')!.text).toContain('Aucun call à évaluer ici');
    expect(find(q.e, 'ev.missing')!.text).toContain('la fréquence de fold adverse');
    expect(find(q.e, 'ev.missing')!.text).toMatch(/^Valeur espérée impossible à calculer : aucun call à évaluer ; pour juger une mise il faut : /);
    expect(q.e.verdict.verdict).toBe('undetermined');
  });
});

describe('confidence shapes the wording', () => {
  const s = () => play(flop('Ah Kh', 'Qs 7d 2c', 'Qd Jd', '5c 5d'), ['bet', 40], ['fold']);

  it('HIGH with exact hands: "Contre la main connue"', () => {
    const { e } = explain(s(), { opponents: { 1: exact('Qd Jd') } });
    expect(e.confidence).toBe('high');
    expect(find(e, 'equity.value')!.text).toMatch(/^Contre la main connue, ton equity est de/);
    expect(find(e, 'range.opponent.1')!.text).toBe('Player 1 : sa main est connue.');
    expect(find(e, 'decision.verdict')!.text).toMatch(/^Contre la main connue, payer est (favorable|défavorable)/);
    expect(find(e, 'equity.method')!.text).toBe('Calcul exact : toutes les possibilités ont été énumérées.');
    expect(find(e, 'limitation.hypothesis')).toBeUndefined();
  });

  it('HIGH with a known range: "Contre cette range connue"', () => {
    const { e } = explain(s(), { opponents: { 1: known('QQ+, AKs') } });
    expect(e.confidence).toBe('high');
    expect(find(e, 'equity.value')!.text).toMatch(/^Contre cette range connue, ton equity est de/);
    expect(find(e, 'range.opponent.1')!.text).toBe('Player 1 : sa range est connue.');
  });

  it('MEDIUM with a hypothesis: "Si on suppose cette range"', () => {
    const { e } = explain(s(), { opponents: { 1: hyp('QQ+, AKs', 'LAG') } });
    expect(e.confidence).toBe('medium');
    expect(find(e, 'equity.value')!.text).toMatch(/^Si on suppose cette range, ton equity est de/);
    expect(find(e, 'range.hypothesis.0')!.text).toBe('Cette analyse suppose que Player 1 possède la range « LAG » : c’est une hypothèse, pas une observation.');
    expect(find(e, 'decision.verdict')!.text).toMatch(/^Si on suppose cette range, payer est/);
  });

  it('LOW without information: no "Contre" and no "Si on suppose"', () => {
    const { e } = explain(s());
    expect(e.confidence).toBe('low');
    expect(norm(all(e))).not.toMatch(/Contre (la|cette|les|ces)|Si on suppose/);
  });
});

describe('verdict: read from the analysis, never decided here', () => {
  const heroStrong = () => play(flop('Ah Kh', 'As 7d 2c', 'Qd Jd', '5c 5d'), ['bet', 40], ['fold']);
  const heroWeak = () => play(flop('7h 3c', 'As Kd Qc', 'Ad Ks', '5c 5d'), ['bet', 100], ['fold']);

  it('favorable when equity beats the requirement, unfavorable when it does not', () => {
    const good = explain(heroStrong(), { opponents: { 1: exact('Qd Jd') } });
    const bad = explain(heroWeak(), { opponents: { 1: exact('Ad Ks') } });
    expect(comparisonOf(good.a).meetsRequirement).toBe(true);
    expect(good.e.verdict.verdict).toBe('favorable');
    expect(good.e.verdict.sources).toContain('potOdds.comparison.margin');
    expect(comparisonOf(bad.a).meetsRequirement).toBe(false);
    expect(bad.e.verdict.verdict).toBe('unfavorable');
    expect(find(bad.e, 'decision.verdict')!.text).toContain('payer est défavorable : ton equity est inférieure à l’equity nécessaire.');
    expect(find(bad.e, 'pot_odds.compare')!.tone).toBe('neutral');
    expect(find(bad.e, 'decision.verdict')!.tone).toBe('negative');
  });

  it('close when the gap is within the simulation error (a statistical tie), reading standardError from the analysis', () => {
    const { a } = explain(heroStrong(), { opponents: { 1: hyp('22+, A2s+, K9s+') }, equity: { method: 'monte-carlo', samples: 2000, seed: 2 } });
    if (a.equity.status !== 'computed') throw new Error();
    const se = a.equity.standardError!;
    expect(se).toBeGreaterThan(0);
    // craft analyses that only differ by the margin: the verdict must follow the documented rule
    const mk2 = (margin: number): CoachAnalysis => withMargin(a, margin);
    expect(readVerdict(mk2(CLOSE_MARGIN_STANDARD_ERRORS * se * 0.99)).verdict).toBe('close');
    expect(readVerdict(mk2(-CLOSE_MARGIN_STANDARD_ERRORS * se * 0.99)).verdict).toBe('close');
    expect(readVerdict(mk2(CLOSE_MARGIN_STANDARD_ERRORS * se * 1.5)).verdict).toBe('favorable');
    expect(readVerdict(mk2(-CLOSE_MARGIN_STANDARD_ERRORS * se * 1.5)).verdict).toBe('unfavorable');
    const closeText = explainAnalysis(mk2(0), { formatAmount: fmt }).items.find((i) => i.id === 'decision.verdict')!.text;
    expect(closeText).toContain('la décision est proche');
    expect(closeText).toContain('l’écart est trop faible pour trancher');
  });

  it('exact results are close only on an exact tie', () => {
    const { a } = explain(heroStrong(), { opponents: { 1: exact('Qd Jd') } });
    const at = (m: number): CoachAnalysis => withMargin(a, m);
    expect(readVerdict(at(0)).verdict).toBe('close');
    expect(readVerdict(at(0.001)).verdict).toBe('favorable');
  });

  it('with no call but a complete EV (explicit bet assumptions) the verdict follows the EV sign', () => {
    const s = flop('Ah Kh', 'As 7d 2c', 'Qd Jd', '5c 5d');
    const win = explain(s, { opponents: { 1: exact('Qd Jd'), 2: exact('5c 5d') }, bet: { betAmount: 40, foldEquity: 0.5, winWhenCalled: 0.8, tieWhenCalled: 0, lossWhenCalled: 0.2 } });
    const lose = explain(s, { opponents: { 1: exact('Qd Jd'), 2: exact('5c 5d') }, bet: { betAmount: 400, foldEquity: 0, winWhenCalled: 0.1, tieWhenCalled: 0, lossWhenCalled: 0.9 } });
    expect(win.e.verdict).toEqual({ verdict: 'favorable', sources: ['ev.ev'] });
    expect(lose.e.verdict.verdict).toBe('unfavorable');
    expect(find(win.e, 'decision.verdict')!.text).toContain('miser est favorable');
    expect(find(win.e, 'decision.verdict')!.text).toContain('la valeur espérée est positive');
  });
});

describe('three levels', () => {
  const { e } = explain(flushDrawFacingBet(), { opponents: { 1: hyp(tag), 2: hyp('22+, A2s+, K9s+') } });
  const l1 = itemsForLevel(e, 1);
  const l2 = itemsForLevel(e, 2);
  const l3 = itemsForLevel(e, 3);

  it('are cumulative: simple ⊂ intermediate ⊂ advanced, and each adds sentences', () => {
    const ids = (xs: ExplanationItem[]) => new Set(xs.map((i) => i.id));
    for (const id of ids(l1)) expect(ids(l2).has(id)).toBe(true);
    for (const id of ids(l2)) expect(ids(l3).has(id)).toBe(true);
    expect(l1.length).toBeLessThan(l2.length);
    expect(l2.length).toBeLessThan(l3.length);
    expect(l3).toHaveLength(e.items.length);
  });

  it('level 1 is short and answers "what is happening": situation, hand, draw, outs, equity, pot odds, decision', () => {
    expect(l1.length).toBeLessThanOrEqual(12);
    const cats = new Set(l1.map((i) => i.category));
    for (const c of ['situation', 'made_hand', 'draw', 'outs', 'equity', 'pot_odds', 'decision', 'confidence', 'range']) expect(cats.has(c as never), c).toBe(true);
    expect(l1.every((i) => i.level === 1)).toBe(true);
    expect(cats.has('limitation')).toBe(false);
  });

  it('level 2 links the data into a reasoning chain; level 3 adds interactions and limits', () => {
    expect(l1.find((i) => i.id === 'decision.reasoning')).toBeUndefined();
    expect(l2.find((i) => i.id === 'decision.reasoning')).toBeDefined();
    expect(l2.some((i) => i.category === 'spr')).toBe(true);
    expect(l1.some((i) => i.category === 'limitation')).toBe(false);
    expect(l2.some((i) => i.category === 'limitation')).toBe(false);
    expect(l3.some((i) => i.category === 'limitation')).toBe(true);
    expect(l3.some((i) => i.id === 'blockers.range.1.detail')).toBe(true);
    expect(l3.some((i) => i.id === 'outs.basis')).toBe(true);
    expect(l3.some((i) => i.id === 'equity.method')).toBe(true);
  });

  it('every level-1 sentence is one short sentence (no big paragraphs)', () => {
    for (const i of l1) expect(i.text.length, i.text).toBeLessThan(200);
    for (const i of e.items) expect(i.text.length, i.id).toBeLessThan(420);
  });
});

describe('traceability: no sentence without data, no number from nowhere', () => {
  const scenarios: [string, GameState, CoachAssumptions][] = [
    ['flush draw, no range', flushDrawFacingBet(), {}],
    ['flush draw, two hypothetical ranges', flushDrawFacingBet(), { opponents: { 1: hyp(tag), 2: hyp('22+, A2s+, K9s+', 'LAG') } }],
    ['exact hands', play(flop('Ah Kh', 'As 7d 2c', 'Qd Jd', '5c 5d'), ['bet', 40], ['fold']), { opponents: { 1: exact('Qd Jd') } }],
    ['known range, heads-up flop, nothing to call', flop('Ah Kh', 'As 7d 2c'), { opponents: { 1: known('QQ+'), 2: known('JJ-TT') } }],
    ['open-ended straight draw', flop('8h 7d', '6c 5s 2h'), {}],
    ['set, full house draw', flop('7h 7d', '7c Kd 2s'), { opponents: { 1: hyp('22+, A2s+'), 2: hyp('99+') } }],
    ['preflop facing the blind', rigged(mk(), ['As Ks', '7c 2d', '8c 3d'], '2h 9h Jc 4s 5s'), {}],
    ['preflop with ranges (simulation)', rigged(mk(), ['As Ks', '7c 2d', '8c 3d'], '2h 9h Jc 4s 5s'), { opponents: { 1: hyp(tag), 2: hyp(tag) }, equity: { samples: 3000, seed: 4 } }],
    ['hero all-in call', play(flop('Ah Kh', 'As 7d 2c', 'Qd Jd', '5c 5d'), ['allin']), { opponents: { 1: exact('Qd Jd') } }],
    ['hero folded', play(flop('Ah Kh', 'As 7d 2c'), ['bet', 60], ['fold'], ['fold']), {}],
  ];

  it.each(scenarios)('%s', (_name, state, assume) => {
    const { a, e } = explain(state, assume);
    expect(e.items.length).toBeGreaterThan(0);
    const ids = new Set<string>();
    for (const i of e.items) {
      // 1. unique ids, non-empty text, no leaked placeholders
      expect(ids.has(i.id), `duplicate id ${i.id}`).toBe(false);
      ids.add(i.id);
      expect(i.text.trim().length).toBeGreaterThan(0);
      expect(i.text).not.toMatch(/undefined|NaN|null|\[object|Infinity|\{|\}/);
      // 2. every sentence is tied to data that exists in the analysis
      expect(i.sources.length, `${i.id} has no source`).toBeGreaterThan(0);
      for (const s of i.sources) expect(resolvePath(a, s), `${i.id}: source ${s} is missing`).not.toBeUndefined();
      for (const s of i.sources) expect(resolvePath(a, s)).not.toBeNull();
      // 3. every figure written in the text was registered with a source
      const printed = norm(i.text).match(/\d+(?:[.,]\d+)?/g) ?? [];
      const registered = i.values.map((v) => norm(v.display));
      for (const n of printed) {
        expect(registered.some((d) => d.includes(n)), `${i.id}: "${n}" is not backed by a value in "${i.text}"`).toBe(true);
      }
      for (const v of i.values) expect(i.sources, `${i.id}: value ${v.display} cites ${v.source}`).toContain(v.source);
    }
  });

  it.each(scenarios)('is deterministic: %s', (_name, state, assume) => {
    const first = explain(state, assume).e;
    const second = explain(state, assume).e;
    expect(JSON.stringify(first)).toBe(JSON.stringify(second));
  });

  it('the printed percentages are exactly the analysis values, formatted', () => {
    const { a, e } = explain(flushDrawFacingBet(), { opponents: { 1: hyp(tag), 2: hyp('22+, A2s+, K9s+') } });
    if (a.equity.status !== 'computed' || a.outs.status !== 'available') throw new Error();
    const eqItem = find(e, 'equity.value')!;
    expect(eqItem.sources).toContain('equity.equity');
    expect(norm(eqItem.values[0]!.display)).toBe(`${(a.equity.equity * 100).toFixed(1).replace('.', ',')} %`);
    const outs = find(e, 'outs.total')!;
    expect(outs.values[0]).toEqual({ source: 'outs.total', display: String(a.outs.total) });
  });

  it('a sentence is dropped when its data is missing (mutating the analysis removes the sentence)', () => {
    const { a } = explain(flushDrawFacingBet(), { opponents: { 1: hyp(tag), 2: hyp('22+, A2s+, K9s+') } });
    const withoutPotOdds = { ...a, potOdds: { status: 'no_call_decision' } } as CoachAnalysis;
    const e = explainAnalysis(withoutPotOdds, { formatAmount: fmt });
    expect(find(e, 'pot_odds.need')).toBeUndefined();
    expect(find(e, 'pot_odds.free')).toBeDefined();
    const noProbs = { ...a, outs: { ...(a.outs as object), probabilities: undefined } } as unknown as CoachAnalysis;
    expect(find(explainAnalysis(noProbs, { formatAmount: fmt }), 'outs.probability')).toBeUndefined();
    expect(find(explainAnalysis(noProbs, { formatAmount: fmt }), 'outs.total')).toBeDefined();
  });

  it('does not recompute: changing a number in the analysis changes the text accordingly', () => {
    const { a } = explain(flushDrawFacingBet(), { opponents: { 1: hyp(tag), 2: hyp('22+, A2s+, K9s+') } });
    if (a.equity.status !== 'computed') throw new Error();
    const forged = { ...a, equity: { ...a.equity, equity: 0.4242 } } as CoachAnalysis;
    expect(norm(find(explainAnalysis(forged, { formatAmount: fmt }), 'equity.value')!.text)).toContain('42,4 %');
  });
});

describe('situations', () => {
  it('preflop: hand class and combos, no outs, equity unknown', () => {
    const { e } = explain(rigged(mk(), ['As Ks', '7c 2d', '8c 3d'], '2h 9h Jc 4s 5s'));
    expect(find(e, 'made_hand.value')!.text).toBe('Ta main de départ est AKs.');
    expect(find(e, 'made_hand.combos')!.text).toBe('Cette main de départ existe en 4 combinaisons possibles.');
    expect(find(e, 'outs.total')).toBeUndefined();
    expect(find(e, 'draw.none')).toBeUndefined();
    expect(find(e, 'missing.equity')).toBeDefined();
    expect(find(e, 'situation.summary')!.text).toBe('Tu es au preflop, à 3 joueurs. Le pot est de 1,5 BB et tu dois payer 1 BB.');
  });

  it('a made set with a full-house draw', () => {
    const { e } = explain(flop('7h 7d', '7c Kd 2s'));
    expect(find(e, 'made_hand.value')!.text).toBe('Tu as un brelan de sept.');
    expect(find(e, 'draw.full-house-draw')!.text).toBe('Tu as aussi un tirage full.');
    expect(find(e, 'draw.quads-draw')!.text).toBe('Tu as aussi un tirage carré.');
    expect(find(e, 'draw.full-house-draw.reason')!.text).toBe('Tu passerais d’un brelan à un full.');
  });

  it('open-ended straight draw reasons name the cards that complete it', () => {
    const { e } = explain(flop('8h 7d', '6c 5s 2h'));
    expect(find(e, 'draw.open-ended-straight-draw')!.text).toBe('Tu as aussi un tirage quinte par les deux bouts.');
    expect(find(e, 'draw.open-ended-straight-draw.reason')!.text).toBe('La quinte se complète avec un quatre ou un neuf.');
  });

  it('no draw', () => {
    const { e } = explain(flop('Ah 9d', 'Ac Kc 7h'));
    expect(find(e, 'made_hand.value')!.text).toBe('Tu as une paire d’as.');
    expect(find(e, 'made_hand.use')!.text).toBe('Ta meilleure main utilise deux de tes cartes privées.');
  });

  it('when the board plays, the text says so', () => {
    let s = rigged(newGame([1000, 1000]), ['2c 3c', '4d 5d'], 'Th Jh Qh Kh Ah');
    s = play(s, ['call'], ['check'], ['check'], ['check'], ['check'], ['check']);
    const a = analyzeGameState(s, 0);
    const e = explainAnalysis(a, { formatAmount: fmt });
    expect(find(e, 'made_hand.value')!.text).toBe('Tu as une quinte flush royale.');
    expect(find(e, 'made_hand.use')!.text).toContain('Le board joue seul');
    expect(find(e, 'draw.river')!.text).toBe('Il n’y a plus de carte à venir : plus de tirage possible.');
  });

  it('hero out of the hand: nothing about equity or decisions', () => {
    const { e } = explain(play(flop('Ah Kh', 'As 7d 2c'), ['bet', 60], ['fold'], ['fold']));
    expect(find(e, 'situation.summary')!.text).toBe('Tu n’es plus dans la main.');
    expect(find(e, 'decision.verdict')!.text).toBe('Aucune décision à évaluer : tu n’es plus dans la main.');
    expect(find(e, 'equity.value')).toBeUndefined();
    expect(find(e, 'outs.total')).toBeUndefined();
  });

  it('default amount formatting works without a formatter', () => {
    const a = analyzeGameState(flushDrawFacingBet(), 0);
    const e = explainAnalysis(a);
    expect(find(e, 'situation.summary')!.text).toBe('Tu es au flop, à 3 joueurs. Le pot est de 100 et tu dois payer 40.');
  });
});

describe('implied odds and limits are only mentioned when they exist', () => {
  it('complete and incomplete implied odds', () => {
    const s = play(flop('Ah Kh', 'As 7d 2c', 'Qd Jd', '5c 5d'), ['bet', 40], ['fold']);
    const incomplete = explain(s, { opponents: { 1: exact('Qd Jd') }, implied: { futureWinWhenHit: 100 } });
    expect(find(incomplete.e, 'pot_odds.implied')!.text).toContain('Cotes implicites incomplètes : il manque');
    expect(find(incomplete.e, 'pot_odds.implied')!.text).toContain('le stack restant derrière');
    const complete = explain(s, { opponents: { 1: exact('Qd Jd') }, implied: { stackBehind: 1000, futureWinWhenHit: 100, payoffProbability: 0.5 } });
    expect(norm(find(complete.e, 'pot_odds.implied')!.text)).toMatch(/Avec les cotes implicites que tu as supposées, il te faudrait \d+,\d % d’equity\./);
    expect(find(explain(s, { opponents: { 1: exact('Qd Jd') } }).e, 'pot_odds.implied')).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------------------------
// Architecture guard: the explanation layer is a pure reader of CoachAnalysis.
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

describe('architecture: the explanation layer computes nothing and calls nothing', () => {
  const dir = join(__dirname, '..');
  const files = readdirSync(dir).filter((f) => f.endsWith('.ts'));
  const source = (f: string) => readFileSync(join(dir, f), 'utf8');

  it('has the expected files', () => {
    expect(files.sort()).toEqual(['explain.ts', 'index.ts', 'reader.ts', 'templates.ts', 'types.ts']);
  });

  it('does not import the math engine (only types), the poker rules, React, storage or the network', () => {
    for (const f of files) {
      const src = source(f);
      for (const m of src.matchAll(/^import\s+(type\s+)?[^;]*from\s+'([^']+)'/gm)) {
        const isType = Boolean(m[1]);
        const from = m[2]!;
        if (/\/math(\/|$)/.test(from) || from.endsWith('/ranges')) expect(isType, `${f} imports runtime code from ${from}`).toBe(true);
        expect(from, `${f}`).not.toMatch(/react|storage|\/ui\b|\/ai\b/);
      }
      expect(src, f).not.toMatch(/Math\.random|fetch\(|XMLHttpRequest|Date\.now|new Date|setTimeout|localStorage/);
      expect(src, f).not.toMatch(/equityVs|equityMultiway|analyzeOuts|drawProbabilities|potOdds\(|callEV|betEV|impliedOdds\(|analyzeBlockers|parseRange|spr\(/);
    }
  });
});
