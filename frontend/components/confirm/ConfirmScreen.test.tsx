import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { useEffect } from 'react';
import { renderToString } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ConfirmScreen, LINK_INVALID_TEXT, type LinkView } from './ConfirmScreen';

// The real map loads the Azure Maps web SDK; here a stub shows where the pin is, moves it on a click, and reports
// ready on mount (as the SDK's 'ready' event does) unless a test holds it back with `mapReady.auto = false`.
const mapProps = vi.fn();
const mapReady = { auto: true };
type MapStub = { pin: { lat: number; lon: number }; credential: { kind: string }; onMove: (pin: { lat: number; lon: number }) => void;
  onFail: () => void; onReady: () => void };
vi.mock('./ConfirmMap', () => ({
  ConfirmMap: (p: MapStub) => {
    mapProps(p);
    useEffect(() => { if (mapReady.auto) p.onReady(); }, []); // eslint-disable-line react-hooks/exhaustive-deps
    return (
      <div data-testid="map">
        <span>pin {p.pin.lat},{p.pin.lon}</span>
        <button type="button" onClick={() => p.onMove({ lat: p.pin.lat + 0.01, lon: p.pin.lon })}>Move pin</button>
        <button type="button" onClick={p.onReady}>Ready map</button>
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

/** The pin look-up's answer (REQ-LINK-16); by default the map read nothing, so the fields stay as they are. */
const NOTHING_READ = { reading: { line1: null, city: null, state: null, zip: null, found: false }, checkId: null };
let lookupAnswer: [number, unknown] = [200, NOTHING_READ];
/** fetch stub: one `[status, body]` per Confirm post, in order; a pin look-up gets `lookupAnswer`. */
function stubFetch(...answers: [number, unknown][]) {
  const fn = vi.fn(async (url: string, _init: RequestInit) => {
    const [status, body] = url.endsWith('/lookup') ? lookupAnswer : answers.shift() ?? [500, {}];
    return { ok: status < 300, status, json: async () => body } as Response;
  });
  vi.stubGlobal('fetch', fn);
  return fn;
}
const sent = (fn: ReturnType<typeof stubFetch>) => fn.mock.calls.map(([url, init]) => ({ url, body: JSON.parse(String(init.body)) }));
/** The Confirm posts only (pin look-ups left out). */
const posted = (fn: ReturnType<typeof stubFetch>) => sent(fn).filter((c) => !c.url.endsWith('/lookup'));
const lookups = (fn: ReturnType<typeof stubFetch>) => sent(fn).filter((c) => c.url.endsWith('/lookup'));
const field = (name: string) => screen.getByLabelText(name) as HTMLInputElement;

describe('/confirm/{token} page (E19, SPEC §5.17)', () => {
  afterEach(() => { cleanup(); vi.unstubAllGlobals(); mapProps.mockClear(); mapReady.auto = true; lookupAnswer = [200, NOTHING_READ]; });

  it('AC-LINK-02 (page): the five fields hold the email\'s address, the pin and the expiry show, and nothing else about the order', () => {
    render(<ConfirmScreen token={TOKEN} view={view} />);
    expect(['Street address', 'Apartment, suite, dock', 'City', 'State', 'ZIP code'].map((n) => field(n).value))
      .toEqual(['920 Broad St', 'Dock 5', 'Newark', 'NJ', '85004']);
    expect(screen.getByText('pin 40.7228,-74.1797')).toBeTruthy();
    expect(mapProps.mock.calls[0][0].credential).toEqual(view.map);
    const text = document.body.textContent ?? '';
    for (const no of ['This link works', 'HX-', 'qty', 'Promise', 'promise', 'C130', 'Client 130', 'Tom Okafor', '555-0171', 'client130']) expect(text, no).not.toContain(no);
    expect(screen.getByRole('button', { name: 'Confirm address' })).toBeTruthy();
  });

  it('AC-LINK-15, REQ-LINK-02 (page): with no map credential the page is the form alone and Confirm sends no pin; a 409 shows the map\'s reading of the address', async () => {
    const fn = stubFetch([409, { error: 'needs_second_confirm', checkId: 'c-1',
      reading: { of: 'address', found: true, line1: '920 Broad St', city: 'Phoenix', state: 'AZ', zip: '85004', distanceM: null, differs: ['city', 'state'] } }]);
    render(<ConfirmScreen token={TOKEN} view={{ ...view, map: null }} />);
    expect(screen.queryByTestId('map')).toBeNull();
    expect(screen.queryByText(/Drag the pin/)).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Confirm address' }));
    expect(await screen.findByRole('button', { name: 'Confirm again' })).toBeTruthy();
    expect('pin' in posted(fn)[0].body).toBe(false);
    const reading = screen.getByRole('region', { name: 'The map\'s reading of your address' });
    expect(reading.textContent).toContain('The map reads your address as');
    expect(reading.textContent).toContain('920 Broad St, Phoenix, AZ 85004');
    expect(reading.textContent).toContain('The map has a different city and state.');
    expect(screen.getByRole('region', { name: 'The address you typed' }).textContent).toContain('920 Broad St, Dock 5, Newark, NJ 85004');
    expect(screen.queryByText('The map reads your pin as')).toBeNull();
  });

  it('AC-LINK-15 (page): a map that refuses its tiles (hidden) sends no pin, even after it was ready', async () => {
    const fn = stubFetch([200, { status: 'confirmed' }]);
    render(<ConfirmScreen token={TOKEN} view={view} />);
    fireEvent.click(screen.getByRole('button', { name: 'Fail map' }));
    fireEvent.click(screen.getByRole('button', { name: 'Confirm address' }));
    await screen.findByText('Thank you. Your delivery address is confirmed.');
    expect('pin' in posted(fn)[0].body).toBe(false);
  });

  it('AC-LINK-15 (page): a map shown but not yet ready sends no pin', async () => {
    mapReady.auto = false;
    const fn = stubFetch([200, { status: 'confirmed' }]);
    render(<ConfirmScreen token={TOKEN} view={view} />);
    fireEvent.click(screen.getByRole('button', { name: 'Confirm address' }));
    await screen.findByText('Thank you. Your delivery address is confirmed.');
    expect('pin' in posted(fn)[0].body).toBe(false);
  });

  it('AC-LINK-15 (page): a working map with a start pin posts that pin', async () => {
    const fn = stubFetch([200, { status: 'confirmed' }]);
    render(<ConfirmScreen token={TOKEN} view={view} />);
    fireEvent.click(screen.getByRole('button', { name: 'Confirm address' }));
    await screen.findByText('Thank you. Your delivery address is confirmed.');
    expect(posted(fn)[0].body.pin).toEqual(view.pin);
  });

  it('AC-LINK-15 (page): a working map with no start pin posts no pin until the client drags it, then the dragged pin; never the display default', async () => {
    const fn = stubFetch([409, { error: 'needs_second_confirm', checkId: 'c-1',
      reading: { of: 'address', found: false, line1: null, city: null, state: null, zip: null, distanceM: null, differs: ['city', 'state', 'zip'] } }],
    [200, { status: 'confirmed' }]);
    render(<ConfirmScreen token={TOKEN} view={{ ...view, pin: null }} />);
    expect(screen.getByText('pin 39.8283,-98.5795')).toBeTruthy(); // the map's view only
    fireEvent.click(screen.getByRole('button', { name: 'Confirm address' }));
    await screen.findByRole('button', { name: 'Confirm again' });
    expect('pin' in posted(fn)[0].body).toBe(false);
    expect(screen.getByRole('region', { name: 'The map\'s reading of your address' }).textContent).toContain('The map could not find this address');
    fireEvent.click(screen.getByRole('button', { name: 'Move pin' }));
    expect(screen.queryByRole('button', { name: 'Confirm again' })).toBeNull(); // the pin moved: the checkId is dropped
    fireEvent.click(screen.getByRole('button', { name: 'Confirm address' }));
    await screen.findByText('Thank you. Your delivery address is confirmed.');
    expect(posted(fn)[1].body).toEqual({ address: expect.any(Object), pin: { lat: expect.closeTo(39.8383, 6), lon: -98.5795 } });
    expect(JSON.stringify(posted(fn)[0].body)).not.toMatch(/39\.8283|-98\.5795/);
  });

  // 31 Oct design: two steps (verification check done, address check now) after the code; nothing but the address.
  it('page: after the code the steps show Verification check done and Address check current; no back, save-default, verified box or order details', () => {
    render(<ConfirmScreen token={TOKEN} view={view} verifyToken={'V'.repeat(43)} />);
    const steps = screen.getByRole('list', { name: 'Steps' });
    expect(steps.textContent).toContain('Verification check (done)');
    expect(screen.getByText('Address check').closest('li')!.getAttribute('aria-current')).toBe('step');
    expect(screen.getByRole('heading', { name: 'Confirm the delivery address' })).toBeTruthy();
    for (const gone of [/Back/, /default address/i, /Address verified/i, /drive time/i, /zone/i, /next day/i, /HX-/]) {
      expect(document.body.textContent, String(gone)).not.toMatch(gone);
    }
    expect(screen.queryByRole('button', { name: /Back/ })).toBeNull();
    cleanup();
    render(<ConfirmScreen token={TOKEN} view={view} />); // CONFIRM_LINK_CODE off: no code step, so no steps
    expect(screen.queryByRole('list', { name: 'Steps' })).toBeNull();
  });

  it('page: line 1, city, state and ZIP are required (red asterisk); Confirm stays disabled until all four are filled', () => {
    render(<ConfirmScreen token={TOKEN} view={{ ...view, address: { city: 'Madhapur' }, pin: null }} />);
    for (const n of ['Street address', 'City', 'State', 'ZIP code']) {
      expect(field(n).required, n).toBe(true);
      expect(field(n).closest('label')!.querySelector('[data-required]')?.textContent, n).toBe('*');
    }
    expect(field('Apartment, suite, dock').required).toBe(false);
    expect(field('Apartment, suite, dock').closest('label')!.querySelector('[data-required]')).toBeNull();
    const confirm = () => screen.getByRole('button', { name: 'Confirm address' }) as HTMLButtonElement;
    expect(confirm().disabled).toBe(true);
    fireEvent.change(field('Street address'), { target: { value: '65156 Powers Rd' } });
    fireEvent.change(field('State'), { target: { value: 'OR' } });
    expect(confirm().disabled).toBe(true); // ZIP still empty
    fireEvent.change(field('ZIP code'), { target: { value: '97828' } });
    expect(confirm().disabled).toBe(false);
    fireEvent.change(field('City'), { target: { value: '   ' } });
    expect(confirm().disabled).toBe(true); // spaces only count as empty
    expect(screen.getByText(/Fill in the fields marked/)).toBeTruthy();
  });

  it('AC-LINK-16 (page): moving the pin fills line 1, city, state and ZIP from the map, keeps line 2, and Confirm sends the look-up checkId', async () => {
    lookupAnswer = [200, { reading: { line1: '65156 Powers Rd', city: 'Enterprise', state: 'OR', zip: '97828', found: true }, checkId: 'fill-1' }];
    const fn = stubFetch([200, { status: 'confirmed' }]);
    render(<ConfirmScreen token={TOKEN} view={view} />);
    fireEvent.click(screen.getByRole('button', { name: 'Move pin' }));
    await waitFor(() => expect(field('City').value).toBe('Enterprise'));
    expect(['Street address', 'Apartment, suite, dock', 'City', 'State', 'ZIP code'].map((n) => field(n).value))
      .toEqual(['65156 Powers Rd', 'Dock 5', 'Enterprise', 'OR', '97828']);
    const moved = { lat: view.pin!.lat + 0.01, lon: view.pin!.lon };
    expect(lookups(fn)).toEqual([{ url: `/api/confirm/${TOKEN}/lookup`, body: { pin: moved, line2: 'Dock 5' } }]);
    expect(screen.getByText(/Filled in from the map/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Confirm address' }));
    await screen.findByText('Thank you. Your delivery address is confirmed.');
    expect(posted(fn)[0].body).toEqual({ address: { line1: '65156 Powers Rd', line2: 'Dock 5', city: 'Enterprise', state: 'OR', zip: '97828' },
      pin: moved, checkId: 'fill-1' });
  });

  // 31 Oct: every look-up counts in the per-IP limit; a burst of moves must be one request, for where the pin ends.
  it('AC-LINK-16 (page): moves in quick succession are looked up once, when the pin has been still for half a second', async () => {
    lookupAnswer = [200, { reading: { line1: '65156 Powers Rd', city: 'Enterprise', state: 'OR', zip: '97828', found: true }, checkId: 'fill-3' }];
    const fn = stubFetch();
    render(<ConfirmScreen token={TOKEN} view={view} />);
    fireEvent.click(screen.getByRole('button', { name: 'Move pin' }));
    fireEvent.click(screen.getByRole('button', { name: 'Move pin' }));
    await waitFor(() => expect(field('City').value).toBe('Enterprise'));
    expect(lookups(fn)).toHaveLength(1);
  });

  it('AC-LINK-16 (page): editing a field after the fill drops the look-up checkId; a reading with parts missing fills only what it has', async () => {
    lookupAnswer = [200, { reading: { line1: null, city: 'Enterprise', state: 'OR', zip: '97828', found: true }, checkId: null }];
    const fn = stubFetch([409, { error: 'needs_second_confirm', checkId: 'c-9', reading: { of: 'pin', found: true, line1: null, city: 'Enterprise', state: 'OR', zip: '97828', distanceM: 900, differs: [] } }]);
    render(<ConfirmScreen token={TOKEN} view={view} />);
    fireEvent.click(screen.getByRole('button', { name: 'Move pin' }));
    await waitFor(() => expect(field('City').value).toBe('Enterprise'));
    expect(field('Street address').value).toBe('920 Broad St'); // not read: kept
    lookupAnswer = [200, { reading: { line1: '1 Main St', city: 'Joseph', state: 'OR', zip: '97846', found: true }, checkId: 'fill-2' }];
    fireEvent.click(screen.getByRole('button', { name: 'Move pin' }));
    await waitFor(() => expect(field('City').value).toBe('Joseph'));
    fireEvent.change(field('Street address'), { target: { value: '2 Main St' } });
    fireEvent.click(screen.getByRole('button', { name: 'Confirm address' }));
    await screen.findByRole('button', { name: 'Confirm again' });
    expect(posted(fn)[0].body.checkId).toBeUndefined();
  });

  it('REQ-LINK-13 (page): changing any field after a reading drops the checkId', async () => {
    const fn = stubFetch(
      [409, { error: 'needs_second_confirm', checkId: 'chk-1', reading: { of: 'address', found: true, line1: '920 Broad St', city: 'Phoenix', state: 'AZ', zip: '85004', distanceM: null, differs: ['city'] } }],
      [409, { error: 'needs_second_confirm', checkId: 'chk-2', reading: { of: 'address', found: true, line1: '920 Broad St', city: 'Phoenix', state: 'AZ', zip: '85004', distanceM: null, differs: ['city'] } }],
    );
    render(<ConfirmScreen token={TOKEN} view={view} />);
    fireEvent.click(screen.getByRole('button', { name: 'Confirm address' }));
    await screen.findByRole('button', { name: 'Confirm again' });
    fireEvent.change(field('City'), { target: { value: 'Phoenix' } });
    expect(screen.queryByRole('button', { name: 'Confirm again' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Confirm address' }));
    await screen.findByRole('button', { name: 'Confirm again' });
    expect(posted(fn).map((p) => p.body.checkId)).toEqual([undefined, undefined]);
  });

  it('AC-LINK-13 (page): a reading of the pin names the parts the map reads differently', async () => {
    stubFetch([409, { error: 'needs_second_confirm', checkId: 'c', reading: { of: 'pin', found: true, line1: '65156 Powers Rd', city: 'Enterprise', state: 'OR', zip: '97828', distanceM: 400, differs: ['city'] } }]);
    render(<ConfirmScreen token={TOKEN} view={view} />);
    fireEvent.click(screen.getByRole('button', { name: 'Confirm address' }));
    const reading = await screen.findByRole('region', { name: 'The map\'s reading of your pin' });
    expect(reading.textContent).toContain('65156 Powers Rd, Enterprise, OR 97828');
    expect(reading.textContent).toContain('about 400 m from where we placed the pin');
    expect(reading.textContent).toContain('The map has a different city for the address you typed.');
  });

  it('AC-LINK-12 (page): a 503 map_unavailable asks the client to try again; the form stays and nothing is lost', async () => {
    stubFetch([503, { error: 'map_unavailable' }]);
    render(<ConfirmScreen token={TOKEN} view={view} />);
    fireEvent.change(field('City'), { target: { value: 'Newark ' } });
    fireEvent.click(screen.getByRole('button', { name: 'Confirm address' }));
    expect(await screen.findByText(/could not check your address on the map just now. Please try again in a minute/)).toBeTruthy();
    expect(field('City').value).toBe('Newark ');
    await waitFor(() => expect((screen.getByRole('button', { name: 'Confirm address' }) as HTMLButtonElement).disabled).toBe(false));
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

  // 31 Oct (the user): the thank-you screen does not show the address back.
  it('page: the thank-you screen thanks the client and does not show the confirmed address', async () => {
    stubFetch([200, { status: 'confirmed' }]);
    render(<ConfirmScreen token={TOKEN} view={view} />);
    fireEvent.change(field('ZIP code'), { target: { value: '07102' } });
    fireEvent.click(screen.getByRole('button', { name: 'Confirm address' }));
    expect(await screen.findByText('Thank you. Your delivery address is confirmed.')).toBeTruthy();
    const text = document.body.textContent ?? '';
    for (const part of ['920 Broad St', 'Dock 5', 'Newark', '07102']) expect(text, part).not.toContain(part);
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
        reading: { of: 'pin', found: true, line1: '920 Broad St', city: 'Newark', state: 'NJ', zip: '07102', distanceM: 1112, differs: [] } }],
      [200, { status: 'confirmed' }],
    );
    render(<ConfirmScreen token={TOKEN} view={view} />);
    fireEvent.click(screen.getByRole('button', { name: 'Move pin' }));
    fireEvent.change(field('ZIP code'), { target: { value: '07102' } });
    fireEvent.click(screen.getByRole('button', { name: 'Confirm address' }));
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
      [409, { error: 'needs_second_confirm', checkId: 'chk-1', reading: { of: 'pin', found: true, line1: null, city: 'Newark', state: 'NJ', zip: '07102', distanceM: 0, differs: [] } }],
      [409, { error: 'needs_second_confirm', checkId: 'chk-2', reading: { of: 'pin', found: true, line1: null, city: 'Newark', state: 'NJ', zip: '07102', distanceM: 0, differs: [] } }],
    );
    render(<ConfirmScreen token={TOKEN} view={view} />);
    fireEvent.click(screen.getByRole('button', { name: 'Confirm address' }));
    await screen.findByRole('button', { name: 'Confirm again' });
    fireEvent.change(field('ZIP code'), { target: { value: '07102' } });
    expect(screen.queryByRole('button', { name: 'Confirm again' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Confirm address' }));
    await screen.findByRole('button', { name: 'Confirm again' });
    expect(posted(fn).map((p) => p.body.checkId)).toEqual([undefined, undefined]);
  });

  it('REQ-LINK-03 (page): with no start pin the page asks the client to drag the pin', () => {
    render(<ConfirmScreen token={TOKEN} view={{ ...view, address: { city: 'Orlando', state: 'FL' }, pin: null }} />);
    expect(screen.getByText('Drag the pin to your delivery entrance')).toBeTruthy(); // the map's chip
    expect(field('Street address').value).toBe('');
    expect(field('ZIP code').value).toBe('');
  });

  it('REQ-LINK-07 (page): a 404 on Confirm shows the one invalid-link text and drops the form', async () => {
    stubFetch([404, { error: 'link_invalid' }]);
    render(<ConfirmScreen token={TOKEN} view={view} />);
    fireEvent.click(screen.getByRole('button', { name: 'Confirm address' }));
    expect(await screen.findByText(LINK_INVALID_TEXT)).toBeTruthy();
    expect(LINK_INVALID_TEXT).toBe('This link is no longer valid. Please reply to our email with the delivery address.');
    expect(screen.queryByLabelText('City')).toBeNull();
  });

  it('SEC-LINK-10 (page): a 400 asks to check the fields and keeps the form with what was typed', async () => {
    stubFetch([400, { error: 'invalid' }]);
    render(<ConfirmScreen token={TOKEN} view={view} />);
    // State is a list of US codes now, so the bad value the API refuses is a ZIP
    fireEvent.change(field('ZIP code'), { target: { value: '1234' } });
    fireEvent.click(screen.getByRole('button', { name: 'Confirm address' }));
    expect(await screen.findByText(/Please check the address fields/)).toBeTruthy();
    expect(field('ZIP code').value).toBe('1234');
    expect([...(field('State') as unknown as HTMLSelectElement).options].map((o) => o.value)).toHaveLength(52); // Select + 50 states + DC
  });

  it('SEC-LINK-04 (page): a 429 asks the client to wait; the form stays', async () => {
    stubFetch([429, { error: 'rate_limited' }]);
    render(<ConfirmScreen token={TOKEN} view={view} />);
    fireEvent.click(screen.getByRole('button', { name: 'Confirm address' }));
    expect(await screen.findByText(/Please wait a minute and try again/)).toBeTruthy();
    await waitFor(() => expect((screen.getByRole('button', { name: 'Confirm address' }) as HTMLButtonElement).disabled).toBe(false));
  });

  it('SEC-LINK-07: the client\'s text is shown as text, never as markup', async () => {
    stubFetch([409, { error: 'needs_second_confirm', checkId: 'c', reading: { of: 'pin', found: true, line1: '<img src=x onerror=alert(1)>', city: null, state: null, zip: null, distanceM: 0, differs: [] } }]);
    render(<ConfirmScreen token={TOKEN} view={view} />);
    fireEvent.click(screen.getByRole('button', { name: 'Confirm address' }));
    await screen.findByRole('button', { name: 'Confirm again' });
    expect(document.querySelector('img')).toBeNull();
    expect(screen.getByRole('region', { name: 'The map\'s reading of your pin' }).textContent).toContain('<img src=x onerror=alert(1)>');
  });
  it('AC-LINK-19 (page): with a verifyToken the look-up and Confirm send x-link-verify; without one they send no such header', async () => {
    const VT = 'V'.repeat(43);
    const fn = stubFetch([200, { status: 'confirmed' }]);
    render(<ConfirmScreen token={TOKEN} view={view} verifyToken={VT} />);
    fireEvent.click(screen.getByRole('button', { name: 'Move pin' }));
    await waitFor(() => expect(lookups(fn)).toHaveLength(1));
    fireEvent.click(screen.getByRole('button', { name: 'Confirm address' }));
    await screen.findByText('Thank you. Your delivery address is confirmed.');
    expect(fn.mock.calls.map(([, init]) => new Headers(init.headers).get('x-link-verify'))).toEqual([VT, VT]);
    cleanup();
    const plain = stubFetch([200, { status: 'confirmed' }]);
    render(<ConfirmScreen token={TOKEN} view={view} />);
    fireEvent.click(screen.getByRole('button', { name: 'Confirm address' }));
    await screen.findByText('Thank you. Your delivery address is confirmed.');
    expect(new Headers(plain.mock.calls[0][1].headers).has('x-link-verify')).toBe(false);
  });

  it('AC-LINK-19 (page): a 401 verify_required on the look-up or Confirm calls onVerifyRequired', async () => {
    const back = vi.fn();
    lookupAnswer = [401, { error: 'verify_required' }];
    stubFetch([401, { error: 'verify_required' }]);
    render(<ConfirmScreen token={TOKEN} view={view} verifyToken={'V'.repeat(43)} onVerifyRequired={back} />);
    fireEvent.click(screen.getByRole('button', { name: 'Move pin' }));
    await waitFor(() => expect(back).toHaveBeenCalledTimes(1));
    fireEvent.click(screen.getByRole('button', { name: 'Confirm address' }));
    await waitFor(() => expect(back).toHaveBeenCalledTimes(2));
  });
});
