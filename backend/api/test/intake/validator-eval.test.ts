import { describe, expect, it } from 'vitest';
import { queryText, RecordedAddressValidator } from '../../src/core/maps/recorded.js';
import type { AddressQuery } from '../../src/core/maps/types.js';
import { readRecording, RECORDINGS_DIR } from '../../src/core/recordings.js';
import { validateAddress } from '../../src/modules/intake/validate.js';
import { loadFixtures, loadReferenceAddresses } from './fixtures.js';

// Real Azure Maps answers, replayed. Record them with: ADDRESS_PROVIDER=azure-maps RECORD=1 npm run maps:check
// The 20 reference buildings must be confirmed, and the 6 deliberate errors (A3) must be flagged.
const query = (a: AddressQuery): AddressQuery => ({ line1: a.line1, city: a.city, state: a.state, zip: a.zip });
const fixtureCases = loadFixtures()
  .filter((fx) => !fx.gold.matched_saved && fx.gold.missing.length === 0)
  .map((fx) => ({ name: `fixture ${fx.gold.id}`, q: query(fx.gold.address as AddressQuery), flagged: fx.gold.address_issue !== null }));
const referenceCases = loadReferenceAddresses().map((a) => ({ name: `reference ${a.line1}, ${a.city}`, q: query(a), flagged: false }));
const cases = [...referenceCases, ...fixtureCases];
const recorded = cases.some((c) => readRecording(RECORDINGS_DIR, 'address', '', queryText(c.q)) !== null);

describe.skipIf(!recorded)('Azure Maps on the fixture addresses (recorded)', () => {
  const maps = new RecordedAddressValidator();
  for (const c of cases) {
    it(`${c.name} ${c.flagged ? 'is flagged' : 'is confirmed'}`, async () => {
      const v = await validateAddress(maps, c.q);
      expect(v.confidence).not.toBe('unavailable');
      expect(v.issues.length > 0).toBe(c.flagged);
    });
  }
});
