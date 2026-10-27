// Look up the 20 reference buildings and every complete fixture address on Azure Maps, and print what the
// address rules make of each. With RECORD=1 the answers are saved for the tests (validator-eval.test.ts).
// Usage (from backend/api): ADDRESS_PROVIDER=azure-maps RECORD=1 npm run maps:check
import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createAddressValidator, type AddressQuery } from '../src/core/maps/index.js';
import { validateAddress } from '../src/modules/intake/validate.js';

const ROOT = fileURLToPath(new URL('../../', import.meta.url));
const ref = JSON.parse(readFileSync(`${ROOT}synthetic-data/reference/state_regions.json`, 'utf8')) as
  { addresses: Record<string, AddressQuery[]> };
const DIR = `${ROOT}tests/fixtures/emails/`;
const golds = readdirSync(DIR).filter((f) => f.endsWith('.json')).sort()
  .map((f) => JSON.parse(readFileSync(DIR + f, 'utf8')) as
    { id: string; address: AddressQuery; missing: string[]; matched_saved: boolean; address_issue: string | null });

const cases = [
  ...Object.values(ref.addresses).flat().map((a) => ({ name: 'reference', q: a, expect: 'ok' })),
  ...golds.filter((g) => !g.matched_saved && g.missing.length === 0)
    .map((g) => ({ name: `fixture ${g.id}`, q: g.address, expect: g.address_issue ?? 'ok' })),
];

const validator = createAddressValidator();
let wrong = 0;
for (const c of cases) {
  const q = { line1: c.q.line1, city: c.q.city, state: c.q.state, zip: c.q.zip };
  const v = await validateAddress(validator, q);
  const got = v.confidence === 'unavailable' ? 'unavailable' : v.issues.join('+') || 'ok';
  const pass = (c.expect === 'ok') === (got === 'ok');
  if (!pass) wrong += 1;
  console.log(`${pass ? 'ok  ' : 'DIFF'}  ${c.name.padEnd(11)} ${`${q.line1}, ${q.city} ${q.state} ${q.zip}`.padEnd(46)} `
    + `expected ${c.expect.padEnd(16)} got ${got} (${v.confidence})${v.suggestion ? ` map: ${v.suggestion.zip}` : ''}`);
}
console.log(`\n${cases.length} addresses via ${validator.name}, ${wrong} not as expected`);
