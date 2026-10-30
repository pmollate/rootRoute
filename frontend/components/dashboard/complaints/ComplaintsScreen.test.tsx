import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { asRole, mockApi, renderScreen } from '../test-utils';
import { ComplaintsScreen } from './ComplaintsScreen';

const c = (id: string, over: object = {}) => ({ complaintId: id, clientId: 'C055', deliveryId: 'D023590', category: 'Redelivery needed',
  date: '2026-07-03', text: 'It did not arrive.', atRisk: true, tier: 'Tier 1', escalate: true, triage: null, ...over });
const triaged = { complaintId: 'CMP001', deliveryId: 'D023590', stages: ['Intake'], prePickup: true, escalate: true,
  draft: 'We checked delivery D023590: the delivery address was incomplete when the order arrived.', source: 'template' };
const done = { stages: ['Carrier', 'Delivery'], prePickup: false, escalate: false, draft: 'Sorry it was late.', source: 'model', at: '2026-10-28 16:05' };
const routes = {
  '/api/complaints': { complaints: [
    c('CMP001'),
    c('CMP002', { clientId: 'C010', tier: 'Tier 3', atRisk: false, escalate: false, date: '2026-10-12', stages: ['Carrier', 'Delivery'], triage: done }),
    c('CMP003', { clientId: 'C010', tier: 'Tier 3', atRisk: false, escalate: false, date: '2026-10-20', category: 'Late delivery', stages: ['Intake', 'Carrier'] }),
  ] },
  '/api/complaints/CMP001/triage': triaged,
};
const table = () => screen.getAllByRole('table')[0]; // the list; the open complaint's causes table comes after

describe('Complaints (E12, E14)', () => {
  afterEach(() => cleanup());

  it('REQ-PRI-02 (UI): counts, escalations first in their own group, and the months covered', async () => {
    mockApi(routes);
    renderScreen(<ComplaintsScreen />);
    expect(await screen.findByText('1 complaint escalates to the account owner')).toBeTruthy();
    expect(screen.getAllByText('of 3')).toHaveLength(2); // the Escalate chip and the Triaged tile
    expect(screen.getByText(/Customer support · Jul to Oct 2026/)).toBeTruthy();
    // The queue opens on escalations, as in the design; All groups them first.
    expect(within(table()).queryByRole('button', { name: 'CMP002' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'All 3 complaints' }));
    const rows = within(table()).getAllByRole('row').map((r) => r.textContent);
    expect(rows[1]).toMatch(/^Escalate · 1/);
    expect(rows[2]).toMatch(/^CMP001/);
    expect(rows[3]).toMatch(/^Other complaints · 2/);
  });

  it('summarises categories, tiers, cause stages, months and repeat clients from the list', async () => {
    mockApi(routes);
    renderScreen(<ComplaintsScreen />);
    const cats = within(await screen.findByRole('region', { name: 'What clients complain about' }));
    expect(cats.getByText('Redelivery needed').closest('div')?.textContent).toMatch(/Redelivery needed2/);
    const road = within(screen.getByRole('region', { name: 'Where the delays started' }));
    expect(road.getByText('4 causes')).toBeTruthy(); // CMP002 Carrier + Delivery, CMP003 Intake + Carrier; CMP001 has none known
    expect(road.getByText(/Carrier is the single biggest source \(2\)/)).toBeTruthy();
    expect(screen.getByText('1 of 4')).toBeTruthy(); // causes before pickup
    const repeat = within(screen.getByRole('region', { name: 'Clients who complained more than once' }));
    expect(repeat.getAllByText('C010')).toHaveLength(2);
    expect(repeat.queryByText('C055')).toBeNull();
  });

  it('opens the first complaint, and a triaged one shows its causes by stage and the draft', async () => {
    mockApi(routes);
    renderScreen(<ComplaintsScreen />);
    expect(await screen.findByRole('heading', { name: 'CMP001' })).toBeTruthy();
    expect(screen.getByText('Not triaged yet. Triage looks up the delivery’s causes and drafts a reply.')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'All' }));
    fireEvent.click(screen.getByRole('button', { name: 'CMP002' }));
    const open = within(screen.getByRole('region', { name: 'Complaint' }));
    expect(open.getAllByText('After pickup')).toHaveLength(2); // the pill and the track label
    expect(open.getByText('f_lane')).toBeTruthy();
    expect(open.getByText('More than 20% over the planned route')).toBeTruthy();
    expect(screen.getByText('AI draft')).toBeTruthy();
    expect(screen.getByText('Last triaged 28 Oct 2026, 16:05')).toBeTruthy();
  });

  it('Show filters to escalations or to complaints not triaged yet', async () => {
    mockApi(routes);
    renderScreen(<ComplaintsScreen />);
    await screen.findByRole('button', { name: 'CMP001' });
    fireEvent.click(screen.getByRole('button', { name: 'All' }));
    expect(screen.getByRole('button', { name: 'CMP002' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Not triaged' }));
    expect(screen.queryByRole('button', { name: 'CMP002' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Escalate' }));
    expect(screen.getByRole('button', { name: 'CMP001' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'CMP002' })).toBeNull();
  });

  it('AC-CMP-02 (UI): customer support triages a complaint and sees the cause and the draft', async () => {
    const fetch = mockApi(routes);
    renderScreen(<ComplaintsScreen />, asRole('customer_support'));
    fireEvent.click(await screen.findByRole('button', { name: 'CMP001' }));
    fireEvent.click(screen.getByRole('button', { name: 'Triage' }));
    expect(await screen.findByText(/address was incomplete/)).toBeTruthy();
    const open = within(screen.getByRole('region', { name: 'Complaint' }));
    expect(open.getByText('Started before pickup')).toBeTruthy();
    expect(open.getByText('Incomplete address')).toBeTruthy();
    await waitFor(() => expect((fetch.mock.calls as unknown as [string, RequestInit][])
      .some(([url, init]) => url === '/api/complaints/CMP001/triage' && init?.method === 'POST')).toBe(true));
  });

  it('AC-AUTH-10: leadership and the order desk see no Triage button, only why', async () => {
    for (const role of ['leadership', 'order_desk'] as const) {
      mockApi(routes);
      renderScreen(<ComplaintsScreen />, asRole(role));
      fireEvent.click(await screen.findByRole('button', { name: 'CMP001' }));
      expect(screen.queryByRole('button', { name: 'Triage' }), role).toBeNull();
      expect(screen.getByText('Triage is available to customer support and admin.')).toBeTruthy();
      cleanup();
    }
  });

  it('has no export button', async () => {
    mockApi(routes);
    renderScreen(<ComplaintsScreen />);
    await screen.findByRole('button', { name: 'CMP001' });
    expect(screen.queryByText(/Export/)).toBeNull();
  });
});
