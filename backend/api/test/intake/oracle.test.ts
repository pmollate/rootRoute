import { describe, expect, it } from 'vitest';
import { checkAddress, verifyAddress } from '../../src/modules/intake/address.js';
import { decide } from '../../src/modules/intake/decide.js';
import { loadFixtures, loadSavedAddresses, referenceMap } from './fixtures.js';

// AC-INT-02, AC-INT-04: with a perfect extraction and a map of the reference buildings, the code rules must reach
// every gold decision (32 ALL_CLEAR, 17 CONFIRM_ADDRESS, 1 MISSING_INFO). Separates rule bugs from model errors.
describe('fixture oracle', () => {
  const saved = loadSavedAddresses();
  const map = referenceMap();
  for (const fx of loadFixtures()) {
    it(`fixture ${fx.gold.id} (layout ${fx.gold.layout}) -> ${fx.gold.decision}`, async () => {
      const g = fx.gold;
      const own = saved.filter((s) => s.client_id === g.client_id);
      const extraction = { items: g.items, address: { ...g.address, raw: null }, requested_commitment: g.requested_commitment,
        confidence: { items: 1, address: 1 } };
      const check = await verifyAddress(checkAddress(extraction.address, own, fx.body), own, map);
      expect(check.missing.sort()).toEqual(g.matched_saved ? [] : [...g.missing].sort());
      expect(check.validation?.issues ?? []).toEqual(g.address_issue ? [g.address_issue] : []);
      expect(decide(g.client_id, extraction, check)).toBe(g.decision);
    });
  }
});
