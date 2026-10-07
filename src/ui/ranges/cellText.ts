import { rankChar } from '../../engine';
import type { HandClass } from '../../coach/math';
import type { CellSelection } from '../../coach/ranges';

/** French number with a decimal comma: 11.2 -> "11,2". */
export const frDecimal = (x: number, digits = 1): string => x.toFixed(digits).replace('.', ',');

/** "AA", "AK suited", "AK offsuit". */
export function handName(h: HandClass): string {
  const ranks = `${rankChar(h.high)}${rankChar(h.low)}`;
  return h.kind === 'pair' ? ranks : `${ranks} ${h.kind}`;
}

export const KIND_TEXT: Record<HandClass['kind'], { name: string; hint: string }> = {
  pair: { name: 'Paire', hint: 'deux cartes de même rang' },
  suited: { name: 'Suited', hint: 'même couleur' },
  offsuit: { name: 'Offsuit', hint: 'couleurs différentes' },
};

export interface CellExplanation {
  /** One plain sentence about the share of this hand that is in the range. */
  headline: string;
  /** A second line with the exact combos, when it helps. */
  detail: string | null;
  /** Only when known cards remove combos. */
  blocked: { available: string; reason: string } | null;
}

const plural = (n: number, one: string, many: string): string => (n === 1 ? one : many);

/** Words for a cell, built from the CellSelection data (no recomputation of combos). */
export function explainCell(h: HandClass, s: CellSelection): CellExplanation {
  const name = handName(h);
  const n = s.availableCombos;
  let headline: string;
  let detail: string | null = null;

  switch (s.kind) {
    case 'disabled':
      headline = 'Toutes les combinaisons de cette main sont retirées par les cartes connues.';
      break;
    case 'none':
      headline = 'Cette main n’est pas dans la range.';
      break;
    case 'full':
      headline = '100 % de cette main est dans la range.';
      detail = `Les ${n} ${plural(n, 'combo', 'combos')} ${name} ${plural(n, 'est sélectionné', 'sont sélectionnés')}.`;
      break;
    case 'uniform':
      headline = `${s.percent} % de cette main est dans la range.`;
      detail = `Chaque combo ${name} est joué ${s.percent} % du temps.`;
      break;
    case 'subset':
      headline = `${s.percent} % de cette main est dans la range.`;
      detail = `${s.selectedCombos} / ${n} combos ${name} ${plural(s.selectedCombos, 'sélectionné', 'sélectionnés')}.`;
      break;
    default:
      headline = `${s.percent} % de cette main est dans la range.`;
      detail = `Sélection mixte : ${s.selectedCombos} / ${n} combos ${name}, à des fréquences différentes.`;
  }

  const blocked =
    s.blockedCombos > 0
      ? {
          available: `${n} ${plural(n, 'combo disponible', 'combos disponibles')} sur ${s.totalCombos} normalement`,
          reason: `Tes cartes et le board retirent ${s.blockedCombos} ${plural(s.blockedCombos, 'combo', 'combos')} : ils ne peuvent plus être dans la main de l’adversaire.`,
        }
      : null;
  return { headline, detail, blocked };
}
