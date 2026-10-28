import { cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { mockApi, renderScreen } from '../test-utils';
import { IntakeScreen } from './IntakeScreen';

/** The requests the screen made, as [url, init]. */
const calls = (fetch: ReturnType<typeof mockApi>) => fetch.mock.calls as unknown as [string, RequestInit][];

const item = (id: number, over: object = {}) => ({ id, source: 'paste', from: 'orders@client190.example', subject: `[SYNTHETIC] Order ${id}`,
  receivedAt: '2026-10-21 07:27', clientId: 'C190', status: 'AWAITING_APPROVAL', decision: 'CONFIRM_ADDRESS', inReplyTo: null, priority: true, ...over });
const detail = (id: number, over: object = {}) => ({
  email: { id, source: 'paste', from: 'orders@client190.example', subject: `[SYNTHETIC] Order ${id}`, body: 'Ship to:\nDock 2\nOrlando, FL\nThanks,\nSam Kowalski',
    redactedBody: '[SYNTHETIC] Order 34\n\nShip to:\nDock 2\nOrlando, FL\nThanks,\n[PERSON_1]', receivedAt: '2026-10-21 07:27', clientId: 'C190',
    status: 'AWAITING_APPROVAL', inReplyTo: null },
  decision: 'CONFIRM_ADDRESS', replySource: 'model', replyDraft: 'Hello Sam Kowalski,\nPlease send the street address and ZIP code.',
  extraction: { items: [{ sku: 'HX-447', qty: 77 }] },
  checks: { address: { status: 'incomplete', missing: ['address.line1', 'address.zip'], address: null, validation: null },
    promise: { promiseDate: '2026-10-25', reason: null }, warehouse: null, carrier: null },
  ...over,
});

describe('Order emails', () => {
  afterEach(cleanup);

  it('marks priority clients and shows what the AI saw, the checks and the reply for the selected email', async () => {
    mockApi({ '/api/intake': { emails: [item(34), item(2, { priority: false, clientId: 'C004', from: 'orders@client004.example' })] },
      '/api/intake/34': detail(34) });
    renderScreen(<IntakeScreen />);
    expect(await screen.findAllByTitle('Tier 1 or at-risk client: handled first')).toHaveLength(1);
    expect(screen.getByText('Synthetic data')).toBeTruthy();
    fireEvent.click(await screen.findByRole('button', { name: 'Open email 34' }));
    expect(await screen.findByText(/Missing: street address, ZIP code/)).toBeTruthy();
    expect(screen.queryByText('PERSON_1')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'What the AI saw' }));
    expect(screen.getByText('PERSON_1')).toBeTruthy();
    expect(screen.getByText(/Please send the street address and ZIP code/)).toBeTruthy();
    expect(screen.getByText('25 Oct 2026')).toBeTruthy();
  });

  it('searches by sender, client, subject, decision and status, and says when nothing matches', async () => {
    mockApi({ '/api/intake': { emails: [item(34), item(2, { priority: false, clientId: 'C004', from: 'orders@client004.example',
      subject: '[SYNTHETIC] Restock', decision: 'ALL_CLEAR', status: 'ENTERED' })] }, '/api/intake/34': detail(34) });
    renderScreen(<IntakeScreen />);
    await screen.findByRole('button', { name: 'Open email 34' });
    const search = screen.getByLabelText('Search emails');
    const open = () => screen.queryAllByRole('button', { name: /^Open email/ }).map((b) => b.getAttribute('aria-label'));
    for (const q of ['client004', 'c004', 'restock', 'all clear', 'in wms', 'C004 restock']) {
      fireEvent.change(search, { target: { value: q } });
      expect(open()).toEqual(['Open email 2']);
    }
    fireEvent.change(search, { target: { value: 'confirm address' } });
    expect(open()).toEqual(['Open email 34']);
    fireEvent.change(search, { target: { value: 'nothing like this' } });
    expect(open()).toEqual([]);
    expect(screen.getByText('No emails match "nothing like this" in Inbox.')).toBeTruthy();
    fireEvent.change(search, { target: { value: '' } });
    expect(open()).toHaveLength(2);
  });

  it('edits the reply in place and sends the edited text once approved', async () => {
    const approved = { ...detail(34).email, status: 'APPROVED' };
    const fetch = mockApi({ '/api/intake': { emails: [item(34, { status: 'APPROVED' })] }, '/api/intake/34': detail(34, { email: approved }),
      '/api/intake/34/action': { status: 'SENT' } });
    renderScreen(<IntakeScreen />);
    fireEvent.click(await screen.findByRole('button', { name: 'Open email 34' }));
    const box = await screen.findByLabelText('Reply') as HTMLTextAreaElement;
    expect(box.value).toMatch(/Please send the street address and ZIP code/);
    expect(screen.queryByText('An operator approves every reply.')).toBeNull();
    expect(screen.queryByRole('button', { name: /edit/i })).toBeNull();
    fireEvent.change(box, { target: { value: 'Hello Sam,\nWhich dock number?' } });
    fireEvent.click(screen.getByRole('button', { name: 'Send reply' }));
    await waitFor(() => expect(calls(fetch).some(([url, init]) => url.endsWith('/api/intake/34/action')
      && JSON.parse(String(init.body)).reply === 'Hello Sam,\nWhich dock number?')).toBe(true));
  });

  it('AC-SEC-04 (UI): sending waits for approval, and only an ALL_CLEAR order can go to the WMS', async () => {
    const fetch = mockApi({ '/api/intake': { emails: [item(34)] }, '/api/intake/34': detail(34),
      '/api/intake/34/action': { status: 'APPROVED' } });
    renderScreen(<IntakeScreen />);
    fireEvent.click(await screen.findByRole('button', { name: 'Open email 34' }));
    const approve = await screen.findByRole('button', { name: 'Approve' });
    expect((screen.getByRole('button', { name: 'Send reply' }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.queryByRole('button', { name: 'Send to WMS' })).toBeNull();
    fireEvent.click(approve);
    await waitFor(() => expect(calls(fetch).some(([url, init]) => url.endsWith('/api/intake/34/action')
      && JSON.parse(String(init.body)).action === 'approve')).toBe(true));
  });

  it('shows the map problem and the chosen warehouse and carrier', async () => {
    mockApi({ '/api/intake': { emails: [item(9), item(2, { decision: 'ALL_CLEAR' })] },
      '/api/intake/9': detail(9, { checks: { address: { status: 'unverified', missing: [],
        address: { line1: '9800 International Dr', line2: 'Dock 3', city: 'Orlando', state: 'FL', zip: '19107' },
        validation: { confidence: 'low', issues: ['zip_mismatch'], suggestion: { zip: '32819' } } }, promise: null, warehouse: null, carrier: null } }),
      '/api/intake/2': detail(2, { decision: 'ALL_CLEAR', checks: { address: { status: 'complete', missing: [],
        address: { line1: '705 Pike St', line2: null, city: 'Seattle', state: 'WA', zip: '98101' }, validation: { confidence: 'high', issues: [], suggestion: null } },
        promise: { promiseDate: '2026-10-24', reason: null }, warehouse: { warehouseId: 'W5', reason: 'Nearest warehouse W5 has stock.' },
        carrier: { carrier: 'A', reason: 'Carrier A for West standard' } } }) });
    renderScreen(<IntakeScreen />);
    fireEvent.click(await screen.findByRole('button', { name: 'Open email 9' }));
    expect(await screen.findByText(/ZIP code does not match the city/)).toBeTruthy();
    expect(screen.getByText(/map shows 32819/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Open email 2' }));
    expect(await screen.findByText(/Nearest warehouse W5 has stock/)).toBeTruthy();
    expect(screen.getByText(/Carrier A for West standard/)).toBeTruthy();
  });

  it('links a pasted reply to the email waiting for an address', async () => {
    const sent = { ...detail(34).email, status: 'SENT' };
    const fetch = mockApi({ '/api/intake': { emails: [item(34, { status: 'SENT' })] }, '/api/intake/34': detail(34, { email: sent }),
      '/api/intake/email': { id: 35, status: 'AWAITING_APPROVAL', decision: 'ALL_CLEAR' } });
    renderScreen(<IntakeScreen />);
    fireEvent.click(await screen.findByRole('button', { name: 'Open email 34' }));
    fireEvent.click(await screen.findByRole('button', { name: "Paste client's reply" }));
    expect(await screen.findByText(/This will be linked as the reply to email 34/)).toBeTruthy();
    fireEvent.change(screen.getByLabelText('Body'), { target: { value: 'Use 400 S Orange Ave, ZIP 32801' } });
    fireEvent.click(screen.getByRole('button', { name: 'Process email' }));
    await waitFor(() => {
      const call = calls(fetch).find(([url]) => url.endsWith('/api/intake/email'));
      expect(call && JSON.parse(String(call[1].body))).toMatchObject({ inReplyTo: 34, body: 'Use 400 S Orange Ave, ZIP 32801' });
    });
    expect(await screen.findByText('Email 35: ALL_CLEAR')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Paste an email' }));
    expect((screen.getByLabelText('Body') as HTMLTextAreaElement).value).toBe('');
  });

  it('AC-INT-08 (UI): shows how often Gmail is checked and how the last check went, and reports a manual check', async () => {
    const lastPoll = { trigger: 'schedule', startedAt: '2026-10-28T10:00:00.000Z', processed: 2, retried: 1, ok: true };
    mockApi({ '/api/intake': { emails: [item(34)], pollMinutes: 10, lastPoll },
      '/api/intake/fetch': { fetched: 3, processed: 1, retried: 0, ok: true } });
    renderScreen(<IntakeScreen />);
    expect(await screen.findByText('Gmail is checked every 10 min.')).toBeTruthy();
    expect(screen.getByText(/Last check .* \(automatic\): 2 new emails, 1 retried\./)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Fetch from Gmail' }));
    expect(await screen.findByText('Checked Gmail: 1 new email.')).toBeTruthy();
  });

  it('says when the automatic check is off', async () => {
    mockApi({ '/api/intake': { emails: [], pollMinutes: 0, lastPoll: null } });
    renderScreen(<IntakeScreen />);
    expect(await screen.findByText('Automatic Gmail check is off.')).toBeTruthy();
  });

  it('explains a refused reply without showing server text', async () => {
    const fetch = mockApi({ '/api/intake': { emails: [item(34, { status: 'APPROVED' })] },
      '/api/intake/34': detail(34, { email: { ...detail(34).email, status: 'APPROVED' } }) });
    fetch.mockImplementation(async (url: string) => {
      const path = new URL(url).pathname;
      if (path === '/api/intake/34/action') return { ok: false, status: 503, json: async () => ({ error: 'Gmail is not set up (GMAIL_* in .env): reply not sent' }) } as Response;
      const body = path === '/api/intake' ? { emails: [item(34, { status: 'APPROVED' })] } : detail(34, { email: { ...detail(34).email, status: 'APPROVED' } });
      return { ok: true, status: 200, json: async () => body } as Response;
    });
    renderScreen(<IntakeScreen />);
    fireEvent.click(await screen.findByRole('button', { name: 'Open email 34' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Send reply' }));
    expect(await screen.findByText('Not sent: Gmail is not connected yet.')).toBeTruthy();
    expect(screen.queryByText(/GMAIL_/)).toBeNull();
  });
});
