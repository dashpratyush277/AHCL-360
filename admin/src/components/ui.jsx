import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { label } from '../lib/format';

/* ------------------------------ Toasts ------------------------------ */

const ToastCtx = createContext(() => {});
export const useToast = () => useContext(ToastCtx);

export function ToastProvider({ children }) {
  const [items, setItems] = useState([]);
  const push = useCallback((message, kind = 'ok') => {
    const id = Math.random();
    setItems((x) => [...x, { id, message, kind }]);
    setTimeout(() => setItems((x) => x.filter((i) => i.id !== id)), 4000);
  }, []);
  return (
    <ToastCtx.Provider value={push}>
      {children}
      <div className="toasts" role="status" aria-live="polite">
        {items.map((t) => (
          <div key={t.id} className={`toast toast-${t.kind}`}>{t.message}</div>
        ))}
      </div>
    </ToastCtx.Provider>
  );
}

/** Wrap an async action: shows success/error toast and tracks a busy flag. */
export function useAction() {
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const run = useCallback(
    async (fn, success) => {
      setBusy(true);
      try {
        const out = await fn();
        if (success) toast(success);
        return out;
      } catch (e) {
        const extra = e.details?.map?.((d) => `${d.path}: ${d.message}`).join(', ');
        toast(extra ? `${e.message} – ${extra}` : e.message, 'error');
        throw e;
      } finally {
        setBusy(false);
      }
    },
    [toast],
  );
  return [run, busy];
}

/* ------------------------------ Primitives ------------------------------ */

export const Button = ({ variant = 'primary', size, className = '', ...p }) => (
  <button className={`btn btn-${variant} ${size ? `btn-${size}` : ''} ${className}`} {...p} />
);

const BADGE = {
  approved: 'ok', verified: 'ok', delivered: 'ok', reimbursed: 'ok', present: 'ok', resolved: 'ok', settled: 'ok', paid: 'ok', active: 'ok',
  pending: 'warn', processing: 'warn', submitted: 'warn', open: 'warn', half_day: 'warn', in_progress: 'warn', revision_requested: 'warn', needs_changes: 'warn', unpaid: 'warn',
  rejected: 'bad', cancelled: 'bad', absent: 'bad', blocked: 'bad', closed: 'muted',
  packed: 'info', shipped: 'info', leave: 'info', holiday: 'info',
};
export const Badge = ({ status, children }) => <span className={`badge badge-${BADGE[status] || 'muted'}`}>{children ?? label(status)}</span>;

export const Card = ({ title, actions, children, className = '' }) => (
  <section className={`card ${className}`}>
    {(title || actions) && (
      <header className="card-head">
        {title && <h3>{title}</h3>}
        <div className="row gap-s">{actions}</div>
      </header>
    )}
    {children}
  </section>
);

export const Stat = ({ label: l, value, hint, tone }) => (
  <div className={`stat ${tone ? `stat-${tone}` : ''}`}>
    <div className="stat-label">{l}</div>
    <div className="stat-value">{value}</div>
    {hint && <div className="stat-hint">{hint}</div>}
  </div>
);

export const PageHeader = ({ title, subtitle, children }) => (
  <div className="page-head">
    <div>
      <h1>{title}</h1>
      {subtitle && <p className="muted">{subtitle}</p>}
    </div>
    <div className="row gap-s wrap">{children}</div>
  </div>
);

export const Empty = ({ children = 'Nothing here yet.' }) => <div className="empty">{children}</div>;
export const Spinner = () => <div className="spinner" aria-label="Loading" />;
export const ErrorBox = ({ error }) => (error ? <div className="error-box">{error.message}</div> : null);

export function Tabs({ tabs, value, onChange }) {
  return (
    <div className="tabs" role="tablist">
      {tabs.map((t) => {
        const [v, l] = Array.isArray(t) ? t : [t, label(t)];
        return (
          <button key={v} role="tab" aria-selected={value === v} className={value === v ? 'active' : ''} onClick={() => onChange(v)}>
            {l}
          </button>
        );
      })}
    </div>
  );
}

/* ------------------------------ Data table ------------------------------ */

/**
 * columns: [{ key, header, render?(row), align?, width? }]
 */
export function DataTable({ columns, rows, loading, error, empty, onRowClick, page, total, limit, onPage }) {
  if (error) return <ErrorBox error={error} />;
  return (
    <div className="table-wrap">
      <table className="table">
        <thead>
          <tr>
            {columns.map((c) => (
              <th key={c.key} style={{ textAlign: c.align, width: c.width }}>{c.header}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {loading && !rows?.length ? (
            <tr><td colSpan={columns.length}><Spinner /></td></tr>
          ) : !rows?.length ? (
            <tr><td colSpan={columns.length}><Empty>{empty}</Empty></td></tr>
          ) : (
            rows.map((r, i) => (
              <tr key={r._id || r.id || i} onClick={onRowClick ? () => onRowClick(r) : undefined} className={onRowClick ? 'clickable' : ''}>
                {columns.map((c) => (
                  <td key={c.key} style={{ textAlign: c.align }}>{c.render ? c.render(r) : (r[c.key] ?? '-')}</td>
                ))}
              </tr>
            ))
          )}
        </tbody>
      </table>
      {total > limit && (
        <div className="pager">
          <span className="muted">{(page - 1) * limit + 1}–{Math.min(page * limit, total)} of {total}</span>
          <Button variant="ghost" size="s" disabled={page <= 1} onClick={() => onPage(page - 1)}>Prev</Button>
          <Button variant="ghost" size="s" disabled={page * limit >= total} onClick={() => onPage(page + 1)}>Next</Button>
        </div>
      )}
    </div>
  );
}

/* ------------------------------ Modal ------------------------------ */

export function Modal({ open, title, onClose, children, footer, wide }) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className={`modal ${wide ? 'modal-wide' : ''}`} role="dialog" aria-modal="true" aria-label={title}>
        <header className="modal-head">
          <h3>{title}</h3>
          <button className="icon-btn" onClick={onClose} aria-label="Close">×</button>
        </header>
        <div className="modal-body">{children}</div>
        {footer && <footer className="modal-foot">{footer}</footer>}
      </div>
    </div>
  );
}

/* ------------------------------ Forms ------------------------------ */

export const Field = ({ label: l, hint, children, full }) => (
  <label className={`field ${full ? 'field-full' : ''}`}>
    <span className="field-label">{l}</span>
    {children}
    {hint && <span className="field-hint">{hint}</span>}
  </label>
);

const get = (o, path) => path.split('.').reduce((a, k) => a?.[k], o);
const set = (o, path, v) => {
  const keys = path.split('.');
  const copy = structuredClone(o);
  let cur = copy;
  keys.slice(0, -1).forEach((k) => (cur = cur[k] ??= {}));
  cur[keys.at(-1)] = v;
  return copy;
};

/**
 * Declarative form. fields: [{ name: 'contact.mobile', label, type: text|number|select|textarea|checkbox|date|password,
 * options: [[value,label]] | string[], required, full, hint }]
 */
export function FormFields({ fields, value, onChange }) {
  return (
    <div className="form-grid">
      {fields.map((f) => {
        const v = get(value, f.name);
        const update = (x) => onChange(set(value, f.name, x));
        let input;
        if (f.type === 'select') {
          input = (
            <select value={v ?? ''} required={f.required} onChange={(e) => update(e.target.value || undefined)}>
              <option value="">{f.placeholder || 'Select…'}</option>
              {f.options.map((o) => {
                const [ov, ol] = Array.isArray(o) ? o : [o, label(o)];
                return <option key={ov} value={ov}>{ol}</option>;
              })}
            </select>
          );
        } else if (f.type === 'textarea') {
          input = <textarea rows={3} value={v ?? ''} required={f.required} onChange={(e) => update(e.target.value)} />;
        } else if (f.type === 'checkbox') {
          input = <input type="checkbox" checked={Boolean(v)} onChange={(e) => update(e.target.checked)} />;
        } else {
          input = (
            <input
              type={f.type || 'text'}
              value={v ?? ''}
              required={f.required}
              step={f.step}
              placeholder={f.placeholder}
              onChange={(e) => update(f.type === 'number' ? (e.target.value === '' ? undefined : Number(e.target.value)) : e.target.value)}
            />
          );
        }
        return (
          <Field key={f.name} label={`${f.label}${f.required ? ' *' : ''}`} hint={f.hint} full={f.full || f.type === 'textarea'}>
            {input}
          </Field>
        );
      })}
    </div>
  );
}

/** Strip empty strings so optional API fields validate. */
export const clean = (o) => {
  if (Array.isArray(o)) return o.map(clean);
  if (o && typeof o === 'object') {
    const out = {};
    for (const [k, v] of Object.entries(o)) {
      if (v === '' || v === undefined || v === null) continue;
      const c = clean(v);
      if (c && typeof c === 'object' && !Array.isArray(c) && !Object.keys(c).length) continue;
      out[k] = c;
    }
    return out;
  }
  return o;
};

/** Generic create/edit modal driven by FormFields. */
export function EditModal({ open, title, fields, initial, onClose, onSubmit, wide }) {
  const [value, setValue] = useState(initial || {});
  const [run, busy] = useAction();
  useEffect(() => setValue(initial || {}), [initial, open]);
  const submit = async (e) => {
    e.preventDefault();
    try {
      await run(() => onSubmit(clean(value)), 'Saved');
      onClose();
    } catch {
      /* toast already shown; keep the form open */
    }
  };
  return (
    <Modal open={open} title={title} onClose={onClose} wide={wide}>
      <form onSubmit={submit}>
        <FormFields fields={fields} value={value} onChange={setValue} />
        <div className="modal-foot">
          <Button type="button" variant="ghost" onClick={onClose}>Cancel</Button>
          <Button disabled={busy}>{busy ? 'Saving…' : 'Save'}</Button>
        </div>
      </form>
    </Modal>
  );
}

/** Prompt for approve/reject with optional comment/amount. */
export function ReviewModal({ open, title, options, withAmount, defaultAmount, onClose, onSubmit }) {
  const [status, setStatus] = useState(options[0][0]);
  const [comment, setComment] = useState('');
  const [amount, setAmount] = useState(defaultAmount);
  const [run, busy] = useAction();
  useEffect(() => {
    setStatus(options[0][0]);
    setComment('');
    setAmount(defaultAmount);
  }, [open, defaultAmount]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <Modal open={open} title={title} onClose={onClose}>
      <div className="stack">
        <div className="row gap-s wrap">
          {options.map(([v, l]) => (
            <Button key={v} type="button" variant={status === v ? 'primary' : 'ghost'} onClick={() => setStatus(v)}>{l}</Button>
          ))}
        </div>
        {withAmount && status === 'approved' && (
          <Field label="Approved amount (₹)">
            <input type="number" value={amount ?? ''} onChange={(e) => setAmount(Number(e.target.value))} />
          </Field>
        )}
        <Field label="Comment">
          <textarea rows={3} value={comment} onChange={(e) => setComment(e.target.value)} />
        </Field>
      </div>
      <div className="modal-foot">
        <Button variant="ghost" onClick={onClose}>Cancel</Button>
        <Button
          disabled={busy}
          onClick={() =>
            run(() => onSubmit({ status, comment: comment || undefined, approvedAmount: amount }), 'Updated')
              .then(onClose)
              .catch(() => {})
          }
        >
          Submit
        </Button>
      </div>
    </Modal>
  );
}
