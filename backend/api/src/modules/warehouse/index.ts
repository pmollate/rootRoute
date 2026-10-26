// Public entry point of the Warehouse & promise area (CONTRACTS §2). STUB until Task B8.
import type { DiagnosisApi, Region, WarehouseApi, WarehouseId } from '../../core/contracts.js';

const NEAREST: Record<Region, WarehouseId> = { Midwest: 'W1', Northeast: 'W4', Southeast: 'W3', West: 'W5' };

function plusOneDay(receivedAt: string): string {
  return new Date(Date.parse(`${receivedAt.slice(0, 10)}T00:00:00Z`) + 86_400_000).toISOString().slice(0, 10);
}

export const warehouseApi: WarehouseApi = {
  checkPromise: (commitment, receivedAt) => ({ promiseDate: plusOneDay(receivedAt), commitment, downgraded: false, reason: null }),
  nearestWarehouse: async (_clientId, region) => NEAREST[region],
  pickWarehouse: async (input) => ({ warehouseId: input.nearestWarehouseId, reason: 'stub', warnClient: false }),
};

export const diagnosisApi: DiagnosisApi = { getDeliveryCauses: async () => null };
