import { type AddressQuery, type AddressValidator, AddressValidatorError, type GeocodeResponse } from './types.js';

const URL_BASE = 'https://atlas.microsoft.com/geocode';
const API_VERSION = '2026-01-01';

/** Azure Maps Get Geocoding with a structured US address; only the best match is asked for. */
export class AzureMapsValidator implements AddressValidator {
  readonly name = 'azure-maps';

  constructor(private readonly key: string, private readonly fetchFn: typeof fetch = fetch) {}

  async geocode(q: AddressQuery): Promise<GeocodeResponse> {
    const params = new URLSearchParams({ 'api-version': API_VERSION, addressLine: q.line1, locality: q.city,
      adminDistrict: q.state, postalCode: q.zip, countryRegion: 'US', top: '1' });
    let res: Response;
    try {
      res = await this.fetchFn(`${URL_BASE}?${params}`, { headers: { 'subscription-key': this.key } });
    } catch (err) {
      throw new AddressValidatorError(err instanceof Error ? err.message : String(err), 'transport');
    }
    if (!res.ok) throw new AddressValidatorError(`Azure Maps returned ${res.status}: ${await res.text()}`, 'transport');
    const body = (await res.json()) as Partial<GeocodeResponse>;
    return { features: body.features ?? [] };
  }
}
