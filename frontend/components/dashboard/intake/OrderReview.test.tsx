import { cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { asRole, mockApi, renderScreen } from '../test-utils';
import { OrderReview } from './OrderReview';

const order = { id: 8, from: 'orders@client025.example', clientId: 'C025', clientName: 'Client 25', tier: 'Tier 1', priority: true,
  receivedAt: '2026-10-22 07:30', items: [{ sku: 'HX-616', qty: 45 }], region: 'Northeast', promiseDate: '2026-10-23', warehouseId: 'W4',
  carrier: 'E', carrierReason: 'E: best on this lane', blocked: ['F'],
  choices: [{ carrier: 'E', status: 'recommended', onTime: 0.9, meanRate: 2.1, reason: 'eligible' },
    { carrier: 'A', status: 'backup', onTime: 0.88, meanRate: 2.4, reason: 'eligible' }],
  commitment: 'next_day', promiseReason: null, warehouseReason: 'Nearest warehouse W4 has stock.', warnClient: false,
  addressStatus: 'complete', blockedLanes: [{ carrier: 'F', onTime: 0.6 }] };
const radios = () => screen.getAllByRole('radio') as HTMLButtonElement[];
const routes = { '/api/intake/review': { orders: [order] }, '/api/intake/8/action': { status: 'APPROVED' } };
const bodies = (fetch: ReturnType<typeof mockApi>) => (fetch.mock.calls as unknown as [string, RequestInit][])
  .filter(([url]) => url.endsWith('/action')).map(([, init]) => JSON.parse(String(init.body)));

describe('Order review (E18)', () => {
  afterEach(() => cleanup());

  it('REQ-INT-15 (UI): offers only unblocked carriers and names the blocked ones', async () => {
    mockApi(routes);
    renderScreen(<OrderReview />, asRole('order_desk'));
    await screen.findByRole('radiogroup', { name: 'Carrier for order 8' });
    expect(radios().map((b) => b.textContent?.[0])).toEqual(['E', 'A']);
    expect(radios()[0].getAttribute('aria-checked')).toBe('true');
    expect(screen.getByLabelText('F, blocked on this lane, not offered').textContent).toContain('60.0%');
    expect(screen.getByText('+$0.30 / shipment')).toBeTruthy();
    expect(screen.getByText('Tier 1 · Priority')).toBeTruthy();
    expect(screen.getByText('Synthetic data')).toBeTruthy();
  });

  it('AC-INT-15, AC-AUTH-14 (UI): changing the carrier needs a reason, then approve sends carrier and reason, no user', async () => {
    const fetch = mockApi(routes);
    renderScreen(<OrderReview />, asRole('order_desk'));
    await screen.findByRole('radiogroup', { name: 'Carrier for order 8' });
    fireEvent.click(radios()[1]);
    expect(radios()[1].getAttribute('aria-checked')).toBe('true');
    const approve = screen.getByRole('button', { name: 'Approve W4 + A' }) as HTMLButtonElement;
    expect(approve.disabled).toBe(true);
    fireEvent.change(screen.getByLabelText('Reason for order 8'), { target: { value: 'client asked for A' } });
    fireEvent.click(approve);
    await waitFor(() => expect(bodies(fetch)).toEqual([{ action: 'approve', carrier: 'A', reason: 'client asked for A' }]));
  });

  it('REQ-INT-14 (UI): the card shows the order, the promise with its slack, the warehouse reason and the checks', async () => {
    mockApi(routes);
    renderScreen(<OrderReview />, asRole('order_desk'));
    expect(await screen.findByText('Tier 1 · Priority')).toBeTruthy();
    expect(screen.getByText('45 × HX-616 · W4 → Northeast · Next day')).toBeTruthy();
    expect(screen.getByText('Fri 23 Oct')).toBeTruthy();
    expect(screen.getByText(/1 day slack · email 8 · keyed 22 Oct 07:30/)).toBeTruthy();
    expect(screen.getByText('Nearest warehouse W4 has stock.')).toBeTruthy();
    expect(screen.getByText('Address checked')).toBeTruthy();
    expect(screen.getByText('Before the 08:00 cut-off')).toBeTruthy();
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
    await screen.findByRole('radiogroup', { name: 'Carrier for order 8' });
    expect(radios().every((b) => b.disabled)).toBe(true);
    expect(screen.queryByRole('button', { name: /^Approve/ })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Reject' })).toBeNull();
    expect(screen.queryByLabelText('Reason for order 8')).toBeNull();
  });
});
