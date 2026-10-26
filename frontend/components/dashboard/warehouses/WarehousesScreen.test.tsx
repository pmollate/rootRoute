import { screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { mockApi, renderScreen } from '../test-utils';
import { WarehousesScreen } from './WarehousesScreen';

describe('Warehouses', () => {
  it('AC-UI-04: the placement panel carries the synthetic badge', async () => {
    mockApi({
      '/api/warehouses': { warehouses: [{ warehouseId: 'W4', name: 'Northeast', orders: 12668, cutoffMisses: 1200, cutoffLateRate: 0.6,
        cutoffBefore11: 600, outOfStock: 1568, outOfStockLateRate: 0.5, skippedNearest: 150, skippedNearestLateRate: 0.49 }],
        secondPick: { movedOrders: 2414, onTime: 0.734 }, freightPerOrder: { nearest: 13.93, otherSite: 23.58 } },
      '/api/overview': { onTime: 0.71, benchmark: 0.94, deliveries: 48340, late: 14019, penaltiesUsd: 0, handlingCostUsd: 0,
        atRiskAccounts: 0, atRiskRevenueUsd: 0, prePickupShare: 0.67 },
      '/api/placement': { synthetic: true, week: '2026-09-21', suggestions: [], impact: [] },
      '/api/penalties/unpaid': { count: 2002, byTier: [{ tier: 'Tier 1', n: 699 }], rows: [] },
    });
    renderScreen(<WarehousesScreen />);
    expect((await screen.findAllByText('Synthetic data')).length).toBeGreaterThan(0);
    expect(await screen.findByText(/73\.4%/)).toBeTruthy();
    expect(await screen.findByText(/2,002 late deliveries/)).toBeTruthy();
    expect(await screen.findByText('$360,360')).toBeTruthy();
    expect(await screen.findByText('$23.58')).toBeTruthy();
  });
});
