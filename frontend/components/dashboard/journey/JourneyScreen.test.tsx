import { cleanup, fireEvent, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { mockApi, renderScreen } from '../test-utils';
import { JourneyScreen } from './JourneyScreen';

const stage = (n: number, key: string, label: string, status: string, extra: object = {}) =>
  ({ n, key, label, status, at: null, actor: '—', source: 'real', detail: `${label} detail`, ...extra });

const LANE = 'Carrier E for Northeast standard: 96% on time vs 57% for F; $1.63 more per shipment';
const D000213 = {
  ref: 'delivery:D000213', kind: 'delivery', synthetic: true, rounds: [],
  summary: { clientId: 'C190', tier: 'Tier 1', channel: 'Email', commitment: 'standard', destination: 'Northeast',
    promisedDate: '2026-04-05', outcome: '4 days late' },
  stages: [
    stage(1, 'received', 'Order received', 'done', { at: '2026-04-01 11:04', actor: 'Client' }),
    stage(2, 'read', 'Order read', 'done', { actor: 'Person' }),
    stage(3, 'address', 'Address checked', 'failed', { withLateLens: 'Decision CONFIRM_ADDRESS: the client is asked.' }),
    stage(4, 'promise', 'Promise set', 'done', { at: '2026-04-01 11:04' }), stage(5, 'warehouse', 'Warehouse chosen', 'done'),
    stage(6, 'carrier', 'Carrier chosen', 'failed', { withLateLens: LANE }),
    stage(7, 'approved', 'Approved', 'skipped'), stage(8, 'told', 'Client told', 'skipped'),
    stage(9, 'wms', 'Entered in WMS', 'done', { at: '2026-04-01 11:04', actor: 'Person', detail: 'Keyed in by hand as ORD-46195691.' }),
    stage(10, 'picked', 'Picked', 'done', { at: '2026-04-02', actor: 'W4' }),
    stage(11, 'handed', 'Handed to carrier', 'done', { at: '2026-04-02 09:56', actor: 'Carrier F' }),
    stage(12, 'transit', 'In transit', 'done', { at: '2026-04-02 15:56', actor: 'Carrier F', source: 'synthetic' }),
    stage(13, 'delivered', 'Delivered', 'failed', { at: '2026-04-09', actor: 'Carrier F' }),
    stage(14, 'notice', 'Delay notice', 'skipped'),
  ],
};
const INBOX = { emails: [{ id: 8, decision: 'ALL_CLEAR', status: 'AWAITING_APPROVAL' }] };
const heading = () => screen.getByRole('heading', { level: 1 }).textContent;
/** A place's label on the board. */
const place = (name: RegExp) => within(screen.getByRole('region', { name: 'Journey map' })).getByRole('button', { name });
/** The stages of the open place, shown beside its node. */
const popup = (title: string) => screen.getByRole('group', { name: `${title}: stages` });

describe('Order journey', () => {
  afterEach(cleanup);

  it('AC-JRN-07: says when it was delivered and which decisions made it late, with the parcel on the first that went wrong', async () => {
    mockApi({ '/api/journey/delivery:D000213': D000213, '/api/intake': INBOX });
    renderScreen(<JourneyScreen initialRef="delivery:D000213" />);
    expect(await screen.findByText('Delivered 9 April, four days after the promise.')).toBeTruthy();
    expect(screen.getByText('ORD-46195691 · Northeast standard')).toBeTruthy();
    expect(screen.getByText(/^Two decisions caused it: the order went ahead with an incomplete address, and it was given to Carrier F/)).toBeTruthy();
    expect(place(/Order intake/).getAttribute('aria-pressed')).toBe('true');
    expect(screen.queryByRole('group', { name: /: stages$/ })).toBeNull();
    expect(screen.queryByRole('region', { name: 'Stages' })).toBeNull();
  });

  it('AC-JRN-08: selecting a place opens its stages beside its node, and synthetic stages are marked', async () => {
    mockApi({ '/api/journey/delivery:D000213': D000213, '/api/intake': INBOX });
    renderScreen(<JourneyScreen initialRef="delivery:D000213" />);
    await screen.findByRole('region', { name: 'Journey map' });
    fireEvent.click(place(/Planning/));
    const rows = within(popup('Planning')).getAllByRole('listitem');
    expect(rows.map((r) => r.querySelector('span > span > b')?.textContent)).toEqual(['Promise set', 'Warehouse chosen', 'Carrier chosen', 'Approved']);
    expect(rows[2].textContent).toMatch(/Went wrong here/);
    expect(place(/Planning/).getAttribute('aria-expanded')).toBe('true');
    fireEvent.click(place(/Carrier dock/));
    expect(screen.queryByRole('group', { name: 'Planning: stages' })).toBeNull();
    expect(within(popup('Carrier dock')).getByRole('listitem').textContent)
      .toMatch(/^09:562 Apr11Handed to carrierDoneCarrier FHanded to carrier detail$/);
    fireEvent.click(place(/Last mile/));
    expect(popup('Last mile').textContent).toMatch(/In transit.*Synthetic data/);
    expect(place(/Warehouse W4/).textContent).toMatch(/Picked 2 Apr/);
  });

  it('the open place closes on its close button, on Escape, and when selected again', async () => {
    mockApi({ '/api/journey/delivery:D000213': D000213, '/api/intake': INBOX });
    renderScreen(<JourneyScreen initialRef="delivery:D000213" />);
    await screen.findByRole('region', { name: 'Journey map' });
    fireEvent.click(place(/Planning/));
    fireEvent.click(within(popup('Planning')).getByRole('button', { name: 'Close' }));
    expect(screen.queryByRole('group', { name: 'Planning: stages' })).toBeNull();
    fireEvent.click(place(/Planning/));
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(screen.queryByRole('group', { name: 'Planning: stages' })).toBeNull();
    fireEvent.click(place(/Planning/));
    fireEvent.click(place(/Planning/));
    expect(screen.queryByRole('group', { name: 'Planning: stages' })).toBeNull();
  });

  it('With Root Route toggle: shows the rule on the same facts on the map and in the stages', async () => {
    mockApi({ '/api/journey/delivery:D000213': D000213, '/api/intake': INBOX });
    renderScreen(<JourneyScreen initialRef="delivery:D000213" />);
    const rr = await screen.findByRole('switch', { name: 'With Root Route' });
    expect(rr.getAttribute('aria-checked')).toBe('false');
    expect(place(/Planning/).textContent).toMatch(/Carrier F on a late lane/);
    fireEvent.click(rr);
    expect(rr.getAttribute('aria-checked')).toBe('true');
    expect(heading()).toBe('The same order, with Root Route’s two decisions.');
    expect(place(/Planning/).textContent).toMatch(/Carrier E, \+\$1\.63 \/ shipment/);
    expect(place(/Order intake/).textContent).toMatch(/Address confirmed first/);
    fireEvent.click(place(/Planning/));
    expect(within(popup('Planning')).getAllByText('Changed by Root Route')).toHaveLength(1);
    expect(within(popup('Planning')).getByText(LANE)).toBeTruthy();
    expect(within(popup('Planning')).getByText('As recorded: Carrier chosen detail')).toBeTruthy();
    fireEvent.click(place(/Order intake/));
    expect(within(popup('Order intake')).getByText(/CONFIRM_ADDRESS/)).toBeTruthy();
    fireEvent.click(rr);
    expect(heading()).toBe('Delivered 9 April, four days after the promise.');
    expect(within(popup('Order intake')).queryByText('Changed by Root Route')).toBeNull();
  });

  it('lists orders in plain words to choose from, including recent email orders', async () => {
    const order = { ...D000213, ref: 'email:8', kind: 'order', summary: { ...D000213.summary, outcome: 'awaiting approval' },
      stages: D000213.stages.map((st) => (st.n >= 10 ? { ...st, status: 'not_reached', at: null } : st)) };
    const fetch = mockApi({ '/api/journey/delivery:D000213': D000213, '/api/intake': INBOX, '/api/journey/email:8': order });
    renderScreen(<JourneyScreen initialRef="delivery:D000213" />);
    expect(await screen.findByRole('option', { name: 'Email order 8 — awaiting approval' })).toBeTruthy();
    const select = screen.getByLabelText('Order') as HTMLSelectElement;
    expect(select.selectedOptions[0].textContent).toBe('Delivery D000213 — incomplete address, slow carrier lane');
    expect(screen.queryByLabelText('Delivery ID')).toBeNull();
    fireEvent.change(select, { target: { value: 'email:8' } });
    expect(await screen.findByText(/^Awaiting approval: \d+ of 14 steps done\.$/)).toBeTruthy();
    expect(screen.queryByRole('switch', { name: 'With Root Route' })).toBeNull();
    expect(place(/Last mile/).textContent).toMatch(/Not reached yet/);
    expect(fetch.mock.calls.some(([url]) => String(url).endsWith('/api/journey/email:8'))).toBe(true);
  });

  it('opens any other delivery from its ID, with or without the leading zeros', async () => {
    const fetch = mockApi({ '/api/journey/delivery:D000213': D000213, '/api/intake': INBOX });
    renderScreen(<JourneyScreen initialRef="delivery:D000559" />);
    fireEvent.change(await screen.findByLabelText('Order'), { target: { value: 'other' } });
    const box = screen.getByLabelText('Delivery ID');
    fireEvent.change(box, { target: { value: 'not an id' } });
    expect((screen.getByRole('button', { name: 'Inspect' }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.change(box, { target: { value: '213' } });
    fireEvent.click(screen.getByRole('button', { name: 'Inspect' }));
    expect(await screen.findByText('Delivered 9 April, four days after the promise.')).toBeTruthy();
    expect(fetch.mock.calls.some(([url]) => String(url).endsWith('/api/journey/delivery:D000213'))).toBe(true);
  });

  it('says so when the ref is not found', async () => {
    mockApi({ '/api/intake': INBOX });
    renderScreen(<JourneyScreen initialRef="delivery:D999999" />);
    expect((await screen.findByRole('alert')).textContent).toMatch(/No delivery found with ID D999999/);
    expect((screen.getByLabelText('Delivery ID') as HTMLInputElement).value).toBe('D999999');
  });
});
