import { cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { asRole, mockApi, renderScreen } from '../test-utils';
import { OrderReview } from './OrderReview';

const order = { id: 8, from: 'orders@client025.example', clientId: 'C025', clientName: 'Client 25', tier: 'Tier 1', priority: true,
  receivedAt: '2026-10-22 07:30', items: [{ sku: 'HX-616', qty: 45 }], region: 'Northeast', promiseDate: '2026-10-23', warehouseId: 'W4',
  carrier: 'E', carrierReason: 'E: best on this lane', blocked: ['F'],
  choices: [{ carrier: 'E', status: 'recommended', onTime: 0.9, reason: 'eligible' }, { carrier: 'A', status: 'backup', onTime: 0.88, reason: 'eligible' }] };
const routes = { '/api/intake/review': { orders: [order] }, '/api/intake/8/action': { status: 'APPROVED' } };
const bodies = (fetch: ReturnType<typeof mockApi>) => (fetch.mock.calls as unknown as [string, RequestInit][])
  .filter(([url]) => url.endsWith('/action')).map(([, init]) => JSON.parse(String(init.body)));

describe('Order review (E18)', () => {
  afterEach(() => cleanup());

  it('REQ-INT-15 (UI): offers only unblocked carriers and names the blocked ones', async () => {
    mockApi(routes);
    renderScreen(<OrderReview />, asRole('order_desk'));
    const select = (await screen.findByLabelText('Carrier for order 8')) as HTMLSelectElement;
    expect([...select.options].map((o) => o.value)).toEqual(['E', 'A']);
    expect(screen.getByText(/Blocked on this lane, not offered: F/)).toBeTruthy();
    expect(screen.getByText('Priority')).toBeTruthy();
    expect(screen.getByText('Synthetic data')).toBeTruthy();
  });

  it('AC-INT-15, AC-AUTH-14 (UI): changing the carrier needs a reason, then approve sends carrier and reason, no user', async () => {
    const fetch = mockApi(routes);
    renderScreen(<OrderReview />, asRole('order_desk'));
    fireEvent.change(await screen.findByLabelText('Carrier for order 8'), { target: { value: 'A' } });
    const approve = screen.getByRole('button', { name: 'Approve' }) as HTMLButtonElement;
    expect(approve.disabled).toBe(true);
    fireEvent.change(screen.getByLabelText('Reason for order 8'), { target: { value: 'client asked for A' } });
    fireEvent.click(approve);
    await waitFor(() => expect(bodies(fetch)).toEqual([{ action: 'approve', carrier: 'A', reason: 'client asked for A' }]));
  });

  it('AC-INT-14 (UI): reject is enabled only with a reason and sends it', async () => {
    const fetch = mockApi({ ...routes, '/api/intake/8/action': { status: 'REJECTED' } });
    renderScreen(<OrderReview />, asRole('order_desk'));
    const reject = (await screen.findByRole('button', { name: 'Reject' })) as HTMLButtonElement;
    expect(reject.disabled).toBe(true);
    fireEvent.change(screen.getByLabelText('Reason for order 8'), { target: { value: 'client cancelled' } });
    fireEvent.click(reject);
    await waitFor(() => expect(bodies(fetch)).toEqual([{ action: 'reject', reason: 'client cancelled' }]));
    expect(await screen.findByText('Order 8: rejected.')).toBeTruthy();
  });

  it('AC-AUTH-10: leadership sees the queue but no Approve, Reject or carrier change', async () => {
    mockApi(routes);
    renderScreen(<OrderReview />, asRole('leadership'));
    expect(((await screen.findByLabelText('Carrier for order 8')) as HTMLSelectElement).disabled).toBe(true);
    expect(screen.queryByRole('button', { name: 'Approve' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Reject' })).toBeNull();
    expect(screen.queryByLabelText('Reason for order 8')).toBeNull();
  });
});
