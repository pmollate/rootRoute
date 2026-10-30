// E19 one-time address link (SPEC §5.17): what the confirm routes and send_reply need, from the settings. Tests override.
import { DefaultAzureCredential } from '@azure/identity';
import { allowList, config } from '../../core/config.js';
import { azureMapsSas } from '../../core/maps/credentials.js';
import { getDeps } from './deps.js';
import type { LinkDeps, MapCredentials } from './link.js';
import { MAILBOX_TIMEZONE } from './mailbox.js';
import { linkRepo } from './repo.js';

/**
 * SEC-LINK-08: the map tile credential, an Azure Maps SAS token expiring with the link, issued only for a valid link and
 * never stored or logged. `recorded` (tests, local demo) returns a fixed stand-in; `azure-maps` asks listSas (A20), signed
 * in with the API's managed identity on App Service or `az login` locally, so a page never gets a Maps key.
 */
let sasCredential: DefaultAzureCredential | undefined;
export function createMapCredentials(provider: string = config.ADDRESS_PROVIDER): MapCredentials {
  if (provider === 'recorded') return { issue: async (e) => ({ kind: 'sas', token: 'recorded', expiresAt: e.toISOString() }) };
  sasCredential ??= new DefaultAzureCredential();
  return azureMapsSas({ accountId: config.AZURE_MAPS_ACCOUNT_ID, principalId: config.AZURE_MAPS_SAS_PRINCIPAL_ID,
    credential: sasCredential });
}

let overrides: Partial<LinkDeps> = {};

/** Built on each call, so a test's setDeps (map) or setLinkDeps is seen by the next request. */
export function getLinkDeps(): LinkDeps {
  return {
    enabled: config.CONFIRM_LINK === 'on', hours: config.CONFIRM_LINK_HOURS, timeZone: MAILBOX_TIMEZONE,
    appUrl: config.AUTH_URL ?? 'http://localhost:3000', links: linkRepo, maps: getDeps().maps,
    credentials: createMapCredentials(), now: () => new Date(), log: () => {},
    // REQ-LINK-17, -18: the emailed code, sent from the orders mailbox to ALLOW_LIST addresses only (as send_reply)
    code: config.CONFIRM_LINK_CODE === 'on', outbox: { gmail: getDeps().gmail, allow: allowList },
    ...overrides,
  };
}

/** Tests: merged into every later getLinkDeps() (e.g. `{ enabled: true, timeZone: 'UTC' }`, a spy issuer). */
export function setLinkDeps(over: Partial<LinkDeps>): void {
  overrides = { ...overrides, ...over };
}
