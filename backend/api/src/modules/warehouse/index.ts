// Public entry point of the Warehouse & promise area (CONTRACTS §2). Other areas import only this file.
import type { DiagnosisApi, Region, WarehouseApi, WarehouseId } from '../../core/contracts.js';
import { checkPromise, chooseWarehouse } from './domain.js';
import { clientNearest, deliveryCauses, milesToRegion } from './lookups.js';

const NEAREST: Record<Region, WarehouseId> = { Midwest: 'W1', Northeast: 'W4', Southeast: 'W3', West: 'W5' };

export const warehouseApi: WarehouseApi = {
  checkPromise,
  async nearestWarehouse(clientId, region) {
    if (region !== 'Midwest') return NEAREST[region];
    return (await clientNearest(clientId, region)) ?? NEAREST.Midwest;
  },
  async pickWarehouse(input) {
    return chooseWarehouse(input, await milesToRegion(input.destinationRegion));
  },
};

export const diagnosisApi: DiagnosisApi = { getDeliveryCauses: deliveryCauses };
