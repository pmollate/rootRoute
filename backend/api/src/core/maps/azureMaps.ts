import { type AddressQuery, type AddressValidator, AddressValidatorError, type GeocodeResponse } from './types.js';

const URL_BASE = 'https://atlas.microsoft.com/geocode';
const REVERSE_URL = 'https://atlas.microsoft.com/reverseGeocode';
const API_VERSION = '2026-01-01';

/** Azure Maps Get Geocoding with a US address as one line of text; only the best match is asked for. */
export class AzureMapsValidator implements AddressValidator {
  readonly name = 'azure-maps';

  constructor(private readonly key: string, private readonly fetchFn: typeof fetch = fetch) {}

  async geocode(q: AddressQuery): Promise<GeocodeResponse> {
    // One line of text, not the structured parameters: those matched a rural street to another state (Powers Rd,
    // Enterprise OR → US Highway 59, Sallisaw OK). `query` takes no countryRegion, so the text names the country;
    // validate.ts still checks the street, city, state and ZIP of the answer against what was typed.
    const params = new URLSearchParams({ 'api-version': API_VERSION,
      query: `${q.line1}, ${q.city}, ${q.state} ${q.zip}, United States`, top: '1' });
    return this.get(`${URL_BASE}?${params}`);
  }

  /** Azure Maps Get Reverse Geocoding: the address at a pin (E19 second Confirm, REQ-LINK-03). Live check: A20. */
  async reverse(pin: { lat: number; lon: number }): Promise<GeocodeResponse> {
    const params = new URLSearchParams({ 'api-version': API_VERSION, coordinates: `${pin.lon},${pin.lat}` });
    return this.get(`${REVERSE_URL}?${params}`);
  }

  private async get(url: string): Promise<GeocodeResponse> {
    let res: Response;
    try {
      res = await this.fetchFn(url, { headers: { 'subscription-key': this.key } });
    } catch (err) {
      throw new AddressValidatorError(err instanceof Error ? err.message : String(err), 'transport');
    }
    if (!res.ok) throw new AddressValidatorError(`Azure Maps returned ${res.status}: ${await res.text()}`, 'transport');
    const body = (await res.json()) as Partial<GeocodeResponse>;
    return { features: body.features ?? [] };
  }
}
