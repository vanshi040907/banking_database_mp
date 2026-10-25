import { createPortal } from 'react-dom';
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { BRAND } from './brand.js';
import { inr, titleCase } from './format.js';

const cx = (...a) => a.filter(Boolean).join(' ');

/* ---------- brand ---------- */
export function Wordmark({ className = '', sub }) {
  return (
    <div className={cx('flex items-center gap-2.5', className)}>
      <svg width="26" height="26" viewBox="0 0 26 26" fill="none" aria-hidden="true">
        <path d="M13 2.5c3.2 4.2 6.2 7.4 6.2 11.2a6.2 6.2 0 1 1-12.4 0C6.8 9.9 9.8 6.7 13 2.5Z" stroke="#25307A" strokeWidth="1.3" strokeLinejoin="round" />
        <path d="M13 9.5v9.2M10.3 15.2 13 12.6" stroke="#6A52A3" strokeWidth="1.2" strokeLinecap="round" />
      </svg>
      <span className="serif text-[22px] italic leading-none tracking-tight text-ink-800">{BRAND.name}</span>
      {sub && <span className="ml-1 rounded-full border border-violet-200 bg-violet-50 px-2 py-0.5 text-[11px] font-medium uppercase tracking-[0.08em] text-violet-600">{sub}</span>}
    </div>
  );
}

/* ---------- primitives ---------- */
const BTN = {
  primary: 'bg-ink-700 text-white shadow-[0_1px_2px_rgba(20,27,74,0.18)] hover:bg-ink-800 disabled:bg-ink-200 disabled:shadow-none',
  secondary: 'bg-white text-ink-800 border border-line hover:bg-ink-50 hover:border-ink-200 disabled:text-ink-300',
  ghost: 'text-ink-700 hover:bg-violet-100 disabled:text-ink-300',
  danger: 'bg-white text-danger-600 border border-danger-200 hover:bg-danger-50 disabled:opacity-50',
};
export function Button({ variant = 'primary', size = 'md', loading, children, className = '', ...p }) {
  return (
    <button
      {...p}
      disabled={p.disabled || loading}
      className={cx('inline-flex items-center justify-center gap-2 rounded-lg font-medium transition-colors disabled:cursor-not-allowed',
        size === 'sm' ? 'h-9 px-3.5 text-[13.5px]' : 'h-11 px-5 text-[15px]', BTN[variant], className)}
    >
      {loading && <Spinner className="h-4 w-4" />}
      {children}
    </button>
  );
}

export function Spinner({ className = 'h-5 w-5' }) {
  return (
    <svg className={cx('animate-spin', className)} viewBox="0 0 24 24" fill="none" aria-label="Loading">
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeOpacity=".2" strokeWidth="2.4" />
      <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" />
    </svg>
  );
}

const inputCls = 'h-11 w-full rounded-lg border border-line bg-white px-3.5 text-[15px] text-ink-900 outline-none transition placeholder:text-ink-300 focus:border-ink-500 focus:ring-4 focus:ring-violet-100 disabled:bg-ink-50 disabled:text-ink-400';

export function Field({ label, hint, error, children, className = '' }) {
  return (
    <label className={cx('block', className)}>
      {label && <span className="mb-1.5 block text-[13px] font-medium text-ink-700">{label}</span>}
      {children}
      {error ? <span className="mt-1.5 block text-[12.5px] text-danger-600">{error}</span>
        : hint ? <span className="mt-1.5 block text-[12.5px] text-ink-400">{hint}</span> : null}
    </label>
  );
}
export const Input = ({ className = '', ...p }) => <input {...p} className={cx(inputCls, className)} />;
export const Select = ({ className = '', children, ...p }) => (
  <select {...p} className={cx(inputCls, 'appearance-none bg-[url("data:image/svg+xml,%3Csvg xmlns=%27http://www.w3.org/2000/svg%27 width=%2712%27 height=%277%27 fill=%27none%27%3E%3Cpath d=%27m1 1 5 5 5-5%27 stroke=%27%236F78B8%27 stroke-width=%271.4%27 stroke-linecap=%27round%27/%3E%3C/svg%3E")] bg-[length:12px] bg-[right_14px_center] bg-no-repeat pr-9', className)}>{children}</select>
);
export const Textarea = ({ className = '', ...p }) => <textarea {...p} className={cx(inputCls, 'h-auto min-h-[88px] py-2.5', className)} />;

export function Card({ children, className = '', as: Tag = 'div', ...p }) {
  return <Tag {...p} className={cx('rounded-xl border border-line bg-white shadow-[0_1px_2px_rgba(20,27,74,0.04)]', className)}>{children}</Tag>;
}

const TONES = {
  neutral: 'bg-ink-50 text-ink-600 border-ink-100',
  violet: 'bg-violet-100 text-violet-700 border-violet-200',
  ok: 'bg-ok-50 text-ok-600 border-[#cfe6df]',
  warn: 'bg-warn-50 text-warn-600 border-[#ecdcb6]',
  danger: 'bg-danger-50 text-danger-600 border-danger-200',
};
export function Badge({ tone = 'neutral', children, className = '' }) {
  return <span className={cx('inline-flex items-center rounded-full border px-2.5 py-0.5 text-[12px] font-medium', TONES[tone], className)}>{children}</span>;
}
const STATUS_TONE = { ACTIVE: 'ok', VERIFIED: 'ok', PAID: 'ok', SUCCESS: 'ok', MATURED: 'violet', FROZEN: 'warn', PENDING: 'warn', OVERDUE: 'danger',
  CLOSED: 'neutral', INACTIVE: 'neutral', BLOCKED: 'danger', REJECTED: 'danger', EXPIRED: 'neutral', FAILED: 'danger', SUSPENDED: 'danger', DEFAULTED: 'danger' };
export const StatusBadge = ({ status }) => <Badge tone={STATUS_TONE[status] ?? 'neutral'}>{titleCase(status)}</Badge>;

export function Alert({ tone = 'danger', children, className = '' }) {
  if (!children) return null;
  const t = { danger: 'border-danger-200 bg-danger-50 text-danger-600', ok: 'border-[#cfe6df] bg-ok-50 text-ok-600', info: 'border-violet-200 bg-violet-50 text-violet-700' }[tone];
  return <div role={tone === 'danger' ? 'alert' : 'status'} className={cx('rounded-lg border px-3.5 py-2.5 text-[14px]', t, className)}>{children}</div>;
}

export const Money = ({ value, className = '' }) => <span className={cx('tnum', className)}>{inr(value)}</span>;

export function Segmented({ options, value, onChange, className = '' }) {
  return (
    <div className={cx('inline-flex rounded-lg border border-line bg-ink-50 p-0.5', className)} role="tablist">
      {options.map((o) => {
        const [v, l] = Array.isArray(o) ? o : [o, o];
        return (
          <button key={v} type="button" role="tab" aria-selected={value === v} onClick={() => onChange(v)}
            className={cx('whitespace-nowrap rounded-md px-3.5 py-1.5 text-[13.5px] font-medium transition', value === v ? 'bg-white text-ink-800 shadow-[0_1px_2px_rgba(20,27,74,0.1)]' : 'text-ink-400 hover:text-ink-700')}>
            {l}
          </button>
        );
      })}
    </div>
  );
}

export function Progress({ value, className = '' }) {
  return (
    <div className={cx('h-1.5 overflow-hidden rounded-full bg-violet-100', className)} role="progressbar" aria-valuenow={Math.round(value)} aria-valuemin={0} aria-valuemax={100}>
      <div className="h-full rounded-full bg-ink-600 transition-all duration-700" style={{ width: `${Math.max(0, Math.min(100, value))}%` }} />
    </div>
  );
}

/* ---------- page structure ---------- */
export function PageHeader({ title, subtitle, actions, className = '' }) {
  return (
    <div className={cx('mb-6 flex flex-wrap items-end justify-between gap-4', className)}>
      <div>
        <h1 className="text-[32px] leading-tight">{title}</h1>
        {subtitle && <p className="mt-1 text-[15px] text-ink-400">{subtitle}</p>}
      </div>
      {actions && <div className="flex items-center gap-2.5">{actions}</div>}
    </div>
  );
}

export function Stat({ label, value, hint, className = '' }) {
  return (
    <Card className={cx('p-5', className)}>
      <div className="text-[13px] font-medium text-ink-400">{label}</div>
      <div className="serif tnum mt-1 text-[30px] leading-tight text-ink-900">{value}</div>
      {hint && <div className="mt-0.5 text-[13px] text-ink-400">{hint}</div>}
    </Card>
  );
}

export function SectionTitle({ children, action }) {
  return (
    <div className="mb-3 flex items-baseline justify-between">
      <h2 className="text-[21px]">{children}</h2>
      {action}
    </div>
  );
}

export function Loading({ label = 'Loading' }) {
  return <div className="flex items-center gap-2.5 py-10 text-ink-400"><Spinner />{label}…</div>;
}
export function ErrorNote({ children, onRetry }) {
  return (
    <Alert className="flex items-center justify-between gap-4">
      <span>{children}</span>
      {onRetry && <button onClick={onRetry} className="font-medium underline underline-offset-2">Try again</button>}
    </Alert>
  );
}
export function EmptyState({ title, children, action }) {
  return (
    <div className="flex flex-col items-center px-6 py-12 text-center">
      <svg width="44" height="44" viewBox="0 0 44 44" fill="none" aria-hidden="true" className="mb-3 opacity-80">
        <path d="M6 30c4-6 7-9 11-9s5 4 9 4 6-5 12-12" stroke="#6A52A3" strokeWidth="1.2" strokeLinecap="round" />
        <path d="M6 36h32M10 33h24" stroke="#25307A" strokeWidth="1" strokeLinecap="round" strokeOpacity=".5" />
      </svg>
      <div className="serif text-[20px] text-ink-800">{title}</div>
      {children && <p className="mt-1 max-w-sm text-[14px] text-ink-400">{children}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

/* ---------- table ---------- */
export function Table({ columns, rows, onRowClick, empty, rowKey, dense }) {
  if (!rows?.length) return empty ?? <EmptyState title="Nothing here yet" />;
  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-left">
        <thead>
          <tr className="border-b border-line">
            {columns.map((c) => (
              <th key={c.key} className={cx('whitespace-nowrap px-4 py-2.5 text-[12px] font-medium uppercase tracking-[0.07em] text-ink-400', c.align === 'right' && 'text-right')}>{c.label}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={rowKey ? r[rowKey] : i} onClick={onRowClick ? () => onRowClick(r) : undefined}
              className={cx('border-b border-line/70 last:border-0', onRowClick && 'cursor-pointer hover:bg-violet-50')}>
              {columns.map((c) => (
                <td key={c.key} className={cx('px-4 text-[14.5px]', dense ? 'py-2' : 'py-3.5', c.align === 'right' && 'text-right tnum', c.className)}>
                  {c.render ? c.render(r) : r[c.key]}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/* ---------- overlays ---------- */
export function Modal({ open, onClose, title, children, side = false, width }) {
  useEffect(() => {
    if (!open) return;
    const k = (e) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [open, onClose]);
  if (!open) return null;
  return createPortal(
    <div className="fixed inset-0 z-50 flex" role="dialog" aria-modal="true" aria-label={title}>
      <div className="absolute inset-0 bg-ink-900/25" onClick={onClose} />
      <div className={cx('relative z-10 bg-white shadow-[0_8px_40px_rgba(20,27,74,0.18)]',
        side ? 'ml-auto h-full w-full overflow-y-auto border-l border-line' : 'm-auto max-h-[90vh] w-full overflow-y-auto rounded-2xl border border-line')}
        style={{ maxWidth: width ?? (side ? 560 : 520) }}>
        <div className="flex items-start justify-between gap-4 border-b border-line px-6 py-4">
          <h2 className="text-[22px]">{title}</h2>
          <button onClick={onClose} aria-label="Close" className="-mr-2 rounded-lg p-2 text-ink-400 hover:bg-violet-100 hover:text-ink-700">
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="m3 3 10 10M13 3 3 13" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" /></svg>
          </button>
        </div>
        <div className="px-6 py-5">{children}</div>
      </div>
    </div>,
    document.body,
  );
}

const ToastCtx = createContext(() => {});
export const useToast = () => useContext(ToastCtx);
export function ToastProvider({ children }) {
  const [items, setItems] = useState([]);
  const push = useCallback((message, tone = 'ok') => {
    const id = Math.random();
    setItems((x) => [...x, { id, message, tone }]);
    setTimeout(() => setItems((x) => x.filter((i) => i.id !== id)), 4500);
  }, []);
  return (
    <ToastCtx.Provider value={push}>
      {children}
      <div className="pointer-events-none fixed bottom-6 left-1/2 z-[60] flex -translate-x-1/2 flex-col gap-2">
        {items.map((t) => (
          <div key={t.id} className={cx('soft-in pointer-events-auto rounded-lg border bg-white px-4 py-2.5 text-[14px] shadow-[0_6px_24px_rgba(20,27,74,0.14)]',
            t.tone === 'ok' ? 'border-[#cfe6df] text-ok-600' : 'border-danger-200 text-danger-600')}>{t.message}</div>
        ))}
      </div>
    </ToastCtx.Provider>
  );
}

/* ---------- OTP ---------- */
export function OtpInput({ length = 6, onComplete, disabled, autoFocus = true }) {
  const [vals, setVals] = useState(Array(length).fill(''));
  const refs = useRef([]);
  useEffect(() => { if (autoFocus) refs.current[0]?.focus(); }, [autoFocus]);
  const set = (next) => { setVals(next); if (next.every(Boolean)) onComplete?.(next.join('')); };
  const onChange = (i, v) => {
    const d = v.replace(/\D/g, '');
    if (!d) return;
    const next = [...vals];
    d.slice(0, length - i).split('').forEach((ch, k) => { next[i + k] = ch; });
    set(next);
    refs.current[Math.min(i + d.length, length - 1)]?.focus();
  };
  const onKey = (i, e) => {
    if (e.key === 'Backspace') {
      const next = [...vals];
      if (next[i]) next[i] = ''; else if (i > 0) { next[i - 1] = ''; refs.current[i - 1]?.focus(); }
      setVals(next);
    }
    if (e.key === 'ArrowLeft') refs.current[i - 1]?.focus();
    if (e.key === 'ArrowRight') refs.current[i + 1]?.focus();
  };
  useEffect(() => { if (!disabled && vals.every((v) => !v)) refs.current[0]?.focus(); }, [disabled]); // eslint-disable-line
  return (
    <div className="flex gap-2.5" role="group" aria-label="One-time code">
      {vals.map((v, i) => (
        <input key={i} ref={(el) => (refs.current[i] = el)} value={v} inputMode="numeric" autoComplete={i === 0 ? 'one-time-code' : 'off'}
          maxLength={length} disabled={disabled} aria-label={`Digit ${i + 1}`}
          onChange={(e) => onChange(i, e.target.value)} onKeyDown={(e) => onKey(i, e)} onFocus={(e) => e.target.select()}
          className="serif tnum h-14 w-12 rounded-lg border border-line bg-white text-center text-[26px] text-ink-900 outline-none transition focus:border-ink-500 focus:ring-4 focus:ring-violet-100 disabled:bg-ink-50" />
      ))}
    </div>
  );
}

/* ---------- small hooks ---------- */
export function useAction() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const run = useCallback(async (fn) => {
    setBusy(true); setError('');
    try { return await fn(); } catch (e) { setError(e.message); return undefined; } finally { setBusy(false); }
  }, []);
  return useMemo(() => ({ busy, error, run, setError }), [busy, error, run]);
}

export const KV = ({ k, v, className = '' }) => (
  <div className={cx('flex items-baseline justify-between gap-6 border-b border-line/70 py-2.5 last:border-0', className)}>
    <dt className="text-[13.5px] text-ink-400">{k}</dt>
    <dd className="text-right text-[14.5px] text-ink-900">{v}</dd>
  </div>
);
export { cx };
