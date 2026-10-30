import { describe, expect, it } from 'vitest';
import { azureMapsSas } from '../../src/core/maps/credentials.js';

const ACCOUNT = '/subscriptions/s/resourceGroups/rg/providers/Microsoft.Maps/accounts/root-route';
const credential = { getToken: async (scope: string | string[]) => ({ token: `arm:${scope}`, expiresOnTimestamp: 0 }) };

describe('E19 Azure Maps SAS issuer (A20)', () => {
  it('AC-SEC-LINK-08: listSas is asked for a token expiring with the link, capped at 50 requests per second', async () => {
    const calls: { url: string; init: RequestInit }[] = [];
    const fetch = async (url: string | URL | Request, init?: RequestInit) => {
      calls.push({ url: String(url), init: init! });
      return new Response(JSON.stringify({ accountSasToken: 'jwt-sas' }), { status: 200 });
    };
    const now = new Date('2026-10-30T15:00:00Z');
    const expiry = new Date('2026-10-31T10:00:00Z');
    const sas = azureMapsSas({ accountId: ACCOUNT, principalId: 'p-1', credential, fetch, now: () => now });

    expect(await sas.issue(expiry)).toEqual({ kind: 'sas', token: 'jwt-sas', expiresAt: expiry.toISOString() });
    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe(`https://management.azure.com${ACCOUNT}/listSas?api-version=2023-06-01`);
    expect(calls[0].init.method).toBe('POST');
    expect((calls[0].init.headers as Record<string, string>).authorization).toBe('Bearer arm:https://management.azure.com/.default');
    expect(JSON.parse(String(calls[0].init.body))).toEqual({
      signingKey: 'primaryKey', principalId: 'p-1', maxRatePerSecond: 50, start: now.toISOString(), expiry: expiry.toISOString(),
    });
  });

  it('AC-SEC-LINK-08: a refused listSas gives no credential, and the error holds only the status', async () => {
    const fetch = async () => new Response('{"error":{"message":"secret detail"}}', { status: 403 });
    const sas = azureMapsSas({ accountId: ACCOUNT, principalId: 'p-1', credential, fetch });
    await expect(sas.issue(new Date())).rejects.toThrow(/^Azure Maps listSas failed: 403$/);
  });

  it('refuses to issue without the account and identity settings (Q-LINK-02)', async () => {
    await expect(azureMapsSas({ accountId: undefined, principalId: 'p', credential }).issue(new Date()))
      .rejects.toThrow(/AZURE_MAPS_ACCOUNT_ID/);
    await expect(azureMapsSas({ accountId: ACCOUNT, principalId: undefined, credential }).issue(new Date()))
      .rejects.toThrow(/AZURE_MAPS_SAS_PRINCIPAL_ID/);
  });
});
