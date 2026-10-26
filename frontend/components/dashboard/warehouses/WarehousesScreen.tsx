'use client';

import Link from 'next/link';
import { useState, type ReactNode } from 'react';
import { Pill, Segmented, Status, SyntheticBadge, ui } from '@/components/dashboard/ui';
import { useApi } from '@/hooks/useApi';
import { int, pct, points, usd, usd2 } from '@/lib/metrics';
import type { Overview } from '../overview/OverviewScreen';
import s from './warehouses.module.css';

interface WarehouseRow {
  warehouseId: string; name: string; orders: number; cutoffMisses: number; cutoffLateRate: number; cutoffBefore11: number;
  outOfStock: number; outOfStockLateRate: number; skippedNearest: number; skippedNearestLateRate: number;
}
interface Placement {
  week: string | null; suggestions: { clientId: string; from: string; to: string; qty: number; reason: string }[];
  impact: { week: string; suggestions: number; avoidedNextWeek: number }[];
}
interface UnpaidRow { deliveryId: string; clientId: string; tier: string; daysLate: number; promisedDate: string }
interface Unpaid { count: number; byTier: { tier: string; n: number }[]; rows: UnpaidRow[] }

/** Flat SLA penalty per late delivery (Halcyon contract terms). */
const PENALTY_USD = 180;
/** The pick-run timeline runs 06:00–15:00. */
const at = (hour: number) => `${((hour - 6) / 9) * 100}%`;
/** ≥60% late reads as hot, 50–59% as warm, anything lower as cool. */
const heat = (rate: number) => (rate >= 0.6 ? s.hot : rate >= 0.5 ? s.warm : s.cool);
const sum = (rows: WarehouseRow[], f: (r: WarehouseRow) => number) => rows.reduce((t, r) => t + f(r), 0);
/** Late rate across all sites, weighted by each site's count. */
const pooled = (rows: WarehouseRow[], n: (r: WarehouseRow) => number, rate: (r: WarehouseRow) => number) =>
  sum(rows, (r) => n(r) * rate(r)) / (sum(rows, n) || 1);
const shareRange = (rows: WarehouseRow[], n: (r: WarehouseRow) => number) => {
  const shares = rows.map((r) => Math.round((n(r) / r.orders) * 100));
  const [lo, hi] = [Math.min(...shares), Math.max(...shares)];
  return lo === hi ? `≈${lo}%` : `${lo}–${hi}%`;
};

const PROBLEMS = [
  { key: 'cutoff', label: 'After cutoff', n: (r: WarehouseRow) => r.cutoffMisses, rate: (r: WarehouseRow) => r.cutoffLateRate },
  { key: 'stock', label: 'Out of stock', n: (r: WarehouseRow) => r.outOfStock, rate: (r: WarehouseRow) => r.outOfStockLateRate },
  { key: 'skip', label: 'Skipped nearest', n: (r: WarehouseRow) => r.skippedNearest, rate: (r: WarehouseRow) => r.skippedNearestLateRate },
] as const;
const VIEWS = [['cards', 'Cards'], ['table', 'Table']] as const;
type View = (typeof VIEWS)[number][0];

/** 16px line icons, drawn on a 24px grid. */
const Icon = ({ children, size = 16 }: { children: ReactNode; size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6"
    strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{children}</svg>
);
const ICON = {
  clock: <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>,
  box: <><path d="M12 2 3 7v10l9 5 9-5V7l-9-5Z" /><path d="m3 7 9 5 9-5M12 12v10" /></>,
  site: <><path d="M3 21V8l9-5 9 5v13" /><path d="M7 21v-8h10v8M7 17h10" /></>,
  pin: <><path d="M12 21s-7-6.2-7-11.5a7 7 0 0 1 14 0C19 14.8 12 21 12 21Z" /><circle cx="12" cy="9.5" r="2.5" /></>,
  info: <><circle cx="12" cy="12" r="9" /><path d="M12 11v5M12 8h.01" /></>,
  people: <><circle cx="9" cy="8" r="3" /><path d="M3 20a6 6 0 0 1 12 0M16 5a3 3 0 0 1 0 6M21 20a6 6 0 0 0-4-5.6" /></>,
  replay: <><path d="M3 12a9 9 0 1 0 3-6.7L3 8" /><path d="M3 3v5h5" /></>,
  download: <path d="M12 4v11m-5-5 5 5 5-5M4 20h16" />,
  dollar: <path d="M12 2v20M17 6H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />,
  calendar: <><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M3 10h18M8 3v4M16 3v4" /></>,
};

function downloadCsv(name: string, lines: (string | number)[][]) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([lines.map((l) => l.join(',')).join('\n')], { type: 'text/csv' }));
  a.download = name;
  a.click();
  URL.revokeObjectURL(a.href);
}
const exportSites = (rows: WarehouseRow[]) => downloadCsv('warehouses-pre-pickup.csv', [
  ['warehouse_id', 'name', 'orders', ...PROBLEMS.flatMap((x) => [`${x.key}_orders`, `${x.key}_late_rate`])],
  ...rows.map((r) => [r.warehouseId, r.name, r.orders, ...PROBLEMS.flatMap((x) => [x.n(r), x.rate(r).toFixed(4)])]),
]);
const exportUnpaid = (rows: UnpaidRow[]) => downloadCsv('unrecorded-penalties.csv', [
  ['delivery_id', 'client_id', 'tier', 'days_late', 'promised_date'],
  ...rows.map((r) => [r.deliveryId, r.clientId, r.tier, r.daysLate, r.promisedDate]),
]);

export function WarehousesScreen() {
  const [site, setSite] = useState('all');
  const [view, setView] = useState<View>('table');
  const w = useApi<{
    warehouses: WarehouseRow[]; secondPick: { movedOrders: number; onTime: number | null };
    freightPerOrder?: { nearest: number | null; otherSite: number | null };
  }>('/api/warehouses');
  const o = useApi<Overview>('/api/overview');
  const p = useApi<Placement>('/api/placement');
  const u = useApi<Unpaid>('/api/penalties/unpaid');

  const all = w.data?.warehouses ?? [];
  const rows = site === 'all' ? all : all.filter((r) => r.warehouseId === site);
  const totals = PROBLEMS.map((x) => ({ ...x, total: sum(rows, x.n), late: pooled(rows, x.n, x.rate) }));
  const [cutoff, stock, skip] = totals;
  /** Spread of the two volume causes across every site; skipped-nearest is too small to compare. */
  const spread = Math.max(...PROBLEMS.slice(0, 2).map((x) => {
    const rates = all.map((r) => x.rate(r) * 100);
    return Math.round(Math.max(...rates) - Math.min(...rates));
  }));
  const allTotal = all.reduce((t, r) => t + r.orders, 0) || 1;
  const pick = w.data?.secondPick;
  const freight = w.data?.freightPerOrder;
  const allCutoff = sum(all, PROBLEMS[0].n);
  const allSkip = sum(all, PROBLEMS[2].n);
  const stillLate = allCutoff - (pick?.movedOrders ?? 0);
  const tierTotal = u.data?.byTier.reduce((t, x) => t + x.n, 0) || 1;

  return (
    <div className={s.screen}>
      <header className={s.intro}>
        <div>
          <h1 className={s.title}>Warehouses</h1>
          <p className={s.lede}>Pre-pickup failures by site, and the fixes that remove them.</p>
        </div>
        <div className={s.tools}>
          <select className={s.select} aria-label="Site" value={site} onChange={(e) => setSite(e.target.value)}>
            <option value="all">All {all.length || ''} sites</option>
            {all.map((r) => <option key={r.warehouseId} value={r.warehouseId}>{r.warehouseId} · {r.name}</option>)}
          </select>
          <button type="button" className={s.button} disabled={rows.length === 0} onClick={() => exportSites(rows)}>
            <Icon>{ICON.download}</Icon>Export
          </button>
          <Link className={s.dark} href="/dashboard/replay"><Icon>{ICON.replay}</Icon>Open replay</Link>
        </div>
      </header>

      {u.data && u.data.count > 0 && (
        <div className={s.alert} role="note">
          <Icon>{ICON.dollar}</Icon>
          <p><b>{int(u.data.count)} late deliveries have no penalty record</b> for clients with a penalty clause —
            up to {usd(u.data.count * PENALTY_USD)} unaccounted.</p>
          <a href="#finance">Review with finance →</a>
        </div>
      )}

      <Status loading={w.loading} error={w.error} />
      {rows.length > 0 && (
        <>
          <div className={s.cards}>
            {[
              { x: cutoff, icon: ICON.clock, label: 'Same-day after 08:00 cutoff', note: `${shareRange(rows, cutoff.n)} of orders at every site` },
              { x: stock, icon: ICON.box, label: 'Nearest site out of stock', note: `${shareRange(rows, stock.n)} of orders at every site` },
              { x: skip, icon: ICON.site, label: 'Skipped nearest despite stock', note: 'Allocation error · target 0' },
            ].map(({ x, icon, label, note }) => (
              <section key={x.key} className={s.card}>
                <div className={s.cardTop}>
                  <p className={s.cardLabel}>{label}</p>
                  <span className={s.cardIcon}><Icon>{icon}</Icon></span>
                </div>
                <div className={s.cardRow}>
                  <span className={s.big}>{int(x.total)}</span>
                  <span className={`${s.rate} ${heat(x.late)}`}>{pct(x.late, 0)} late</span>
                </div>
                <p className={s.cardNote}>{note}</p>
              </section>
            ))}
          </div>

          <section>
            <div className={s.head}>
              <div>
                <h2 className={s.h2}>Sites</h2>
                <p className={s.sub}>Affected orders · share of site volume · late rate when present</p>
              </div>
              <Segmented label="Sites view" value={view} options={VIEWS} onChange={setView} />
            </div>
            {view === 'cards' ? (
              <div className={s.sites}>
                {rows.map((r) => (
                  <section key={r.warehouseId} className={s.site}>
                    <div className={s.siteHead}>
                      <span className={s.code}>{r.warehouseId}</span><b>{r.name}</b>
                      <span className={s.pin}><Icon>{ICON.pin}</Icon></span>
                    </div>
                    <div className={s.siteOrders}>
                      <span className={s.mid}>{int(r.orders)}</span>
                      <small>orders · {pct(r.orders / allTotal)} of volume</small>
                    </div>
                    {PROBLEMS.map((x) => (
                      <div key={x.key} className={s.metric}>
                        <div className={s.metricHead}>
                          <span>{x.label}</span>
                          <span className={s.num}>{int(x.n(r))} <small>· {pct(x.n(r) / r.orders)}</small></span>
                        </div>
                        <div className={s.metricBar}>
                          <span className={s.barTrack} role="img" aria-label={`${pct(x.rate(r), 0)} late`}>
                            <span className={heat(x.rate(r))} style={{ width: pct(x.rate(r)) }} />
                          </span>
                          <b className={s.num}>{pct(x.rate(r), 0)}</b>
                        </div>
                      </div>
                    ))}
                  </section>
                ))}
              </div>
            ) : (
              <div className={`${s.panel} ${s.flush}`}>
                <div className={ui.tableWrap}>
                  <table className={`${ui.table} ${s.table} ${s.stack}`}>
                    <thead>
                      <tr>
                        <th>Site</th><th className={ui.right}>Orders</th>
                        {PROBLEMS.map((x) => <th key={x.key} className={ui.right}>{x.label}</th>)}
                      </tr>
                    </thead>
                    <tbody>
                      {rows.map((r) => (
                        <tr key={r.warehouseId}>
                          <td><span className={s.code}>{r.warehouseId}</span>{r.name}</td>
                          <td className={`${ui.right} ${s.num}`} data-label="Orders">{int(r.orders)}</td>
                          {PROBLEMS.map((x) => (
                            <td key={x.key} className={`${ui.right} ${s.num}`} data-label={x.label}>
                              {int(x.n(r))} <small>{pct(x.n(r) / r.orders)}</small>{' '}
                              <span className={`${s.rate} ${heat(x.rate(r))}`}>{pct(x.rate(r), 0)}</span>
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                    {rows.length > 1 && (
                      <tfoot>
                        <tr>
                          <td><b>All sites</b></td>
                          <td className={`${ui.right} ${s.num}`} data-label="Orders">{int(sum(rows, (r) => r.orders))}</td>
                          {totals.map((x) => <td key={x.key} className={`${ui.right} ${s.num}`} data-label={x.label}>{int(x.total)}</td>)}
                        </tr>
                      </tfoot>
                    )}
                  </table>
                </div>
              </div>
            )}
            {all.length > 1 && (
              <p className={s.note}>
                <Icon>{ICON.info}</Icon>
                <span>Late rates differ by at most {spread} points between sites. <b>The causes are company-wide rules</b>, not a problem warehouse.</span>
              </p>
            )}
          </section>

          <section>
            <div className={s.head}>
              <div>
                <h2 className={s.h2}>Fixes to decide</h2>
                <p className={s.sub}>Each targets one pre-pickup cause</p>
              </div>
            </div>
            <div className={s.options}>
              <section className={s.panel}>
                <div className={s.optHead}>
                  <div>
                    <div className={s.tags}><Pill tone="bad">Promise</Pill><Pill>Proposed</Pill></div>
                    <h3 className={s.h3}>Second pick wave at 11:00</h3>
                  </div>
                  {pick?.onTime != null && o.data && (
                    <div className={s.gain}>
                      <div className={s.gainBig}>+{points(pick.onTime - o.data.onTime)} pts</div>
                      <small>{pct(o.data.onTime)} → {pct(pick.onTime)} alone</small>
                    </div>
                  )}
                </div>
                {pick && (
                  <>
                    <div className={s.timeline} role="img"
                      aria-label={`${int(pick.movedOrders)} same-day orders make the 11:00 wave; ${int(stillLate)} still arrive after 11:00`}>
                      <span className={s.made} style={{ left: at(8), width: `calc(${at(11)} - ${at(8)})` }}>
                        {int(pick.movedOrders)}<span className={s.barWords}> now make it</span>
                      </span>
                      <span className={s.after} style={{ left: at(11), right: 0 }}>{int(stillLate)}<span className={s.barWords}> after 11:00</span></span>
                    </div>
                    <div className={s.scale} aria-hidden="true">
                      <span style={{ left: 0 }}>06:00</span>
                      <span style={{ left: at(8) }}><b>08:00 cutoff</b></span>
                      <span style={{ left: at(11) }}><b>11:00 wave</b></span>
                      <span style={{ left: '100%' }}>15:00</span>
                    </div>
                  </>
                )}
                <p className={s.body}>
                  Same-day orders arriving 08:00–11:00 join a second pick wave instead of slipping a day.
                  Orders after 11:00 get a cutoff-aware promise at checkout.
                </p>
                <div className={s.actions}>
                  <span className={s.owner}><Icon>{ICON.people}</Icon>Sales ops / warehouse</span>
                  <Link className={s.dark} href="/dashboard/replay"><Icon>{ICON.replay}</Icon>Simulate</Link>
                </div>
              </section>

              <section className={s.panel}>
                <div className={s.optHead}>
                  <div>
                    <div className={s.tags}><Pill tone="bad">Fulfilment</Pill><Pill>Proposed</Pill></div>
                    <h3 className={s.h3}>Nearest-stocked + sibling fallback</h3>
                  </div>
                  <div className={s.gain}>
                    <div className={s.gainBig}>{int(allSkip)} → 0</div>
                    <small>misallocated orders</small>
                  </div>
                </div>
                <div className={s.freight}>
                  <div><small>Freight / order · nearest</small><b>{usd2(freight?.nearest)}</b></div>
                  <div className={s.freightBad}><small>Freight / order · wrong site</small><b>{usd2(freight?.otherSite)}</b></div>
                </div>
                <p className={s.body}>
                  Allocate from the nearest site with stock; if it is out, fall back to its sibling (W1 ↔ W2) before shipping cross-country.
                </p>
                <div className={s.actions}>
                  <span className={s.owner}><Icon>{ICON.people}</Icon>Warehouse supervisors</span>
                  <Link className={s.dark} href="/dashboard/replay"><Icon>{ICON.replay}</Icon>Simulate</Link>
                </div>
              </section>
            </div>
          </section>
        </>
      )}

      <section className={`${s.panel} ${s.flush}`}>
        <div className={`${s.head} ${s.pad}`}>
          <div>
            <h2 className={s.h2}>Weekly stock placement <SyntheticBadge /></h2>
            <p className={s.sub}>Moves that prevent out-of-stock at the nearest site · Inventory planning</p>
          </div>
          {p.data?.week && <span className={s.button}><Icon>{ICON.calendar}</Icon>Week of {p.data.week}</span>}
        </div>
        <div className={s.pad}><Status loading={p.loading} error={p.error} /></div>
        {p.data && (
          <div className={ui.tableWrap}>
            <table className={`${ui.table} ${s.table} ${s.placement} ${s.stack}`}>
              <thead><tr><th>Client</th><th>Move</th><th className={ui.right}>Units</th><th>Why</th></tr></thead>
              <tbody>
                {p.data.suggestions.slice(0, 15).map((r, i) => (
                  <tr key={i}>
                    <td>{r.clientId}</td>
                    <td data-label="Move"><span className={s.code}>{r.from}</span>→ <span className={s.code}>{r.to}</span></td>
                    <td className={`${ui.right} ${s.num}`} data-label="Units">{int(r.qty)}</td>
                    <td data-label="Why">{r.reason}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {p.data && p.data.suggestions.length === 0 && (
          <div className={s.empty}>
            <span className={s.cardIcon}><Icon size={20}>{ICON.box}</Icon></span>
            <b>No placement suggestions yet</b>
            <p>Run the weekly placement job (<code>npm run pipeline</code>) to see which SKUs to move between sites,
              with units and the stock-outs each move prevents.</p>
          </div>
        )}
      </section>

      <section id="finance" className={s.panel}>
        <Status loading={u.loading} error={u.error} />
        {u.data && (
          <div className={s.finance}>
            <span className={s.financeIcon}><Icon size={18}>{ICON.dollar}</Icon></span>
            <div>
              <p className={s.kicker}>Finance · for CFO review</p>
              <h2 className={s.h2}>Penalties possibly owed but not recorded</h2>
              <p className={s.body}>
                Late deliveries for clients with a penalty clause and no penalty record, at the flat {usd(PENALTY_USD)} rate.
              </p>
              <button type="button" className={s.dark} onClick={() => exportUnpaid(u.data!.rows)}>
                <Icon>{ICON.download}</Icon>Export {int(u.data.rows.length)} orders
              </button>
            </div>
            <div>
              <div className={s.figures}>
                <div><div className={s.big}>{int(u.data.count)}</div><small>unrecorded late deliveries</small></div>
                <div><div className={`${s.big} ${s.money}`}>{usd(u.data.count * PENALTY_USD)}</div><small>potential exposure</small></div>
              </div>
              <div className={s.tiers} role="img" aria-label={u.data.byTier.map((t) => `${t.tier}: ${int(t.n)}`).join(', ')}>
                {u.data.byTier.map((t, i) => <span key={t.tier} className={s[`t${i}`]} style={{ flexGrow: t.n / tierTotal }} />)}
              </div>
              <div className={s.tierKey}>
                {u.data.byTier.map((t, i) => <span key={t.tier}><i className={s[`t${i}`]} />{t.tier} · {int(t.n)}</span>)}
              </div>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
