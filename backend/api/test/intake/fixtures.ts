import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import type { AddressValidator, GeocodeResponse } from '../../src/core/maps/types.js';
import { bodyText } from '../../src/modules/intake/mailbox.js';
import type { SavedAddress } from '../../src/modules/intake/schema.js';

const ROOT = fileURLToPath(new URL('../../../', import.meta.url));
const DIR = `${ROOT}tests/fixtures/emails/`;

export interface Gold {
  id: string; layout: number; from: string; received_at: string; message_id: string; client_id: string | null;
  items: { sku: string; qty: number }[];
  address: { line1: string | null; line2: string | null; city: string | null; state: string | null; zip: string | null };
  requested_commitment: 'same_day' | 'next_day' | 'standard'; missing: string[]; matched_saved: boolean;
  address_issue: 'zip_mismatch' | 'street_not_found' | null;
  decision: 'ALL_CLEAR' | 'CONFIRM_ADDRESS' | 'MISSING_INFO'; injection: boolean; pii: string[];
}

/** body is what the pipeline sees: plain text, with HTML emails converted by the Gmail reader (bodyText). */
export interface Fixture { eml: string; subject: string; body: string; gold: Gold }

export function loadFixtures(): Fixture[] {
  return readdirSync(DIR).filter((f) => f.endsWith('.eml')).sort().map((f) => {
    const eml = readFileSync(DIR + f, 'utf8');
    const [head, ...rest] = eml.split('\n\n');
    const subject = /^Subject: (.*)$/m.exec(head)?.[1] ?? '';
    const mimeType = /^Content-Type: ([^;\n]+)/m.exec(head)?.[1] ?? 'text/plain';
    const body = bodyText({ mimeType, body: { data: Buffer.from(rest.join('\n\n')).toString('base64url') } });
    return { eml, subject, body, gold: JSON.parse(readFileSync(DIR + f.replace('.eml', '.json'), 'utf8')) as Gold };
  });
}

export function loadSavedAddresses(): SavedAddress[] {
  const [header, ...lines] = readFileSync(`${ROOT}synthetic-data/out/saved_addresses.csv`, 'utf8').trim().split('\n');
  const cols = header.split(',');
  return lines.map((line, i) => {
    const v = Object.fromEntries(line.split(',').map((x, j) => [cols[j], x]));
    return { id: i + 1, client_id: v.client_id, label: v.label, line1: v.line1, line2: v.line2 || null, city: v.city, state: v.state, zip: v.zip };
  });
}

interface RefAddress { line1: string; city: string; state: string; zip: string }

/** The 20 real public buildings the fixtures use (A2). */
export function loadReferenceAddresses(): RefAddress[] {
  const ref = JSON.parse(readFileSync(`${ROOT}synthetic-data/reference/state_regions.json`, 'utf8')) as
    { addresses: Record<string, RefAddress[]> };
  return Object.values(ref.addresses).flat();
}

/**
 * A map that knows exactly the 20 reference buildings: a known street comes back with its real ZIP and state,
 * any other street only up to the postcode. Lets the oracle test the rules without Azure Maps; the real
 * service is checked by validator-eval.test.ts against recorded responses.
 */
export function referenceMap(): AddressValidator {
  const known = new Map(loadReferenceAddresses().map((a) => [a.line1.toUpperCase(), a]));
  return {
    name: 'reference-map',
    geocode: async (q): Promise<GeocodeResponse> => {
      const hit = known.get(q.line1.toUpperCase());
      if (!hit) {
        return { features: [{ properties: { type: 'Postcode1', confidence: 'Medium', matchCodes: ['UpHierarchy'],
          address: { postalCode: q.zip, adminDistricts: [{ shortName: q.state }] } } }] };
      }
      return { features: [{ properties: { type: 'Address', confidence: 'High', matchCodes: ['Good'],
        address: { addressLine: hit.line1, locality: hit.city, postalCode: hit.zip, adminDistricts: [{ shortName: hit.state }] } } }] };
    },
  };
}
