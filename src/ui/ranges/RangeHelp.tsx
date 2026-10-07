import { useState } from 'react';
import { ChevronDown, GraduationCap, Grid3x3, Layers } from 'lucide-react';
import type { Rank } from '../../engine';
import { handClassAt, handClassToString } from '../../coach/math';
import { Button, Modal } from '../design-system';
import './ranges.css';

const MINI: Rank[] = [14, 13, 12, 11];

/** The top-left 4 x 4 corner of the matrix, big enough to read, to show where pairs, suited and offsuit hands sit. */
export function MiniMatrix() {
  return (
    <div className="mini" role="img" aria-label="Extrait de la matrice : les paires sur la diagonale, les mains suited au-dessus, les mains offsuit en dessous">
      {MINI.map((row) =>
        MINI.map((col) => {
          const h = handClassAt(row, col);
          return (
            <span key={`${row}-${col}`} className="mini__cell" data-kind={h.kind}>
              {handClassToString(h)}
            </span>
          );
        }),
      )}
    </div>
  );
}

function Legend() {
  return (
    <ul className="legend">
      <li>
        <span className="legend__dot" data-kind="pair" aria-hidden="true" />
        <span>
          <strong>Diagonale</strong> : les paires (AA, KK, QQ…)
        </span>
      </li>
      <li>
        <span className="legend__dot" data-kind="suited" aria-hidden="true" />
        <span>
          <strong>Au-dessus</strong> : mains suited, même couleur (AKs, AQs…)
        </span>
      </li>
      <li>
        <span className="legend__dot" data-kind="offsuit" aria-hidden="true" />
        <span>
          <strong>En dessous</strong> : mains offsuit, couleurs différentes (AKo, AQo…)
        </span>
      </li>
    </ul>
  );
}

/** Opened by "Comprendre la matrice": the details a beginner needs, each one short. */
export function MatrixGuideModal({ onClose }: { onClose: () => void }) {
  return (
    <Modal title="Comprendre la matrice" onClose={onClose}>
      <div className="guide">
        <MiniMatrix />
        <Legend />
        <p className="guide__note">
          <strong>s</strong> = suited, même couleur · <strong>o</strong> = offsuit, couleurs différentes · aucune lettre = une paire.
        </p>

        <h3 className="guide__h">Les cases et les combos</h3>
        <p>
          La matrice a 169 cases : une par type de main de départ. Un <strong>combo</strong> est une main précise avec ses couleurs : une paire comme AA a 6 combos, une main suited comme AKs en a 4, une main offsuit comme AKo en a 12.
        </p>

        <h3 className="guide__h">Les pourcentages</h3>
        <p>
          « 50 % de cette main est dans la range » veut dire que chaque combo est joué la moitié du temps, ce qui compte comme la moitié des combos. À 100 %, tous les combos sont dans la range.
        </p>

        <h3 className="guide__h">Les cases partielles</h3>
        <p>Une case est partielle quand seule une partie de ses combos est choisie, ou quand elle est jouée à moins de 100 %.</p>

        <h3 className="guide__h">Les combos retirés</h3>
        <p>
          Les cartes connues (les tiennes et le board) ne peuvent pas être dans la main de l’adversaire. Avec A♠ en main, AKs n’a plus que 3 combos disponibles sur 4. Un petit point rouge marque ces cases.
        </p>

        <h3 className="guide__h">À quoi sert une range ?</h3>
        <p>Le Coach s’en sert pour estimer ton équité contre les mains que l’adversaire pourrait avoir. C’est une hypothèse, pas une information connue.</p>

        <Button variant="primary" block onClick={onClose}>
          J’ai compris
        </Button>
      </div>
    </Modal>
  );
}

/** Optional, collapsed by default: the idea of a range in three lines and a picture. */
export function RangeGuide() {
  const [open, setOpen] = useState(false);
  const [modal, setModal] = useState(false);
  return (
    <section className="rguide" aria-label="Aide : comprendre les ranges">
      <button type="button" className="rguide__toggle" aria-expanded={open} onClick={() => setOpen((v) => !v)}>
        <span>Comprendre les ranges</span>
        <ChevronDown size={18} aria-hidden="true" data-open={open || undefined} />
      </button>
      {open && (
        <div className="rguide__body">
          <p className="rguide__lead">Une range, c’est l’ensemble des mains qu’un joueur peut avoir dans une situation.</p>
          <MiniMatrix />
          <Legend />
          <p className="guide__note">
            <strong>s</strong> = suited, même couleur · <strong>o</strong> = offsuit, couleurs différentes · aucune lettre = paire.
          </p>
          <Button variant="secondary" onClick={() => setModal(true)}>
            Comprendre la matrice
          </Button>
        </div>
      )}
      {modal && <MatrixGuideModal onClose={() => setModal(false)} />}
    </section>
  );
}

/** Shown once, the first time the Range Lab is used. */
export function RangeIntro({ onDone }: { onDone: () => void }) {
  return (
    <section className="rintro" aria-label="Bienvenue dans Range Lab">
      <h2 className="rintro__title">Bienvenue dans Range Lab</h2>
      <p className="rintro__lead">Une range représente les mains qu’un joueur peut avoir.</p>
      <ol className="rintro__steps">
        <li>
          <span className="rintro__icon" aria-hidden="true">
            <Grid3x3 size={18} />
          </span>
          <span>Choisis des mains dans la matrice.</span>
        </li>
        <li>
          <span className="rintro__icon" aria-hidden="true">
            <Layers size={18} />
          </span>
          <span>Les cartes connues retirent certains combos.</span>
        </li>
        <li>
          <span className="rintro__icon" aria-hidden="true">
            <GraduationCap size={18} />
          </span>
          <span>Le Coach utilise cette range pour calculer ton équité.</span>
        </li>
      </ol>
      <Button variant="primary" onClick={onDone}>
        J’ai compris
      </Button>
    </section>
  );
}
