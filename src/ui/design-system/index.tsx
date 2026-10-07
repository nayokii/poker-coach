import {
  createContext, useCallback, useContext, useEffect, useId, useMemo, useRef, useState,
  type ComponentProps, type HTMLAttributes, type ReactNode,
} from 'react';
import { X } from 'lucide-react';
import './ds.css';

/* Button ------------------------------------------------------------- */
type Variant = 'primary' | 'secondary' | 'ghost' | 'danger';

export interface ButtonProps extends ComponentProps<'button'> {
  variant?: Variant;
  large?: boolean;
  block?: boolean;
}

export function Button({ variant = 'secondary', large, block, className = '', type = 'button', ...rest }: ButtonProps) {
  const cls = ['btn', `btn--${variant}`, large && 'btn--lg', block && 'btn--block', className].filter(Boolean).join(' ');
  return <button type={type} className={cls} {...rest} />;
}

export function IconButton({ label, className = '', children, ...rest }: ComponentProps<'button'> & { label: string }) {
  return (
    <button type="button" className={`icon-btn ${className}`} aria-label={label} title={label} {...rest}>
      {children}
    </button>
  );
}

/* Panel / Badge --------------------------------------------------------- */
export function Panel({ flush, className = '', ...rest }: HTMLAttributes<HTMLDivElement> & { flush?: boolean }) {
  return <div className={`panel ${flush ? 'panel--flush' : ''} ${className}`} {...rest} />;
}

export function Badge({ tone = 'neutral', className = '', ...rest }: HTMLAttributes<HTMLSpanElement> & { tone?: 'neutral' | 'accent' | 'danger' | 'gain' }) {
  const t = tone === 'neutral' ? '' : `badge--${tone}`;
  return <span className={`badge ${t} ${className}`} {...rest} />;
}

/* Segmented control ----------------------------------------------------- */
export function Segmented<T extends string | number>({
  label, value, options, onChange,
}: {
  label: string;
  value: T;
  options: { value: T; label: string }[];
  onChange: (v: T) => void;
}) {
  return (
    <div className="segmented" role="radiogroup" aria-label={label}>
      {options.map((o) => (
        <button
          key={String(o.value)}
          type="button"
          role="radio"
          aria-checked={o.value === value}
          className="segmented__item"
          onClick={() => onChange(o.value)}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

/* Modal ------------------------------------------------------------------- */
export function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  const titleId = useId();
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    ref.current?.querySelector<HTMLElement>('button, [href], input, [tabindex]')?.focus();
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'Tab' && ref.current) {
        const items = [...ref.current.querySelectorAll<HTMLElement>('button:not(:disabled), input, [href], [tabindex]:not([tabindex="-1"])')];
        const first = items[0];
        const last = items[items.length - 1];
        if (!first || !last) return;
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
      previous?.focus?.();
    };
  }, [onClose]);

  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal" role="dialog" aria-modal="true" aria-labelledby={titleId} ref={ref}>
        <div className="modal__head">
          <h2 className="modal__title" id={titleId}>{title}</h2>
          <IconButton label="Fermer" onClick={onClose}>
            <X size={20} />
          </IconButton>
        </div>
        <div className="modal__body">{children}</div>
      </div>
    </div>
  );
}

/* Toast ---------------------------------------------------------------------- */
interface ToastItem {
  id: number;
  text: string;
}
const ToastContext = createContext<(text: string) => void>(() => {});
export const useToast = (): ((text: string) => void) => useContext(ToastContext);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const nextId = useRef(1);
  const show = useCallback((text: string) => {
    const id = nextId.current++;
    setItems((cur) => [...cur.slice(-2), { id, text }]);
    setTimeout(() => setItems((cur) => cur.filter((t) => t.id !== id)), 2600);
  }, []);
  const value = useMemo(() => show, [show]);
  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className="toasts" role="status" aria-live="polite">
        {items.map((t) => (
          <div key={t.id} className="toast">{t.text}</div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}
