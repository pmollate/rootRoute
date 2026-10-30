// E19 map tile credential (SPEC §5.17 "Map credential", SEC-LINK-08, Task A20). An Azure Maps SAS token from Azure
// Resource Manager's listSas, for the user-assigned identity that holds the Maps data-reader role, expiring no later
// than the link and capped at 50 requests per second. Never stored or logged.
import type { TokenCredential } from '@azure/identity';
import type { MapCredentials } from '../../modules/intake/link.js';

const ARM = 'https://management.azure.com';
const API_VERSION = '2023-06-01';
const MAX_RATE_PER_SECOND = 50; // design setting (SPEC §5.17)

export interface SasOptions {
  accountId: string | undefined;   // AZURE_MAPS_ACCOUNT_ID: the Maps account's ARM id
  principalId: string | undefined; // AZURE_MAPS_SAS_PRINCIPAL_ID: object id of the user-assigned identity on the account
  credential: Pick<TokenCredential, 'getToken'>; // the API's managed identity on App Service; `az login` locally
  fetch?: typeof fetch;
  now?: () => Date;
}

export function azureMapsSas(o: SasOptions): MapCredentials {
  const fetchFn = o.fetch ?? fetch;
  const now = o.now ?? (() => new Date());
  return {
    async issue(expiresAt) {
      if (!o.accountId) throw new Error('Map tile credential needs AZURE_MAPS_ACCOUNT_ID (Q-LINK-02)');
      if (!o.principalId) throw new Error('Map tile credential needs AZURE_MAPS_SAS_PRINCIPAL_ID (Q-LINK-02)');
      const arm = await o.credential.getToken(`${ARM}/.default`);
      if (!arm) throw new Error('Map tile credential: no Azure Resource Manager token');
      const res = await fetchFn(`${ARM}${o.accountId}/listSas?api-version=${API_VERSION}`, {
        method: 'POST',
        headers: { authorization: `Bearer ${arm.token}`, 'content-type': 'application/json' },
        body: JSON.stringify({ signingKey: 'primaryKey', principalId: o.principalId, maxRatePerSecond: MAX_RATE_PER_SECOND,
          start: now().toISOString(), expiry: expiresAt.toISOString() }),
      });
      // Only the status: ARM's error body can echo ids, and nothing about the credential is logged.
      if (!res.ok) throw new Error(`Azure Maps listSas failed: ${res.status}`);
      const { accountSasToken } = await res.json() as { accountSasToken?: string };
      if (!accountSasToken) throw new Error('Azure Maps listSas returned no token');
      return { kind: 'sas', token: accountSasToken, expiresAt: expiresAt.toISOString() };
    },
  };
}
