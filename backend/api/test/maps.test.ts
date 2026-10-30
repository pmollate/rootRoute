import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { AzureMapsValidator } from '../src/core/maps/azureMaps.js';
import { RecordedAddressValidator, RecordingAddressValidator } from '../src/core/maps/recorded.js';
import { AddressValidatorError, type GeocodeResponse } from '../src/core/maps/types.js';

const Q = { line1: '400 S Orange Ave', city: 'Orlando', state: 'FL', zip: '32801' };
const HIT: GeocodeResponse = { features: [{ properties: { type: 'Address', confidence: 'High', matchCodes: ['Good'],
  address: { addressLine: '400 S Orange Ave', locality: 'Orlando', postalCode: '32801', adminDistricts: [{ shortName: 'FL' }] } } }] };

describe('Azure Maps validator', () => {
  it('sends a structured US address with the key in a header, never in the URL', async () => {
    const sent: { url: string; headers: Record<string, string> }[] = [];
    const fetch = async (url: unknown, init?: RequestInit) => {
      sent.push({ url: String(url), headers: init?.headers as Record<string, string> });
      return new Response(JSON.stringify(HIT), { status: 200 });
    };
    expect(await new AzureMapsValidator('secret', fetch).geocode(Q)).toEqual(HIT);
    const url = new URL(sent[0].url);
    expect(url.origin + url.pathname).toBe('https://atlas.microsoft.com/geocode');
    expect(Object.fromEntries(url.searchParams)).toMatchObject({ addressLine: '400 S Orange Ave', locality: 'Orlando',
      adminDistrict: 'FL', postalCode: '32801', countryRegion: 'US', top: '1' });
    expect(sent[0].url).not.toContain('secret');
    expect(sent[0].headers['subscription-key']).toBe('secret');
  });

  it('reports a failed call as a transport error', async () => {
    const fetch = async () => new Response('denied', { status: 401 });
    await expect(new AzureMapsValidator('bad', fetch).geocode(Q)).rejects.toMatchObject({ kind: 'transport' });
  });

  it('replays what it recorded, and says when a recording is missing', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'maps-'));
    const real = { name: 'fake', geocode: async () => HIT };
    await new RecordingAddressValidator(real, dir).geocode(Q);
    expect(await new RecordedAddressValidator(dir).geocode(Q)).toEqual(HIT);
    await expect(new RecordedAddressValidator(dir).geocode({ ...Q, zip: '32802' })).rejects.toBeInstanceOf(AddressValidatorError);
  });

  it('REQ-LINK-03 (E19): reverse geocoding sends the pin as lon,lat to /reverseGeocode with the key in a header', async () => {
    const sent: { url: string; headers: Record<string, string> }[] = [];
    const fetch = async (url: unknown, init?: RequestInit) => {
      sent.push({ url: String(url), headers: init?.headers as Record<string, string> });
      return new Response(JSON.stringify(HIT), { status: 200 });
    };
    expect(await new AzureMapsValidator('secret', fetch).reverse({ lat: 28.5, lon: -81.4 })).toEqual(HIT);
    const url = new URL(sent[0].url);
    expect(url.origin + url.pathname).toBe('https://atlas.microsoft.com/reverseGeocode');
    expect(url.searchParams.get('coordinates')).toBe('-81.4,28.5');
    expect(url.searchParams.get('api-version')).toBeTruthy();
    expect(sent[0].url).not.toContain('secret');
    expect(sent[0].headers['subscription-key']).toBe('secret');
    await expect(new AzureMapsValidator('bad', async () => new Response('denied', { status: 401 })).reverse({ lat: 0, lon: 0 }))
      .rejects.toMatchObject({ kind: 'transport' });
  });

  it('REQ-LINK-03 (E19): reverse readings are recorded and replayed by pin; a missing one is a missing_recording error', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'maps-'));
    const real = { name: 'fake', geocode: async () => HIT, reverse: async () => HIT };
    await new RecordingAddressValidator(real, dir).reverse({ lat: 28.5, lon: -81.4 });
    expect(await new RecordedAddressValidator(dir).reverse({ lat: 28.5, lon: -81.4 })).toEqual(HIT);
    await expect(new RecordedAddressValidator(dir).reverse({ lat: 28.6, lon: -81.4 })).rejects.toMatchObject({ kind: 'missing_recording' });
    // A wrapped validator that cannot reverse-geocode says so rather than guessing.
    await expect(new RecordingAddressValidator({ name: 'old', geocode: async () => HIT }, dir).reverse({ lat: 0, lon: 0 }))
      .rejects.toMatchObject({ kind: 'unsupported' });
  });
});
