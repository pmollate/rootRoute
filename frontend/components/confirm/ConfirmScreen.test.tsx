import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { renderToString } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ConfirmScreen, LINK_INVALID_TEXT, type LinkView } from './ConfirmScreen';

// The real map loads the Azure Maps web SDK from its CDN; here a stub shows where the pin is and moves it on a click.
const mapProps = vi.fn();
vi.mock('./ConfirmMap', () => ({
  ConfirmMap: (p: { pin: { lat: number; lon: number }; credential: { kind: string }; onMove: (pin: { lat: number; lon: number }) => void; onFail: () => void }) => {
    mapProps(p);
    return (
      <div data-testid="map">
        <span>pin {p.pin.lat},{p.pin.lon}</span>
        <button type="button" onClick={() => p.onMove({ lat: p.pin.lat + 0.01, lon: p.pin.lon })}>Move pin</button>
        <button type="button" onClick={p.onFail}>Fail map</button>
      </div>
    );
  },
}));

const TOKEN = 'A'.repeat(43);
// Fixture 21 (backend/tests/fixtures/emails/21.json): the address the email gave, ZIP not matching the city.
const view: LinkView = {
  address: { line1: '920 Broad St', line2: 'Dock 5', city: 'Newark', state: 'NJ', zip: '85004' },
  pin: { lat: 40.7228, lon: -74.1797 },
  expiresAt: '2026-10-31T10:22:00.000Z',
  synthetic: true,
  map: { kind: 'sas', token: 'sas-stand-in', expiresAt: '2026-10-31T10:22:00.000Z' },
};

/** fetch stub: one `[status, body]` per call, in order. */
function stubFetch(...answers: [number, unknown][]) {
  const fn = vi.fn(async (_url: string, _init: RequestInit) => {
    const [status, body] = answers.shift() ?? [500, {}];
    return { ok: status < 300, status, json: async () => body } as Response;
  });
  vi.stubGlobal('fetch', fn);
  return fn;
}
const posted = (fn: ReturnType<typeof stubFetch>) => fn.mock.calls.map(([url, init]) => ({ url, body: JSON.parse(String(init.body)) }));
const field = (name: string) => screen.getByLabelText(name) as HTMLInputElement;

describe('/confirm/{token} page (E19, SPEC §5.17)', () => {
  afterEach(() => { cleanup(); vi.unstubAllGlobals(); mapProps.mockClear(); });

  it('AC-LINK-02 (page): the five fields hold the email\'s address, the pin and the expiry show, and nothing else about the order', () => {
    render(<ConfirmScreen token={TOKEN} view={view} />);
    expect(['Address line 1', 'Address line 2', 'City', 'State', 'ZIP code'].map((n) => field(n).value))
      .toEqual(['920 Broad St', 'Dock 5', 'Newark', 'NJ', '85004']);
    expect(screen.getByText('pin 40.7228,-74.1797')).toBeTruthy();
    expect(mapProps.mock.calls[0][0].credential).toEqual(view.map);
    expect(screen.getByText(/This link works until/).textContent).toContain(new Date(view.expiresAt).toLocaleString(undefined,
      { dateStyle: 'medium', timeStyle: 'short' }));
    const text = document.body.textContent ?? '';
    for (const no of ['HX-', 'qty', 'Promise', 'promise', 'C130', 'Client 130', 'Tom Okafor', '555-0171', 'client130']) expect(text, no).not.toContain(no);
    expect(screen.getByRole('button', { name: 'Confirm' })).toBeTruthy();
  });

  it('REQ-LINK-02 (page): with no map credential the page is the address form alone; Confirm still sends the start pin', async () => {
    const fn = stubFetch([409, { error: 'needs_second_confirm', checkId: 'c-1', reading: { line1: null, city: 'Lebanon', state: 'KS', zip: null, distanceM: 0 } }]);
    render(<ConfirmScreen token={TOKEN} view={{ ...view, map: null }} />);
    expect(screen.queryByTestId('map')).toBeNull();
    expect(screen.queryByText(/Drag the pin/)).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Confirm' }));
    expect(await screen.findByRole('button', { name: 'Confirm again' })).toBeTruthy();
    expect(posted(fn)[0].body.pin).toEqual(view.pin);
    expect(screen.getByText(/920 Broad St/, { selector: 'p' })).toBeTruthy();
    // without a map the pin is not the client's: its reading would only confuse
    expect(screen.queryByText('The map reads your pin as')).toBeNull();
  });

  it('REQ-LINK-02 (page): a map that fails to load is hidden, not unmounted, leaving the form', async () => {
    render(<ConfirmScreen token={TOKEN} view={view} />);
    const map = screen.getByTestId('map');
    fireEvent.click(screen.getByRole('button', { name: 'Fail map' }));
    // Hidden, not disposed: disposing the SDK's map right after a refused tile throws inside the SDK
    // ("reading 'sources'" from its attribution timer).
    await waitFor(() => expect(map.closest('[hidden]')).not.toBeNull());
    expect(screen.getByTestId('map')).toBe(map); // the same element: never unmounted
    expect(screen.getByText(/Drag the pin/).closest('[hidden]')).not.toBeNull();
    expect(field('City').value).toBe('Newark');
  });

  it('page: the thank-you screen repeats the confirmed address', async () => {
    stubFetch([200, { status: 'confirmed' }]);
    render(<ConfirmScreen token={TOKEN} view={view} />);
    fireEvent.change(field('ZIP code'), { target: { value: '07102' } });
    fireEvent.click(screen.getByRole('button', { name: 'Confirm' }));
    expect(await screen.findByText('Thank you. Your delivery address is confirmed.')).toBeTruthy();
    expect(screen.getByText('920 Broad St, Dock 5, Newark, NJ 07102')).toBeTruthy();
  });

  it('page: the server render holds no locale- or zone-formatted time, so it hydrates the same in any browser', () => {
    const html = renderToString(<ConfirmScreen token={TOKEN} view={view} />);
    expect(html).not.toContain(new Date(view.expiresAt).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' }));
    expect(html).not.toMatch(/\d{1,2}:\d{2}/);
  });

  it('AC-LINK-10: a synthetic order shows the "Synthetic data" badge; a real one does not', () => {
    render(<ConfirmScreen token={TOKEN} view={view} />);
    expect(screen.getByText('Synthetic data')).toBeTruthy();
    cleanup();
    render(<ConfirmScreen token={TOKEN} view={{ ...view, synthetic: false }} />);
    expect(screen.queryByText('Synthetic data')).toBeNull();
  });

  it('AC-LINK-03 (page): 409 shows the map\'s reading with "Confirm again", which sends the checkId; 200 thanks the client', async () => {
    const fn = stubFetch(
      [409, { error: 'needs_second_confirm', checkId: 'chk-1',
        reading: { line1: '920 Broad St', city: 'Newark', state: 'NJ', zip: '07102', distanceM: 1112 } }],
      [200, { status: 'confirmed' }],
    );
    render(<ConfirmScreen token={TOKEN} view={view} />);
    fireEvent.click(screen.getByRole('button', { name: 'Move pin' }));
    fireEvent.change(field('ZIP code'), { target: { value: '07102' } });
    fireEvent.click(screen.getByRole('button', { name: 'Confirm' }));
    const reading = await screen.findByRole('region', { name: 'The map\'s reading of your pin' });
    expect(reading.textContent).toContain('920 Broad St, Newark, NJ 07102');
    expect(reading.textContent).toContain('about 1112 m from where we placed the pin');
    expect(screen.getByRole('region', { name: 'The address you typed' }).textContent).toContain('920 Broad St, Dock 5, Newark, NJ 07102');
    fireEvent.click(screen.getByRole('button', { name: 'Confirm again' }));
    expect(await screen.findByText('Thank you. Your delivery address is confirmed.')).toBeTruthy();
    const pin = { lat: 40.7328, lon: -74.1797 };
    const address = { line1: '920 Broad St', line2: 'Dock 5', city: 'Newark', state: 'NJ', zip: '07102' };
    expect(posted(fn)).toEqual([
      { url: `/api/confirm/${TOKEN}`, body: { address, pin: { lat: expect.closeTo(pin.lat, 6), lon: pin.lon } } },
      { url: `/api/confirm/${TOKEN}`, body: { address, pin: { lat: expect.closeTo(pin.lat, 6), lon: pin.lon }, checkId: 'chk-1' } },
    ]);
    expect(screen.queryByLabelText('ZIP code')).toBeNull(); // the form is gone once confirmed
  });

  it('REQ-LINK-03 (page): changing the ZIP or moving the pin after a reading drops the checkId', async () => {
    const fn = stubFetch(
      [409, { error: 'needs_second_confirm', checkId: 'chk-1', reading: { line1: null, city: 'Newark', state: 'NJ', zip: '07102', distanceM: 0 } }],
      [409, { error: 'needs_second_confirm', checkId: 'chk-2', reading: { line1: null, city: 'Newark', state: 'NJ', zip: '07102', distanceM: 0 } }],
    );
    render(<ConfirmScreen token={TOKEN} view={view} />);
    fireEvent.click(screen.getByRole('button', { name: 'Confirm' }));
    await screen.findByRole('button', { name: 'Confirm again' });
    fireEvent.change(field('ZIP code'), { target: { value: '07102' } });
    expect(screen.queryByRole('button', { name: 'Confirm again' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Confirm' }));
    await screen.findByRole('button', { name: 'Confirm again' });
    expect(posted(fn).map((p) => p.body.checkId)).toEqual([undefined, undefined]);
  });

  it('REQ-LINK-03 (page): with no start pin the page asks the client to drag the pin', () => {
    render(<ConfirmScreen token={TOKEN} view={{ ...view, address: { city: 'Orlando', state: 'FL' }, pin: null }} />);
    expect(screen.getByText('Drag the pin to your delivery entrance.')).toBeTruthy();
    expect(field('Address line 1').value).toBe('');
    expect(field('ZIP code').value).toBe('');
  });

  it('REQ-LINK-07 (page): a 404 on Confirm shows the one invalid-link text and drops the form', async () => {
    stubFetch([404, { error: 'link_invalid' }]);
    render(<ConfirmScreen token={TOKEN} view={view} />);
    fireEvent.click(screen.getByRole('button', { name: 'Confirm' }));
    expect(await screen.findByText(LINK_INVALID_TEXT)).toBeTruthy();
    expect(LINK_INVALID_TEXT).toBe('This link is no longer valid. Please reply to our email with the delivery address.');
    expect(screen.queryByLabelText('City')).toBeNull();
  });

  it('SEC-LINK-10 (page): a 400 asks to check the fields and keeps the form with what was typed', async () => {
    stubFetch([400, { error: 'invalid' }]);
    render(<ConfirmScreen token={TOKEN} view={view} />);
    fireEvent.change(field('State'), { target: { value: 'XX' } });
    fireEvent.click(screen.getByRole('button', { name: 'Confirm' }));
    expect(await screen.findByText(/Please check the address fields/)).toBeTruthy();
    expect(field('State').value).toBe('XX');
  });

  it('SEC-LINK-04 (page): a 429 asks the client to wait; the form stays', async () => {
    stubFetch([429, { error: 'rate_limited' }]);
    render(<ConfirmScreen token={TOKEN} view={view} />);
    fireEvent.click(screen.getByRole('button', { name: 'Confirm' }));
    expect(await screen.findByText(/Please wait a minute and try again/)).toBeTruthy();
    await waitFor(() => expect((screen.getByRole('button', { name: 'Confirm' }) as HTMLButtonElement).disabled).toBe(false));
  });

  it('SEC-LINK-07: the client\'s text is shown as text, never as markup', async () => {
    stubFetch([409, { error: 'needs_second_confirm', checkId: 'c', reading: { line1: '<img src=x onerror=alert(1)>', city: null, state: null, zip: null, distanceM: 0 } }]);
    render(<ConfirmScreen token={TOKEN} view={view} />);
    fireEvent.click(screen.getByRole('button', { name: 'Confirm' }));
    await screen.findByRole('button', { name: 'Confirm again' });
    expect(document.querySelector('img')).toBeNull();
    expect(screen.getByRole('region', { name: 'The map\'s reading of your pin' }).textContent).toContain('<img src=x onerror=alert(1)>');
  });
});
