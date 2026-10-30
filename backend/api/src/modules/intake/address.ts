import type { AddressValidator } from '../../core/maps/types.js';
import { isUsState } from './region.js';
import type { ExtractedAddress, SavedAddress } from './schema.js';
import { type AddressValidation, validateAddress } from './validate.js';

/**
 * complete: all parts present; matched: a saved address; incomplete: parts missing; unverified: the map disagrees;
 * confirmed: the client confirmed it through the one-time address link (E19, REQ-INT-09, REQ-LINK-04).
 */
export type AddressStatus = 'complete' | 'matched' | 'incomplete' | 'unverified' | 'confirmed';
type Field = 'line1' | 'city' | 'state' | 'zip';

export interface AddressCheck {
  status: AddressStatus;
  address: { line1: string; line2: string | null; city: string; state: string; zip: string } | null;
  missing: string[];                    // e.g. ["address.line1", "address.zip"]
  candidates: SavedAddress[];           // saved addresses to offer the client
  validation: AddressValidation | null; // set by verifyAddress for complete addresses
}

const REQUIRED: Field[] = ['line1', 'city', 'state', 'zip'];
const ZIP = /^\d{5}(-\d{4})?$/;
const norm = (s: string) => s.toUpperCase().replace(/[^A-Z0-9]/g, '');

/** A value counts only if it appears in the source text (stops the model inventing an address). */
export function grounded(addr: ExtractedAddress, source: string): ExtractedAddress {
  const src = norm(source);
  const keep = (v: string | null) => (v && norm(v) && src.includes(norm(v)) ? v.trim() : null);
  return { line1: keep(addr.line1), line2: keep(addr.line2), city: keep(addr.city), state: keep(addr.state),
    zip: keep(addr.zip), raw: addr.raw };
}

// A secondary unit at the end of the street line: "Dock 6", "Suite 200", "Unit B". The identifier must be a number or a
// single letter, so a street named "Dock St" is left alone.
const UNIT = /(?:^|\s+)((?:dock|suite|ste|unit|bldg|building|floor|room|rm|apt)\.?\s*#?\s*(?:\d[\w-]*|[a-z]))$/i;

/** Moves a dock or suite out of line1 (into line2 if that is empty); a line1 that is only a dock becomes null. */
export function splitUnit(addr: ExtractedAddress): ExtractedAddress {
  const m = addr.line1 ? UNIT.exec(addr.line1) : null;
  if (!m) return addr;
  const street = addr.line1!.slice(0, m.index).trim();
  return { ...addr, line1: street || null, line2: addr.line2 ?? m[1] };
}

function valid(field: Field, v: string | null): boolean {
  if (!v) return false;
  if (field === 'zip') return ZIP.test(v);
  if (field === 'state') return isUsState(v);
  return true;
}

/** E4 format rules: complete, or matched to a saved address, or incomplete with the missing fields named. */
export function checkAddress(extracted: ExtractedAddress, saved: SavedAddress[], source: string): AddressCheck {
  const a = splitUnit(grounded(extracted, source));
  const missing = REQUIRED.filter((f) => !valid(f, a[f])).map((f) => `address.${f}`);
  if (missing.length === 0) {
    return { status: 'complete', address: { line1: a.line1!, line2: a.line2, city: a.city!, state: a.state!.toUpperCase(), zip: a.zip! },
      missing, candidates: [], validation: null };
  }
  // Same rule as matches_saved in analytics/intake/fixtures.py: street missing, ZIP given, exactly one saved address
  // with that ZIP. A street without its ZIP is asked about, not guessed: the same street name exists in many cities.
  const byZip = !a.line1 && a.zip ? saved.filter((s) => s.zip === a.zip) : [];
  const match = byZip.length === 1 ? byZip[0] : null;
  if (match) {
    return { status: 'matched', address: { line1: match.line1, line2: match.line2, city: match.city, state: match.state, zip: match.zip },
      missing: [], candidates: [match], validation: null };
  }
  return { status: 'incomplete', address: null, missing, candidates: saved.slice(0, 3), validation: null };
}

/**
 * E4 map check, for complete addresses only (a saved address is already on file). A low-confidence or
 * mismatching address becomes unverified and the client is offered their saved addresses.
 */
export async function verifyAddress(check: AddressCheck, saved: SavedAddress[], validator: AddressValidator): Promise<AddressCheck> {
  if (check.status !== 'complete' || !check.address) return check;
  const { line1, city, state, zip } = check.address;
  const validation = await validateAddress(validator, { line1, city, state, zip });
  if (validation.issues.length > 0 || validation.confidence === 'low') {
    return { ...check, status: 'unverified', candidates: saved.slice(0, 3), validation };
  }
  return { ...check, validation };
}
