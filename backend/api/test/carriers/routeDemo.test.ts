import { describe, expect, it } from 'vitest';
import { DELIVERY_ID, shapeRouteDemo } from '../../src/modules/carriers/routeDemo.js';

describe('route demo shape (C9c, CONTRACTS §6)', () => {
  it('AC-RDEMO-04: parses the JSON columns and marks the answer synthetic', () => {
    const r = shapeRouteDemo({
      delivery_id: 'D000001', n_stops: 2, stops: '[[1.5,0],[0,2]]', planned_order: '[0,1]', optimised_order: '[1,0]',
      planned_km: 7, optimised_km: 6.5, actual_km: null, overran: false, example: null, synthetic: true,
    });
    expect(r).toEqual({ synthetic: true, deliveryId: 'D000001', nStops: 2, stops: [[1.5, 0], [0, 2]], plannedOrder: [0, 1],
      optimisedOrder: [1, 0], plannedKm: 7, optimisedKm: 6.5, actualKm: null, overran: false });
  });

  it('AC-RDEMO-04: a delivery id is D plus six digits', () => {
    for (const ok of ['D000001', 'D999999']) expect(DELIVERY_ID.test(ok), ok).toBe(true);
    for (const bad of ['D1', 'x', 'D0000001', 'd000001', '']) expect(DELIVERY_ID.test(bad), bad).toBe(false);
  });
});
