import { cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { asRole, mockApi, renderScreen } from '../test-utils';
import { IntakeScreen, localMinute } from './IntakeScreen';

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
  afterEach(() => { cleanup(); localStorage.clear(); });

  it('E18: "Order review" in the rail opens the review in the reading pane', async () => {
    mockApi({ '/api/intake': { emails: [item(34)] }, '/api/intake/34': detail(34), '/api/intake/review': { orders: [] } });
    renderScreen(<IntakeScreen />);
    fireEvent.click(await screen.findByRole('button', { name: 'Order review' }));
    expect(await screen.findByText('No all-clear orders are waiting for approval.')).toBeTruthy();
  });

  it('AC-INT-10 (UI): an email from an unknown sender says in the order summary that it was not read', async () => {
    const unknown = detail(50, {
      email: { ...detail(50).email, from: 'buyer@unknown-co.example', clientId: null, redactedBody: null },
      decision: 'MISSING_INFO', extraction: null, replySource: 'template',
      checks: { address: null, promise: null, warehouse: null, carrier: null },
    });
    mockApi({ '/api/intake': { emails: [item(50, { clientId: null, from: 'buyer@unknown-co.example', decision: 'MISSING_INFO', priority: false })] },
      '/api/intake/50': unknown });
    renderScreen(<IntakeScreen />);
    fireEvent.click(await screen.findByRole('button', { name: 'Open email 50' }));
    expect(await screen.findByText(/Not read by the AI and no automatic reply/)).toBeTruthy();
  });

  it('shows unread threads in bold until opened, and can mark a thread unread again', async () => {
    mockApi({ '/api/intake': { emails: [item(34), item(2, { priority: false })] }, '/api/intake/34': detail(34), '/api/intake/2': detail(2) });
    renderScreen(<IntakeScreen />);
    const row = (id: number) => screen.getByRole('button', { name: `Open email ${id}` });
    await screen.findByRole('button', { name: 'Open email 34' });
    await waitFor(() => expect(row(34).dataset.unread).toBeUndefined());
    expect(row(2).dataset.unread).toBe('true');
    fireEvent.click(row(2));
    await waitFor(() => expect(row(2).dataset.unread).toBeUndefined());
    fireEvent.click(await screen.findByRole('button', { name: 'More actions' }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Mark as unread' }));
    expect(row(2).dataset.unread).toBe('true');
    expect(JSON.parse(localStorage.getItem('rr.intake.read')!)).toEqual([34]);
  });

  it('marks priority clients, and shows the email, the order summary and the reply', async () => {
    mockApi({ '/api/intake': { emails: [item(34), item(2, { priority: false, clientId: 'C004', from: 'orders@client004.example' })] },
      '/api/intake/34': detail(34) });
    renderScreen(<IntakeScreen />);
    expect(await screen.findAllByTitle('Tier 1 or at-risk client: handled first')).toHaveLength(1);
    expect(screen.getByText('Synthetic data')).toBeTruthy();
    fireEvent.click(await screen.findByRole('button', { name: 'Open email 34' }));
    expect(await screen.findByText(/Ship to:/)).toBeTruthy();
    expect(screen.getByText(/Missing: street address, ZIP code/)).toBeTruthy();
    expect(screen.getByText('77 units')).toBeTruthy();
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
    fireEvent.click(screen.getByRole('button', { name: 'Request address' }));
    await waitFor(() => expect(calls(fetch).some(([url, init]) => url.endsWith('/api/intake/34/action')
      && JSON.parse(String(init.body)).reply === 'Hello Sam,\nWhich dock number?')).toBe(true));
  });

  /** The actions posted for an email, in order. */
  const actions = (fetch: ReturnType<typeof mockApi>, id: number) => calls(fetch)
    .filter(([url]) => url.endsWith(`/api/intake/${id}/action`)).map(([, init]) => JSON.parse(String(init.body)).action);

  it('design §5: a warning from the approval (auto-advance did not run) is shown to the person who approved', async () => {
    const warning = 'Auto-advance did not run (x): send it to the WMS by hand.';
    mockApi({ '/api/intake': { emails: [item(34)] }, '/api/intake/34': detail(34),
      '/api/intake/34/action': { status: 'APPROVED', warning } });
    renderScreen(<IntakeScreen />);
    fireEvent.click(await screen.findByRole('button', { name: 'Open email 34' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Request address' }));
    expect(await screen.findByText(new RegExp(warning.replace(/[()]/g, '\\$&')))).toBeTruthy();
  });

  it('AC-SEC-04 (UI): an incomplete order is not approved, only its request is sent, and it cannot go to the WMS', async () => {
    const fetch = mockApi({ '/api/intake': { emails: [item(34)] }, '/api/intake/34': detail(34),
      '/api/intake/34/action': { status: 'APPROVED' } });
    renderScreen(<IntakeScreen />);
    fireEvent.click(await screen.findByRole('button', { name: 'Open email 34' }));
    expect(await screen.findByText('Confirm address', { selector: 'b' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Approve & send' })).toBeNull();
    expect(screen.getByText('Pending address').getAttribute('aria-current')).toBe('step');
    expect(screen.getByText('Reply sent').getAttribute('aria-current')).toBeNull();
    expect(screen.queryByText('Approve')).toBeNull();
    const send = screen.getByRole('button', { name: 'Request address' });
    expect(screen.queryByLabelText('Push to WMS after sending')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Send to WMS' })).toBeNull();
    fireEvent.click(send);
    await waitFor(() => expect(actions(fetch, 34)).toEqual(['approve', 'send_reply']));
  });

  it('AC-SEC-04 (UI): an approved ALL_CLEAR order goes to the WMS after the reply, unless the operator unticks it', async () => {
    const clear = (id: number) => detail(id, { decision: 'ALL_CLEAR' });
    const fetch = mockApi({ '/api/intake': { emails: [item(34, { decision: 'ALL_CLEAR' }), item(35, { decision: 'ALL_CLEAR', priority: false })] },
      '/api/intake/34': clear(34), '/api/intake/35': clear(35), '/api/intake/34/action': { status: 'SENT' }, '/api/intake/35/action': { status: 'SENT' } });
    renderScreen(<IntakeScreen />);
    fireEvent.click(await screen.findByRole('button', { name: 'Open email 34' }));
    expect((await screen.findByLabelText('Push to WMS after sending') as HTMLInputElement).checked).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: 'Approve & send' }));
    await waitFor(() => expect(actions(fetch, 34)).toEqual(['approve', 'send_reply', 'send_to_wms']));
    fireEvent.click(screen.getByRole('button', { name: 'Open email 35' }));
    fireEvent.click(await screen.findByLabelText('Push to WMS after sending'));
    fireEvent.click(screen.getByRole('button', { name: 'Approve & send' }));
    await waitFor(() => expect(actions(fetch, 35)).toEqual(['approve', 'send_reply']));
  });

  it('AC-SEC-04 (UI): an approved ALL_CLEAR order whose reply has not gone out can still be sent to the WMS on its own', async () => {
    const approved = detail(34, { decision: 'ALL_CLEAR', email: { ...detail(34).email, status: 'APPROVED' }, replySent: false });
    const fetch = mockApi({ '/api/intake': { emails: [item(34, { decision: 'ALL_CLEAR', status: 'APPROVED' })] },
      '/api/intake/34': approved, '/api/intake/34/action': { status: 'ENTERED' } });
    renderScreen(<IntakeScreen />);
    fireEvent.click(await screen.findByRole('button', { name: 'Open email 34' }));
    expect(await screen.findByRole('button', { name: 'Send reply' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Send to WMS' }));
    await waitFor(() => expect(actions(fetch, 34)).toEqual(['send_to_wms']));
  });

  it('an order in the WMS whose reply has not gone out still offers Send reply, and nothing more once it has', async () => {
    const entered = (replySent: boolean) => detail(34, { decision: 'ALL_CLEAR', email: { ...detail(34).email, status: 'ENTERED' }, replySent });
    const fetch = mockApi({ '/api/intake': { emails: [item(34, { decision: 'ALL_CLEAR', status: 'ENTERED' })] },
      '/api/intake/34': entered(false), '/api/intake/34/action': { status: 'ENTERED' } });
    renderScreen(<IntakeScreen />);
    fireEvent.click(await screen.findByRole('button', { name: 'Open email 34' }));
    expect((await screen.findByLabelText('Reply') as HTMLTextAreaElement).readOnly).toBe(false);
    expect(screen.queryByText('Reply sent and order in the WMS')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Send to WMS' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Send reply' }));
    await waitFor(() => expect(actions(fetch, 34)).toEqual(['send_reply']));
    cleanup();
    mockApi({ '/api/intake': { emails: [item(34, { decision: 'ALL_CLEAR', status: 'ENTERED' })] }, '/api/intake/34': entered(true) });
    renderScreen(<IntakeScreen />);
    fireEvent.click(await screen.findByRole('button', { name: 'Open email 34' }));
    expect(await screen.findByText('Reply sent and order in the WMS')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Send reply' })).toBeNull();
  });

  it('shows a client reply in the same thread as the order it answers', async () => {
    mockApi({ '/api/intake': { emails: [item(35, { inReplyTo: 34, subject: '[SYNTHETIC] Re: Order 34', decision: 'ALL_CLEAR' }), item(34, { status: 'SENT' })] },
      '/api/intake/35': detail(35, { email: { ...detail(35).email, inReplyTo: 34 }, decision: 'ALL_CLEAR' }) });
    renderScreen(<IntakeScreen />);
    expect(await screen.findByRole('button', { name: 'Open email 35' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Open email 34' })).toBeNull();
    expect(screen.getByText('2 emails')).toBeTruthy();
    expect(await screen.findByText(/Email 34 ·/)).toBeTruthy();
    expect(screen.getByRole('heading', { name: /^Order 34/ })).toBeTruthy();
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

  describe('paste form: bad input (REQ-INT-16)', () => {
    /** The API refuses /api/intake/email with `status` and `body`; every other route answers from `routes`. */
    const refusing = (status: number, body: object, routes: Record<string, unknown> = { '/api/intake': { emails: [] } }) => {
      const fetch = mockApi(routes);
      const base = fetch.getMockImplementation()!;
      fetch.mockImplementation(async (url: string) => (new URL(url, 'http://localhost').pathname === '/api/intake/email'
        ? { ok: false, status, json: async () => body } as Response : base(url)));
      return fetch;
    };
    const openPaste = async () => fireEvent.click(await screen.findByRole('button', { name: 'Paste an email' }));
    const type = (label: string, value: string) => fireEvent.change(screen.getByLabelText(label), { target: { value } });
    const process = () => screen.getByRole('button', { name: 'Process email' }) as HTMLButtonElement;

    it("AC-INT-19: the API's readable refusal is shown next to the form and the field is marked; the typed email is kept", async () => {
      refusing(400, { error: 'From must be an email address, like orders@client190.example.',
        fields: { from: 'From must be an email address, like orders@client190.example.' } });
      renderScreen(<IntakeScreen />);
      await openPaste();
      type('From', 'not-an-email');
      type('Body', 'Please send 10 x HX-220.');
      fireEvent.click(process());
      const alert = await screen.findByRole('alert');
      expect(alert.textContent).toContain('From must be an email address, like orders@client190.example.');
      expect(screen.getByRole('form', { name: 'Paste an email' }).contains(alert)).toBe(true);
      expect(screen.getByLabelText('From').getAttribute('aria-invalid')).toBe('true');
      expect(screen.getByLabelText('Body').getAttribute('aria-invalid')).toBeNull();
      expect((screen.getByLabelText('Body') as HTMLTextAreaElement).value).toBe('Please send 10 x HX-220.');
      type('From', 'orders@client190.example'); // editing the field clears its mark
      expect(screen.getByLabelText('From').getAttribute('aria-invalid')).toBeNull();
    });

    it('AC-INT-19: a request over the size limit (413) shows the API sentence, not "Refresh and try again"', async () => {
      refusing(413, { error: 'The request is larger than 1 MB. Paste only the text of one email.', fields: {} });
      renderScreen(<IntakeScreen />);
      await openPaste();
      type('Body', 'x');
      fireEvent.click(process());
      expect((await screen.findByRole('alert')).textContent).toContain('The request is larger than 1 MB. Paste only the text of one email.');
      expect(screen.queryByText(/Refresh and try again/)).toBeNull();
    });

    it('AC-INT-19: a server failure without a readable message stays generic (no server text)', async () => {
      refusing(500, { statusCode: 500, error: 'Internal Server Error', message: 'relation "x" does not exist' });
      renderScreen(<IntakeScreen />);
      await openPaste();
      type('Body', 'x');
      fireEvent.click(process());
      expect(await screen.findByText('Could not do that. Refresh and try again.')).toBeTruthy();
      expect(screen.queryByText(/relation/)).toBeNull();
    });

    it('AC-INT-19: Process email is disabled for an empty or whitespace-only body', async () => {
      mockApi({ '/api/intake': { emails: [] } });
      renderScreen(<IntakeScreen />);
      await openPaste();
      expect(process().disabled).toBe(true);
      type('Body', '  \n\t ');
      expect(process().disabled).toBe(true);
      type('Body', 'Please send 10 x HX-220.');
      expect(process().disabled).toBe(false);
    });

    it('AC-INT-19: Received at is a date-time picker that stops at now; a future or empty time does not send', async () => {
      const fetch = mockApi({ '/api/intake': { emails: [] } });
      renderScreen(<IntakeScreen />);
      await openPaste();
      const at = screen.getByLabelText('Received at') as HTMLInputElement;
      expect(at.type).toBe('datetime-local');
      expect(at.value).toBe('2026-10-21T08:05');
      expect(at.max).toBe(localMinute(new Date()));
      type('Body', 'Please send 10 x HX-220.');
      expect(process().disabled).toBe(false);
      type('Received at', '2099-01-01T09:00');
      expect(screen.getByText('Received at is in the future. Pick when the email arrived.')).toBeTruthy();
      expect(at.getAttribute('aria-invalid')).toBe('true');
      expect(process().disabled).toBe(true);
      type('Received at', '');
      expect(screen.getByText('Pick when the email arrived.')).toBeTruthy();
      expect(process().disabled).toBe(true);
      expect(calls(fetch).some(([url]) => url.endsWith('/api/intake/email'))).toBe(false);
    });

    it('AC-INT-19: the picked time is sent as "YYYY-MM-DD HH:mm"', async () => {
      const fetch = mockApi({ '/api/intake': { emails: [] }, '/api/intake/email': { id: 7, decision: 'ALL_CLEAR' } });
      renderScreen(<IntakeScreen />);
      await openPaste();
      type('Received at', '2026-09-14T09:30');
      type('Body', 'Please send 10 x HX-220.');
      fireEvent.click(process());
      await waitFor(() => expect(calls(fetch).some(([url]) => url.endsWith('/api/intake/email'))).toBe(true));
      const [, init] = calls(fetch).find(([url]) => url.endsWith('/api/intake/email'))!;
      expect(JSON.parse(String(init?.body)).receivedAt).toBe('2026-09-14 09:30');
    });

    it('AC-INT-19: the body shows its length against the limit; over it, the form says so and does not send', async () => {
      const fetch = mockApi({ '/api/intake': { emails: [], limits: { bodyChars: 1000, subjectChars: 300, fromChars: 320 } } });
      renderScreen(<IntakeScreen />);
      await openPaste();
      type('Body', 'x'.repeat(20));
      expect(await screen.findByText('20 / 1,000 characters')).toBeTruthy();
      type('Body', 'x'.repeat(1001));
      expect(screen.getByText('The email body is longer than 1,000 characters (1,001 now).')).toBeTruthy();
      expect(process().disabled).toBe(true);
      expect(calls(fetch).some(([url]) => url.endsWith('/api/intake/email'))).toBe(false);
    });
  });

  it('AC-INT-08 (UI): reports a manual Gmail check', async () => {
    mockApi({ '/api/intake': { emails: [item(34)] }, '/api/intake/fetch': { fetched: 3, processed: 1, retried: 0, ok: true } });
    renderScreen(<IntakeScreen />);
    fireEvent.click(await screen.findByRole('button', { name: 'Sync' }));
    expect(await screen.findByText('Checked Gmail: 1 new email.')).toBeTruthy();
  });

  it('explains a refused reply without showing server text', async () => {
    const fetch = mockApi({ '/api/intake': { emails: [item(34, { status: 'APPROVED' })] },
      '/api/intake/34': detail(34, { email: { ...detail(34).email, status: 'APPROVED' } }) });
    fetch.mockImplementation(async (url: string) => {
      const path = new URL(url, 'http://localhost').pathname;
      if (path === '/api/intake/34/action') return { ok: false, status: 503, json: async () => ({ error: 'Gmail is not set up (GMAIL_* in .env): reply not sent' }) } as Response;
      const body = path === '/api/intake' ? { emails: [item(34, { status: 'APPROVED' })] } : detail(34, { email: { ...detail(34).email, status: 'APPROVED' } });
      return { ok: true, status: 200, json: async () => body } as Response;
    });
    renderScreen(<IntakeScreen />);
    fireEvent.click(await screen.findByRole('button', { name: 'Open email 34' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Request address' }));
    expect(await screen.findByText('Not sent: Gmail is not connected yet.')).toBeTruthy();
    expect(screen.queryByText(/GMAIL_/)).toBeNull();
  });

  describe('sign-in and roles (P7)', () => {
    const clear = detail(34, { decision: 'ALL_CLEAR' });
    const routes = { '/api/intake': { emails: [item(34, { decision: 'ALL_CLEAR' })] }, '/api/intake/34': clear,
      '/api/intake/34/action': { status: 'SENT' } };

    it('AC-AUTH-10: leadership sees no Sync, Paste, Approve, Send reply or Send to WMS control', async () => {
      mockApi(routes);
      renderScreen(<IntakeScreen />, asRole('leadership'));
      fireEvent.click(await screen.findByRole('button', { name: 'Open email 34' }));
      await screen.findByLabelText('Reply');
      for (const name of ['Sync', 'Paste an email', 'Paste email', 'Approve & send', 'Send reply', 'Send to WMS', 'Save draft']) {
        expect(screen.queryByRole('button', { name }), name).toBeNull();
      }
      expect(screen.queryByLabelText('Push to WMS after sending')).toBeNull();
      expect((screen.getByLabelText('Reply') as HTMLTextAreaElement).readOnly).toBe(true);
    });

    it('REQ-AUTH-07, Q-AUTH-03: order_desk approves and sends without a user field, and does not send to the WMS', async () => {
      const fetch = mockApi(routes);
      renderScreen(<IntakeScreen />, asRole('order_desk'));
      fireEvent.click(await screen.findByRole('button', { name: 'Open email 34' }));
      await screen.findByLabelText('Reply');
      expect(screen.queryByLabelText('Push to WMS after sending')).toBeNull();
      fireEvent.click(screen.getByRole('button', { name: 'Approve & send' }));
      await waitFor(() => expect(actions(fetch, 34)).toEqual(['approve', 'send_reply']));
      const bodies = calls(fetch).filter(([url]) => url.endsWith('/action')).map(([, init]) => JSON.parse(String(init.body)));
      expect(bodies.every((b) => !('user' in b))).toBe(true);
    });

    it('AC-AUTH-05 (UI): a warehouse supervisor sees only Send to WMS on an approved all-clear order', async () => {
      const approved = { ...clear.email, status: 'APPROVED' };
      const fetch = mockApi({ ...routes, '/api/intake': { emails: [item(34, { decision: 'ALL_CLEAR', status: 'APPROVED' })] },
        '/api/intake/34': { ...clear, email: approved }, '/api/intake/34/action': { status: 'ENTERED' } });
      renderScreen(<IntakeScreen />, asRole('warehouse_supervisor'));
      fireEvent.click(await screen.findByRole('button', { name: 'Open email 34' }));
      fireEvent.click(await screen.findByRole('button', { name: 'Send to WMS' }));
      await waitFor(() => expect(actions(fetch, 34)).toEqual(['send_to_wms']));
      expect(screen.queryByRole('button', { name: 'Send reply' })).toBeNull();
    });

    it('AC-AUTH-11: an ended session keeps the edited reply, links to sign-in and back to the same email, and resends nothing', async () => {
      const fetch = vi.fn(async (url: string) => {
        const path = new URL(url, 'http://localhost').pathname;
        if (path.endsWith('/action')) return { ok: false, status: 401, json: async () => ({ error: 'session_expired' }) } as Response;
        const body = path === '/api/intake' ? routes['/api/intake'] : path === '/api/intake/34' ? detail(34) : null;
        return { ok: Boolean(body), status: body ? 200 : 404, json: async () => body ?? { error: 'not found' } } as Response;
      });
      vi.stubGlobal('fetch', fetch);
      const first = renderScreen(<IntakeScreen />, asRole('order_desk'));
      fireEvent.click(await screen.findByRole('button', { name: 'Open email 34' }));
      fireEvent.change(await screen.findByLabelText('Reply'), { target: { value: 'Hello Sam,\nWhich dock number?' } });
      fireEvent.click(screen.getByRole('button', { name: 'Request address' }));
      const alert = await screen.findByRole('alert');
      expect(alert.textContent).toContain('Your session has ended. Sign in again; your changes are kept.');
      expect(screen.getByRole('link', { name: 'Sign in again' }).getAttribute('href'))
        .toBe(`/login?expired=1&next=${encodeURIComponent('/dashboard/intake?email=34')}`);
      first.unmount();

      // After signing in: /dashboard/intake?email=34 opens that email with the edited text, and nothing is sent by itself.
      window.history.replaceState(null, '', '/dashboard/intake?email=34');
      fetch.mockClear();
      renderScreen(<IntakeScreen />, asRole('order_desk'));
      await waitFor(() => expect((screen.getByLabelText('Reply') as HTMLTextAreaElement).value).toBe('Hello Sam,\nWhich dock number?'));
      expect(fetch.mock.calls.some(([url]) => String(url).endsWith('/action'))).toBe(false);
      window.history.replaceState(null, '', '/');
      vi.unstubAllGlobals();
    });
  });
});
