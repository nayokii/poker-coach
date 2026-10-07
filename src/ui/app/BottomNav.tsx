import type { Section, SectionId } from './sections';
import './app.css';

/** Mobile tab bar. Only mounted once more than one section is available. */
export function BottomNav({ sections, current, onSelect }: { sections: Section[]; current: SectionId; onSelect: (id: SectionId) => void }) {
  return (
    <nav className="bottom-nav" aria-label="Sections">
      {sections.map(({ id, label, icon: Icon }) => (
        <button key={id} type="button" aria-current={id === current ? 'page' : undefined} onClick={() => onSelect(id)}>
          <Icon size={20} />
          {label}
        </button>
      ))}
    </nav>
  );
}
