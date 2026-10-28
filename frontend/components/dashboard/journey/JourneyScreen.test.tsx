import { cleanup, fireEvent, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { mockApi, renderScreen } from '../test-utils';
import { JourneyScreen } from './JourneyScreen';

const stage = (n: number, key: string, label: string, status: string, extra: object = {}) =>
  ({ n, key, label, status, at: null, actor: '—', source: 'real', detail: `${label} detail`, ...extra });

const D000213 = {
  ref: 'delivery:D000213', kind: 'delivery', synthetic: true, rounds: [],
  summary: { clientId: 'C190', tier: 'Tier 1', channel: 'Email', commitment: 'standard', destination: 'Northeast',
    promisedDate: '2026-04-05', outcome: '4 days late' },
  stages: [
    stage(1, 'received', 'Order received', 'done'), stage(2, 'read', 'Order read', 'done'),
    stage(3, 'address', 'Address checked', 'failed', { withLateLens: 'Decision CONFIRM_ADDRESS: the client is asked.' }),
    stage(4, 'promise', 'Promise set', 'done'), stage(5, 'warehouse', 'Warehouse chosen', 'done'),
    stage(6, 'carrier', 'Carrier chosen', 'failed', { withLateLens: 'Carrier E for Northeast standard: 96% on time vs 57% for F' }),
    stage(7, 'approved', 'Approved', 'skipped'), stage(8, 'told', 'Client told', 'skipped'), stage(9, 'wms', 'Entered in WMS', 'done'),
    stage(10, 'picked', 'Picked', 'done'), stage(11, 'handed', 'Handed to carrier', 'done'),
    stage(12, 'transit', 'In transit', 'done', { source: 'synthetic' }), stage(13, 'delivered', 'Delivered', 'failed'),
    stage(14, 'notice', 'Delay notice', 'skipped'),
  ],
};
const INBOX = { emails: [{ id: 8, decision: 'ALL_CLEAR', status: 'AWAITING_APPROVAL' }] };

describe('Order journey', () => {
  afterEach(cleanup);

  it('AC-JRN-07 / AC-JRN-08: shows the failed stages with the LateLens rule beside them, and marks synthetic stages', async () => {
    mockApi({ '/api/journey/delivery:D000213': D000213, '/api/intake': INBOX });
    renderScreen(<JourneyScreen initialRef="delivery:D000213" />);
    expect(await screen.findByText('4 days late')).toBeTruthy();
    expect(screen.getByText(/96% on time vs 57% for F/)).toBeTruthy();
    expect(screen.getByText(/CONFIRM_ADDRESS/)).toBeTruthy();
    expect(screen.getAllByText('Went wrong here')).toHaveLength(3);
    expect(screen.getAllByText('Synthetic data').length).toBeGreaterThan(1);
  });

  it('opens another ref from the box, and lists recent order emails as shortcuts', async () => {
    const fetch = mockApi({ '/api/journey/delivery:D000213': D000213, '/api/intake': INBOX,
      '/api/journey/email:8': { ...D000213, ref: 'email:8', kind: 'order', summary: { ...D000213.summary, outcome: 'awaiting approval' } } });
    renderScreen(<JourneyScreen initialRef="delivery:D000213" />);
    expect(await screen.findByRole('button', { name: 'email:8' })).toBeTruthy();
    fireEvent.change(screen.getByLabelText('Order or delivery'), { target: { value: 'email:8' } });
    fireEvent.click(screen.getByRole('button', { name: 'Open' }));
    expect(await screen.findByText('awaiting approval')).toBeTruthy();
    expect(fetch.mock.calls.some(([url]) => String(url).endsWith('/api/journey/email:8'))).toBe(true);
  });

  it('says so when the ref is not found', async () => {
    mockApi({ '/api/intake': INBOX });
    renderScreen(<JourneyScreen initialRef="delivery:D999999" />);
    expect(await screen.findByRole('alert')).toBeTruthy();
  });
});
