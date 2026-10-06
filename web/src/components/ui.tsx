import {
  forwardRef, useEffect, useId, useRef, useState, type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode,
} from 'react';
import { AlertTriangle, CheckCircle2, Eye, EyeOff, Info, Loader2, WifiOff, X } from 'lucide-react';
import { BOOKING_STATUS_LABEL, BOOKING_STATUS_TONE, type Tone } from '../lib/labels';
import type { BookingStatus } from '../lib/types';
import { PASSWORD_RULES } from '../lib/password';
import { MESSAGES } from '../lib/errors';

type Variant = 'primary' | 'secondary' | 'danger' | 'ghost';

export const Button = forwardRef<HTMLButtonElement, ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: Variant; loading?: boolean; block?: boolean; size?: 'md' | 'lg' | 'sm';
}>(function Button({ variant = 'primary', loading, block, size = 'md', className = '', children, disabled, ...rest }, ref) {
  return (
    <button
      ref={ref}
      className={`btn btn-${variant} btn-${size}${block ? ' btn-block' : ''} ${className}`}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...rest}
    >
      {loading && <Loader2 className="spin" size={18} aria-hidden />}
      {children}
    </button>
  );
});

export function Card({ children, className = '', as: As = 'section', ...rest }: {
  children: ReactNode; className?: string; as?: 'section' | 'div' | 'article' | 'li';
} & Record<string, unknown>) {
  return <As className={`card ${className}`} {...rest}>{children}</As>;
}

export function Badge({ tone = 'neutral', children }: { tone?: Tone; children: ReactNode }) {
  return <span className={`badge badge-${tone}`}>{children}</span>;
}

export function StatusBadge({ status }: { status: BookingStatus }) {
  return <Badge tone={BOOKING_STATUS_TONE[status]}>{BOOKING_STATUS_LABEL[status]}</Badge>;
}

export function Alert({ tone = 'info', title, children, onClose }: {
  tone?: 'info' | 'success' | 'warning' | 'danger'; title?: string; children?: ReactNode; onClose?: () => void;
}) {
  const Icon = tone === 'success' ? CheckCircle2 : tone === 'info' ? Info : AlertTriangle;
  return (
    <div className={`alert alert-${tone}`} role={tone === 'danger' || tone === 'warning' ? 'alert' : 'status'}>
      <Icon size={20} aria-hidden className="alert-icon" />
      <div className="alert-body">
        {title && <strong>{title}</strong>}
        {children && <div>{children}</div>}
      </div>
      {onClose && (
        <button className="icon-btn" onClick={onClose} aria-label="Dismiss">
          <X size={18} aria-hidden />
        </button>
      )}
    </div>
  );
}

export function Spinner({ label = 'Loading…' }: { label?: string }) {
  return (
    <div className="spinner" role="status">
      <Loader2 className="spin" size={28} aria-hidden />
      <span>{label}</span>
    </div>
  );
}

export function EmptyState({ icon, title, children }: { icon?: ReactNode; title: string; children?: ReactNode }) {
  return (
    <div className="empty">
      {icon && <div className="empty-icon" aria-hidden>{icon}</div>}
      <p className="empty-title">{title}</p>
      {children}
    </div>
  );
}

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <Alert tone="danger" title="Something went wrong">
      <p>{message}</p>
      {onRetry && <Button variant="secondary" size="sm" onClick={onRetry}>Try again</Button>}
    </Alert>
  );
}

export function OfflineNotice() {
  return (
    <div className="offline-notice" role="status">
      <WifiOff size={20} aria-hidden />
      <span>{MESSAGES.OFFLINE}</span>
    </div>
  );
}

export const Field = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement> & {
  label: string; error?: string; hint?: ReactNode;
}>(function Field({ label, error, hint, id, ...rest }, ref) {
  const auto = useId();
  const inputId = id ?? auto;
  const errId = `${inputId}-err`;
  const hintId = `${inputId}-hint`;
  return (
    <div className="field">
      <label htmlFor={inputId}>{label}</label>
      <input
        ref={ref}
        id={inputId}
        aria-invalid={!!error || undefined}
        aria-describedby={[error ? errId : '', hint ? hintId : ''].filter(Boolean).join(' ') || undefined}
        {...rest}
      />
      {hint && <div id={hintId} className="field-hint">{hint}</div>}
      {error && <div id={errId} className="field-error">{error}</div>}
    </div>
  );
});

export function PasswordField({ label, value, onChange, error, showRules, autoComplete, id }: {
  label: string; value: string; onChange: (v: string) => void; error?: string; showRules?: boolean;
  autoComplete: 'new-password' | 'current-password'; id?: string;
}) {
  const [visible, setVisible] = useState(false);
  const auto = useId();
  const inputId = id ?? auto;
  const rulesId = `${inputId}-rules`;
  const errId = `${inputId}-err`;
  return (
    <div className="field">
      <label htmlFor={inputId}>{label}</label>
      <div className="input-with-action">
        <input
          id={inputId}
          type={visible ? 'text' : 'password'}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          autoComplete={autoComplete}
          aria-invalid={!!error || undefined}
          aria-describedby={[showRules ? rulesId : '', error ? errId : ''].filter(Boolean).join(' ') || undefined}
          required
        />
        <button type="button" className="icon-btn" onClick={() => setVisible((v) => !v)}
          aria-label={visible ? 'Hide password' : 'Show password'} aria-pressed={visible}>
          {visible ? <EyeOff size={20} aria-hidden /> : <Eye size={20} aria-hidden />}
        </button>
      </div>
      {showRules && (
        <ul id={rulesId} className="pw-rules" aria-label="Password requirements">
          {PASSWORD_RULES.map((r) => {
            const ok = r.test(value);
            return (
              <li key={r.id} className={ok ? 'ok' : ''}>
                {ok ? <CheckCircle2 size={16} aria-hidden /> : <span className="dot" aria-hidden />}
                <span>{r.label}</span>
                <span className="sr-only">{ok ? '(met)' : '(not met)'}</span>
              </li>
            );
          })}
        </ul>
      )}
      {error && <div id={errId} className="field-error">{error}</div>}
    </div>
  );
}

/** Accessible modal built on the native <dialog> (focus trap + Escape handled by the browser). */
export function Modal({ open, onClose, title, children, footer, wide }: {
  open: boolean; onClose: () => void; title: string; children: ReactNode; footer?: ReactNode; wide?: boolean;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);
  return (
    <dialog
      ref={ref}
      className={`modal${wide ? ' modal-wide' : ''}`}
      aria-labelledby={titleId}
      onCancel={(e) => { e.preventDefault(); onClose(); }}
      onClick={(e) => { if (e.target === ref.current) onClose(); }}
    >
      {open && (
        <div className="modal-inner">
          <header className="modal-header">
            <h2 id={titleId}>{title}</h2>
            <button className="icon-btn" onClick={onClose} aria-label="Close"><X size={20} aria-hidden /></button>
          </header>
          <div className="modal-body">{children}</div>
          {footer && <footer className="modal-footer">{footer}</footer>}
        </div>
      )}
    </dialog>
  );
}

export function ConfirmDialog({ open, title, children, confirmLabel, cancelLabel = 'Keep it', danger, loading, onConfirm, onClose, error }: {
  open: boolean; title: string; children: ReactNode; confirmLabel: string; cancelLabel?: string; danger?: boolean;
  loading?: boolean; onConfirm: () => void; onClose: () => void; error?: string | null;
}) {
  return (
    <Modal open={open} onClose={onClose} title={title} footer={
      <>
        <Button variant="secondary" onClick={onClose} disabled={loading}>{cancelLabel}</Button>
        <Button variant={danger ? 'danger' : 'primary'} onClick={onConfirm} loading={loading}>{confirmLabel}</Button>
      </>
    }>
      {children}
      {error && <Alert tone="danger">{error}</Alert>}
    </Modal>
  );
}
