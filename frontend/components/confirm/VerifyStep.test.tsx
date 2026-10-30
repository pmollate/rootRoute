import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { renderToString } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { LinkView } from './ConfirmScreen';
import { LINK_INVALID_TEXT } from './text';
import { type VerifyView, VerifyStep } from './VerifyStep';

// The address page after verification renders the real ConfirmScreen; its map is a stub here.
vi.mock('./ConfirmMap', () => ({ ConfirmMap: () => <div data-testid="map" /> }));

const TOKEN = 'A'.repeat(43);
const VT = 'V'.repeat(43);
const view: VerifyView = { verify: { sentTo: 'o•••••@client130.example' }, expiresAt: '2026-10-31T10:22:00.000Z', synthetic: true };
const full: LinkView = {
  address: { line1: '920 Broad St', line2: 'Dock 5', city: 'Newark', state: 'NJ', zip: '85004' },
  pin: null, expiresAt: view.expiresAt, synthetic: true, map: null,
};

type Answer = [number, unknown];
/** fetch stub: answers per route suffix ('code', 'verify', 'view' for the GET, 'confirm' for the Confirm POST), in order. */
function stubFetch(answers: Partial<Record<'code' | 'verify' | 'view' | 'confirm' | 'lookup', Answer[]>>) {
  const fn = vi.fn(async (url: string, init: RequestInit = {}) => {
    const kind = url.endsWith('/code') ? 'code' : url.endsWith('/verify') ? 'verify' : url.endsWith('/lookup') ? 'lookup'
      : init.method === 'POST' ? 'confirm' : 'view';
    const [status, body] = answers[kind]?.shift() ?? [500, {}];
    return { ok: status < 300, status, json: async () => body } as Response;
  });
  vi.stubGlobal('fetch', fn);
  return fn;
}
const calls = (fn: ReturnType<typeof stubFetch>) => fn.mock.calls.map(([url, init]) =>
  ({ url, method: init?.method ?? 'GET', headers: new Headers(init?.headers), body: init?.body ? JSON.parse(String(init.body)) : undefined }));
const digit = (n: number) => screen.getByLabelText(`Digit ${n} of 6`) as HTMLInputElement;
const digits = () => [1, 2, 3, 4, 5, 6].map((n) => digit(n).value).join('');
/** Types or pastes `code` into the first box; the page spreads it over the six. */
const typeCode = (code: string) => fireEvent.change(digit(1), { target: { value: code } });
const button = (name: string) => screen.getByRole('button', { name }) as HTMLButtonElement;

describe('/confirm/{token} verify step (E19, REQ-LINK-17 to -19)', () => {
  afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.useRealTimers(); });

  it('AC-LINK-17 (page): opens on "Check your inbox" with the masked sender (read-only, no Change) and Send code; no address field; nothing is sent on open', () => {
    const fn = stubFetch({});
    render(<VerifyStep token={TOKEN} view={view} />);
    expect(screen.getByRole('heading', { name: 'Check your inbox' })).toBeTruthy();
    expect(document.body.textContent).toContain('o•••••@client130.example');
    expect(screen.queryByRole('textbox', { name: /email/i })).toBeNull(); // the address is shown, never typed or changed
    expect(screen.queryByRole('button', { name: 'Change' })).toBeNull();
    expect(screen.getByRole('timer').textContent).toBe('10:00');
    expect(screen.getByText('0 of 6 digits entered · 5 attempts left')).toBeTruthy();
    expect(button('Send code')).toBeTruthy();
    expect(screen.queryByLabelText('Address line 1')).toBeNull();
    expect(screen.getByText('Synthetic data')).toBeTruthy();
    expect(fn).not.toHaveBeenCalled(); // a code goes only on the button (mail scanners open links)
    expect(screen.getByRole('group', { name: '6-digit code' })).toBeTruthy();
    expect([digit(1).inputMode, digit(1).autocomplete]).toEqual(['numeric', 'one-time-code']);
    expect([digit(2).maxLength, digit(6).maxLength]).toEqual([1, 1]);
  });

  it('AC-LINK-17 (page): the server render holds no locale-formatted expiry (formatted after mount)', () => {
    const html = renderToString(<VerifyStep token={TOKEN} view={view} />);
    expect(html).toContain('This link works for a limited time.');
    expect(html).not.toContain('2026');
  });

  it('AC-LINK-18 (page): Send code posts to /code, says where it went and holds the button for retryIn seconds', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] }); // the countdown's clock only; findBy* keeps its own polling
    const fn = stubFetch({ code: [[200, { sentTo: 'o•••••@client130.example', retryIn: 60 }]] });
    render(<VerifyStep token={TOKEN} view={view} />);
    await act(async () => {
      fireEvent.click(button('Send code'));
      for (let i = 0; i < 20; i += 1) await Promise.resolve(); // the stubbed fetch and json() settle in microtasks
    });
    expect(screen.getByRole('status').textContent).toMatch(/^Code sent at /);
    expect(screen.getByText(/Enter the 6-digit code we sent to/)).toBeTruthy();
    expect(calls(fn)[0]).toMatchObject({ url: `/api/confirm/${TOKEN}/code`, method: 'POST' });
    expect(button('Resend in 01:00').disabled).toBe(true);
    for (let i = 0; i < 59; i += 1) await act(async () => { vi.advanceTimersByTime(1000); }); // one tick per second, as rendered
    expect(button('Resend in 00:01').disabled).toBe(true);
    await act(async () => { vi.advanceTimersByTime(1000); });
    expect(button('Resend code').disabled).toBe(false);
  });

  it('AC-LINK-18 (page): 429 with retryIn waits; 429 with no retryIn says no more codes; 503 asks to try again', async () => {
    stubFetch({ code: [[429, { error: 'code_wait', retryIn: 20 }], [429, { error: 'code_wait', retryIn: null }]] });
    render(<VerifyStep token={TOKEN} view={view} />);
    fireEvent.click(button('Send code'));
    expect((await screen.findByRole('button', { name: 'Send code in 00:20' })).hasAttribute('disabled')).toBe(true);
    cleanup();
    stubFetch({ code: [[429, { error: 'code_wait', retryIn: null }]] });
    render(<VerifyStep token={TOKEN} view={view} />);
    fireEvent.click(button('Send code'));
    expect((await screen.findByRole('alert')).textContent).toBe('No more codes can be sent for this link. Please reply to our email with the delivery address.');
    expect(button('Send code').disabled).toBe(true);
    cleanup();
    stubFetch({ code: [[503, { error: 'email_unavailable' }]] });
    render(<VerifyStep token={TOKEN} view={view} />);
    fireEvent.click(button('Send code'));
    expect((await screen.findByRole('alert')).textContent).toBe('We could not send the code just now. Please try again in a minute.');
  });

  it('AC-LINK-19 (page): Verify is disabled until 6 digits; letters are dropped; wrong and expired codes say so', async () => {
    const fn = stubFetch({ verify: [[422, { error: 'code_wrong', triesLeft: 4 }], [422, { error: 'code_wrong', triesLeft: 1 }],
      [422, { error: 'code_wrong', triesLeft: 0 }], [422, { error: 'code_expired' }]] });
    render(<VerifyStep token={TOKEN} view={view} />);
    expect(button('Verify and continue').disabled).toBe(true);
    typeCode('12a34');
    expect(digits()).toBe('1234'); // letters dropped, digits spread over the boxes
    expect(screen.getByText('4 of 6 digits entered · 5 attempts left')).toBeTruthy();
    expect(button('Verify and continue').disabled).toBe(true);
    fireEvent.keyDown(digit(5), { key: 'Backspace' }); // an empty box: Backspace clears the one before
    expect(digits()).toBe('123');
    typeCode('123456');
    expect(button('Verify and continue').disabled).toBe(false);
    const texts: string[] = [];
    for (let i = 0; i < 4; i += 1) {
      fireEvent.click(button('Verify and continue'));
      await waitFor(() => expect(fn).toHaveBeenCalledTimes(i + 1));
      texts.push((await screen.findByRole('alert')).textContent ?? '');
      await waitFor(() => expect(button('Verify and continue').disabled).toBe(false));
    }
    expect(texts).toEqual(['That code is not right. 4 tries left.', 'That code is not right. 1 try left.',
      'That code is not right. Send a new code.', 'That code has expired. Send a new one.']);
    expect(calls(fn)[0]).toMatchObject({ url: `/api/confirm/${TOKEN}/verify`, method: 'POST', body: { code: '123456' } });
    expect(screen.getByText('6 of 6 digits entered · 0 attempts left')).toBeTruthy();
  });

  it('AC-LINK-19 (page): the right code fetches the address with x-link-verify and shows the address form; Confirm carries the header', async () => {
    const fn = stubFetch({ verify: [[200, { verifyToken: VT }]], view: [[200, full]], confirm: [[200, { status: 'confirmed' }]] });
    render(<VerifyStep token={TOKEN} view={view} />);
    typeCode('654321');
    fireEvent.click(button('Verify and continue'));
    expect(((await screen.findByLabelText('Address line 1')) as HTMLInputElement).value).toBe('920 Broad St');
    const get = calls(fn)[1];
    expect([get.url, get.method, get.headers.get('x-link-verify')]).toEqual([`/api/confirm/${TOKEN}`, 'GET', VT]);
    fireEvent.click(button('Confirm'));
    expect(await screen.findByText('Thank you. Your delivery address is confirmed.')).toBeTruthy();
    expect(calls(fn)[2].headers.get('x-link-verify')).toBe(VT);
  });

  it('AC-LINK-19 (page): a 401 verify_required on Confirm returns to the verify step; a 404 shows the one invalid text', async () => {
    stubFetch({ verify: [[200, { verifyToken: VT }]], view: [[200, full]], confirm: [[401, { error: 'verify_required' }]] });
    render(<VerifyStep token={TOKEN} view={view} />);
    typeCode('654321');
    fireEvent.click(button('Verify and continue'));
    fireEvent.click(await screen.findByRole('button', { name: 'Confirm' }));
    expect(await screen.findByRole('heading', { name: 'Check your inbox' })).toBeTruthy();
    expect(digits()).toBe('');
    cleanup();
    stubFetch({ code: [[404, { error: 'link_invalid' }]] });
    render(<VerifyStep token={TOKEN} view={view} />);
    fireEvent.click(button('Send code'));
    expect(await screen.findByText(LINK_INVALID_TEXT)).toBeTruthy();
  });
});
