import { cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { asRole, mockApi, renderScreen } from '../test-utils';
import { ComplaintsScreen } from './ComplaintsScreen';

const c = (id: string, over: object = {}) => ({ complaintId: id, clientId: 'C055', deliveryId: 'D023590', category: 'Redelivery needed',
  date: '2026-07-03', text: 'It did not arrive.', atRisk: true, tier: 'Tier 1', escalate: true, triage: null, ...over });
const triaged = { complaintId: 'CMP001', deliveryId: 'D023590', stages: ['Intake'], prePickup: true, escalate: true,
  draft: 'We checked delivery D023590: the delivery address was incomplete when the order arrived.', source: 'template' };
const routes = {
  '/api/complaints': { complaints: [c('CMP001'), c('CMP002', { clientId: 'C010', tier: 'Tier 3', atRisk: false, escalate: false })] },
  '/api/complaints/CMP001/triage': triaged,
};

describe('Complaints (E12, E14)', () => {
  afterEach(() => cleanup());

  it('REQ-PRI-02 (UI): flags escalations and counts them', async () => {
    mockApi(routes);
    renderScreen(<ComplaintsScreen />);
    expect(await screen.findByText('1 of 2 escalate')).toBeTruthy();
    expect(screen.getAllByText('Escalate')).toHaveLength(1);
  });

  it('AC-CMP-02 (UI): customer support triages a complaint and sees the cause and the draft', async () => {
    const fetch = mockApi(routes);
    renderScreen(<ComplaintsScreen />, asRole('customer_support'));
    fireEvent.click(await screen.findByRole('button', { name: 'CMP001' }));
    fireEvent.click(screen.getByRole('button', { name: 'Triage' }));
    expect(await screen.findByText(/address was incomplete/)).toBeTruthy();
    expect(screen.getByText(/cause before pickup/)).toBeTruthy();
    await waitFor(() => expect((fetch.mock.calls as unknown as [string, RequestInit][])
      .some(([url, init]) => url === '/api/complaints/CMP001/triage' && init?.method === 'POST')).toBe(true));
  });

  it('AC-AUTH-10: leadership and the order desk see no Triage button', async () => {
    for (const role of ['leadership', 'order_desk'] as const) {
      mockApi(routes);
      renderScreen(<ComplaintsScreen />, asRole(role));
      fireEvent.click(await screen.findByRole('button', { name: 'CMP001' }));
      expect(screen.queryByRole('button', { name: 'Triage' }), role).toBeNull();
      cleanup();
    }
  });
});
