'use client';

import { ScreenHead, Section, Status, SyntheticBadge, Table } from '@/components/dashboard/ui';
import { useApi } from '@/hooks/useApi';
import { int, pct } from '@/lib/metrics';

interface WarehouseRow {
  warehouseId: string; name: string; orders: number; cutoffMisses: number; cutoffLateRate: number; cutoffBefore11: number;
  outOfStock: number; outOfStockLateRate: number; skippedNearest: number; skippedNearestLateRate: number;
}
interface Placement {
  week: string | null; suggestions: { clientId: string; from: string; to: string; qty: number; reason: string }[];
  impact: { week: string; suggestions: number; avoidedNextWeek: number }[];
}
interface Unpaid { count: number; byTier: { tier: string; n: number }[] }

export function WarehousesScreen() {
  const w = useApi<{ warehouses: WarehouseRow[]; secondPick: { movedOrders: number; onTime: number | null } }>('/api/warehouses');
  const p = useApi<Placement>('/api/placement');
  const u = useApi<Unpaid>('/api/penalties/unpaid');
  return (
    <>
      <ScreenHead title="Warehouses and promises" />
      <Section title="Problems before pickup, by warehouse">
        <Status loading={w.loading} error={w.error} />
        {w.data && <Table rows={w.data.warehouses} columns={[
          { key: 'w', label: 'Warehouse', render: (r) => `${r.warehouseId} ${r.name}` },
          { key: 'o', label: 'Orders', align: 'right', render: (r) => int(r.orders) },
          { key: 'c', label: 'Same-day after 8am', align: 'right', render: (r) => `${int(r.cutoffMisses)} (${pct(r.cutoffLateRate, 0)} late)` },
          { key: 's', label: 'Out of stock', align: 'right', render: (r) => `${int(r.outOfStock)} (${pct(r.outOfStockLateRate, 0)} late)` },
          { key: 'k', label: 'Skipped nearest', align: 'right', render: (r) => `${int(r.skippedNearest)} (${pct(r.skippedNearestLateRate, 0)} late)` },
        ]} />}
      </Section>
      {w.data && (
        <Section title="Option: second pick run at 11:00">
          <p>{int(w.data.secondPick.movedOrders)} same-day orders arrive between 08:00 and 11:00 and would make a second pick run.
            On-time would rise to {pct(w.data.secondPick.onTime)} on its own.</p>
        </Section>
      )}
      <Section title="Weekly stock placement suggestions" badge={<SyntheticBadge />}>
        <Status loading={p.loading} error={p.error} />
        {p.data && (
          <Table rows={p.data.suggestions.slice(0, 15)} columns={[
            { key: 'c', label: 'Client', render: (r) => r.clientId },
            { key: 'm', label: 'Move', render: (r) => `${r.from} → ${r.to}` },
            { key: 'q', label: 'Units', align: 'right', render: (r) => int(r.qty) },
            { key: 'r', label: 'Why', render: (r) => r.reason },
          ]} />
        )}
      </Section>
      <Section title="Penalties possibly owed but not paid">
        <Status loading={u.loading} error={u.error} />
        {u.data && <p>{int(u.data.count)} late deliveries for clients with a penalty clause have no penalty record
          ({u.data.byTier.map((t) => `${t.tier}: ${int(t.n)}`).join(', ')}). Question for the CFO.</p>}
      </Section>
    </>
  );
}
