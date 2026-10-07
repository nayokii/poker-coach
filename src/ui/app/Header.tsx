import { GraduationCap, Menu } from 'lucide-react';
import { IconButton } from '../design-system';
import './app.css';

/** Whisper-quiet session header: game type, blinds, hand number and the menu. */
export function Header({ blinds, handNumber, onMenu, onCoach }: { blinds: string; handNumber: number; onMenu: () => void; onCoach?: () => void }) {
  return (
    <header className="header">
      <div className="header__game">
        <span className="label">NLH</span>
        <span className="header__blinds num">{blinds}</span>
      </div>
      <span className="header__hand label" aria-label={`Hand ${handNumber}`}>
        Hand <span className="num">{handNumber}</span>
      </span>
      {onCoach && (
        <IconButton label="Coach analysis" onClick={onCoach}>
          <GraduationCap size={22} />
        </IconButton>
      )}
      <IconButton label="Menu" onClick={onMenu}>
        <Menu size={22} />
      </IconButton>
    </header>
  );
}
