import { describe, expect, it } from 'vitest';
import type { GeocodeResponse } from '../../src/core/maps/types.js';
import { assessGeocode } from '../../src/modules/intake/validate.js';

/** The map's best match, as Azure Maps returns it. */
const answer = (a: { line1: string; city: string; state: string; zip: string }): GeocodeResponse => ({ features: [{ properties: {
  type: 'Address', confidence: 'High', matchCodes: ['Good'],
  address: { addressLine: a.line1, locality: a.city, postalCode: a.zip, adminDistricts: [{ shortName: a.state }] } } }] });
const ENTERPRISE = { line1: '65156 Powers Rd', city: 'Enterprise', state: 'OR', zip: '97828' };

describe('map check (SPEC §5.3 step 7)', () => {
  it('a matching address is high confidence with no issues', () => {
    expect(assessGeocode(ENTERPRISE, answer(ENTERPRISE))).toEqual({ confidence: 'high', issues: [], suggestion: ENTERPRISE });
  });

  // Live on 30 Oct: "65156 Powers Rd, Madhapur, OR 97828" was read by the map as Enterprise, OR and passed as high.
  it('a city the map does not agree with is city_mismatch, low, and the map\'s reading is offered', () => {
    const v = assessGeocode({ ...ENTERPRISE, city: 'Madhapur' }, answer(ENTERPRISE));
    expect(v.issues).toEqual(['city_mismatch']);
    expect(v.confidence).toBe('low');
    expect(v.suggestion).toEqual(ENTERPRISE);
  });

  it('the same city written differently is not a mismatch (case, punctuation, Saint/St, Fort/Ft, Mount/Mt)', () => {
    const same = (typed: string, mapped: string) =>
      assessGeocode({ ...ENTERPRISE, city: typed }, answer({ ...ENTERPRISE, city: mapped })).issues;
    expect(same('enterprise', 'Enterprise')).toEqual([]);
    expect(same('Saint Louis', 'St. Louis')).toEqual([]);
    expect(same('Ft Worth', 'Fort Worth')).toEqual([]);
    expect(same('Mount Vernon', 'Mt Vernon')).toEqual([]);
    expect(same('Winston Salem', 'Winston-Salem')).toEqual([]);
  });
});
