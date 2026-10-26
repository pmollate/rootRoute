import type { ReactNode } from 'react';
import s from './ui.module.css';

export { s as ui };

export function ScreenHead({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className={s.head}>
      <h1 className={s.title}>{title}</h1>
      {children}
    </div>
  );
}

export function Section({ title, badge, children }: { title: string; badge?: ReactNode; children: ReactNode }) {
  return (
    <section className={s.card}>
      <h2 className={s.cardTitle}>{title} {badge}</h2>
      {children}
    </section>
  );
}

export function Kpi({ label, value, note }: { label: string; value: string; note?: string }) {
  return (
    <div className={s.kpi}>
      <div className={s.kpiValue}>{value}</div>
      <div className={s.kpiLabel}>{label}{note ? ` · ${note}` : ''}</div>
    </div>
  );
}

export type Tone = 'good' | 'bad' | 'warn' | 'synthetic' | 'neutral';
export function Pill({ tone = 'neutral', children, title }: { tone?: Tone; children: ReactNode; title?: string }) {
  return <span className={`${s.pill} ${s[tone]}`} title={title}>{children}</span>;
}

export function SyntheticBadge() {
  return <Pill tone="synthetic" title="Built on data we generated (SPEC §12.1)">Synthetic data</Pill>;
}

export function Status({ loading, error }: { loading: boolean; error?: string }) {
  if (error) return <p className={s.error}>Could not load: {error}</p>;
  if (loading) return <p className={s.muted}>Loading…</p>;
  return null;
}

export interface Column<T> { key: string; label: string; render: (row: T) => ReactNode; align?: 'right' }

export function Table<T>({ rows, columns }: { rows: T[]; columns: Column<T>[] }) {
  return (
    <div className={s.tableWrap}>
      <table className={s.table}>
        <thead>
          <tr>{columns.map((c) => <th key={c.key} className={c.align === 'right' ? s.right : undefined}>{c.label}</th>)}</tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i}>{columns.map((c) => <td key={c.key} className={c.align === 'right' ? s.right : undefined}>{c.render(r)}</td>)}</tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export interface BarItem { label: ReactNode; value: number; tone?: 'pre' | 'post' | 'good' | 'muted' | 'accent' }

/** Horizontal bars on one scale from `min` to `max`; `mark` draws a reference line (e.g. the 94% benchmark). */
export function Bars({ items, min = 0, max = 1, mark, format }: {
  items: BarItem[]; min?: number; max?: number; mark?: number; format: (v: number) => string;
}) {
  const w = (v: number) => `${Math.max(0, Math.min(100, ((v - min) / (max - min)) * 100))}%`;
  return (
    <div className={s.bars}>
      {items.map((it, i) => (
        <div key={i} className={s.bar}>
          <span>{it.label}</span>
          <span className={s.track} role="img" aria-label={format(it.value)}>
            <span className={`${s.fill} ${it.tone && it.tone !== 'accent' ? s[it.tone] : ''}`} style={{ width: w(it.value) }} />
            {mark != null && <span className={s.mark} style={{ left: w(mark) }} />}
          </span>
          <span className={s.value}>{format(it.value)}</span>
        </div>
      ))}
    </div>
  );
}

/** A row of toggle buttons; exactly one is pressed. */
export function Segmented<V extends string>({ label, value, options, onChange }: {
  label: string; value: V; options: readonly (readonly [V, string])[]; onChange: (v: V) => void;
}) {
  return (
    <div className={s.seg} role="group" aria-label={label}>
      {options.map(([v, l]) => (
        <button key={v} type="button" aria-pressed={v === value} onClick={() => onChange(v)}>{l}</button>
      ))}
    </div>
  );
}
