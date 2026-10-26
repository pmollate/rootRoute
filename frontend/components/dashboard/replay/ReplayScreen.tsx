'use client';

import { useState } from 'react';
import { Bars, type BarItem, ScreenHead, Section, Segmented, Status, Table, ui } from '@/components/dashboard/ui';
import { useApi } from '@/hooks/useApi';
import { int, pct, usd } from '@/lib/metrics';

interface Scenario { scenario: string; label: string; grp: string; onTime: number; lateAvoided: number; costAvoided: number }
interface Account { clientId: string; clientName: string; tier: string; revenueUsd: number; channel: string; onTime: number; mainCause: string; complaints: number }

// Expected-adoption programme (SPEC §2.4) against the routing vendor; then the full-fix upper bounds.
const PROGRAMME = ['today', 'adopt_vendor', 'adopt_address', 'adopt_lanes', 'adopt_cutoff', 'adopt_warehouse', 'adopt_all', 'as_built_adopted'];
const UPPER = ['route_only', 'vendor_best', 'as_built', 'all_but_route'];
const TONE: Record<string, BarItem['tone']> = { today: 'muted', adopt_vendor: 'post', adopt_all: 'good', as_built_adopted: 'accent' };
const SEGMENTS = [['all', 'All'], ['email', 'Email orders'], ['at_risk', 'At-risk accounts'], ['aug_sep', 'Aug–Sep']] as const;
type Segment = (typeof SEGMENTS)[number][0];

export function ReplayScreen() {
  const [segment, setSegment] = useState<Segment>('all');
  const r = useApi<{ scenarios: Scenario[] }>(`/api/replay?segment=${segment}`);
  const a = useApi<{ accounts: Account[] }>('/api/accounts');
  const o = useApi<{ benchmark: number; onTime: number }>('/api/overview');
  const byKey = new Map((r.data?.scenarios ?? []).map((s) => [s.scenario, s]));
  const pick = (keys: string[]) => keys.map((k) => byKey.get(k)).filter((s): s is Scenario => Boolean(s));
  const programme = pick(PROGRAMME);
  const vendor = byKey.get('adopt_vendor');
  const full = byKey.get('adopt_all');
  const built = byKey.get('as_built_adopted');
  const route = byKey.get('route_only');
  return (
    <>
      <ScreenHead title="Replay and decision" />
      <p className={ui.lede}>Each scenario replays all 48,340 deliveries. The programme adds one fix at a time, each working on part of its
        cause (address 85%, lanes 90%, cut-off 85%, warehouse 60%, route 30%). The routing vendor is assumed to fix every carrier
        issue and 30% of detours.</p>
      <Section title="On-time delivery under each scenario">
        <div className={ui.row}><Segmented label="Orders" value={segment} options={SEGMENTS} onChange={setSegment} /></div>
        <Status loading={r.loading} error={r.error} />
        {programme.length > 0 && (
          <>
            <Bars items={programme.map((s) => ({ label: s.label, value: s.onTime, tone: TONE[s.scenario] ?? 'pre' }))}
              min={0.6} max={1} mark={o.data?.benchmark} format={(v) => pct(v)} />
            <Table rows={programme} columns={[
              { key: 'l', label: 'Scenario', render: (s) => s.label },
              { key: 'o', label: 'On-time', align: 'right', render: (s) => pct(s.onTime) },
              { key: 'a', label: 'Late avoided', align: 'right', render: (s) => int(s.lateAvoided) },
              { key: 'c', label: 'Cost avoided (6 mo)', align: 'right', render: (s) => usd(s.costAvoided) },
            ]} />
            <p className={ui.muted}>Upper bounds if every fix worked on every delivery:</p>
            <Table rows={pick(UPPER)} columns={[
              { key: 'l', label: 'Scenario', render: (s) => s.label },
              { key: 'o', label: 'On-time', align: 'right', render: (s) => pct(s.onTime) },
              { key: 'c', label: 'Cost avoided (6 mo)', align: 'right', render: (s) => usd(s.costAvoided) },
            ]} />
          </>
        )}
      </Section>
      {vendor && full && built && route && o.data && (
        <section className={ui.callout}>
          <h2 className={ui.cardTitle}>Recommendation on the $680K routing contract</h2>
          <p><strong>Do not sign as scoped.</strong> The routing vendor alone reaches {pct(vendor.onTime)}. Fixing all five causes reaches{' '}
            {pct(full.onTime)} and avoids {usd(full.costAvoided)} in six months; what we build this week reaches {pct(built.onTime)}.
            Route detours, the one cause routing fixes directly, are worth {((route.onTime - o.data.onTime) * 100).toFixed(1)} points on
            their own. Pilot for 8 weeks with one measure per cause; if carrier and route causes still cost more than 3 points, pilot
            the vendor on the remaining lanes.</p>
        </section>
      )}
      <Section title="The 9 accounts threatening to leave">
        <Status loading={a.loading} error={a.error} />
        {a.data && <Table rows={a.data.accounts} columns={[
          { key: 'c', label: 'Client', render: (x) => `${x.clientId} · ${x.tier}` },
          { key: 'r', label: 'Revenue', align: 'right', render: (x) => usd(x.revenueUsd) },
          { key: 'ch', label: 'Channel', render: (x) => x.channel },
          { key: 'o', label: 'On-time', align: 'right', render: (x) => pct(x.onTime) },
          { key: 'm', label: 'Main cause', render: (x) => x.mainCause },
          { key: 'k', label: 'Complaints', align: 'right', render: (x) => int(x.complaints) },
        ]} />}
      </Section>
    </>
  );
}
