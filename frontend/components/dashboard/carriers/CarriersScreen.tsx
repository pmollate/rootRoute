'use client';

import Link from 'next/link';
import { useState, type ReactNode } from 'react';
import { Pill, Segmented, Status, SyntheticBadge, Table, type Tone } from '@/components/dashboard/ui';
import { useApi } from '@/hooks/useApi';
import { postJSON } from '@/lib/api';
import { int, pct, usd2 } from '@/lib/metrics';
import s from './carriers.module.css';

interface Option { carrier: string; onTime: number; meanRate: number; n: number; score: number | null; status: string; reason: string }
interface Rec { carrier: string; backup: string; reason: string; blocked: string[]; options: Option[] }
interface Backtest { rows: { choice: string; n: number; onTime: number; meanRate: number }[] }
interface Tracking { asOf: string; freshness: { carrier: string; source: string; lastEventAt: string }[]; atRisk: { deliveryId: string; carrier: string }[] }

const REGIONS = [['Midwest', 'Midwest'], ['Northeast', 'Northeast'], ['Southeast', 'Southeast'], ['West', 'West']] as const;
const COMMITMENTS = [['same_day', 'Same day'], ['next_day', 'Next day'], ['standard', 'Standard']] as const;
type Region = (typeof REGIONS)[number][0];
type Commitment = (typeof COMMITMENTS)[number][0];
const STATUS_TONE: Record<string, Tone> = { recommended: 'good', backup: 'neutral', eligible: 'neutral', blocked: 'bad' };
/** Tracking is synthetic (SD-07); this is the demo day it is shown for. */
const TRACKING_DAY = '2026-09-10';
const laneUrl = (region: Region, commitment: Commitment, sla = false) =>
  `/api/carriers?region=${region}&commitment=${commitment}&sla=${sla}`;

/** 16px line icons, drawn on a 24px grid. */
const Icon = ({ children }: { children: ReactNode }) => (
  <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6"
    strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{children}</svg>
);
const ICON = {
  block: <><circle cx="12" cy="12" r="9" /><path d="m5.6 5.6 12.8 12.8" /></>,
  download: <path d="M12 4v11m-5-5 5 5 5-5M4 20h16" />,
  replay: <><path d="M3 12a9 9 0 1 0 3-6.7L3 8" /><path d="M3 3v5h5" /></>,
};

function exportLane(region: Region, commitment: Commitment, rec: Rec) {
  const lines = [['region', 'commitment', 'carrier', 'status', 'on_time_fair', 'mean_rate_usd', 'deliveries', 'reason'],
    ...rec.options.map((o) => [region, commitment, o.carrier, o.status, o.onTime.toFixed(4), o.meanRate.toFixed(2), o.n, `"${o.reason}"`])];
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([lines.map((l) => l.join(',')).join('\n')], { type: 'text/csv' }));
  a.download = `carriers-${region}-${commitment}.csv`;
  a.click();
  URL.revokeObjectURL(a.href);
}

/** Blocked lanes do not depend on the delivery promise, so one call per region (standard) finds all of them. */
function useBlockedLanes(): string[] | undefined {
  const lanes = [
    ['Midwest', useApi<{ recommendation: Rec }>(laneUrl('Midwest', 'standard')).data],
    ['Northeast', useApi<{ recommendation: Rec }>(laneUrl('Northeast', 'standard')).data],
    ['Southeast', useApi<{ recommendation: Rec }>(laneUrl('Southeast', 'standard')).data],
    ['West', useApi<{ recommendation: Rec }>(laneUrl('West', 'standard')).data],
  ] as const;
  if (lanes.some(([, d]) => !d)) return undefined;
  return lanes.flatMap(([r, d]) => d!.recommendation.blocked.map((c) => `${c} → ${r}`)).sort();
}

export function CarriersScreen() {
  const [region, setRegion] = useState<Region>('Northeast');
  const [commitment, setCommitment] = useState<Commitment>('next_day');
  const [sla, setSla] = useState(false);
  const [override, setOverride] = useState({ orderRef: '', to: '', reason: '', user: '' });
  const [overrideMsg, setOverrideMsg] = useState('');
  const lane = useApi<{ recommendation: Rec }>(laneUrl(region, commitment, sla));
  const blockedLanes = useBlockedLanes();
  const bt = useApi<Backtest>('/api/carriers/backtest');
  const tr = useApi<Tracking>(`/api/tracking?asOf=${TRACKING_DAY}`);
  const rec = lane.data?.recommendation;
  const best = rec?.options.find((o) => o.carrier === rec.carrier);
  const backup = rec?.options.find((o) => o.carrier === rec.backup);

  async function saveOverride() {
    try {
      const r = await postJSON<{ id: number }>('/api/overrides', { ...override, from: rec?.carrier ?? '' });
      setOverrideMsg(`Logged override #${r.id}`);
    } catch {
      // A fixed message: the error text can carry API paths, status codes or server internals.
      setOverrideMsg('Could not log the override. Check the fields and try again.');
    }
  }

  return (
    <div className={s.screen}>
      <header className={s.intro}>
        <div>
          <h1 className={s.title}>Carriers</h1>
          <p className={s.lede}>Carrier choice by lane, scored only on deliveries with no address, stock or cut-off problem.</p>
        </div>
        <div className={s.tools}>
          <button type="button" className={s.button} disabled={!rec} onClick={() => rec && exportLane(region, commitment, rec)}>
            <Icon>{ICON.download}</Icon>Export
          </button>
          <Link className={s.dark} href="/dashboard/replay"><Icon>{ICON.replay}</Icon>Open replay</Link>
        </div>
      </header>

      {blockedLanes && blockedLanes.length > 0 && (
        <div className={s.alert} role="note">
          <Icon>{ICON.block}</Icon>
          <p><b>{blockedLanes.length} carrier lanes are blocked</b> — late on fair data on every promise. Carrier D is
            also capped on Fridays at its normal daily level, so its Friday overflow goes to the next carrier.</p>
          <ul className={s.lanes}>{blockedLanes.map((l) => <li key={l}>{l}</li>)}</ul>
        </div>
      )}

      <section className={s.panel}>
        <div className={s.head}>
          <div>
            <h2 className={s.h2}>Which carrier for this lane?</h2>
            <p className={s.sub}>Ranked by on-time rate, days late and cost; blocked carriers are never offered.</p>
          </div>
        </div>
        <div className={s.controls}>
          <Segmented label="Region" value={region} options={REGIONS} onChange={setRegion} />
          <Segmented label="Delivery promise" value={commitment} options={COMMITMENTS} onChange={setCommitment} />
          <label className={s.check}>
            <input type="checkbox" checked={sla} onChange={(e) => setSla(e.target.checked)} /> Client has an SLA penalty clause
          </label>
        </div>
        <Status loading={lane.loading} error={lane.error} />
        {rec && best && (
          <>
            <div className={s.cards}>
              <div className={s.card}>
                <p className={s.cardLabel}>Recommended</p>
                <p className={s.big}>Carrier {rec.carrier}</p>
                <p className={s.cardNote}>{pct(best.onTime, 0)} on time · {usd2(best.meanRate)} per shipment</p>
              </div>
              <div className={s.card}>
                <p className={s.cardLabel}>Backup</p>
                <p className={s.big}>Carrier {rec.backup}</p>
                <p className={s.cardNote}>{backup ? `${pct(backup.onTime, 0)} on time · ${usd2(backup.meanRate)} per shipment` : 'Used when the first choice is at capacity'}</p>
              </div>
              <div className={s.card}>
                <p className={s.cardLabel}>Blocked on this lane</p>
                <p className={s.big}>{rec.blocked.length ? rec.blocked.join(', ') : 'None'}</p>
                <p className={s.cardNote}>Never recommended here</p>
              </div>
            </div>
            <p className={s.reason}>{rec.reason}</p>
            <Table rows={rec.options} columns={[
              { key: 'c', label: 'Carrier', render: (o) => o.carrier },
              { key: 's', label: 'Status', render: (o) => <Pill tone={STATUS_TONE[o.status] ?? 'neutral'}>{o.status}</Pill> },
              { key: 'o', label: 'On-time (fair data)', align: 'right', render: (o) => pct(o.onTime, 0) },
              { key: 'r', label: 'Mean rate', align: 'right', render: (o) => usd2(o.meanRate) },
              { key: 'n', label: 'Deliveries', align: 'right', render: (o) => int(o.n) },
              { key: 'w', label: 'Why', render: (o) => (o.status === 'blocked' ? o.reason : o.score == null ? '' : `score ${o.score.toFixed(0)}`) },
            ]} />
          </>
        )}
      </section>

      <section className={s.panel}>
        <h2 className={s.h2}>Backtest: rules trained Apr–Jul, tested Aug–Sep</h2>
        <Status loading={bt.loading} error={bt.error} />
        {bt.data && <Table rows={bt.data.rows} columns={[
          { key: 'c', label: 'Carrier choice', render: (r) => r.choice },
          { key: 'o', label: 'On-time', align: 'right', render: (r) => pct(r.onTime) },
          { key: 'm', label: 'Mean rate', align: 'right', render: (r) => usd2(r.meanRate) },
          { key: 'n', label: 'Deliveries', align: 'right', render: (r) => int(r.n) },
        ]} />}
      </section>

      <section className={s.panel}>
        <h2 className={s.h2}>Tracking across all six carriers <SyntheticBadge /></h2>
        <Status loading={tr.loading} error={tr.error} />
        {tr.data && (
          <>
            <p className={s.sub}>As of {tr.data.asOf}: {int(tr.data.atRisk.length)} deliveries promised that day have no delivered event.</p>
            <Table rows={tr.data.freshness} columns={[
              { key: 'c', label: 'Carrier', render: (f) => f.carrier },
              { key: 's', label: 'Feed', render: (f) => f.source },
              { key: 'l', label: 'Last event', render: (f) => f.lastEventAt },
            ]} />
          </>
        )}
      </section>

      <section className={s.panel}>
        <h2 className={s.h2}>Override a recommendation</h2>
        <p className={s.sub}>Every override is logged with a reason, so the lane rules can be reviewed.</p>
        <div className={s.form}>
          <input className={s.input} aria-label="Order ref" placeholder="Order ref" value={override.orderRef} onChange={(e) => setOverride({ ...override, orderRef: e.target.value })} />
          <input className={s.input} aria-label="Use carrier" placeholder="Use carrier" value={override.to} onChange={(e) => setOverride({ ...override, to: e.target.value })} />
          <input className={s.input} aria-label="Reason" placeholder="Reason" value={override.reason} onChange={(e) => setOverride({ ...override, reason: e.target.value })} />
          <input className={s.input} aria-label="Your name" placeholder="Your name" value={override.user} onChange={(e) => setOverride({ ...override, user: e.target.value })} />
          <button type="button" className={s.dark} onClick={saveOverride}>Log override</button>
        </div>
        {overrideMsg && <p className={s.sub} role="status">{overrideMsg}</p>}
      </section>
    </div>
  );
}
