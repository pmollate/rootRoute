import { describe, expect, it } from 'vitest';
import { toOverview } from '../../src/modules/warehouse/queries.js';

const ms = (day: string) => Date.parse(`${day}T00:00:00Z`);

describe('overview from the kpis table (no database)', () => {
  it('AC-DATA-21: the data line (window, sites, carriers) is read from kpis, days as ISO dates', () => {
    const o = toOverview([
      { key: 'deliveries', value: 48340 }, { key: 'warehouses', value: 5 }, { key: 'carriers', value: 6 },
      { key: 'window_from', value: ms('2026-04-01') }, { key: 'window_to', value: ms('2026-09-25') },
      { key: 'recent_from', value: ms('2026-08-01') }, { key: 'on_time', value: 0.71 },
    ]);
    expect(o).toMatchObject({
      deliveries: 48340, warehouses: 5, carriers: 6, onTime: 0.71,
      windowFrom: '2026-04-01', windowTo: '2026-09-25', recentFrom: '2026-08-01',
    });
  });

  it('AC-DATA-21: a kpis table written before the data line gives nulls, not invented values', () => {
    const o = toOverview([{ key: 'deliveries', value: 10 }]);
    expect(o).toMatchObject({ deliveries: 10, warehouses: null, carriers: null, windowFrom: null, windowTo: null, recentFrom: null });
  });
});
