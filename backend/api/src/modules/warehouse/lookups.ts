import { cached } from '../../core/cache.js';
import type { CauseFlag, DeliveryCauses, Region, WarehouseId } from '../../core/contracts.js';
import { query } from '../../core/db/pool.js';

const FLAGS: CauseFlag[] = ['f_addr', 'f_cutoff', 'f_stock', 'f_stock_out', 'f_skip_nearest', 'f_lane', 'f_bad_lane', 'f_d_friday', 'f_route'];

export async function milesToRegion(region: Region): Promise<Record<WarehouseId, number>> {
  return cached(`miles:${region}`, async () => {
    const rows = await query<{ warehouse_id: WarehouseId; miles: number }>(
      'SELECT warehouse_id, miles FROM warehouse_region_distance WHERE region = $1', [region],
    );
    return Object.fromEntries(rows.map((r) => [r.warehouse_id, r.miles])) as Record<WarehouseId, number>;
  });
}

export async function clientNearest(clientId: string, region: Region): Promise<WarehouseId | null> {
  const rows = await query<{ warehouse_id: WarehouseId }>(
    'SELECT warehouse_id FROM client_region_nearest WHERE client_id = $1 AND region = $2', [clientId, region],
  );
  return rows[0]?.warehouse_id ?? null;
}

export async function deliveryCauses(deliveryId: string): Promise<DeliveryCauses | null> {
  const rows = await query<Record<string, unknown>>('SELECT * FROM delivery_causes WHERE delivery_id = $1', [deliveryId]);
  const r = rows[0];
  if (!r) return null;
  return {
    deliveryId,
    late: Boolean(r.late),
    flags: Object.fromEntries(FLAGS.map((f) => [f, Boolean(r[f])])) as Record<CauseFlag, boolean>,
    stages: String(r.stages ?? '').split(',').filter(Boolean),
  };
}
