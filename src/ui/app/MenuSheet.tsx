import { GraduationCap, Grid3x3, RotateCcw, ScrollText, SlidersHorizontal } from 'lucide-react';
import { Modal } from '../design-system';
import './app.css';

export interface MenuSheetProps {
  onClose: () => void;
  onNewGame: () => void;
  onLog: () => void;
  onSettings: () => void;
  onCoach?: () => void;
  onRanges?: () => void;
}

export function MenuSheet({ onClose, onNewGame, onLog, onSettings, onCoach, onRanges }: MenuSheetProps) {
  return (
    <Modal title="Menu" onClose={onClose}>
      <ul className="menu-list">
        <li>
          <button type="button" className="menu-item" onClick={onNewGame}>
            <RotateCcw size={20} />
            <span>
              New game
              <small>Change opponents, blinds or stacks</small>
            </span>
          </button>
        </li>
        {onCoach && (
          <li>
            <button type="button" className="menu-item" onClick={onCoach}>
              <GraduationCap size={20} />
              <span>
                Coach analysis
                <small>Outs, equity, pot odds, SPR and EV of this hand</small>
              </span>
            </button>
          </li>
        )}
        {onRanges && (
          <li>
            <button type="button" className="menu-item" onClick={onRanges}>
              <Grid3x3 size={20} />
              <span>
                Range Lab
                <small>Edit ranges and compare them</small>
              </span>
            </button>
          </li>
        )}
        <li>
          <button type="button" className="menu-item" onClick={onLog}>
            <ScrollText size={20} />
            <span>
              Hand log
              <small>Every action of the current hand</small>
            </span>
          </button>
        </li>
        <li>
          <button type="button" className="menu-item" onClick={onSettings}>
            <SlidersHorizontal size={20} />
            <span>
              Settings
              <small>Units, bot speed, table setup</small>
            </span>
          </button>
        </li>
      </ul>
    </Modal>
  );
}
