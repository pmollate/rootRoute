'use client';

import { useState } from 'react';
import { Bars, Kpi, ScreenHead, Section, Segmented, Status, Table, ui } from '@/components/dashboard/ui';
import { useApi } from '@/hooks/useApi';
import { int, pct, points, usd } from '@/lib/metrics';

export interface Overview {
  onTime: number; benchmark: number; deliveries: number; late: number; penaltiesUsd: number; handlingCostUsd: number;
  atRiskAccounts: number; atRiskRevenueUsd: number; prePickupShare: number;
}
interface Cause { flag: string; label: string; stage: string; n: number; lateRate: number }
interface Attribution { cause: string; label: string; stage: string; deliveries: number; pointsLost: number; share: number }
interface CauseKpi { cause: string; label: string; kpi: string; baseline: number; target: string; owner: string }

const PRE_PICKUP = new Set(['Intake', 'Promise', 'Fulfilment']);
const FIVE = ['f_addr', 'f_cutoff', 'f_stock', 'f_lane', 'f_route', 'none'];
const SEGMENTS = [['all', 'All orders'], ['email', 'Email orders'], ['at_risk', 'At-risk accounts']] as const;
type Segment = (typeof SEGMENTS)[number][0];
/** Counts are shown as whole numbers, shares as percentages. */
const isCount = (k: CauseKpi) => k.baseline > 1;

export function OverviewScreen() {
  const [segment, setSegment] = useState<Segment>('all');
  const o = useApi<Overview>('/api/overview');
  const a = useApi<{ causes: Attribution[] }>('/api/attribution');
  const k = useApi<{ kpis: CauseKpi[] }>('/api/cause-kpis');
  const c = useApi<{ causes: Cause[] }>(`/api/causes?segment=${segment}`);
  const causes = (c.data?.causes ?? []).filter((x) => FIVE.includes(x.flag));
  return (
    <>
      <ScreenHead title="Where Halcyon stands" />
      <Status loading={o.loading} error={o.error} />
      {o.data && (
        <div className={ui.kpis}>
          <Kpi label="On-time delivery" value={pct(o.data.onTime)} note={`benchmark ${pct(o.data.benchmark, 0)}`} />
          <Kpi label="Late deliveries (6 months)" value={int(o.data.late)} />
          <Kpi label="Late deliveries with a cause before pickup" value={pct(o.data.prePickupShare, 0)} />
          <Kpi label="SLA penalties" value={usd(o.data.penaltiesUsd)} />
          <Kpi label="Late-delivery handling cost" value={usd(o.data.handlingCostUsd)} />
          <Kpi label="Accounts threatening to leave" value={`${o.data.atRiskAccounts}`} note={usd(o.data.atRiskRevenueUsd)} />
        </div>
      )}
      <Section title="Points of on-time delivery lost to each cause">
        <Status loading={a.loading} error={a.error} />
        {a.data && (
          <Bars
            items={a.data.causes.map((x) => ({ label: `${x.label} · ${int(x.deliveries)}`, value: x.pointsLost, tone: PRE_PICKUP.has(x.stage) ? 'pre' : 'post' }))}
            max={0.08}
            format={points}
          />
        )}
      </Section>
      <Section title="One measure per cause">
        <Status loading={k.loading} error={k.error} />
        {k.data && <Table rows={k.data.kpis} columns={[
          { key: 'l', label: 'Cause', render: (r) => r.label },
          { key: 'k', label: 'Measure', render: (r) => r.kpi },
          { key: 'b', label: 'Today', align: 'right', render: (r) => (isCount(r) ? int(r.baseline) : pct(r.baseline)) },
          { key: 't', label: 'Target', render: (r) => r.target },
          { key: 'o', label: 'Owner', render: (r) => r.owner },
        ]} />}
      </Section>
      <Section title="Late rate when each cause is present">
        <div className={ui.row}><Segmented label="Orders" value={segment} options={SEGMENTS} onChange={setSegment} /></div>
        <Status loading={c.loading} error={c.error} />
        {causes.length > 0 && <Table rows={causes} columns={[
          { key: 'l', label: 'Cause', render: (r) => r.label },
          { key: 's', label: 'Stage', render: (r) => `${r.stage}${PRE_PICKUP.has(r.stage) ? ' (before pickup)' : ''}` },
          { key: 'n', label: 'Deliveries', align: 'right', render: (r) => int(r.n) },
          { key: 'late', label: 'Late rate', align: 'right', render: (r) => pct(r.lateRate, 0) },
        ]} />}
      </Section>
    </>
  );
}
