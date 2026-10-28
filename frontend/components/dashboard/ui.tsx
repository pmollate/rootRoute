import { useState, type ReactNode } from 'react';
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

/** Loading placeholder shapes: a row of cards, table rows, chart bars, one block, or lines of text. */
export type Skeleton = 'cards' | 'rows' | 'bars' | 'block' | 'text';

function Shimmer({ shape, count }: { shape: Skeleton; count: number }) {
  const n = Array.from({ length: count }, (_, i) => i);
  if (shape === 'cards') return <div className={s.skCards}>{n.map((i) => <span key={i} className={`${s.sk} ${s.skCard}`} />)}</div>;
  if (shape === 'block') return <span className={`${s.sk} ${s.skBlock}`} />;
  if (shape === 'bars') return (
    <div className={s.skList}>
      {n.map((i) => (
        <div key={i} className={s.skBar}>
          <span className={`${s.sk} ${s.skLine}`} />
          <span className={`${s.sk} ${s.skLine}`} style={{ width: `${88 - ((i * 17) % 45)}%` }} />
        </div>
      ))}
    </div>
  );
  if (shape === 'rows') return <div className={s.skList}>{n.map((i) => <span key={i} className={`${s.sk} ${s.skRow}`} />)}</div>;
  return <div className={s.skList}>{n.map((i) => <span key={i} className={`${s.sk} ${s.skLine}`} style={{ width: `${92 - i * 16}%` }} />)}</div>;
}

/** Errors show a fixed message: the error text can carry API paths, status codes or server internals.
 *  While loading, a shimmer in the shape of the content holds its place. */
export function Status({ loading, error, skeleton = 'text', count = 3 }: { loading: boolean; error?: string; skeleton?: Skeleton; count?: number }) {
  if (error) return <p className={s.error} role="alert">Could not load this section. Please try again later.</p>;
  if (loading) return (
    <div className={s.skeleton} role="status" aria-busy="true">
      <span className={s.srOnly}>Loading…</span>
      <Shimmer shape={skeleton} count={count} />
    </div>
  );
  return null;
}

/** Rows shown per table page. */
export const PAGE_SIZE = 25;

export interface Page<T> { rows: T[]; page: number; pages: number; total: number; size: number; setPage: (p: number) => void }

/** Slices `rows` into pages of `size` (default PAGE_SIZE); the page clamps when the row count shrinks (e.g. a filter). */
export function usePage<T>(all: T[], size = PAGE_SIZE): Page<T> {
  const [want, setPage] = useState(0);
  const pages = Math.max(1, Math.ceil(all.length / size));
  const page = Math.min(want, pages - 1);
  return { rows: all.slice(page * size, (page + 1) * size), page, pages, total: all.length, size, setPage };
}

/** Prev / next controls under a table; renders nothing while everything fits on one page. */
export function Pager<T>({ p, className }: { p: Page<T>; className?: string }) {
  if (p.pages < 2) return null;
  const from = p.page * p.size + 1;
  const to = Math.min(p.total, from + p.size - 1);
  return (
    <nav className={`${s.pager} ${className ?? ''}`} aria-label="Table pages">
      <span className={s.pagerInfo} aria-live="polite">{from}–{to} of {p.total}</span>
      <button type="button" className={s.button} disabled={p.page === 0} onClick={() => p.setPage(p.page - 1)}>Previous</button>
      <span className={s.pagerInfo}>Page {p.page + 1} of {p.pages}</span>
      <button type="button" className={s.button} disabled={p.page >= p.pages - 1} onClick={() => p.setPage(p.page + 1)}>Next</button>
    </nav>
  );
}

export interface Column<T> { key: string; label: string; render: (row: T) => ReactNode; align?: 'right' }

export function Table<T>({ rows, columns }: { rows: T[]; columns: Column<T>[] }) {
  const p = usePage(rows);
  return (
    <div className={s.tableWrap}>
      <table className={s.table}>
        <thead>
          <tr>{columns.map((c) => <th key={c.key} className={c.align === 'right' ? s.right : undefined}>{c.label}</th>)}</tr>
        </thead>
        <tbody>
          {p.rows.map((r, i) => (
            <tr key={i}>{columns.map((c) => <td key={c.key} className={c.align === 'right' ? s.right : undefined}>{c.render(r)}</td>)}</tr>
          ))}
        </tbody>
      </table>
      <Pager p={p} />
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
