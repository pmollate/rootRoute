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
const codeBox = () => screen.getByLabelText('6-digit code') as HTMLInputElement;
const button = (name: string) => screen.getByRole('button', { name }) as HTMLButtonElement;

describe('/confirm/{token} verify step (E19, REQ-LINK-17 to -19)', () => {
  afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.useRealTimers(); });

  it('AC-LINK-17 (page): opens on "Verify it\'s you" with the masked sender and Send code; no address field; nothing is sent on open', () => {
    const fn = stubFetch({});
    render(<VerifyStep token={TOKEN} view={view} />);
    expect(screen.getByRole('heading', { name: "Verify it's you" })).toBeTruthy();
    expect(document.body.textContent).toContain('o•••••@client130.example');
    expect(button('Send code')).toBeTruthy();
    expect(screen.queryByLabelText('Address line 1')).toBeNull();
    expect(screen.getByText('Synthetic data')).toBeTruthy();
    expect(fn).not.toHaveBeenCalled(); // a code goes only on the button (mail scanners open links)
    const box = codeBox();
    expect([box.inputMode, box.autocomplete, box.maxLength]).toEqual(['numeric', 'one-time-code', 6]);
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
    expect(screen.getByText('Code sent to o•••••@client130.example. It expires in 10 minutes.')).toBeTruthy();
    expect(calls(fn)[0]).toMatchObject({ url: `/api/confirm/${TOKEN}/code`, method: 'POST' });
    expect(button('Send a new code').disabled).toBe(true);
    expect(screen.getByText('You can send a new code in 60 s.')).toBeTruthy();
    for (let i = 0; i < 59; i += 1) await act(async () => { vi.advanceTimersByTime(1000); }); // one tick per second, as rendered
    expect(screen.getByText('You can send a new code in 1 s.')).toBeTruthy();
    await act(async () => { vi.advanceTimersByTime(1000); });
    expect(button('Send a new code').disabled).toBe(false);
  });

  it('AC-LINK-18 (page): 429 with retryIn waits; 429 with no retryIn says no more codes; 503 asks to try again', async () => {
    stubFetch({ code: [[429, { error: 'code_wait', retryIn: 20 }], [429, { error: 'code_wait', retryIn: null }]] });
    render(<VerifyStep token={TOKEN} view={view} />);
    fireEvent.click(button('Send code'));
    expect(await screen.findByText('You can send a new code in 20 s.')).toBeTruthy();
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
    expect(button('Verify').disabled).toBe(true);
    fireEvent.change(codeBox(), { target: { value: '12a34' } });
    expect(codeBox().value).toBe('1234');
    expect(button('Verify').disabled).toBe(true);
    fireEvent.change(codeBox(), { target: { value: '123456' } });
    expect(button('Verify').disabled).toBe(false);
    const texts: string[] = [];
    for (let i = 0; i < 4; i += 1) {
      fireEvent.click(button('Verify'));
      await waitFor(() => expect(fn).toHaveBeenCalledTimes(i + 1));
      texts.push((await screen.findByRole('alert')).textContent ?? '');
      await waitFor(() => expect(button('Verify').disabled).toBe(false));
    }
    expect(texts).toEqual(['That code is not right. 4 tries left.', 'That code is not right. 1 try left.',
      'That code is not right. Send a new code.', 'That code has expired. Send a new one.']);
    expect(calls(fn)[0]).toMatchObject({ url: `/api/confirm/${TOKEN}/verify`, method: 'POST', body: { code: '123456' } });
  });

  it('AC-LINK-19 (page): the right code fetches the address with x-link-verify and shows the address form; Confirm carries the header', async () => {
    const fn = stubFetch({ verify: [[200, { verifyToken: VT }]], view: [[200, full]], confirm: [[200, { status: 'confirmed' }]] });
    render(<VerifyStep token={TOKEN} view={view} />);
    fireEvent.change(codeBox(), { target: { value: '654321' } });
    fireEvent.click(button('Verify'));
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
    fireEvent.change(codeBox(), { target: { value: '654321' } });
    fireEvent.click(button('Verify'));
    fireEvent.click(await screen.findByRole('button', { name: 'Confirm' }));
    expect(await screen.findByRole('heading', { name: "Verify it's you" })).toBeTruthy();
    expect(codeBox().value).toBe('');
    cleanup();
    stubFetch({ code: [[404, { error: 'link_invalid' }]] });
    render(<VerifyStep token={TOKEN} view={view} />);
    fireEvent.click(button('Send code'));
    expect(await screen.findByText(LINK_INVALID_TEXT)).toBeTruthy();
  });
});
