import { Dumbbell, Grid3x3, History, Play, UserRound, type LucideIcon } from 'lucide-react';

export type SectionId = 'play' | 'ranges' | 'train' | 'history' | 'profile';

export interface Section {
  id: SectionId;
  label: string;
  icon: LucideIcon;
  /**
   * Only built sections are reachable. The shell renders the bottom navigation as soon as
   * more than one is available, so later phases just flip this flag and add a screen.
   */
  available: boolean;
}

export const SECTIONS: Section[] = [
  { id: 'play', label: 'Play', icon: Play, available: true },
  { id: 'ranges', label: 'Ranges', icon: Grid3x3, available: true },
  { id: 'train', label: 'Train', icon: Dumbbell, available: false },
  { id: 'history', label: 'History', icon: History, available: false },
  { id: 'profile', label: 'Profile', icon: UserRound, available: false },
];

export const availableSections = (): Section[] => SECTIONS.filter((s) => s.available);
