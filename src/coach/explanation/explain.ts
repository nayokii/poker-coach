/**
 * Explanation Engine: CoachAnalysis -> traceable French sentences at three levels.
 *
 *   CoachAnalysis -> explainAnalysis() -> Explanation { items[level 1 | 2 | 3] } -> UI
 *
 * This file recomputes NOTHING: no equity, outs, probability, pot odds, SPR, EV, blocker or range. It only
 * reads what the analysis already holds (through `Reader`) and phrases it. It is deterministic: same
 * analysis in, same text out (no randomness, no clock, no network, no model).
 *
 * Data discipline:
 *  - a sentence whose data is absent is not emitted (Reader throws MissingData and the sentence is skipped);
 *  - unknown / insufficient data is said explicitly, never turned into a recommendation;
 *  - confidence shapes the wording: known -> "Contre ...", hypothetical -> "Si on suppose ...", unknown -> caveat;
 *  - the verdict is a READING of the comparison the analysis already contains (equity vs required equity, or the
 *    sign of the EV); it adds no decision logic.
 */
import { HandCategory } from '../../engine';
import type { CoachAnalysis } from '../analysis';
import { MissingData, Reader } from './reader';
import {
  CATEGORY_FROM_FR, CATEGORY_TARGET_FR, CONFIDENCE_FR, DRAW_FR, EQUITY_NA_FR, REASON_FR, SPR_FR, SPR_MEANING_FR, STREET_FR, SUIT_FR, impliedFieldFr,
  knownText, madeHandName, queName, rankWithArticle,
} from './templates';
import type {
  AmountFormatter, DecisionVerdict, Explanation, ExplanationCategory, ExplanationItem, ExplanationLevel, ExplanationTone, ExplainOptions,
  VerdictInfo,
} from './types';

/** An equity gap smaller than this many standard errors cannot be told apart from a tie by the analysis. */
export const CLOSE_MARGIN_STANDARD_ERRORS = 2;

const defaultFormat: AmountFormatter = (c) => (Number.isInteger(c) ? `${c}` : c.toFixed(1));

/* ---------------------------------------------------------------- verdict */

/** Reads the existing comparison (pot odds vs equity, else the EV sign). No new logic. */
export function readVerdict(a: CoachAnalysis): VerdictInfo {
  if (a.potOdds.status === 'available' && a.potOdds.comparison) {
    const margin = a.potOdds.comparison.margin;
    const sources = ['potOdds.comparison.margin', 'potOdds.comparison.meetsRequirement'];
    let close: boolean;
    if (a.equity.status === 'computed' && a.equity.standardError !== undefined) {
      close = Math.abs(margin) <= CLOSE_MARGIN_STANDARD_ERRORS * a.equity.standardError;
      sources.push('equity.standardError');
    } else {
      close = Math.abs(margin) < 1e-9;
    }
    const verdict: DecisionVerdict = close ? 'close' : a.potOdds.comparison.meetsRequirement ? 'favorable' : 'unfavorable';
    return { verdict, sources };
  }
  if (a.ev.status === 'complete') {
    const verdict: DecisionVerdict = Math.abs(a.ev.ev) < 1e-9 ? 'close' : a.ev.ev > 0 ? 'favorable' : 'unfavorable';
    return { verdict, sources: ['ev.ev'] };
  }
  return { verdict: 'undetermined', sources: [] };
}

/* ---------------------------------------------------------------- builder */

interface Spec {
  id: string;
  level: ExplanationLevel;
  category: ExplanationCategory;
  tone?: ExplanationTone;
  build: (r: Reader) => string;
}

class Builder {
  readonly items: ExplanationItem[] = [];
  constructor(
    private readonly a: CoachAnalysis,
    private readonly fmt: AmountFormatter,
  ) {}

  add(spec: Spec): void {
    const r = new Reader(this.a, this.fmt);
    let text: string;
    try {
      text = spec.build(r);
    } catch (e) {
      if (e instanceof MissingData) return; // no data, no sentence
      throw e;
    }
    if (r.sources.length === 0 || text.trim() === '') return; // a sentence must be traceable
    this.items.push({
      id: spec.id,
      level: spec.level,
      category: spec.category,
      text,
      tone: spec.tone ?? 'neutral',
      sources: r.sources.slice(),
      values: r.values.slice(),
    });
  }
}

const cap = (s: string): string => s.charAt(0).toUpperCase() + s.slice(1);
const low = (s: string): string => s.charAt(0).toLowerCase() + s.slice(1);
const plural = (n: number, one: string, many: string): string => (n === 1 ? one : many);

/** How the wording is shaped by what is known about the opponents (high / medium). */
function lead(r: Reader, a: CoachAnalysis): string {
  if (a.equity.status !== 'computed') throw new MissingData('equity.opponents');
  const opps = a.equity.opponents;
  r.get('equity.opponents');
  const many = opps.length > 1;
  const sources = opps.map((o) => o.source);
  if (sources.every((s) => s === 'exact-hand')) return many ? 'Contre les mains connues' : 'Contre la main connue';
  if (sources.every((s) => s !== 'hypothetical-range')) {
    return sources.every((s) => s === 'known-range') ? (many ? 'Contre ces ranges connues' : 'Contre cette range connue') : 'Contre les mains et ranges connues';
  }
  return many ? 'Si on suppose ces ranges' : 'Si on suppose cette range';
}

/** The verdict phrase, shared by the L1 decision and the L2 reasoning chain. */
function verdictPhrase(v: DecisionVerdict, kind: 'call' | 'bet'): string {
  const act = kind === 'call' ? 'payer' : 'miser';
  if (v === 'favorable') return `${act} est favorable`;
  if (v === 'unfavorable') return `${act} est défavorable`;
  if (v === 'close') return 'la décision est proche';
  return 'aucune conclusion précise n’est possible';
}

export function explainAnalysis(a: CoachAnalysis, opts: ExplainOptions = {}): Explanation {
  const fmt = opts.formatAmount ?? defaultFormat;
  const b = new Builder(a, fmt);
  const verdict = readVerdict(a);
  const inHand = a.situation.heroInHand;
  const equityKnown = a.equity.status === 'computed';
  const facingCall = a.situation.facing.kind === 'bet';
  const decisionKind: 'call' | 'bet' = facingCall ? 'call' : a.ev.status === 'complete' && a.ev.kind === 'bet' ? 'bet' : 'call';

  /* ---------- situation ---------- */
  b.add({
    id: 'situation.summary', level: 1, category: 'situation',
    build: (r) => {
      if (!r.flag('situation.heroInHand')) return 'Tu n’es plus dans la main.';
      const street = STREET_FR[r.get<keyof typeof STREET_FR>('situation.street')];
      let t = `Tu es ${street}, à ${r.int('situation.playersInHand')} joueurs. Le pot est de ${r.amount('situation.pot')}`;
      if (r.get<string>('situation.facing.kind') === 'bet') {
        t += ` et tu dois payer ${r.amount('situation.facing.callAmount')}`;
        if (r.flag('situation.facing.callIsAllIn')) t += ' (tapis)';
      } else t += ' ; il n’y a aucune mise à payer';
      return `${t}.`;
    },
  });
  if (inHand) {
    b.add({
      id: 'situation.position', level: 2, category: 'situation',
      build: (r) => `Tu es en position ${r.str('situation.heroPosition')}${r.flag('situation.heroToAct') ? ' et c’est à toi de parler' : ''}.`,
    });
    b.add({
      id: 'situation.bet_ratio', level: 3, category: 'situation',
      build: (r) => `La mise courante représente ${r.dec('situation.facing.betToPotRatio', 2)} fois le pot avant les mises de cette street.`,
    });
    b.add({
      id: 'situation.stack', level: 3, category: 'situation',
      build: (r) => `Le stack effectif est de ${r.amount('situation.effectiveStack')} : c’est le plus petit stack entre le tien et celui de l’adversaire le plus profond encore en jeu.`,
    });
  }

  if (inHand) {
    /* ---------- made hand ---------- */
    b.add({
      id: 'made_hand.value', level: 1, category: 'made_hand',
      build: (r) => {
        if (r.get<string>('handStrength.kind') === 'preflop') return `Ta main de départ est ${r.str('handStrength.handClass')}.`;
        return `Tu as ${madeHandName(r.get<HandCategory>('handStrength.category'), [r.get<number>('handStrength.tiebreak[0]'), r.has('handStrength.tiebreak[1]') ? r.get<number>('handStrength.tiebreak[1]') : 0])}.`;
      },
    });
    b.add({
      id: 'made_hand.combos', level: 2, category: 'made_hand',
      build: (r) => `Cette main de départ existe en ${r.int('handStrength.combos')} combinaisons possibles.`,
    });
    b.add({
      id: 'made_hand.use', level: 2, category: 'made_hand',
      build: (r) => {
        if (r.get<string>('handStrength.kind') !== 'made') throw new MissingData('handStrength.holeCardsUsed');
        if (r.flag('handStrength.boardPlays')) return 'Le board joue seul : aucune de tes cartes privées n’entre dans ta meilleure main, un adversaire peut avoir la même.';
        const n = r.get<unknown[]>('handStrength.holeCardsUsed').length;
        return `Ta meilleure main utilise ${n === 1 ? 'une' : 'deux'} de tes cartes privées.`;
      },
    });
    b.add({
      id: 'made_hand.best_five', level: 3, category: 'made_hand',
      build: (r) => {
        if (r.get<string>('handStrength.kind') !== 'made') throw new MissingData('handStrength.bestFive');
        return `Ta meilleure combinaison de cinq cartes est ${r.cards('handStrength.bestFive')}.`;
      },
    });

    /* ---------- draws ---------- */
    if (a.draws.status === 'available') {
      if (a.draws.draws.length === 0) {
        b.add({ id: 'draw.none', level: 1, category: 'draw', build: (r) => (r.get<unknown[]>('draws.draws').length === 0 ? 'Tu n’as pas de tirage.' : '') });
      }
      a.draws.draws.forEach((d, i) => {
        const p = `draws.draws[${i}]`;
        const major = d.relevance === 'major';
        b.add({
          id: `draw.${d.kind}`, level: major ? 1 : 2, category: 'draw',
          build: (r) => `${major ? 'Tu as aussi' : 'Tu peux aussi viser'} ${DRAW_FR[r.get<keyof typeof DRAW_FR>(`${p}.kind`)]}.`,
        });
        b.add({
          id: `draw.${d.kind}.reason`, level: 2, category: 'draw',
          build: (r) => {
            const code = r.get<string>(`${p}.reason.code`);
            if (code === 'FOUR_TO_FLUSH') {
              return `Tu as quatre cartes de ${SUIT_FR[r.get<string>(`${p}.reason.suit`)]} : ${r.int(`${p}.reason.holeCards.length`)} dans ta main et ${r.int(`${p}.reason.boardCards.length`)} sur le board.`;
            }
            if (code === 'STRAIGHT_COMPLETING_RANKS') {
              const ranks = r.get<number[]>(`${p}.reason.completingRanks`);
              return `La quinte se complète avec ${ranks.map(rankWithArticle).join(' ou ')}.`;
            }
            const from = r.get<number>(`${p}.reason.from`);
            const to = r.get<number>(`${p}.reason.to`);
            return `Tu passerais ${CATEGORY_FROM_FR[from]} à ${CATEGORY_TARGET_FR[to]}.`;
          },
        });
      });
    } else if (a.draws.reason === 'RIVER') {
      b.add({ id: 'draw.river', level: 1, category: 'draw', build: (r) => (r.get<string>('draws.reason') === 'RIVER' ? 'Il n’y a plus de carte à venir : plus de tirage possible.' : '') });
    }

    /* ---------- outs ---------- */
    if (a.outs.status === 'available') {
      const o = a.outs;
      b.add({
        id: 'outs.total', level: 1, category: 'outs',
        build: (r) => {
          const n = r.get<number>('outs.total');
          if (n === 0) return 'Aucune carte ne t’améliore à la prochaine carte.';
          return `Tu as ${r.int('outs.total')} ${plural(n, 'out potentiel', 'outs potentiels')}.`;
        },
      });
      if (o.total > 0) {
        b.add({
          id: 'outs.reliability', level: 1, category: 'outs', tone: 'caution',
          build: (r) => {
            const total = r.get<number>('outs.total');
            const clean = r.get<unknown[]>('outs.clean').length;
            const basis = r.get<string>('outs.qualityBasis');
            if (clean === total) {
              return basis === 'opponent-ranges' ? 'Ils sont tous propres contre la range supposée.' : 'Ils sont tous propres : ils te donnent la meilleure main possible.';
            }
            return basis === 'opponent-ranges'
              ? 'Certains peuvent être moins fiables contre la range supposée.'
              : 'Sans range adverse, on ne sait pas si ces cartes te laissent devant.';
          },
        });
        b.add({
          id: 'outs.quality', level: 2, category: 'outs',
          build: (r) => {
            const c = r.get<unknown[]>('outs.clean').length;
            r.get<unknown[]>('outs.dirty');
            r.get<unknown[]>('outs.unknown');
            return `Parmi eux : ${r.int('outs.clean.length')} ${plural(c, 'propre', 'propres')}, ${r.int('outs.dirty.length')} douteux, ${r.int('outs.unknown.length')} de qualité inconnue.`;
          },
        });
        b.add({
          id: 'outs.probability', level: 2, category: 'outs',
          build: (r) => {
            let t = `Chance de toucher à la prochaine carte : ${r.pct('outs.probabilities.hitNextCard')}`;
            if (r.get<number>('outs.probabilities.cardsToCome') > 1) t += ` ; d’ici la river : ${r.pct('outs.probabilities.hitByLastCard')}`;
            return `${t}.`;
          },
        });
        b.add({
          id: 'outs.basis', level: 3, category: 'outs',
          build: (r) =>
            r.get<string>('outs.qualityBasis') === 'nuts-check'
              ? 'Un out est jugé propre seulement s’il te donne la meilleure main possible ; sans range adverse, tous les autres restent de qualité inconnue.'
              : 'La qualité est jugée contre la range supposée : un out est douteux si une part importante de cette range reste devant ta main une fois complétée.',
        });
        if (o.viaBoardPair.length > 0) {
          b.add({
            id: 'outs.board_pair', level: 3, category: 'outs', tone: 'caution',
            build: (r) => {
              const n = r.get<unknown[]>('outs.viaBoardPair').length;
              return `${r.int('outs.viaBoardPair.length')} de ces outs ${n === 1 ? 'ne fait' : 'ne font'} qu’apparier le board : ${n === 1 ? 'il profite' : 'ils profitent'} aussi aux adversaires qui ont cette carte.`;
            },
          });
        }
      }
    }

    /* ---------- ranges / hypotheses ---------- */
    if (a.equity.status === 'computed') {
      const opps = a.equity.opponents;
      // Hypothetical ranges with the same label are announced together, in one short sentence.
      const groups = new Map<string, number[]>();
      opps.forEach((o, i) => {
        if (o.source === 'hypothetical-range') groups.set(o.label ?? '', [...(groups.get(o.label ?? '') ?? []), i]);
      });
      let g = 0;
      for (const [label, idxs] of groups) {
        b.add({
          id: `range.hypothesis.${g++}`, level: 1, category: 'range', tone: 'caution',
          build: (r) => {
            const names = idxs.map((i) => r.str(`equity.opponents[${i}].name`));
            idxs.forEach((i) => r.get(`equity.opponents[${i}].source`));
            const who = names.length === 1 ? names[0] : `${names.slice(0, -1).join(', ')} et ${names[names.length - 1]}`;
            const range = label ? `la range « ${r.str(`equity.opponents[${idxs[0]}].label`)} »` : 'la range choisie';
            return `Cette analyse suppose ${queName(who as string)} ${names.length === 1 ? 'possède' : 'possèdent chacun'} ${range} : c’est une hypothèse, pas une observation.`;
          },
        });
      }
      opps.forEach((opp, i) => {
        const p = `equity.opponents[${i}]`;
        if (opp.source !== 'hypothetical-range') {
          b.add({
            id: `range.opponent.${opp.seat}`, level: 2, category: 'range',
            build: (r) => {
              const name = r.str(`${p}.name`);
              if (r.get<string>(`${p}.source`) === 'exact-hand') return `${name} : sa main est connue.`;
              return `${name} : sa range est connue${r.has(`${p}.label`) ? ` (« ${r.str(`${p}.label`)} »)` : ''}.`;
            },
          });
        }
        b.add({
          id: `range.opponent.${opp.seat}.combos`, level: 3, category: 'range',
          build: (r) => (r.get<string>(`${p}.source`) === 'exact-hand' ? '' : `${r.str(`${p}.name`)} : ${r.int(`${p}.combos`)} combinaisons restent possibles après tes cartes et le board.`),
        });
      });
    }

    /* ---------- equity ---------- */
    if (a.equity.status === 'computed') {
      b.add({
        id: 'equity.value', level: 1, category: 'equity',
        build: (r) => `${lead(r, a)}, ton equity est de ${r.pct('equity.equity')}.`,
      });
      b.add({
        id: 'equity.outcomes', level: 2, category: 'equity',
        build: (r) => `Tu gagnes ${r.pct('equity.winProbability')} du temps, tu fais égalité ${r.pct('equity.tieProbability')} et tu perds ${r.pct('equity.lossProbability')}.`,
      });
      if (a.equity.opponents.length > 1) {
        b.add({
          id: 'equity.opponents', level: 3, category: 'equity',
          build: (r) => {
            const parts = a.equity.status === 'computed'
              ? a.equity.opponents.map((_, i) => `${r.str(`equity.opponents[${i}].name`)} ${r.pct(`equity.opponentEquities[${i}]`)}`)
              : [];
            return `Les adversaires se partagent le reste : ${parts.join(', ')}.`;
          },
        });
      }
      b.add({
        id: 'equity.method', level: 3, category: 'equity',
        build: (r) => {
          if (r.get<string>('equity.method') === 'exact') return 'Calcul exact : toutes les possibilités ont été énumérées.';
          let t = `Estimation par simulation : ${r.int('equity.samples')} tirages`;
          if (r.has('equity.seed')) t += `, graine ${r.int('equity.seed')}`;
          if (r.has('equity.standardError')) t += `, erreur standard ${r.pct('equity.standardError')}`;
          return `${t}. Ce n’est pas une valeur exacte.`;
        },
      });
    } else if (a.equity.status === 'unknown_opponent_range') {
      b.add({
        id: 'missing.equity', level: 1, category: 'missing_data', tone: 'caution',
        build: (r) => {
          r.get('equity.missingSeats');
          return 'Ton equity est inconnue : la range adverse n’est pas connue. Sélectionne une hypothèse de range pour obtenir une estimation.';
        },
      });
      b.add({
        id: 'missing.equity.who', level: 2, category: 'missing_data',
        build: (r) => {
          const seats = r.get<number[]>('equity.missingSeats');
          const names = seats.map((s) => {
            const i = a.situation.opponents.findIndex((o) => o.seat === s);
            if (i < 0) throw new MissingData(`situation.opponents(seat ${s})`);
            return r.str(`situation.opponents[${i}].name`);
          });
          return `Sans hypothèse pour : ${names.join(', ')}.`;
        },
      });
    } else {
      b.add({
        id: 'missing.equity.na', level: 1, category: 'missing_data',
        build: (r) => `Pas d’equity à afficher : ${EQUITY_NA_FR[r.get<string>('equity.reason')] ?? 'situation sans adversaire'}.`,
      });
    }

    /* ---------- pot odds ---------- */
    if (a.potOdds.status === 'no_call_decision') {
      b.add({
        id: 'pot_odds.free', level: 1, category: 'pot_odds',
        build: (r) => (r.get<string>('potOdds.status') === 'no_call_decision' ? 'Rien à payer : les pot odds ne s’appliquent pas.' : ''),
      });
    } else {
      b.add({
        id: 'pot_odds.need', level: 1, category: 'pot_odds',
        build: (r) => `Il te faut environ ${r.pct('potOdds.odds.requiredEquity')} d’equity pour payer ${r.amount('potOdds.odds.callAmount')} dans un pot de ${r.amount('potOdds.odds.potBeforeCall')}.`,
      });
      b.add({
        id: 'pot_odds.compare', level: 1, category: 'pot_odds', tone: 'neutral',
        build: (r) => {
          const ok = r.flag('potOdds.comparison.meetsRequirement');
          return `Ton equity (${r.pct('potOdds.comparison.equity')}) est ${ok ? 'supérieure ou égale à' : 'inférieure à'} l’equity nécessaire (${r.pct('potOdds.comparison.requiredEquity')}).`;
        },
      });
      if (a.potOdds.comparison === null) {
        b.add({
          id: 'pot_odds.no_equity', level: 1, category: 'missing_data', tone: 'caution',
          build: (r) => {
            r.get('potOdds.odds.requiredEquity');
            return 'Sans equity connue, impossible de comparer ton equity aux pot odds.';
          },
        });
      }
      b.add({
        id: 'pot_odds.ratio', level: 2, category: 'pot_odds',
        build: (r) => `Tu paies ${r.amount('potOdds.odds.callAmount')} pour espérer gagner ${r.amount('potOdds.odds.potBeforeCall')}, soit ${r.dec('potOdds.odds.ratio')} contre un.`,
      });
      b.add({
        id: 'pot_odds.margin', level: 2, category: 'pot_odds',
        build: (r) => `Écart : ${r.points('potOdds.comparison.margin')} d’equity ${r.get<number>('potOdds.comparison.margin') >= 0 ? 'au-dessus' : 'en dessous'} du minimum.`,
      });
      b.add({
        id: 'pot_odds.implied', level: 3, category: 'pot_odds',
        build: (r) => {
          if (r.get<string>('potOdds.implied.status') === 'complete') {
            return `Avec les cotes implicites que tu as supposées, il te faudrait ${r.pct('potOdds.implied.requiredEquity')} d’equity.`;
          }
          const miss = r.get<string[]>('potOdds.implied.missing').map(impliedFieldFr);
          return `Cotes implicites incomplètes : il manque ${miss.join(', ')}.`;
        },
      });
    }

    /* ---------- SPR ---------- */
    b.add({
      id: 'spr.value', level: 2, category: 'spr',
      build: (r) => `Le SPR est de ${r.dec('spr.spr')} (${SPR_FR[r.get<keyof typeof SPR_FR>('spr.category')]}).`,
    });
    b.add({
      id: 'spr.meaning', level: 3, category: 'spr',
      build: (r) => `En règle générale, avec un SPR ${SPR_FR[r.get<keyof typeof SPR_FR>('spr.category')]} ${SPR_MEANING_FR[r.get<keyof typeof SPR_MEANING_FR>('spr.category')]}.`,
    });

    /* ---------- EV ---------- */
    if (a.ev.status === 'complete') {
      b.add({
        id: 'ev.value', level: 2, category: 'ev', tone: a.ev.ev > 0 ? 'positive' : a.ev.ev < 0 ? 'negative' : 'neutral',
        build: (r) => `${r.get<string>('ev.kind') === 'call' ? 'Payer' : 'Miser'} vaut ${r.signedAmount('ev.ev')} en moyenne par rapport à un fold, dans les conditions supposées.`,
      });
      b.add({
        id: 'ev.assumptions', level: 3, category: 'ev',
        build: (r) => `Conditions du calcul : ${r.get<string[]>('ev.assumptions').map((s) => low(knownText(s)).replace(/\.$/, '')).join(' ; ')}.`,
      });
    } else {
      b.add({
        id: 'ev.missing', level: 2, category: 'missing_data', tone: 'caution',
        build: (r) => `Valeur espérée impossible à calculer : ${r.get<string[]>('ev.missing').map((s) => knownText(s)).join(' ; ')}.`,
      });
    }

    /* ---------- blockers ---------- */
    if (a.blockers.status === 'available') {
      const ranges = a.blockers.ranges;
      b.add({
        id: 'blockers.summary', level: 2, category: 'blockers',
        build: (r) => {
          const classes: string[] = [];
          ranges.forEach((rg, i) => rg.mostAffected.slice(0, 2).forEach((_m, j) => {
            const c = r.str(`blockers.ranges[${i}].mostAffected[${j}].handClass`);
            if (!classes.includes(c)) classes.push(c);
          }));
          if (classes.length === 0) throw new MissingData('blockers.ranges[].mostAffected');
          return `Tu bloques certaines combinaisons de ${classes.slice(0, 3).join(', ')}.`;
        },
      });
      ranges.forEach((rg, i) => {
        const p = `blockers.ranges[${i}]`;
        const nameOf = (r: Reader): string => {
          const k = a.situation.opponents.findIndex((o) => o.seat === rg.seat);
          return k >= 0 ? r.str(`situation.opponents[${k}].name`) : `le siège ${r.int(`${p}.seat`)}`;
        };
        b.add({
          id: `blockers.range.${rg.seat}`, level: 3, category: 'blockers',
          build: (r) => {
            const blocked = r.get<number>(`${p}.blockedCombos`);
            if (blocked === 0) return `Tes cartes ne retirent aucune combinaison de la range supposée de ${nameOf(r)}.`;
            return `Contre ${nameOf(r)}, ${r.int(`${p}.blockedCombos`)} ${plural(blocked, 'combinaison est impossible', 'combinaisons sont impossibles')} sur ${r.int(`${p}.totalCombos`)} à cause de tes cartes ; il en reste ${r.int(`${p}.remainingCombos`)}.`;
          },
        });
        b.add({
          id: `blockers.range.${rg.seat}.detail`, level: 3, category: 'blockers',
          build: (r) => {
            if (rg.mostAffected.length === 0) return '';
            const parts = rg.mostAffected.map((_, j) => `${r.str(`${p}.mostAffected[${j}].handClass`)} (${r.int(`${p}.mostAffected[${j}].total`)} → ${r.int(`${p}.mostAffected[${j}].blocked`)} retirées)`);
            return `Mains les plus touchées chez ${nameOf(r)} : ${parts.join(', ')}.`;
          },
        });
      });
    } else {
      b.add({
        id: 'blockers.none', level: 3, category: 'missing_data',
        build: (r) => (r.get<string>('blockers.status') === 'no_range_assumed' ? 'Aucune range supposée : pas d’analyse de blockers possible.' : ''),
      });
    }
  }

  /* ---------- decision ---------- */
  const lc = (r: Reader): string => (equityKnown ? lead(r, a) : '');
  const majorDraw = a.draws.status === 'available' ? a.draws.draws.findIndex((d) => d.relevance === 'major') : -1;
  b.add({
    id: 'decision.verdict', level: 1, category: 'decision',
    tone: verdict.verdict === 'favorable' ? 'positive' : verdict.verdict === 'unfavorable' ? 'negative' : verdict.verdict === 'close' ? 'caution' : 'neutral',
    build: (r) => {
      if (verdict.verdict === 'undetermined') {
        if (!inHand) {
          r.get('situation.heroInHand');
          return 'Aucune décision à évaluer : tu n’es plus dans la main.';
        }
        if (facingCall) {
          r.get('equity.status');
          return equityKnown ? 'Impossible de conclure : données insuffisantes.' : 'Impossible de conclure précisément sans hypothèse sur la range adverse.';
        }
        r.get('potOdds.status');
        return 'Aucun call à évaluer ici : pas de verdict. Pour juger une mise, il faut des hypothèses explicites (voir les données manquantes).';
      }
      verdict.sources.forEach((s) => r.get(s));
      const prefix = equityKnown ? `${lc(r)}, ` : 'Dans les conditions supposées, ';
      const phrase = verdictPhrase(verdict.verdict, decisionKind);
      if (verdict.verdict === 'close') return `${prefix}${phrase} : l’écart est trop faible pour trancher.`;
      if (decisionKind === 'bet') return `${prefix}${phrase} : la valeur espérée est ${verdict.verdict === 'favorable' ? 'positive' : 'négative'}.`;
      return `${prefix}${phrase} : ton equity ${verdict.verdict === 'favorable' ? 'dépasse' : 'est inférieure à'} l’equity nécessaire.`;
    },
  });

  if (inHand) {
    b.add({
      id: 'decision.reasoning', level: 2, category: 'decision',
      build: (r) => {
        const parts: string[] = [];
        if (r.get<string>('handStrength.kind') === 'preflop') parts.push(`Ta main de départ est ${r.str('handStrength.handClass')}.`);
        else if (r.get<string>('handStrength.kind') === 'made') {
          let s = `Tu as ${madeHandName(r.get<HandCategory>('handStrength.category'), [r.get<number>('handStrength.tiebreak[0]'), r.has('handStrength.tiebreak[1]') ? r.get<number>('handStrength.tiebreak[1]') : 0])}`;
          if (majorDraw >= 0) s += ` avec ${DRAW_FR[r.get<keyof typeof DRAW_FR>(`draws.draws[${majorDraw}].kind`)]}`;
          if (r.has('outs.total') && r.get<number>('outs.total') > 0) s += ` et ${r.int('outs.total')} ${plural(r.get<number>('outs.total'), 'out potentiel', 'outs potentiels')}`;
          parts.push(`${s}.`);
        }
        if (equityKnown) {
          parts.push(`${lead(r, a)}, ton equity est de ${r.pct('equity.equity')}.`);
          if (r.has('potOdds.odds.requiredEquity')) parts.push(`Le pot te demande ${r.pct('potOdds.odds.requiredEquity')} pour payer.`);
          if (verdict.verdict !== 'undetermined') {
            verdict.sources.forEach((s) => r.get(s));
            parts.push(`Conclusion : ${verdictPhrase(verdict.verdict, decisionKind)}${verdict.verdict === 'close' ? ' (écart trop faible pour trancher)' : ' dans cette hypothèse'}.`);
          }
        } else {
          r.get('equity.status');
          parts.push('L’equity est inconnue faute d’hypothèse sur la range adverse : le raisonnement s’arrête ici, aucune décision ne peut en être tirée.');
        }
        return parts.join(' ');
      },
    });
  }
  b.add({
    id: 'decision.nuance', level: 3, category: 'decision', tone: 'caution',
    build: (r) => {
      if (verdict.verdict === 'undetermined') throw new MissingData('decision');
      verdict.sources.forEach((s) => r.get(s));
      return 'Ce verdict ne vaut que pour l’hypothèse choisie : si la range réelle de l’adversaire est différente, la conclusion peut changer.';
    },
  });

  /* ---------- confidence ---------- */
  b.add({
    id: 'confidence.level', level: 1, category: 'confidence',
    tone: a.confidence.level === 'low' ? 'caution' : 'neutral',
    build: (r) => `Confiance de l’analyse : ${CONFIDENCE_FR[r.get<keyof typeof CONFIDENCE_FR>('confidence.level')]}.`,
  });
  b.add({
    id: 'confidence.low', level: 1, category: 'confidence', tone: 'caution',
    build: (r) => (r.get<string>('confidence.level') === 'low' && inHand ? 'Sans information sur la range adverse, cette conclusion reste incertaine.' : ''),
  });
  a.confidence.reasons.forEach((_, i) => {
    b.add({
      id: `confidence.reason.${i}`, level: 2, category: 'confidence',
      build: (r) => {
        const code = r.get<keyof typeof REASON_FR>(`confidence.reasons[${i}].code`);
        const extra = code === 'ESTIMATED_BY_SIMULATION' && r.has('equity.samples') ? ` (${r.int('equity.samples')} tirages)` : '';
        return `${cap(REASON_FR[code])}${extra}.`;
      },
    });
  });

  /* ---------- limitations ---------- */
  const reasonCodes = a.confidence.reasons.map((x) => x.code);
  const idx = (code: string): number => a.confidence.reasons.findIndex((x) => x.code === code);
  if (reasonCodes.includes('HYPOTHETICAL_RANGES')) {
    b.add({
      id: 'limitation.hypothesis', level: 3, category: 'limitation', tone: 'caution',
      build: (r) => {
        r.get(`confidence.reasons[${idx('HYPOTHETICAL_RANGES')}].code`);
        return 'Ton equity dépend fortement de la range supposée : le résultat ne doit pas être lu comme une vérité indépendante de cette range, et la range d’un bot n’est pas mise à jour par ses actions.';
      },
    });
  }
  if (a.outs.status === 'available' && (a.outs.dirty.length > 0 || a.outs.unknown.length > 0)) {
    b.add({
      id: 'limitation.outs', level: 3, category: 'limitation', tone: 'caution',
      build: (r) => {
        r.get('outs.dirty');
        r.get('outs.unknown');
        return 'Certains outs sont classés douteux ou inconnus : ils améliorent ta main mais peuvent encore te laisser derrière un adversaire. Ce ne sont pas des cartes gagnantes assurées.';
      },
    });
  }
  if (reasonCodes.includes('ESTIMATED_BY_SIMULATION')) {
    b.add({
      id: 'limitation.simulation', level: 3, category: 'limitation', tone: 'caution',
      build: (r) => {
        r.get(`confidence.reasons[${idx('ESTIMATED_BY_SIMULATION')}].code`);
        return 'L’equity est une estimation : relancer avec une autre graine donnerait un résultat légèrement différent.';
      },
    });
  }
  if (reasonCodes.includes('MULTIWAY_INDEPENDENT_RANGES')) {
    b.add({
      id: 'limitation.multiway', level: 3, category: 'limitation', tone: 'caution',
      build: (r) => {
        r.get(`confidence.reasons[${idx('MULTIWAY_INDEPENDENT_RANGES')}].code`);
        return 'Plusieurs ranges sont traitées comme indépendantes : les mains réellement jouées par plusieurs adversaires sont en pratique corrélées.';
      },
    });
  }
  if (a.ev.status === 'complete') {
    b.add({
      id: 'limitation.ev', level: 3, category: 'limitation', tone: 'caution',
      build: (r) => {
        r.get('ev.assumptions');
        return 'La valeur espérée ne tient compte ni des mises futures ni des cotes implicites, sauf si elles sont renseignées.';
      },
    });
  }
  if (a.confidence.level === 'low' && inHand) {
    b.add({
      id: 'limitation.no_range', level: 3, category: 'limitation', tone: 'caution',
      build: (r) => {
        r.get('confidence.level');
        return 'Tant qu’aucune main ni range adverse n’est supposée, aucune equity, aucune valeur espérée et aucun verdict ne peuvent être calculés.';
      },
    });
  }

  return { version: 1, language: 'fr', items: b.items, verdict, confidence: a.confidence.level };
}

/** Items shown at a level (levels are cumulative: level 3 shows everything). */
export function itemsForLevel(e: Explanation, level: ExplanationLevel): ExplanationItem[] {
  return e.items.filter((i) => i.level <= level);
}
