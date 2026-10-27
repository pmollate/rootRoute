import type { AddressQuery, AddressValidator, GeocodeResponse } from '../../core/maps/types.js';

export type AddressConfidence = 'high' | 'medium' | 'low' | 'unavailable';
export type AddressIssue = 'street_not_found' | 'state_mismatch' | 'zip_mismatch';

export interface AddressValidation {
  confidence: AddressConfidence;
  issues: AddressIssue[];
  suggestion: AddressQuery | null; // the map's own reading of the address, offered in the reply
}

const UNAVAILABLE: AddressValidation = { confidence: 'unavailable', issues: [], suggestion: null };

const ABBREV: Record<string, string> = {
  STREET: 'ST', AVENUE: 'AVE', BOULEVARD: 'BLVD', DRIVE: 'DR', LANE: 'LN', ROAD: 'RD', SQUARE: 'SQ', PLACE: 'PL',
  COURT: 'CT', PARKWAY: 'PKWY', HIGHWAY: 'HWY', TERRACE: 'TER', CIRCLE: 'CIR', TRAIL: 'TRL',
  NORTH: 'N', SOUTH: 'S', EAST: 'E', WEST: 'W', NORTHEAST: 'NE', NORTHWEST: 'NW', SOUTHEAST: 'SE', SOUTHWEST: 'SW',
};
const DIRECTIONS = new Set(['N', 'S', 'E', 'W', 'NE', 'NW', 'SE', 'SW']);

function streetParts(line1: string) {
  const tokens = line1.toUpperCase().replace(/[^A-Z0-9 ]/g, ' ').split(/\s+/).filter(Boolean).map((t) => ABBREV[t] ?? t);
  return { name: tokens.filter((t) => !DIRECTIONS.has(t)).join(' '), dirs: tokens.filter((t) => DIRECTIONS.has(t)).join(' ') };
}

/** Same number and street name; a direction (N, SW) may be left out on one side but must not differ. */
export function sameStreet(said: string, mapped: string): boolean {
  const a = streetParts(said);
  const b = streetParts(mapped);
  return a.name === b.name && (!a.dirs || !b.dirs || a.dirs === b.dirs);
}

/**
 * Reads the map's best match against what the email said.
 * - no street-level match (other type, or UpHierarchy), or a different street (the map tolerates typos and will
 *   swap a made-up street for a similar real one) -> street_not_found
 * - another state -> state_mismatch
 * - a ZIP in another area (first 3 digits differ) -> zip_mismatch; a neighbouring ZIP only lowers confidence to medium
 */
export function assessGeocode(q: AddressQuery, res: GeocodeResponse): AddressValidation {
  const top = res.features[0]?.properties;
  if (!top) return { confidence: 'low', issues: ['street_not_found'], suggestion: null };
  const a = top.address ?? {};
  const issues: AddressIssue[] = [];
  if (top.type !== 'Address' || top.matchCodes?.includes('UpHierarchy') || (a.addressLine && !sameStreet(q.line1, a.addressLine))) {
    issues.push('street_not_found');
  }
  const state = a.adminDistricts?.[0]?.shortName?.toUpperCase();
  if (state && state !== q.state.toUpperCase()) issues.push('state_mismatch');
  const zip = a.postalCode?.slice(0, 5);
  const wanted = q.zip.slice(0, 5);
  if (zip && zip.slice(0, 3) !== wanted.slice(0, 3)) issues.push('zip_mismatch');

  let confidence: AddressConfidence = top.confidence === 'High' ? 'high' : top.confidence === 'Medium' ? 'medium' : 'low';
  if (issues.length > 0) confidence = 'low';
  else if (confidence === 'high' && zip && zip !== wanted) confidence = 'medium';

  // A different street is not offered back to the client: it is the map's guess, not their address.
  const suggestion = !issues.includes('street_not_found') && a.addressLine && a.locality && state && zip
    ? { line1: a.addressLine, city: a.locality, state, zip } : null;
  return { confidence, issues, suggestion };
}

/** E4: never throws. If the map cannot be reached the address is judged on the format rules alone. */
export async function validateAddress(validator: AddressValidator, q: AddressQuery): Promise<AddressValidation> {
  try {
    return assessGeocode(q, await validator.geocode(q));
  } catch {
    return UNAVAILABLE;
  }
}
