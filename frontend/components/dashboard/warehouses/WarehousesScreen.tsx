'use client';

import Link from 'next/link';
import { useState, type CSSProperties, type ReactNode } from 'react';
import { PageHero } from '@/components/dashboard/PageHero';
import { Pager, Segmented, Status, SyntheticBadge, ui, usePage } from '@/components/dashboard/ui';
import { useApi } from '@/hooks/useApi';
import { int, pct, points, usd, usd2 } from '@/lib/metrics';
import type { Overview } from '../overview/OverviewScreen';
import s from './warehouses.module.css';

interface WarehouseRow {
  warehouseId: string; name: string; orders: number; cutoffMisses: number; cutoffLateRate: number; cutoffBefore11: number;
  outOfStock: number; outOfStockLateRate: number; skippedNearest: number; skippedNearestLateRate: number;
}
interface Suggestion { clientId: string; sku?: string; from: string; to: string; qty: number; reason: string }
interface Placement {
  synthetic?: boolean; week: string | null; suggestions: Suggestion[];
  impact: { week: string; suggestions: number; avoidedNextWeek: number }[];
}
/** warehouseId is null until the pipeline has been re-run with the site column. */
interface UnpaidRow { deliveryId: string; clientId: string; tier: string; warehouseId?: string | null; daysLate: number; promisedDate: string }
interface Distance { warehouseId: string; region: string; miles: number }
interface Unpaid { count: number; byTier: { tier: string; n: number }[]; rows: UnpaidRow[] }

/** Flat SLA penalty per late delivery (Halcyon contract terms). */
const PENALTY_USD = 180;
/** Orders shown before "View all orders". */
const ORDERS_PREVIEW = 5;
/** Late rate above 50% reads as hot, 35–50% as warm, anything lower as cool. */
const HOT = 0.5;
const WARM = 0.35;
const heat = (rate: number) => (rate > HOT ? 'hot' : rate >= WARM ? 'warm' : 'cool');
const HEAT_LABEL = { hot: 'Hot', warm: 'Warm', cool: 'Cool' } as const;
const sum = <T,>(rows: T[], f: (r: T) => number) => rows.reduce((t, r) => t + f(r), 0);
/** Late rate across all sites, weighted by each site's count. */
const pooled = (rows: WarehouseRow[], n: (r: WarehouseRow) => number, rate: (r: WarehouseRow) => number) =>
  sum(rows, (r) => n(r) * rate(r)) / (sum(rows, n) || 1);
/** Lowest to highest late rate across sites, e.g. "60–62%". */
const rateRange = (rows: WarehouseRow[], rate: (r: WarehouseRow) => number) => {
  const rates = rows.map((r) => Math.round(rate(r) * 100));
  const [lo, hi] = [Math.min(...rates), Math.max(...rates)];
  return lo === hi ? `${lo}%` : `${lo}–${hi}%`;
};
/** "Northwind Apparel" → "NA"; ids fall back to their last two characters. */
const initials = (name: string) => {
  const words = name.split(/\s+/).filter((w) => /^[A-Za-z]/.test(w));
  return words.length > 1 ? (words[0][0] + words[1][0]).toUpperCase() : name.slice(-2).toUpperCase();
};
const signed = (n: number) => `${n > 0 ? '+' : n < 0 ? '−' : ''}${int(Math.abs(n))}`;
/** Smallest 1 / 2 / 2.5 / 5 × 10ⁿ step at least `x`, for chart gridlines. */
const niceStep = (x: number) => {
  const p = 10 ** Math.floor(Math.log10(Math.max(x, 1)));
  return [1, 2, 2.5, 5, 10].map((m) => m * p).find((v) => v >= x) ?? 10 * p;
};

const PROBLEMS = [
  { key: 'cutoff', label: 'After cut-off', rateLabel: 'Cut-off late rate', kicker: 'Cut-off', title: 'Same-day orders placed after the 08:00 cut-off',
    effect: 'Slips a day at pick', fix: 'Fix A',
    n: (r: WarehouseRow) => r.cutoffMisses, rate: (r: WarehouseRow) => r.cutoffLateRate },
  { key: 'stock', label: 'Out of stock', rateLabel: 'Stock-out late rate', kicker: 'Stock-out', title: 'Nearest site was out of stock',
    effect: 'Ships from a farther site', fix: 'Stock placement',
    n: (r: WarehouseRow) => r.outOfStock, rate: (r: WarehouseRow) => r.outOfStockLateRate },
  { key: 'skip', label: 'Misallocated', rateLabel: 'Misallocation late rate', kicker: 'Allocation error', title: 'Shipped from another site though the nearest had stock',
    effect: null, fix: 'Fix B',
    n: (r: WarehouseRow) => r.skippedNearest, rate: (r: WarehouseRow) => r.skippedNearestLateRate },
] as const;
const VIEWS = [['cards', 'Cards'], ['table', 'Table']] as const;
type View = (typeof VIEWS)[number][0];

/**
 * Where each site sits on the network map, in a 400×240 box: on one ellipse, so a straight line between any two sites
 * never runs through a third. The angle (degrees, 0 = east) keeps the rough US geography of each warehouses.csv region:
 * West on the left, the two Midwest sites one above the other, Northeast top right, Southeast bottom right.
 */
const MAP_CENTER = { x: 200, y: 120, rx: 105, ry: 77 };
const MAP: Record<string, { x: number; y: number; angle: number }> = Object.fromEntries(
  Object.entries({ W5: 180, W1: 110, W4: 30, W3: -35, W2: -110 }).map(([id, deg]) => {
    const a = (deg * Math.PI) / 180;
    return [id, { x: MAP_CENTER.x + MAP_CENTER.rx * Math.cos(a), y: MAP_CENTER.y - MAP_CENTER.ry * Math.sin(a), angle: a }];
  }),
);
/** The two Midwest sites back each other up when one is out of stock. */
const PAIRS = [['W1', 'W2']] as const;
const pairOf = (id: string) => PAIRS.flatMap((p) => ((p as readonly string[]).includes(id) ? p.filter((x) => x !== id) : []))[0];
/** A fallback this far from the customers' region ships across the country. */
const CROSS_COUNTRY_MI = 1000;

/** 16px line icons, drawn on a 24px grid. */
const Icon = ({ children, size = 16 }: { children: ReactNode; size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6"
    strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{children}</svg>
);
const ICON = {
  clock: <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>,
  box: <><path d="M12 2 3 7v10l9 5 9-5V7l-9-5Z" /><path d="m3 7 9 5 9-5M12 12v10" /></>,
  boxes: <><path d="M3 13h8v8H3zM13 13h8v8h-8zM8 3h8v8H8z" /></>,
  site: <><path d="M3 21V8l9-5 9 5v13" /><path d="M7 21v-8h10v8M7 17h10" /></>,
  info: <><circle cx="12" cy="12" r="9" /><path d="M12 11v5M12 8h.01" /></>,
  replay: <><path d="M3 12a9 9 0 1 0 3-6.7L3 8" /><path d="M3 3v5h5" /></>,
  download: <path d="M12 4v11m-5-5 5 5 5-5M4 20h16" />,
  dollar: <path d="M12 2v20M17 6H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />,
  arrow: <path d="M5 12h14M13 6l6 6-6 6" />,
  network: <><circle cx="5" cy="6" r="2" /><circle cx="19" cy="6" r="2" /><circle cx="12" cy="18" r="2" /><path d="M7 6h10M6 8l5 8.3M18 8l-5 8.3" /></>,
  link: <><path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1" /><path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1" /></>,
  target: <><circle cx="12" cy="12" r="9" /><circle cx="12" cy="12" r="5" /><circle cx="12" cy="12" r="1" /></>,
  trend: <><path d="m3 17 6-6 4 4 8-8" /><path d="M15 7h6v6" /></>,
  alert: <><path d="M12 3 2 20h20L12 3Z" /><path d="M12 10v4M12 17h.01" /></>,
  wrench: <path d="M14.7 6.3a4 4 0 0 0 5 5L21 13l-8 8-2-2 8-8-1.3-1.3a4 4 0 0 1-5-5L11 3.4 9.6 2l2.1 2.1a4 4 0 0 0 3 2.2ZM3 21l6-6" />,
  swap: <><path d="M4 8h14l-4-4M20 16H6l4 4" /></>,
  truck: <><path d="M3 6h11v10H3zM14 9h4l3 3v4h-7" /><circle cx="7" cy="17.5" r="1.5" /><circle cx="17" cy="17.5" r="1.5" /></>,
  pin: <><path d="M12 21s-7-6.2-7-11.5a7 7 0 0 1 14 0C19 14.8 12 21 12 21Z" /><circle cx="12" cy="9.5" r="2.5" /></>,
  user: <><circle cx="12" cy="8" r="4" /><path d="M4 21a8 8 0 0 1 16 0" /></>,
  users: <><circle cx="9" cy="8" r="3.5" /><path d="M2.5 20a6.5 6.5 0 0 1 13 0M16 4.5a3.5 3.5 0 0 1 0 7M18 14a6.5 6.5 0 0 1 3.5 6" /></>,
  chart: <><path d="M4 20V10M10 20V4M16 20v-7M22 20H2" /></>,
  shield: <><path d="M12 3 4 6v6c0 4.5 3.4 8.3 8 9 4.6-.7 8-4.5 8-9V6l-8-3Z" /><path d="m9 12 2 2 4-4" /></>,
  file: <><path d="M14 3H6v18h12V7l-4-4Z" /><path d="M14 3v4h4M9 13h6M9 17h4" /></>,
  csv: <><path d="M14 3H6v18h12V7l-4-4Z" /><path d="M14 3v4h4M9 12v6M12 12v6M15 12v6M8.5 15h7" /></>,
  invoice: <><path d="M6 3h12v18l-3-2-3 2-3-2-3 2V3Z" /><path d="M14.5 8h-3.25a1.5 1.5 0 0 0 0 3h1.5a1.5 1.5 0 0 1 0 3H9.5M12 6.5V8m0 6v1.5" /></>,
  play: <path d="M7 4.5v15l12-7.5-12-7.5Z" />,
  layers: <><path d="m12 3 9 5-9 5-9-5 9-5Z" /><path d="m3 13 9 5 9-5" /></>,
  fire: <path d="M12 21c4 0 7-2.7 7-6.8 0-3.6-2.6-6-4.2-8.2-.4 2-1.4 3.3-2.8 4C12 7 10.5 4.6 8.5 3 8.9 6.5 5 8.8 5 14.2 5 18.3 8 21 12 21Z" />,
  thermo: <><path d="M10 14.8V5a2 2 0 1 1 4 0v9.8a4 4 0 1 1-4 0Z" /><path d="M12 9v7" /></>,
  snow: <path d="M12 3v18M4.2 7.5l15.6 9M4.2 16.5l15.6-9M9.5 4.5 12 7l2.5-2.5M9.5 19.5 12 17l2.5 2.5" />,
  calendar: <><rect x="3.5" y="5" width="17" height="15" rx="2" /><path d="M3.5 10h17M8 3v4M16 3v4M8 14h3v3H8z" /></>,
  dolly: <><path d="M4 3h2l3 13h11" /><circle cx="9.5" cy="19" r="2" /><path d="M10 7h8v6h-8z" /></>,
  arrowDown: <path d="M12 5v14M6 13l6 6 6-6" />,
  arrowLeft: <path d="M19 12H5M11 6l-6 6 6 6" />,
  arrowUp: <path d="M12 19V5M6 11l6-6 6 6" />,
  fileExport: <><path d="M14 3H6v18h12v-5" /><path d="M14 3v4h4v2M11 13h10M18 10l3 3-3 3" /></>,
  chevron: <path d="m9 6 6 6-6 6" />,
  truckSolid: <><path d="M2 6.5A1.5 1.5 0 0 1 3.5 5h10A1.5 1.5 0 0 1 15 6.5V9h3.4a1.5 1.5 0 0 1 1.2.6l2.1 2.8a1.5 1.5 0 0 1 .3.9v3.2a1.5 1.5 0 0 1-1.5 1.5H2Z" fill="currentColor" stroke="none" />
    <circle cx="7" cy="18" r="2.4" fill="currentColor" stroke="var(--paper)" strokeWidth="1.5" /><circle cx="17" cy="18" r="2.4" fill="currentColor" stroke="var(--paper)" strokeWidth="1.5" /></>,
  headset: <><path d="M4 14v-2a8 8 0 0 1 16 0v2" /><path d="M4 14h3v5H5a1 1 0 0 1-1-1v-4ZM20 14h-3v5h2a1 1 0 0 0 1-1v-4ZM17 19c0 1.5-2 2-5 2" /></>,
  carry: <><circle cx="7" cy="4.5" r="1.8" /><circle cx="17" cy="4.5" r="1.8" /><path d="M5 21v-6L4 9.5 7 8l3 3h4l3-3 3 1.5-1 5.5v6M9 11h6v4H9z" /></>,
  tie: <><circle cx="12" cy="6.5" r="3.5" /><path d="M4.5 21a7.5 7.5 0 0 1 15 0M12 11l-1.2 2 1.2 5 1.2-5L12 11Z" /></>,
  crosshair: <><circle cx="12" cy="12" r="7" /><circle cx="12" cy="12" r="2.6" fill="currentColor" stroke="none" /><path d="M12 2v3M12 19v3M2 12h3M19 12h3" /></>,
  lifering: <><circle cx="12" cy="12" r="9" /><circle cx="12" cy="12" r="4" /><path d="m5.6 5.6 3.6 3.6M14.8 14.8l3.6 3.6M18.4 5.6l-3.6 3.6M9.2 14.8l-3.6 3.6" /></>,
  map: <><path d="M9 4 3 6.5v13.5l6-2.5 6 2.5 6-2.5V4l-6 2.5L9 4Z" /><path d="M9 4v13.5M15 6.5V20" /></>,
};
/** Solid cause glyphs (clock, open box) and a shuffle for misallocation, as in the design. */
const CAUSE_ICON = {
  cutoff: <><circle cx="12" cy="12" r="10" fill="currentColor" stroke="none" /><path d="M12 7v5.2l3.2 2" stroke="var(--surface)" strokeWidth="2" /></>,
  stock: <><path d="M3.5 10h17v9a1.5 1.5 0 0 1-1.5 1.5H5A1.5 1.5 0 0 1 3.5 19v-9Z" fill="currentColor" stroke="none" />
    <path d="M1.5 6.5 6 3.5l6 3 6-3 4.5 3-3.5 2.5-7-3-7 3-3.5-2.5Z" fill="currentColor" stroke="none" /><path d="M9.5 13.5h5" stroke="var(--surface)" strokeWidth="1.8" /></>,
  skip: <path d="M3 7h3.5c2 0 3 1 4.5 3.5l2 3c1.5 2.5 2.5 3.5 4.5 3.5H21M3 17h3.5c1.3 0 2.2-.4 3-1.4M14.5 8.4c.8-1 1.7-1.4 3-1.4H21M18 4l3 3-3 3M18 14l3 3-3 3" strokeWidth="1.9" />,
};
const HEAT_ICON = { hot: ICON.fire, warm: ICON.thermo, cool: ICON.snow };
const EFFECT_ICON = { cutoff: ICON.calendar, stock: ICON.boxes, skip: null };
const FIX_ICON = { cutoff: ICON.wrench, stock: ICON.dolly, skip: ICON.wrench };

function downloadCsv(name: string, lines: (string | number)[][]) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([lines.map((l) => l.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\n')], { type: 'text/csv' }));
  a.download = name;
  a.click();
  URL.revokeObjectURL(a.href);
}
const exportSites = (rows: WarehouseRow[]) => downloadCsv('warehouses-pre-pickup.csv', [
  ['warehouse_id', 'name', 'orders', ...PROBLEMS.flatMap((x) => [`${x.key}_orders`, `${x.key}_late_rate`])],
  ...rows.map((r) => [r.warehouseId, r.name, r.orders, ...PROBLEMS.flatMap((x) => [x.n(r), x.rate(r).toFixed(4)])]),
]);
const exportUnpaid = (rows: UnpaidRow[]) => downloadCsv('unrecorded-penalties.csv', [
  ['delivery_id', 'client_id', 'tier', 'warehouse_id', 'days_late', 'promised_date'],
  ...rows.map((r) => [r.deliveryId, r.clientId, r.tier, r.warehouseId ?? '', r.daysLate, r.promisedDate]),
]);

/** Card heading: title and one-line description on the left, optional tags or tools on the right. */
function Head({ title, sub, children }: { title: ReactNode; sub?: string; children?: ReactNode }) {
  return (
    <div className={s.head}>
      <div>
        <h2 className={s.h2}>{title}</h2>
        {sub && <p className={s.sub}>{sub}</p>}
      </div>
      {children && <div className={s.tools}>{children}</div>}
    </div>
  );
}

/**
 * Every site on a rough US map, pin size following order volume. One site is in focus (the hero's site filter, or the
 * pin last selected); a line runs to it from every other site, labelled with the miles that site ships to reach the
 * focus site's customer region (warehouse_region_distance_miles.csv). Site-to-site miles are not in the data.
 */
/** Where the map sits beside `n` cards: rows it spans next to 3 columns, columns left over in the last row of 5. */
function cardSlots(n: number): CSSProperties {
  return { '--rows3': Math.max(1, Math.ceil(n / 3)), '--rest5': 5 - (n % 5) } as CSSProperties;
}

function SiteMap({ sites, distances, active }: { sites: WarehouseRow[]; distances: Distance[]; active: string }) {
  const [picked, setPicked] = useState<string | null>(null);
  const max = Math.max(1, ...sites.map((r) => r.orders));
  const placed = sites.filter((r) => MAP[r.warehouseId]);
  const miles = (from: string, region?: string) => distances.find((d) => d.warehouseId === from && d.region === region)?.miles;
  /** A site's home region is the one it is nearest to. */
  const home = (id: string) => distances.filter((d) => d.warehouseId === id).sort((a, b) => a.miles - b.miles)[0]?.region;
  const focus = (active !== 'all' ? active : picked) ?? placed[0]?.warehouseId;
  const region = focus ? home(focus) : undefined;
  const radius = (r: WarehouseRow) => 9 + 7 * Math.sqrt(r.orders / max);
  /** Name labels sit outside the ellipse, away from every line: beside side sites, above or below top and bottom ones. */
  const labelAt = (angle: number, rad: number) => {
    const [cx, cy] = [Math.cos(angle), Math.sin(angle)];
    if (Math.abs(cx) < 0.5) return { dx: 0, dy: cy > 0 ? -rad - 9 : rad + 15, anchor: 'middle' as const };
    return { dx: Math.sign(cx) * (rad + 7), dy: 3, anchor: cx > 0 ? ('start' as const) : ('end' as const) };
  };
  const spokes = focus && region ? placed.filter((r) => r.warehouseId !== focus).flatMap((r) => {
    const mi = miles(r.warehouseId, region);
    if (mi == null) return [];
    const kind = pairOf(focus) === r.warehouseId ? 'pair' : mi >= CROSS_COUNTRY_MI ? 'cross' : 'near';
    return [{ id: r.warehouseId, mi, kind }];
  }) : [];
  const choose = (id: string) => { if (active === 'all') setPicked(id); };
  return (
    <figure className={s.map}>
      <figcaption className={s.mapHead}>
        <span><Icon size={14}>{ICON.map}</Icon>Site network</span>
        <span>Pin size = order volume</span>
      </figcaption>
      <svg viewBox="0 0 400 240" role="group" aria-label="Site network">
        {spokes.map(({ id, mi, kind }) => {
          const a = MAP[id], b = MAP[focus!];
          const [mx, my] = [(a.x + b.x) / 2, (a.y + b.y) / 2];
          /** Nudge the label off the line, perpendicular to it. */
          const len = Math.hypot(b.x - a.x, b.y - a.y) || 1;
          const [ox, oy] = [(-(b.y - a.y) / len) * 9, ((b.x - a.x) / len) * 9];
          return (
            <g key={id} className={`${s.spoke} ${s[kind]}`}>
              <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} />
              <text x={mx + ox} y={my + oy + 3} textAnchor="middle">{int(mi)} mi</text>
            </g>
          );
        })}
        {placed.map((r, i) => {
          const { x, y, angle } = MAP[r.warehouseId];
          const rad = radius(r);
          const l = labelAt(angle, rad + 5);
          const on = r.warehouseId === focus;
          const dim = active !== 'all' && !on;
          return (
            <g key={r.warehouseId} className={`${s.pinGroup} ${s[r.warehouseId.toLowerCase()] ?? ''} ${on ? s.pinOn : ''} ${dim ? s.dim : ''}`}
              style={{ '--i': i } as CSSProperties}
              role="button" tabIndex={active === 'all' ? 0 : -1} aria-pressed={on}
              aria-label={`${r.warehouseId} ${r.name}, ${int(r.orders)} orders`}
              onClick={() => choose(r.warehouseId)}
              onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); choose(r.warehouseId); } }}>
              <circle cx={x} cy={y} r={rad + 5} className={s.halo} />
              <circle cx={x} cy={y} r={rad} className={s.node} />
              <text x={x} y={y + 3.5} textAnchor="middle" className={s.nodeText}>{r.warehouseId}</text>
              <text x={x + l.dx} y={y + l.dy} textAnchor={l.anchor} className={s.pinLabel}>
                {r.name} · {int(r.orders)}
              </text>
            </g>
          );
        })}
      </svg>
      <div className={s.mapFoot}>
        <p className={s.mapKey}>
          <span><i className={s.keyPair} />Paired fallback</span>
          <span><i className={s.keyNear} />Same half of the country</span>
          <span><i className={s.keyCross} />Cross-country (≥{int(CROSS_COUNTRY_MI)} mi)</span>
        </p>
        {focus && region && (
          <p className={s.mapFocus}>
            <span>Miles to <b>{focus}</b>&apos;s {region} customers{miles(focus, region) != null && <> · {focus} itself {int(miles(focus, region))} mi</>}</span>
            {active === 'all' && <small>Select a site to compare</small>}
          </p>
        )}
      </div>
    </figure>
  );
}

/** A 24-hour dial: the 06:00–08:00 orders already made same day, the 08:00–11:00 window the second wave catches, and after 11:00. */
function PickDial({ moved, after }: { moved: number; after: number }) {
  const r = 70, c = 2 * Math.PI * r;
  const arc = (from: number, to: number) => ({ strokeDasharray: `${(c * (to - from)) / 24} ${c}`, strokeDashoffset: (-c * from) / 24 });
  const hand = (h: number, len: number) => {
    const a = (h / 24) * 2 * Math.PI;
    return { x1: 95, y1: 95, x2: 95 + len * Math.sin(a), y2: 95 - len * Math.cos(a) };
  };
  return (
    <svg viewBox="0 0 190 190" className={s.dial} role="img"
      aria-label={`${int(moved)} orders arrive 08:00–11:00 and make the 11:00 wave; ${int(after)} arrive after 11:00`}>
      <circle cx="95" cy="95" r="84" className={s.dialFace} />
      <circle cx="95" cy="95" r={r} className={s.arcRest} />
      <g transform="rotate(-90 95 95)">
        <circle cx="95" cy="95" r={r} className={s.arcBefore} style={arc(6, 8)} />
        <circle cx="95" cy="95" r={r} className={s.arcWave} style={arc(8, 11)} />
        <circle cx="95" cy="95" r={r} className={s.arcAfter} style={arc(11, 24)} />
      </g>
      {[['00', 95, 14], ['06', 180, 99], ['12', 95, 186], ['18', 10, 99]].map(([t, x, y]) => (
        <text key={t} x={x} y={y} textAnchor="middle" className={s.dialTick}>{t}</text>
      ))}
      <line {...hand(8, 62)} className={s.hand} />
      <line {...hand(11, 70)} className={s.handWave} />
      {/* Both hands point below the hub, so the labels sit above it. */}
      <text x="95" y="60" textAnchor="middle" className={s.dialNote}>08:00 cut-off</text>
      <text x="95" y="76" textAnchor="middle" className={s.dialWave}>11:00 wave</text>
      <circle cx="95" cy="95" r="5" className={s.hub} />
    </svg>
  );
}

export function WarehousesScreen() {
  const [site, setSite] = useState('all');
  const [view, setView] = useState<View>('cards');
  const w = useApi<{
    warehouses: WarehouseRow[]; secondPick: { movedOrders: number; onTime: number | null };
    freightPerOrder?: { nearest: number | null; otherSite: number | null }; distances?: Distance[];
  }>('/api/warehouses');
  const o = useApi<Overview>('/api/overview');
  const p = useApi<Placement>('/api/placement');
  const u = useApi<Unpaid>('/api/penalties/unpaid');
  const acc = useApi<{ accounts: { clientId: string; clientName: string }[] }>('/api/accounts');
  const r = useApi<{ scenarios: { scenario: string; onTime: number }[] }>('/api/replay?segment=all');
  // Fix B's effect is the Replay "warehouse fallback" step: on top of the cut-off fix, at expected adoption.
  const step = (k: string) => r.data?.scenarios.find((x) => x.scenario === k)?.onTime;
  const fallbackFrom = step('adopt_cutoff');
  const fallbackTo = step('adopt_warehouse');

  const all = w.data?.warehouses ?? [];
  const rows = site === 'all' ? all : all.filter((r) => r.warehouseId === site);
  const totals = PROBLEMS.map((x) => ({ ...x, total: sum(rows, x.n), late: pooled(rows, x.n, x.rate) }));
  /** Spread of the two volume causes across every site; skipped-nearest is too small to compare. */
  const spread = Math.max(...PROBLEMS.slice(0, 2).map((x) => {
    const rates = all.map((r) => x.rate(r) * 100);
    return Math.round(Math.max(...rates) - Math.min(...rates));
  }));
  const allTotal = sum(all, (r) => r.orders) || 1;
  const siteOrders = sum(rows, (r) => r.orders);
  const siteName = (id: string) => all.find((r) => r.warehouseId === id)?.name ?? id;
  const pick = w.data?.secondPick;
  const freight = w.data?.freightPerOrder;
  const freightMax = Math.max(freight?.nearest ?? 0, freight?.otherSite ?? 0) || 1;
  const moved = sum(rows, (r) => r.cutoffBefore11);
  const stillLate = totals[0].total - moved;
  const allSkip = sum(all, PROBLEMS[2].n);
  const names = new Map((acc.data?.accounts ?? []).map((a) => [a.clientId, a.clientName]));
  const clientName = (id: string) => names.get(id) ?? id;

  const suggestions = p.data?.suggestions ?? [];
  /** Units each site receives and sends in this week's moves; net > 0 means the site is topped up. */
  const flow = [...new Set(suggestions.flatMap((r) => [r.from, r.to]))].sort().map((id) => {
    const inUnits = sum(suggestions.filter((r) => r.to === id), (r) => r.qty);
    const outUnits = sum(suggestions.filter((r) => r.from === id), (r) => r.qty);
    return { id, inUnits, outUnits, net: inUnits - outUnits };
  });
  const flowMax = Math.max(1, ...flow.flatMap((f) => [f.inUnits, f.outUnits]));
  const tick = niceStep(flowMax / 4);
  const scaleMax = tick * Math.ceil(flowMax / tick);
  const ticks = Array.from({ length: scaleMax / tick + 1 }, (_, i) => i * tick);
  const qtyMax = Math.max(1, ...suggestions.map((r) => r.qty));
  const clients = new Set(suggestions.map((r) => r.clientId)).size;
  const impact = p.data?.impact.find((i) => i.week === p.data?.week) ?? p.data?.impact.at(-1);

  const tiers = u.data?.byTier ?? [];
  const tierTotal = sum(tiers, (t) => t.n) || 1;
  const topTier = [...tiers].sort((a, b) => b.n - a.n)[0];

  const sitePage = usePage(rows);
  const placementPage = usePage(suggestions, 8);
  /** The order list opens on its first few rows; "View all orders" pages through every listed row. */
  const [allOrders, setAllOrders] = useState(false);
  const unpaidRows = u.data?.rows ?? [];
  const unpaidPage = usePage(unpaidRows, 10);
  const shownOrders = allOrders ? unpaidPage.rows : unpaidRows.slice(0, ORDERS_PREVIEW);
  const hasSite = unpaidRows.some((r) => r.warehouseId);

  return (
    <div className={s.screen}>
      <div className={s.pageHead}>
        <div>
          <p className={s.eyebrow}>Before pickup</p>
          <h1 className={s.title}>Warehouses</h1>
        </div>
        <div className={s.actions}>
          <button type="button" className={s.chip} disabled={rows.length === 0} onClick={() => exportSites(rows)}>
            <Icon size={14}>{ICON.csv}</Icon>Export CSV
          </button>
          <Link className={s.chip} href="/dashboard/replay"><Icon size={14}>{ICON.play}</Icon>Open replay</Link>
        </div>
      </div>

      <PageHero image="/media/warehouses-hero.jpg" imagePosition="center 62%" variant="metric" chipsAt="top"
        eyebrow={<span title="Orders hit by each warehouse cause, summed; an order with two causes counts twice">Orders hit by a warehouse cause</span>}
        title={all.length > 0 ? int(sum(totals, (x) => x.total)) : '—'}
        text="Delivery failures that start at the warehouse, before a carrier collects the order, and the fixes that would remove them."
        chips={all.length > 0 ? [{ label: 'Sites', value: site === 'all' ? all.length : site }] : undefined}>
        <div className={s.heroTools}>
          <div className={s.siteSeg} role="group" aria-label="Site">
            <button type="button" aria-pressed={site === 'all'} onClick={() => setSite('all')}><Icon size={14}>{ICON.layers}</Icon>All sites</button>
            {all.map((r) => (
              <button key={r.warehouseId} type="button" aria-pressed={site === r.warehouseId} title={r.name}
                onClick={() => setSite(r.warehouseId)}>{r.warehouseId}</button>
            ))}
          </div>
          <label className={s.sitePick}>
            <span className={s.sitePickIcon}><Icon size={14}>{ICON.layers}</Icon></span>
            <span className={ui.srOnly}>Site</span>
            <select value={site} onChange={(e) => setSite(e.target.value)}>
              <option value="all">All sites</option>
              {all.map((r) => <option key={r.warehouseId} value={r.warehouseId}>{r.warehouseId} · {r.name}</option>)}
            </select>
            <span className={s.sitePickCaret}><Icon size={14}>{ICON.chevron}</Icon></span>
          </label>
        </div>
      </PageHero>

      {u.data && u.data.count > 0 && (
        <div className={s.alert} role="note">
          <span className={s.alertIcon}><Icon>{ICON.invoice}</Icon></span>
          <p><b>{int(u.data.count)} late deliveries</b> have no penalty record for clients with a penalty clause.
            At the flat {usd(PENALTY_USD)} SLA penalty, that is up to <b>{usd(u.data.count * PENALTY_USD)}</b> unaccounted for.</p>
          <a href="#finance">Review in finance<Icon size={14}>{ICON.arrowDown}</Icon></a>
        </div>
      )}

      <Status loading={w.loading} error={w.error} skeleton="cards" count={3} />
      {rows.length > 0 && (
        <>
          <section className={s.panel}>
            <Head title="Warehouse causes of lateness"
              sub="Three causes that start inside the warehouse, before carrier collection. Colour shows how often each one arrives late.">
              <p className={s.heatKey}><span>Late rate</span>
                <span className={`${s.heat} ${s.cool}`}>Cool &lt;35%</span>
                <span className={`${s.heat} ${s.warm}`}>Warm 35–50%</span>
                <span className={`${s.heat} ${s.hot}`}>Hot &gt;50%</span>
              </p>
            </Head>
            <div className={s.causes}>
              {totals.map((x, i) => {
                const h = heat(x.late);
                return (
                  <article key={x.key} className={s.cause} style={{ '--i': i } as CSSProperties}>
                    <div className={s.causeTop}>
                      <span className={s.causeIcon}><Icon>{CAUSE_ICON[x.key]}</Icon></span>
                      <span className={`${s.heat} ${s[h]}`}><Icon size={12}>{HEAT_ICON[h]}</Icon>{HEAT_LABEL[h]}</span>
                    </div>
                    <div>
                      <p className={s.kicker}>{x.kicker}</p>
                      <h3 className={s.h3}>{x.title}</h3>
                    </div>
                    <div className={s.causeFigures}>
                      <div><b className={s.big}>{int(x.total)}</b><small>orders affected</small></div>
                      <div><b className={`${s.big} ${s[`${h}Ink`]}`}>{Math.round(x.late * 100)}<em>%</em></b><small>arrive late</small></div>
                    </div>
                    <span className={s.causeBar} role="img" aria-label={`${pct(x.late, 0)} late; warm from ${pct(WARM, 0)}, hot above ${pct(HOT, 0)}`}>
                      <span className={s[h]} style={{ width: pct(x.late) }} />
                      <i style={{ left: pct(WARM) }} />
                      <i style={{ left: pct(HOT) }} />
                    </span>
                    <p className={s.causeFoot}>
                      {EFFECT_ICON[x.key]
                        ? <span><Icon size={13}>{EFFECT_ICON[x.key]}</Icon>{x.effect}</span>
                        : <span className={s.target}><Icon size={12}>{ICON.target}</Icon>Target: 0</span>}
                      <span className={s.fixLink}><Icon size={12}>{FIX_ICON[x.key]}</Icon>{x.fix}</span>
                    </p>
                  </article>
                );
              })}
            </div>
          </section>

          <section className={s.panel}>
            <Head title="Sites" sub="The same three causes, broken down by warehouse." />
            <div className={s.panelBar}>
              <span className={s.meta}><Icon size={14}>{ICON.site}</Icon>{rows.length} {rows.length === 1 ? 'site' : 'sites'} · {int(siteOrders)} orders</span>
              <Segmented label="Sites view" value={view} options={VIEWS} onChange={setView} />
            </div>
            {view === 'cards' ? (
              <div className={s.sitesBody}>
                <div className={s.siteGrid} style={cardSlots(rows.length + (rows.length > 1 ? 1 : 0))}>
                  {rows.map((r, i) => {
                    const pair = pairOf(r.warehouseId);
                    return (
                      <article key={r.warehouseId} className={s.site} style={{ '--i': i } as CSSProperties}>
                        <div className={s.siteHead}>
                          <div><b>{r.warehouseId} · {r.name}</b><small>{pair ? 'Paired site' : 'Regional site'}</small></div>
                          {pair && <span className={s.pairChip}><Icon size={12}>{ICON.swap}</Icon>Pair {pair}</span>}
                        </div>
                        <p className={s.siteOrders} title={`${pct(r.orders / allTotal)} of all orders`}><b>{int(r.orders)}</b> orders</p>
                        <ul className={s.siteMetrics}>
                          {PROBLEMS.map((x) => (
                            <li key={x.key}>
                              <span><Icon size={13}>{CAUSE_ICON[x.key]}</Icon>{x.label}<small>· {int(x.n(r))}</small></span>
                              <span className={`${s.heat} ${s[heat(x.rate(r))]}`}>{pct(x.rate(r), 0)}</span>
                            </li>
                          ))}
                        </ul>
                      </article>
                    );
                  })}
                  {rows.length > 1 && (
                    <article className={`${s.site} ${s.network}`} style={{ '--i': rows.length } as CSSProperties}>
                      <div className={s.siteHead}>
                        <div><b>Network</b><small>All {rows.length} sites</small></div>
                      </div>
                      <p className={s.siteOrders}><b>{int(siteOrders)}</b> orders</p>
                      <ul className={s.siteMetrics}>
                        {PROBLEMS.map((x) => (
                          <li key={x.key}>
                            <span><Icon size={13}>{CAUSE_ICON[x.key]}</Icon>{x.rateLabel}</span>
                            <b>{rateRange(rows, x.rate)}</b>
                          </li>
                        ))}
                      </ul>
                    </article>
                  )}
                  <SiteMap sites={all} distances={w.data?.distances ?? []} active={site} />
                </div>
              </div>
            ) : (
              <div className={s.flush}>
                <div className={ui.tableWrap}>
                  <table className={`${s.table} ${s.stack}`}>
                    <thead>
                      <tr>
                        <th>Site</th><th className={s.right}>Orders</th>
                        {PROBLEMS.map((x) => <th key={x.key} className={s.right}>{x.label}</th>)}
                      </tr>
                    </thead>
                    <tbody>
                      {sitePage.rows.map((r) => (
                        <tr key={r.warehouseId}>
                          <td><span className={s.code}>{r.warehouseId}</span>{r.name}</td>
                          <td className={`${s.right} ${s.num}`} data-label="Orders">{int(r.orders)}</td>
                          {PROBLEMS.map((x) => (
                            <td key={x.key} className={`${s.right} ${s.num}`} data-label={x.label}>
                              {int(x.n(r))} <small>{pct(x.n(r) / r.orders)}</small>{' '}
                              <span className={`${s.heat} ${s[heat(x.rate(r))]}`}>{pct(x.rate(r), 0)}</span>
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                    {rows.length > 1 && (
                      <tfoot>
                        <tr>
                          <td><b>All sites</b></td>
                          <td className={`${s.right} ${s.num}`} data-label="Orders">{int(siteOrders)}</td>
                          {totals.map((x) => <td key={x.key} className={`${s.right} ${s.num}`} data-label={x.label}>{int(x.total)}</td>)}
                        </tr>
                      </tfoot>
                    )}
                  </table>
                </div>
                <Pager p={sitePage} className={s.pager} />
              </div>
            )}
            {all.length > 1 && (
              <p className={s.note}>
                <Icon>{ICON.info}</Icon>
                <span><b>Late rates are close across all {all.length} sites</b> (within {spread} points for each cause). These are company-wide rules to change, not one problem warehouse.</span>
              </p>
            )}
          </section>

          <section className={s.panel}>
            <Head title="Fixes to decide" />
            <div className={s.fixes}>
              <article className={s.fix}>
                <div className={s.fixHead}>
                  <div>
                    <p className={s.kicker}>Fix A · Cut-off</p>
                    <h3 className={s.fixTitle}>Second pick wave at 11:00</h3>
                    <p className={s.body}>
                      Orders placed 08:00–11:00 ship the same day. Later orders get a cut-off-aware promise at checkout.
                    </p>
                  </div>
                  {pick?.onTime != null && o.data && (
                    <span className={s.gain} title={`${pct(o.data.onTime)} → ${pct(pick.onTime)} on time, this fix alone`}>
                      <Icon size={13}>{ICON.trend}</Icon>+{points(pick.onTime - o.data.onTime)} pts
                    </span>
                  )}
                </div>
                <div className={s.wave}>
                  <PickDial moved={moved} after={stillLate} />
                  <ul className={s.waveList}>
                    <li><i className={s.keyBefore} /><span>06:00–08:00 · already same day</span></li>
                    <li className={s.waveHit}><i className={s.keyWave} /><span>08:00–11:00 · now same day</span><b>{int(moved)}</b></li>
                    <li><i className={s.keyAfter} /><span>After 11:00 · next-day promise</span><b>{int(stillLate)}</b></li>
                  </ul>
                </div>
                {pick?.onTime != null && o.data && (
                  <p className={s.fixNote}>On time <b>{pct(o.data.onTime)} → {pct(pick.onTime)}</b> with this fix alone</p>
                )}
                <div className={s.fixFoot}>
                  <span className={s.owners}><small>Owners</small><span className={`${s.owner} ${s.navy}`}><Icon size={12}>{ICON.headset}</Icon>Sales ops</span><span className={`${s.owner} ${s.teal}`}><Icon size={12}>{ICON.carry}</Icon>Warehouse teams</span></span>
                  <Link className={s.primary} href="/dashboard/replay"><Icon>{ICON.replay}</Icon>Simulate in replay</Link>
                </div>
              </article>

              <article className={s.fix}>
                <div className={s.fixHead}>
                  <div>
                    <p className={s.kicker}>Fix B · Allocation</p>
                    <h3 className={s.fixTitle}>Ship from the nearest site with stock</h3>
                    <p className={s.body}>
                      Each order follows a fixed fallback order, so it ships across the country only as a last resort.
                    </p>
                  </div>
                  {fallbackFrom != null && fallbackTo != null && (
                    <span className={s.gain} title={`${pct(fallbackFrom)} → ${pct(fallbackTo)} on time: the warehouse fallback step in Replay, at expected adoption`}>
                      <Icon size={13}>{ICON.trend}</Icon>+{points(fallbackTo - fallbackFrom)} pts
                    </span>
                  )}
                </div>
                <ol className={s.chain}>
                  <li className={s.chainFirst}><Icon size={18}>{ICON.crosshair}</Icon><b>Nearest site</b><small>if in stock</small></li>
                  <li className={s.chainArrow} aria-hidden="true"><Icon size={12}>{ICON.chevron}</Icon></li>
                  <li className={s.chainPair}><Icon size={18}>{ICON.swap}</Icon><b>Paired site</b><small>{PAIRS.map(([a, b]) => `${a} ↔ ${b}`).join(' · ')}</small></li>
                  <li className={s.chainArrow} aria-hidden="true"><Icon size={12}>{ICON.chevron}</Icon></li>
                  <li className={s.chainHub}><Icon size={18}>{ICON.lifering}</Icon><b>Closest with stock</b><small>by miles</small></li>
                  <li className={s.chainArrow} aria-hidden="true"><Icon size={12}>{ICON.chevron}</Icon></li>
                  <li className={s.chainLast}><Icon size={18}>{ICON.truckSolid}</Icon><b>Cross-country</b><small>last resort</small></li>
                </ol>
                <div className={s.freight}>
                  <div className={s.freightRow}>
                    <span><Icon size={16}>{ICON.crosshair}</Icon>Nearest site</span>
                    <span className={s.track}><span className={s.good} style={{ width: `${((freight?.nearest ?? 0) / freightMax) * 100}%` }} /></span>
                    <b className={s.gainText}>{usd2(freight?.nearest)}</b>
                  </div>
                  <div className={s.freightRow}>
                    <span className={s.hotText}><Icon size={16}>{CAUSE_ICON.skip}</Icon>Wrong site</span>
                    <span className={s.track}><span className={s.hot} style={{ width: `${((freight?.otherSite ?? 0) / freightMax) * 100}%` }} /></span>
                    <b className={s.hotText}>{usd2(freight?.otherSite)}</b>
                  </div>
                </div>
                <p className={s.fixNote} title="Freight averaged across all sites">Freight per order · misallocated orders <b>{int(allSkip)} → 0</b></p>
                <div className={s.fixFoot}>
                  <span className={s.owners}><small>Owner</small><span className={`${s.owner} ${s.plum}`}><Icon size={12}>{ICON.tie}</Icon>Warehouse supervisors</span></span>
                  <Link className={s.primary} href="/dashboard/replay"><Icon>{ICON.replay}</Icon>Simulate in replay</Link>
                </div>
              </article>
            </div>
          </section>
        </>
      )}

      <section className={s.panel}>
        <Head title={<>Weekly stock placement {p.data?.synthetic && <SyntheticBadge />}</>} />
        <Status loading={p.loading} error={p.error} skeleton="rows" count={4} />
        {suggestions.length > 0 && (
          <>
            <div className={s.tiles}>
              <div className={s.tile}><span className={s.tileIcon}><Icon>{ICON.boxes}</Icon></span>
                <span><small>Units to move</small><b>{int(sum(suggestions, (r) => r.qty))}</b></span></div>
              <div className={s.tile}><span className={s.tileIcon}><Icon>{ICON.swap}</Icon></span>
                <span><small>Suggested moves</small><b>{int(suggestions.length)} <em>across {int(clients)} {clients === 1 ? 'client' : 'clients'}</em></b></span></div>
              {impact && (
                <div className={`${s.tile} ${s.tileGood}`}><span className={s.tileIcon}><Icon>{ICON.shield}</Icon></span>
                  <span><small>Stock-outs avoided</small><b>{int(impact.avoidedNextWeek)} <em>next week</em></b></span></div>
              )}
              <div className={s.tile}><span className={s.tileIcon}><Icon>{ICON.site}</Icon></span>
                <span><small>Sites topped up</small><b>{flow.filter((f) => f.net > 0).length} <em>from {flow.filter((f) => f.net < 0).length} donor sites</em></b></span></div>
            </div>

            <div className={s.placeBody}>
              <figure className={s.box}>
                <figcaption className={s.boxHead}>
                  <b>Units in and out by site</b>
                  <span className={s.legend}><span><i className={s.keyOut} />Sent</span><span><i className={s.keyIn} />Received</span></span>
                </figcaption>
                <div className={`${s.boxBody} ${s.plot}`}>
                  <div className={s.yAxis} aria-hidden="true">
                    {ticks.map((t) => <span key={t} style={{ bottom: `${(t / scaleMax) * 100}%` }}>{int(t)}</span>)}
                  </div>
                  <div className={s.colsScroll}>
                    <div className={s.cols} role="img" aria-label={flow.map((f) => `${f.id}: ${int(f.inUnits)} in, ${int(f.outUnits)} out`).join('; ')}>
                      <div className={s.gridLines} aria-hidden="true">
                        {ticks.map((t) => <i key={t} style={{ bottom: `${(t / scaleMax) * 100}%` }} />)}
                      </div>
                      {flow.map((f, i) => (
                        <div key={f.id} className={s.col} style={{ '--i': i } as CSSProperties}>
                          <div className={s.colBars}>
                            <span className={s.barOut} style={{ '--h': `${(f.outUnits / scaleMax) * 100}%` } as CSSProperties}>{f.outUnits > 0 && <b>{int(f.outUnits)}</b>}</span>
                            <span className={s.barIn} style={{ '--h': `${(f.inUnits / scaleMax) * 100}%` } as CSSProperties}>{f.inUnits > 0 && <b>{int(f.inUnits)}</b>}</span>
                          </div>
                          <p className={s.colLabel}><b>{f.id} · {siteName(f.id)}</b><small className={f.net > 0 ? s.gainText : undefined}>net {signed(f.net)}</small></p>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </figure>
            </div>

            <div className={s.subHead}><b>Suggested moves</b><small>Sorted by units</small></div>
            <div className={s.flush}>
              <div className={ui.tableWrap}>
                <table className={`${s.table} ${s.stack}`}>
                  <thead><tr><th>Client</th><th>Move</th><th className={s.right}>Units</th><th>Why</th></tr></thead>
                  <tbody>
                    {placementPage.rows.map((r, i) => (
                      <tr key={i}>
                        <td>
                          <span className={s.client}><span className={s.avatar} aria-hidden="true">{initials(clientName(r.clientId))}</span>
                            <span>{clientName(r.clientId)}{r.sku && <small>{r.sku}</small>}</span></span>
                        </td>
                        <td data-label="Move"><span className={s.move}><span className={s.code}>{r.from}</span><Icon size={12}>{ICON.arrow}</Icon><span className={s.code}>{r.to}</span></span></td>
                        <td data-label="Units" className={s.right}>
                          <span className={s.units}><span className={s.unitBar}><span style={{ width: `${(r.qty / qtyMax) * 100}%` }} /></span><b className={s.num}>{int(r.qty)}</b></span>
                        </td>
                        <td data-label="Why" className={s.why}>{r.reason}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <Pager p={placementPage} className={s.pager} />
            </div>
          </>
        )}
        {p.data && suggestions.length === 0 && (
          <div className={s.empty}>
            <span className={s.causeIcon}><Icon size={20}>{ICON.boxes}</Icon></span>
            <b>No placement suggestions yet</b>
            <p>Run the weekly placement job to see which SKUs to move between sites,
              with units and the stock-outs each move prevents.</p>
          </div>
        )}
      </section>

      <section id="finance" className={s.finance}>
        <div className={`${s.head} ${s.financeHead}`}>
          <div>
            <h2 className={s.h2}>Unrecorded SLA penalties</h2>
            <p className={s.sub}>Late deliveries to clients with a penalty clause where no penalty has been recorded.</p>
          </div>
          {u.data && (
            <button type="button" className={s.button} disabled={u.data.rows.length === 0} onClick={() => exportUnpaid(u.data!.rows)}>
              <Icon>{ICON.fileExport}</Icon>Export orders
            </button>
          )}
        </div>
        <div className={s.financePad}><Status loading={u.loading} error={u.error} /></div>
        {u.data && (
          <>
            <div className={s.financeTop}>
              <div className={s.figures}>
                <div><small>Late orders, no record</small><b className={s.big}>{int(u.data.count)}</b><span>with a penalty clause</span></div>
                <div><small>SLA penalty</small><b className={s.big}>{usd(PENALTY_USD)}</b><span>flat, per late order</span></div>
                <div><small>Potential exposure</small><b className={`${s.big} ${s.hotText}`}>{usd(u.data.count * PENALTY_USD)}</b><span>{int(u.data.count)} × {usd(PENALTY_USD)}</span></div>
                {topTier && <div><small>Largest tier</small><b className={s.big}>{topTier.tier}</b><span>{pct(topTier.n / tierTotal, 0)} of exposure</span></div>}
              </div>
              <div className={`${s.financeSide} ${s.flush}`}>
                <div className={s.subHead}><b>Exposure by client tier</b><small>USD</small></div>
                <table className={`${s.table} ${s.tierTable}`}>
                  <thead><tr><th>Tier</th><th className={s.right}>Orders</th><th className={s.right}>Exposure</th><th className={s.right}>Share</th></tr></thead>
                  <tbody>
                    {tiers.map((t) => (
                      <tr key={t.tier}>
                        <td>{t.tier}<span className={s.tierBar}><span style={{ width: pct(t.n / tierTotal) }} /></span></td>
                        <td className={`${s.right} ${s.num}`}>{int(t.n)}</td>
                        <td className={`${s.right} ${s.num}`}>{int(t.n * PENALTY_USD)}</td>
                        <td className={`${s.right} ${s.num}`}>{pct(t.n / tierTotal, 0)}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr>
                      <td>Total</td>
                      <td className={`${s.right} ${s.num}`}>{int(tierTotal)}</td>
                      <td className={`${s.right} ${s.num}`}>{int(tierTotal * PENALTY_USD)}</td>
                      <td className={`${s.right} ${s.num}`}>100%</td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>
            <div className={`${s.financeTable} ${s.flush}`}>
              <div className={s.subHead}><b>Orders without a penalty record</b><small>Sorted by days late</small></div>
              {u.data.rows.length > 0 ? (
                <div className={ui.tableWrap}>
                  <table className={`${s.table} ${s.stackNarrow} ${s.orders}`}>
                    <thead><tr><th>Order ID</th><th>Client</th><th>Tier</th>{hasSite && <th>Site</th>}<th className={s.right}>Days late</th><th>Status</th><th className={s.right}>Exposure</th></tr></thead>
                    <tbody>
                      {shownOrders.map((r) => (
                        <tr key={r.deliveryId} title={`Promised ${r.promisedDate.slice(0, 10)}`}>
                          <td className={`${s.num} ${s.mono}`}>{r.deliveryId}</td>
                          <td data-label="Client">{clientName(r.clientId)}</td>
                          <td data-label="Tier">{r.tier}</td>
                          {hasSite && <td data-label="Site">{r.warehouseId ?? '—'}</td>}
                          <td className={`${s.right} ${s.num}`} data-label="Days late">{r.daysLate}</td>
                          <td data-label="Status"><span className={s.status}><i />Not recorded</span></td>
                          <td className={`${s.right} ${s.num}`} data-label="Exposure">{usd(PENALTY_USD)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : <p className={s.emptyLine}>No order-level rows to list.</p>}
              {allOrders && <Pager p={unpaidPage} className={s.pager} />}
            </div>
            <div className={s.financeFoot}>
              <small>
                Exposure assumes the flat {usd(PENALTY_USD)} SLA penalty per late order.{' '}
                {allOrders
                  ? <>Listing the {int(unpaidRows.length)} most days late of {int(u.data.count)} orders.</>
                  : <>Showing {int(Math.min(ORDERS_PREVIEW, unpaidRows.length))} of {int(u.data.count)} orders.</>}
              </small>
              {unpaidRows.length > ORDERS_PREVIEW && (
                <button type="button" className={s.linkBtn} aria-expanded={allOrders} onClick={() => setAllOrders(!allOrders)}>
                  {allOrders ? 'Show fewer' : 'View all orders'}<Icon size={14}>{allOrders ? ICON.arrowUp : ICON.arrow}</Icon>
                </button>
              )}
            </div>
          </>
        )}
      </section>

      <p className={s.foot}>
        <span>Halcyon · Warehouses · before-pickup causes</span>
        <Link href="/dashboard/overview"><Icon size={12}>{ICON.arrowLeft}</Icon>Back to overview</Link>
      </p>
    </div>
  );
}
