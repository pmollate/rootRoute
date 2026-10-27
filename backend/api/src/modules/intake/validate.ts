import type { AddressQuery, AddressValidator, GeocodeResponse } from '../../core/maps/types.js';

export type AddressConfidence = 'high' | 'medium' | 'low' | 'unavailable';
export type AddressIssue = 'street_not_found' | 'state_mismatch' | 'zip_mismatch';

export interface AddressValidation {
  confidence: AddressConfidence;
  issues: AddressIssue[];
  suggestion: AddressQuery | null; // the map's own reading of the address, offered in the reply
}

const UNAVAILABLE: AddressValidation = { confidence: 'unavailable', issues: [], suggestion: null };

/**
 * Reads the map's best match against what the email said.
 * - no street-level match (other type, or UpHierarchy) -> street_not_found
 * - another state -> state_mismatch
 * - a ZIP in another area (first 3 digits differ) -> zip_mismatch; a neighbouring ZIP only lowers confidence to medium
 */
export function assessGeocode(q: AddressQuery, res: GeocodeResponse): AddressValidation {
  const top = res.features[0]?.properties;
  if (!top) return { confidence: 'low', issues: ['street_not_found'], suggestion: null };
  const a = top.address ?? {};
  const issues: AddressIssue[] = [];
  if (top.type !== 'Address' || top.matchCodes?.includes('UpHierarchy')) issues.push('street_not_found');
  const state = a.adminDistricts?.[0]?.shortName?.toUpperCase();
  if (state && state !== q.state.toUpperCase()) issues.push('state_mismatch');
  const zip = a.postalCode?.slice(0, 5);
  const wanted = q.zip.slice(0, 5);
  if (zip && zip.slice(0, 3) !== wanted.slice(0, 3)) issues.push('zip_mismatch');

  let confidence: AddressConfidence = top.confidence === 'High' ? 'high' : top.confidence === 'Medium' ? 'medium' : 'low';
  if (issues.length > 0) confidence = 'low';
  else if (confidence === 'high' && zip && zip !== wanted) confidence = 'medium';

  const suggestion = top.type === 'Address' && a.addressLine && a.locality && state && zip
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
